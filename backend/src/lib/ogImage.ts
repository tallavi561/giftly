// Extracts a product's own og:image (falling back to twitter:image) straight
// off the same live page a source_url already points to — this is the
// "hotlink, never host" approach to product images: Giftly never downloads
// or stores a copy of a retailer's photo, it just shows the retailer's own
// image next to a real, verified link back to that exact page. That pairing
// is what keeps this a link-out/advertisement for the product rather than
// redistribution of someone else's content.
import { Logger } from './logger.js';

const logger = new Logger('ogImage');
// AliExpress's affiliate short-link redirect chain (s.click.aliexpress.com
// -> aliexpress.com -> he.aliexpress.com, geo-adapted) is measurably slower
// than the Israeli retail sites or Amazon — 5s was too tight and caused
// real "operation was aborted" failures in production logs.
const FETCH_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 500_000; // the og:image tag always lives in <head> — no need to read a whole page

const META_IMAGE_RE = (prop: string) => new RegExp(
  `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["'][^>]*>` +
  `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["'][^>]*>`,
  'i',
);
const OG_IMAGE_RE = META_IMAGE_RE('og:image(?::secure_url)?');
const TWITTER_IMAGE_RE = META_IMAGE_RE('twitter:image(?::src)?');

// A store's own logo/banner is a very common og:image fallback on a
// category/listing page (or any page missing a dedicated product image) —
// caught this in production: 22/22 images a first backfill run wrote out
// turned out to be one of 3 site logos, reused identically across dozens of
// unrelated products. Filename-hint filtering catches the obvious cases
// before ever storing one as if it were a real product photo; the
// same-URL-already-used-elsewhere check in dealFinder.ts catches the rest
// (a hashed CDN filename with no "logo" in it that still turns out to be a
// shared site-wide banner, not product-specific).
const GENERIC_IMAGE_HINT_RE = /logo|placeholder|sprite|favicon|no[-_]?image|default[-_]?(image|photo|banner)/i;

export function looksLikeGenericImage(url: string): boolean {
  return GENERIC_IMAGE_HINT_RE.test(url);
}

export function extractOgImageFromHtml(html: string, pageUrl: string): string | null {
  const match = OG_IMAGE_RE.exec(html) ?? TWITTER_IMAGE_RE.exec(html);
  const raw = match?.[1] ?? match?.[2];
  if (!raw || looksLikeGenericImage(raw)) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}

async function fetchOgImageOnce(pageUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, { redirect: 'follow', signal: controller.signal });
    if (!res.ok) return null;
    const html = await readBoundedHtml(res);
    return extractOgImageFromHtml(html, res.url || pageUrl);
  } catch (err) {
    logger.warn('Failed to fetch/extract og:image', { url: pageUrl, err: (err as Error).message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Standalone fetch+extract, for callers that don't already have the page's
// HTML in hand from their own verification fetch (dealFinder.ts reuses the
// HTML it already fetched instead of calling this, to avoid a second request).
//
// Retries once on a null result. Verified empirically against 41 real
// AliExpress product links: the site's og:image tag is present but often
// server-rendered empty (content="") on the first load — a flaky SSR/cache
// issue, not a per-product one, since 18 of 27 initially-empty links
// resolved correctly on a single retry (73% success overall vs. 29% on one
// attempt). A 2nd retry recovered zero additional links in that same test,
// so a single retry is the point of diminishing returns — not worth the
// extra latency past that.
export async function fetchOgImage(pageUrl: string): Promise<string | null> {
  const first = await fetchOgImageOnce(pageUrl);
  if (first) return first;
  return fetchOgImageOnce(pageUrl);
}

export async function readBoundedHtml(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();

  const decoder = new TextDecoder();
  let html = '';
  let bytes = 0;
  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  await reader.cancel().catch(() => {});
  return html;
}
