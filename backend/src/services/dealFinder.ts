// Finds real discounted products on a fixed allow-list of retail sites and
// stores them in deal_alerts (Specs/Front/FRONTEND_SPEC2.md §10). This is a
// scheduled batch job (see cron.ts), not called per-request — consistent
// with the "no heavy ML/live infra at request time" principle the rest of
// the recommendation engine follows.
//
// Implementation note: the legacy @google/generative-ai SDK already used
// elsewhere in this backend (gemini.ts) only supports the OLD
// `googleSearchRetrieval` grounding tool (verified against the SDK's latest
// published version, 0.24.1) — that tool is for Gemini 1.5-era models.
// gemini-2.5-flash needs the newer `google_search` tool, which that SDK
// doesn't expose at all. Rather than upgrading (or replacing) the SDK for
// the whole app — risking the working self/contact recommendation calls —
// this file talks to the Gemini REST API directly with fetch(), just for
// this one feature.

import { supabase } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import { MASTER_TAG_LIST, TAG_LABEL_HE, type CatalogTag } from '../types/index.js';
import { parseJsonObjectLoose } from '../lib/jsonExtract.js';
import { isGiftAppropriate } from './giftAppropriateness.js';

const logger = new Logger('dealFinder');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = 'gemini-2.5-flash';
const DEFAULT_EXPIRY_DAYS = parseInt(process.env.DEAL_DEFAULT_EXPIRY_DAYS ?? '10', 10);

interface SiteRef { domain: string; label: string }

// Real, verified (WebSearch, 2026-08-22) Israeli/international retail sites,
// mapped per Master Tag List category — each with at least 2 sites so one
// dead/uncooperative site doesn't leave a whole category with zero coverage.
// A site can legitimately appear under more than one category (e.g. BUYME
// sells experience gifts spanning several). Searches run per (category,
// site) pair — see runFindDeals — so every found deal already carries the
// correct category instead of leaving tagging to chance.
export const CATEGORY_SITES: Record<CatalogTag, SiteRef[]> = {
  sports: [
    { domain: 'decathlon.co.il', label: 'Decathlon' },
    { domain: 'megasport.co.il', label: 'מגה ספורט' },
  ],
  music: [
    { domain: 'kley-zemer.co.il', label: 'כלי זמר' },
    { domain: 'musical.org.il', label: 'קורל מוזיקה' },
  ],
  performances: [
    { domain: 'eventim.co.il', label: 'Eventim' },
    { domain: 'leaan.co.il', label: 'לאן' },
  ],
  art: [
    { domain: 'graphos.co.il', label: 'גרפוס' },
    { domain: 'artpunto.co.il', label: 'Artpunto' },
  ],
  culinary: [
    { domain: 'cookstore.co.il', label: 'The Cook Store' },
    { domain: 'buyme.co.il', label: 'BUYME' },
  ],
  travel: [
    { domain: 'buyme.co.il', label: 'BUYME' },
    { domain: 'groupon.co.il', label: 'Groupon Israel' },
  ],
  extreme: [
    { domain: 'buyme.co.il', label: 'BUYME' },
    { domain: 'giftush.co.il', label: 'גיפטוש' },
  ],
  workshops: [
    { domain: 'giftush.co.il', label: 'גיפטוש' },
    { domain: 'kolsadna.co.il', label: 'כל סדנה' },
  ],
  tech: [
    { domain: 'ksp.co.il', label: 'KSP' },
    { domain: 'zap.co.il', label: 'ZAP' },
    { domain: 'bug.co.il', label: 'BUG' },
    { domain: 'ivory.co.il', label: 'Ivory' },
  ],
  books: [
    { domain: 'steimatzky.co.il', label: 'סטימצקי' },
    { domain: 'booknet.co.il', label: 'צומת ספרים' },
  ],
  gaming: [
    { domain: 'bug.co.il', label: 'BUG' },
    { domain: 'genesisgames.co.il', label: 'Genesis Games' },
  ],
  general: [
    { domain: 'amazon.com', label: 'Amazon' },
    { domain: 'castro.co.il', label: 'Castro' },
    { domain: 'magnolia.co.il', label: 'Magnolia' },
    { domain: 'fox.co.il', label: 'Fox' },
    { domain: 'terminalx.com', label: 'Terminal X' },
  ],
};

