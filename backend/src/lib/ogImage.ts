// Extracts a product's own og:image (falling back to twitter:image) straight
// off the same live page a source_url already points to — this is the
// "hotlink, never host" approach to product images: Giftly never downloads
// or stores a copy of a retailer's photo, it just shows the retailer's own
// image next to a real, verified link back to that exact page. That pairing
// is what keeps this a link-out/advertisement for the product rather than
// redistribution of someone else's content.
import { Logger } from './logger.js';

const logger = new Logger('ogImage');
const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 500_000; // the og:image tag always lives in <head> — no need to read a whole page

const META_IMAGE_RE = (prop: string) => new RegExp(
  `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["'][^>]*>` +
  `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["'][^>]*>`,
  'i',
);
const OG_IMAGE_RE = META_IMAGE_RE('og:image(?::secure_url)?');
const TWITTER_IMAGE_RE = META_IMAGE_RE('twitter:image(?::src)?');

export function extractOgImageFromHtml(html: string, pageUrl: string): string | null {
  const match = OG_IMAGE_RE.exec(html) ?? TWITTER_IMAGE_RE.exec(html);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}

// Standalone fetch+extract, for callers that don't already have the page's
// HTML in hand from their own verification fetch (dealFinder.ts reuses the
// HTML it already fetched instead of calling this, to avoid a second request).
export async function fetchOgImage(pageUrl: string): Promise<string | null> {
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
