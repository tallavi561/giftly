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
import { MASTER_TAG_LIST } from '../types/index.js';

const logger = new Logger('dealFinder');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = 'gemini-2.5-flash';
const DEFAULT_EXPIRY_DAYS = parseInt(process.env.DEAL_DEFAULT_EXPIRY_DAYS ?? '10', 10);

const TAG_LABEL_HE: Record<string, string> = {
  sports: 'ספורט', music: 'נגינה', performances: 'הופעות/סטנדאפ', art: 'ציור/אומנות',
  culinary: 'קפה/קולינריה', travel: 'טיולים/טבע', extreme: 'אקסטרים', workshops: 'סדנאות/זוגיות',
  tech: 'טכנולוגיה/גאדטים', books: 'ספרים/ידע', gaming: 'גיימינג', general: 'כללי',
};

// User-provided (Amazon, Castro, Magnolia) + recommended additions covering
// the rest of the Master Tag List reasonably well. Edit freely — this list
// is the enforced allow-list, not just a prompt hint (see the hostname
// check in runFindDeals below).
export const ALLOWED_SITES = [
  { domain: 'amazon.com', label: 'Amazon' },
  { domain: 'castro.co.il', label: 'Castro' },
  { domain: 'magnolia.co.il', label: 'Magnolia' },
  { domain: 'zap.co.il', label: 'ZAP' },
  { domain: 'ksp.co.il', label: 'KSP' },
  { domain: 'ivory.co.il', label: 'Ivory' },
  { domain: 'groupon.co.il', label: 'Groupon Israel' },
  { domain: 'fox.co.il', label: 'Fox' },
  { domain: 'terminalx.com', label: 'Terminal X' },
  { domain: 'bug.co.il', label: 'BUG' },
];

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

// The model reliably cites Google's search-grounding redirect link
// (vertexaisearch.cloud.google.com/grounding-api-redirect/...) as source_url
// even when instructed to give the real destination — so resolve it
// server-side instead of trusting the model's copy of the final URL.
async function resolveFinalUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    await res.body?.cancel();
    return res.url || null;
  } catch (err) {
    logger.warn('Failed to resolve redirect', { url, err: (err as Error).message });
    return null;
  }
}