interface RawDeal {
  title: string;
  description?: string;
  source_url: string;
  image_url?: string | null;
  current_price?: number | null;
  original_price?: number | null;
  tags?: string[];
  expires_at?: string | null; // ISO date, only if the model found an explicit sale end date
}

function normalizeUrl(url: string): URL | null {
  try { return new URL(url); } catch { return null; }
}

const URL_CHECK_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// The model reliably cites Google's search-grounding redirect link
// (vertexaisearch.cloud.google.com/grounding-api-redirect/...) as source_url
// even when instructed to give the real destination — so resolve it
// server-side instead of trusting the model's copy of the final URL.
//
// Also doubles as the real liveness check: the prompt tells the model to
// verify each link with its own url_context tool before citing it, but
// that's a soft instruction inside the model's own response, not something
// this code can rely on — the model can still cite a stale/dead link (a
// sale that ended, a page that moved) with full confidence. Checking res.ok
// here catches that with a real HTTP status, for every deal, not just
// grounding-redirect ones.
async function resolveFinalUrl(url: string): Promise<{ ok: boolean; finalUrl: string | null }> {
  try {
    const res = await fetchWithTimeout(url);
    await res.body?.cancel();
    return { ok: res.ok, finalUrl: res.url || null };
  } catch (err) {
    logger.warn('Failed to resolve/verify URL', { url, err: (err as Error).message });
    return { ok: false, finalUrl: null };
  }
}

// Lightweight liveness-only check (no need for the resolved URL) — a link
// live at insert time can still go dead later, well within the 10-day
// default expiry (sale pages especially rot fast). Shared by the periodic
// sweep below (runVerifyDealLinks) and deals.ts's narrower serve-time check
// on just what's about to be shown to one user.
export async function isUrlLive(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url);
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

export interface VerifyLinksResult { checked: number; deactivated: number }

// Broad sweep over every currently-active deal, run on a schedule (cron.ts)
// so the whole active set stays healthy independent of user traffic —
// deals.ts's serve-time check only ever verifies the handful of deals about
// to be shown to one user, so a dead link a user never happens to match
// would otherwise sit active indefinitely.
export async function runVerifyDealLinks(): Promise<VerifyLinksResult> {
  const { data, error } = await supabase.from('deal_alerts').select('id, source_url').eq('is_active', true);
  if (error) { logger.error('Fetch active deals for link verification failed', error); throw new Error(error.message); }

  let deactivated = 0;
  for (const deal of data ?? []) {
    const live = await isUrlLive(deal.source_url);
    if (!live) {
      const { error: upErr } = await supabase.from('deal_alerts').update({ is_active: false }).eq('id', deal.id);
      if (upErr) logger.warn('Failed to deactivate dead deal link', { id: deal.id, err: upErr.message });
      else deactivated++;
    }
  }

  const checked = data?.length ?? 0;
  logger.info('Deal link verification done', { checked, deactivated });
  return { checked, deactivated };
}

