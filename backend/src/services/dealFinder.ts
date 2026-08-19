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

async function searchSiteForDeals(site: { domain: string; label: string }): Promise<RawDeal[]> {
  const prompt = `
חפש באינטרנט, אך ורק באתר ${site.label} (${site.domain}), 5-8 מבצעים/הנחות משמעותיים וזמינים כרגע (אחוז הנחה גבוה במיוחד, לא מחיר קבוע רגיל).
כל מבצע חייב לכלול קישור אמיתי וישיר לעמוד המוצר באתר ${site.domain} עצמו — אל תמציא קישורים.

רשימת התגיות המותרת (בחר 1-2 שבאמת מתאימות למוצר, מהרשימה הזו בלבד):
${MASTER_TAG_LIST.join(', ')}, general

החזר JSON בלבד (ללא markdown), במבנה:
{
  "deals": [
    {
      "title": "שם המוצר",
      "description": "תיאור קצר",
      "source_url": "קישור ישיר לעמוד המוצר",
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
      tools: [{ google_search: {} }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json() as any;
  const text: string = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    logger.warn('No JSON found in deal search response', { site: site.domain });
    return [];
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as { deals?: RawDeal[] };
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
      const url = normalizeUrl(deal.source_url);
      // Enforced, not just prompted — reject anything not actually hosted on the requested domain.
      if (!url || !(url.hostname === site.domain || url.hostname.endsWith(`.${site.domain}`)) || deal.current_price == null) {
        skipped++;
        continue;
      }

      const outcome = await insertValidatedDeal({
        title: deal.title, description: deal.description, source_site: site.domain, source_url: deal.source_url,
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