async function searchSiteForDeals(site: { domain: string; label: string }): Promise<RawDeal[]> {
  const prompt = `
חפש בגוגל מבצעים/הנחות פעילים באתר ${site.label} (${site.domain}), ואז השתמש בכלי url_context כדי לפתוח בפועל את הקישורים שמצאת ולוודא שהם עובדים ומראים מוצר אמיתי במבצע — לא רק להסתמך על תוצאת החיפוש.
מצא עד 5-8 מבצעים/הנחות משמעותיים (אחוז הנחה גבוה במיוחד, לא מחיר קבוע רגיל).

חשוב מאוד:
- ה-source_url חייב להיות קישור אמיתי שקיבלת מתוצאות חיפוש או מ-url_context — אל תמציא קישורים ואל תנחש URL שלא הופיע בתוצאות אמיתיות. אם יש לך את הכתובת הישירה בדומיין ${site.domain} עצמו (למשל מ-retrievedUrl של url_context) עדיף להשתמש בה; אם לא, קישור תוצאת חיפוש (גם אם הוא redirect) בסדר — הוא ייפתר בצד השרת.
- כל מבצע שאתה כולל בתשובה חייב להיות מגובה בקישור שבדקת בפועל עם url_context ואישרת שהוא נטען בהצלחה ומראה מידע רלוונטי על מבצעים באתר ${site.domain}.
- אם קישור מסוים נכשל, מחזיר 404, או שאינך מצליח לאמת אותו — פשוט דלג על אותו מבצע ונסה קישור אחר מהתוצאות. אל תסביר את זה בתשובה, ואל תיתקע בניסיונות חוזרים על אותו URL.
- אם בסופו של דבר לא נשאר אף מבצע מאומת באתר הזה, זה תקין — החזר "deals": [] .
- התשובה הסופית שלך חייבת להיות אך ורק בלוק ה-JSON, בלי שום טקסט הסבר, נימוק, התנצלות, או תיאור התהליך לפני או אחרי ה-JSON.

רשימת התגיות המותרת (בחר 1-2 שבאמת מתאימות למוצר, מהרשימה הזו בלבד):
${MASTER_TAG_LIST.join(', ')}, general

החזר JSON בלבד (ללא markdown), במבנה:
{
  "deals": [
    {
      "title": "שם המוצר",
      "description": "תיאור קצר",
      "source_url": "קישור ישיר לעמוד המוצר, מאומת עם url_context",
      "current_price": 149,
      "original_price": 249,
      "tags": ["תגית_אחת_או_שתיים"],
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
  const jsonSlice = extractBalancedJsonObject(text);
  if (!jsonSlice) {
    logger.warn('No JSON found in deal search response', { site: site.domain });
    return [];
  }
  try {
    const parsed = JSON.parse(escapeStringControlChars(jsonSlice)) as { deals?: RawDeal[] };
    return parsed.deals ?? [];
  } catch (err) {
    logger.warn('Malformed JSON in deal search response', { site: site.domain, err: (err as Error).message });
    return [];
  }
}

// text.indexOf('{')..lastIndexOf('}') breaks when the model adds any trailing
// content after the JSON block (which also happens to contain a '}') — walk
// brace depth instead, ignoring braces inside quoted strings, to find the
// end of the first complete top-level object.
function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// Models occasionally emit raw control characters (literal newlines/tabs)
// inside JSON string values instead of escaping them, which is technically
// invalid JSON — escape any control char found between unescaped quotes.
function escapeStringControlChars(json: string): string {
  let out = '', inString = false, escape = false;
  for (const ch of json) {
    if (escape) { out += ch; escape = false; continue; }
    if (ch === '\\') { out += ch; escape = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && ch.charCodeAt(0) < 0x20) {
      if (ch === '\n') out += '\\n';
      else if (ch === '\t') out += '\\t';
      else if (ch === '\r') out += '\\r';
      continue;
    }
    out += ch;
  }
  return out;
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

export interface FindDealsResult { inserted: number; skipped: number; sitesSearched: number }

export async function runFindDeals(): Promise<FindDealsResult> {
  let inserted = 0;
  let skipped = 0;

  for (const site of ALLOWED_SITES) {
    let deals: RawDeal[];
    try {
      deals = await searchSiteForDeals(site);
    } catch (err) {
      logger.error('Deal search failed for site', { site: site.domain, err: (err as Error).message });
      continue;
    }

    for (const deal of deals) {
      let url = normalizeUrl(deal.source_url);
      let resolvedSourceUrl = deal.source_url;
      if (url && url.hostname === 'vertexaisearch.cloud.google.com') {
        const resolved = await resolveFinalUrl(deal.source_url);
        url = resolved ? normalizeUrl(resolved) : null;
        if (resolved) resolvedSourceUrl = resolved;
      }
      // Enforced, not just prompted — reject anything not actually hosted on the requested domain.
      if (!url || !(url.hostname === site.domain || url.hostname.endsWith(`.${site.domain}`)) || deal.current_price == null) {
        skipped++;
        continue;
      }

      const outcome = await insertValidatedDeal({
        title: deal.title, description: deal.description, source_site: site.domain, source_url: resolvedSourceUrl,
        image_url: deal.image_url, current_price: deal.current_price, original_price: deal.original_price,
        tags: deal.tags ?? [], expires_at: deal.expires_at,
      });
      if (outcome.ok) inserted++;
      else { logger.warn('Skipped deal', { site: site.domain, reason: outcome.reason }); skipped++; }
    }
  }

  await deactivateExpiredDeals();

  logger.info('Deal search done', { inserted, skipped, sitesSearched: ALLOWED_SITES.length });
  return { inserted, skipped, sitesSearched: ALLOWED_SITES.length };
}