async function searchSiteForCategoryDeals(site: SiteRef, category: CatalogTag): Promise<RawDeal[]> {
  const categoryLabel = TAG_LABEL_HE[category];
  const categoryLine = category === 'general'
    ? 'אתה מחפש מבצעים כלליים (לא ספציפיים לתחום עניין אחד) — כל תחום סביר.'
    : `אתה מחפש ספציפית מבצעים בתחום "${categoryLabel}" — התעלם ממבצעים באתר שלא שייכים לתחום הזה, גם אם הם משמעותיים.`;

  const prompt = `
חפש בגוגל מבצעים/הנחות פעילים באתר ${site.label} (${site.domain}), ואז השתמש בכלי url_context כדי לפתוח בפועל את הקישורים שמצאת ולוודא שהם עובדים ומראים מוצר אמיתי במבצע — לא רק להסתמך על תוצאת החיפוש.
${categoryLine}
מצא עד 5 מבצעים/הנחות משמעותיים (אחוז הנחה גבוה במיוחד, לא מחיר קבוע רגיל) — **רק על מוצרים שהגיוני לתת כמתנה לבן אדם אחר**. דלג על מוצרים שהם רכיבים/אביזרים/מוצרי-צריכה שגרתיים (מטענים, כבלים, סוללות גיבוי, מכשירי חשמל ביתיים בסיסיים כמו כירות/מאווררים, חלקי חילוף) — גם אם ההנחה עליהם גבוהה. מתנה טובה היא מוצר שיש לו ערך רגשי/חוויתי/אישי, לא מוצר-מדף שימושי גרידא.

חשוב מאוד:
- ה-source_url חייב להיות קישור אמיתי שקיבלת מתוצאות חיפוש או מ-url_context — אל תמציא קישורים ואל תנחש URL שלא הופיע בתוצאות אמיתיות. אם יש לך את הכתובת הישירה בדומיין ${site.domain} עצמו (למשל מ-retrievedUrl של url_context) עדיף להשתמש בה; אם לא, קישור תוצאת חיפוש (גם אם הוא redirect) בסדר — הוא ייפתר בצד השרת.
- כל מבצע שאתה כולל בתשובה חייב להיות מגובה בקישור שבדקת בפועל עם url_context ואישרת שהוא נטען בהצלחה ומראה מידע רלוונטי על מבצעים באתר ${site.domain}.
- אם קישור מסוים נכשל, מחזיר 404, או שאינך מצליח לאמת אותו — פשוט דלג על אותו מבצע ונסה קישור אחר מהתוצאות. אל תסביר את זה בתשובה, ואל תיתקע בניסיונות חוזרים על אותו URL.
- אם בסופו של דבר לא נשאר אף מבצע מאומת באתר הזה בתחום הזה, זה תקין — החזר "deals": [] .
- התשובה הסופית שלך חייבת להיות אך ורק בלוק ה-JSON, בלי שום טקסט הסבר, נימוק, התנצלות, או תיאור התהליך לפני או אחרי ה-JSON.
- שדה "tags" בכל מבצע חייב להכיל את "${category}" (התחום שאתה מחפש בו כרגע), ואפשר עוד תגית אחת נוספת אם ממש רלוונטית, מתוך הרשימה: ${MASTER_TAG_LIST.join(', ')}, general.

החזר JSON בלבד (ללא markdown), במבנה:
{
  "deals": [
    {
      "title": "שם המוצר",
      "description": "תיאור קצר",
      "source_url": "קישור ישיר לעמוד המוצר, מאומת עם url_context",
      "current_price": 149,
      "original_price": 249,
      "tags": ["${category}"],
      "expires_at": "YYYY-MM-DD אם יש תאריך סיום מפורש למבצע, אחרת null"
    }
  ]
}
`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }, { url_context: {} }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json() as any;
  const text: string = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  const parsed = parseJsonObjectLoose<{ deals?: RawDeal[] }>(text);
  if (!parsed) {
    logger.warn('No/malformed JSON in deal search response', { site: site.domain });
    return [];
  }
  return parsed.deals ?? [];
}

function validateTags(tags: string[] | undefined): string[] {
  const valid = new Set<string>([...MASTER_TAG_LIST, 'general']);
  return (tags ?? []).filter(t => valid.has(t));
}

// Shared insert path for BOTH sources: the automated site-search job below,
// and the manual WhatsApp-curated ingestion script
// (backend/scripts/insertManualDeals.ts). Same validation either way —
// only the site allow-list check is specific to the automated path (a
// manual deal can legitimately come from anywhere).
export interface DealInput {
  title: string;
  description?: string | null;
  source_site: string; // domain, or a label like 'whatsapp' for manually-curated deals
  source_url: string;
  image_url?: string | null;
  current_price: number;
  original_price?: number | null;
  tags: string[];
  expires_at?: string | null; // ISO date, if known — otherwise DEFAULT_EXPIRY_DAYS from now
}

export interface InsertOutcome { ok: boolean; reason?: string }

export async function insertValidatedDeal(input: DealInput): Promise<InsertOutcome> {
  if (!input.title || input.current_price == null) return { ok: false, reason: 'missing title or current_price' };

  const tags = validateTags(input.tags);
  if (tags.length === 0) return { ok: false, reason: 'no tags from the Master Tag List' };

  const appropriateness = await isGiftAppropriate(input.title, input.description);
  if (!appropriateness.ok) return { ok: false, reason: `not gift-appropriate: ${appropriateness.reason ?? 'no reason given'}` };

  const discountPct = input.original_price && input.original_price > input.current_price
    ? Math.round((1 - input.current_price / input.original_price) * 100)
    : null;

  const expiresAt = input.expires_at && !isNaN(Date.parse(input.expires_at))
    ? new Date(input.expires_at).toISOString()
    : new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 3600 * 1000).toISOString();

  const { error } = await supabase.from('deal_alerts').insert({
    title: input.title,
    description: input.description ?? null,
    source_site: input.source_site,
    source_url: input.source_url,
    image_url: input.image_url ?? null,
    current_price: input.current_price,
    original_price: input.original_price ?? null,
    discount_pct: discountPct,
    tags,
    target_gender: appropriateness.targetGender,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function deactivateExpiredDeals(): Promise<void> {
  // Passive cleanup — flip anything past its expiry to inactive so every
  // read site doesn't need to repeat an expires_at filter.
  await supabase.from('deal_alerts').update({ is_active: false }).lt('expires_at', new Date().toISOString()).eq('is_active', true);
}

async function logSiteSearch(site: SiteRef, category: CatalogTag, foundCount: number, insertedCount: number, error?: string): Promise<void> {
  const { error: dbErr } = await supabase.from('deal_site_search_log').insert({
    site_domain: site.domain, category, found_count: foundCount, inserted_count: insertedCount, error: error ?? null,
  });
  if (dbErr) logger.warn('Failed to write site search log', { site: site.domain, category, err: dbErr.message });
}

export interface FindDealsResult { inserted: number; skipped: number; searchesRun: number }

export async function runFindDeals(): Promise<FindDealsResult> {
  let inserted = 0;
  let skipped = 0;
  let searchesRun = 0;

  for (const category of Object.keys(CATEGORY_SITES) as CatalogTag[]) {
    for (const site of CATEGORY_SITES[category]) {
      searchesRun++;
      let deals: RawDeal[];
      try {
        deals = await searchSiteForCategoryDeals(site, category);
      } catch (err) {
        logger.error('Deal search failed for site', { site: site.domain, category, err: (err as Error).message });
        await logSiteSearch(site, category, 0, 0, (err as Error).message);
        continue;
      }

      let siteInserted = 0;
      for (const deal of deals) {
        // Every candidate link is fetched and checked for a live (2xx) status
        // before it's trusted — not just the grounding-redirect ones — since
        // a direct-domain URL can just as easily be stale (sale ended, page
        // moved/removed) even though the model cited it with confidence.
        const { ok: urlLive, finalUrl } = await resolveFinalUrl(deal.source_url);
        const url = urlLive && finalUrl ? normalizeUrl(finalUrl) : null;
        const resolvedSourceUrl = finalUrl ?? deal.source_url;
        // Enforced, not just prompted — reject anything not actually hosted on the requested domain.
        if (!url || !(url.hostname === site.domain || url.hostname.endsWith(`.${site.domain}`)) || deal.current_price == null) {
          skipped++;
          continue;
        }

        const outcome = await insertValidatedDeal({
          title: deal.title, description: deal.description, source_site: site.domain, source_url: resolvedSourceUrl,
          image_url: deal.image_url, current_price: deal.current_price, original_price: deal.original_price,
          tags: Array.from(new Set([category, ...(deal.tags ?? [])])), expires_at: deal.expires_at,
        });
        if (outcome.ok) { inserted++; siteInserted++; }
        else { logger.warn('Skipped deal', { site: site.domain, category, reason: outcome.reason }); skipped++; }
      }

      await logSiteSearch(site, category, deals.length, siteInserted);
    }
  }

  await deactivateExpiredDeals();

  logger.info('Deal search done', { inserted, skipped, searchesRun });
  return { inserted, skipped, searchesRun };
}
