import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { generateGiftRecommendations } from '../services/gemini.js';
import {
  resolveEffectivePreferences, resolveEffectiveDemographics, sanitize, getAgeBucket, getTopGlobalCandidates,
} from '../services/recommendationEngine.js';
import { getExclusionSet, getProvenCandidates, getContactRankedCandidates, getSelfApprovedGifts, matchToPromptCatalogExamples } from '../services/contactRecommendationBatch.js';
import { applyRatingFeedback } from '../services/catalogFeedback.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest, CatalogGift } from '../types/index.js';

const router = Router();
const logger = new Logger('recommendations');

// How many generate calls (first-page / Gemini) are allowed per user per week (spec §9)
const WEEKLY_CALLS_LIMIT = Number(process.env.WEEKLY_REC_CALLS ?? 5);
const SESSION_CAP = 30; // spec §6.3
const PAGE_SIZE = 10; // spec Appendix A
const TOP_GLOBAL_COUNT = 2; // spec §6.1 source #3

interface RecommendationRow {
  contact_id: string; event_id: string; gift_id: string | null; title: string; description: string | null;
  estimated_price: number | null; category: string | null; category_tag: string | null; search_query: string | null;
  score: number | null; batch_id: string; source: 'gemini' | 'compute';
}

function catalogRow(
  gift: CatalogGift, contactId: string, eventId: string, batchId: string, source: 'gemini' | 'compute', score: number | null,
): RecommendationRow {
  return {
    contact_id: contactId, event_id: eventId, gift_id: gift.id, title: gift.title, description: gift.description,
    estimated_price: gift.estimated_price, category: gift.category, category_tag: gift.tags[0] ?? null,
    search_query: gift.search_query, score, batch_id: batchId, source,
  };
}

// Resolves everything the scoring core + Gemini prompt need for one contact:
// effective preferences/demographics per spec §3, plus the fields §3 doesn't
// cover (name/gender/relationship_status/has_children/religion) using the
// same "linked profile wins, relationship label never overridden" rule.
async function loadEffectiveContext(db: ReturnType<typeof supabaseForUser>, contact: any) {
  const linkedProfile = contact.linked_user_id
    ? (await db.from('user_profiles')
        .select('display_name, interests, negative_prefs, bio, birth_date, country, gender, relationship_status, has_children, religion')
        .eq('user_id', contact.linked_user_id).single()).data
    : null;

  const { effectivePositive, effectiveNegative } = resolveEffectivePreferences(linkedProfile, contact);
  const { birthDate, country } = resolveEffectiveDemographics(linkedProfile, contact);
  const { cleanInterests, promptNegatives } = sanitize(effectivePositive, effectiveNegative);
  const ageBucket = getAgeBucket(birthDate);

  return {
    cleanInterests, promptNegatives, ageBucket, country, birthDate,
    gender: linkedProfile?.gender ?? contact.gender ?? null,
    name: linkedProfile?.display_name ?? contact.name,
    relationship_status: linkedProfile?.relationship_status ?? contact.relationship_status ?? null,
    has_children: linkedProfile?.has_children ?? contact.has_children ?? null,
    religion: linkedProfile?.religion ?? contact.religion ?? null,
    free_text: linkedProfile?.bio ?? contact.free_text ?? null,
  };
}

// POST /api/recommendations — first request for a contact+event (spec §6.1)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { token, user } = req as AuthRequest;
  const { contact_id, event_id } = req.body as { contact_id: string; event_id: string };
  logger.info('Generate recommendations', { contact_id, event_id });

  const db = supabaseForUser(token);

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count, error: countErr } = await db
    .from('recommendation_calls')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', weekAgo);
  if (countErr) { logger.error('Rate limit check failed', countErr); return void res.status(500).json({ error: countErr.message }); }
  if ((count ?? 0) >= WEEKLY_CALLS_LIMIT) {
    return void res.status(429).json({
      error: `הגעת למגבלת ${WEEKLY_CALLS_LIMIT} חיפושי AI לשבוע. הגבלה תתאפס ב-7 ימים.`,
      limit: WEEKLY_CALLS_LIMIT, used: count,
    });
  }

  const [{ data: contact, error: ce }, { data: event, error: ee }] = await Promise.all([
    db.from('contacts').select('*').eq('id', contact_id).single(),
    db.from('events').select('*').eq('id', event_id).single(),
  ]);
  if (ce || !contact) return void res.status(404).json({ error: 'Contact not found' });
  if (ee || !event) return void res.status(404).json({ error: 'Event not found' });

  const ctx = await loadEffectiveContext(db, contact);
  const excludeIds = await getExclusionSet(db, contact);

  const { tier1, tier2 } = await getProvenCandidates(db, {
    linkedUserId: contact.linked_user_id, cleanInterests: ctx.cleanInterests,
    budgetMin: event.budget_min, budgetMax: event.budget_max,
    ageBucket: ctx.ageBucket, gender: ctx.gender, country: ctx.country, excludeIds,
  });
  const provenCount = tier1.length + tier2.length;
  const provenIds = new Set([...tier1.map(g => g.id), ...tier2.map(t => t.gift.id)]);
  const geminiCount = 2 + (6 - provenCount); // spec §6.1

  const dedupTitles = [...tier1.map(g => g.title), ...tier2.map(t => t.gift.title)];
  const catalogExamples = [...tier1, ...tier2.map(t => t.gift)].slice(0, 2);

  let geminiRows: RecommendationRow[] = [];
  try {
    const result = await generateGiftRecommendations({
      profile: {
        name: ctx.name, relationship: contact.relationship, interests: ctx.cleanInterests, free_text: ctx.free_text,
        gender: ctx.gender, relationship_status: ctx.relationship_status, has_children: ctx.has_children, religion: ctx.religion,
      },
      event, budget_min: event.budget_min, budget_max: event.budget_max,
      count: geminiCount, promptNegatives: ctx.promptNegatives, dedupTitles, catalogExamples,
    });
    geminiRows = result.recommendations.map(r => {
      const matched = matchToPromptCatalogExamples(r.title, catalogExamples);
      return {
        contact_id, event_id, gift_id: matched?.id ?? null, title: r.title, description: r.description,
        estimated_price: r.estimated_price, category: r.category, category_tag: matched?.tags[0] ?? r.category_tag ?? null,
        search_query: r.search_query, score: null, batch_id: '', source: 'gemini' as const,
      };
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'GEMINI_QUOTA_EXCEEDED') return void res.status(429).json({ error: 'הגענו למגבלת ה-AI היומית. נסה שוב מחר.' });
    logger.error('Gemini generation failed', err);
    return void res.status(502).json({ error: `Gemini error: ${msg}` });
  }

  const topGlobal = await getTopGlobalCandidates(db, TOP_GLOBAL_COUNT, [...excludeIds, ...provenIds], event.budget_min, event.budget_max);

  const batchId = randomUUID();
  const rows: RecommendationRow[] = [
    ...tier1.map(g => catalogRow(g, contact_id, event_id, batchId, 'gemini', null)),
    ...tier2.map(t => catalogRow(t.gift, contact_id, event_id, batchId, 'gemini', t.score)),
    ...geminiRows.map(r => ({ ...r, batch_id: batchId })),
    ...topGlobal.map(t => catalogRow(t.gift, contact_id, event_id, batchId, 'gemini', t.score)),
  ];

  const { data: saved, error: se } = await db.from('recommendations').insert(rows).select();
  if (se) { logger.error('Save recommendations failed', se); return void res.status(500).json({ error: se.message }); }

  await db.from('recommendation_calls').insert({ user_id: user.id });

  logger.info('Recommendations saved', { count: saved?.length, provenCount, geminiCount, callsUsed: (count ?? 0) + 1 });
  res.json({ recommendations: saved, batch_id: batchId, rate_limit: { used: (count ?? 0) + 1, limit: WEEKLY_CALLS_LIMIT } });
});

// POST /api/recommendations/search-more — compute-only pagination, no Gemini call (spec §6.2)
router.post('/search-more', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { contact_id, batch_id } = req.body as { contact_id: string; batch_id: string };
  const db = supabaseForUser(token);

  const { count: shownCount, error: countErr } = await db
    .from('recommendations').select('id', { count: 'exact', head: true }).eq('batch_id', batch_id);
  if (countErr) return void res.status(500).json({ error: countErr.message });
  if ((shownCount ?? 0) >= SESSION_CAP) return void res.json({ done: true, reason: 'CAP_REACHED', items: [] });

  const [{ data: contact, error: ce }, { data: shown }, { data: firstRow }] = await Promise.all([
    db.from('contacts').select('*').eq('id', contact_id).single(),
    db.from('recommendations').select('gift_id').eq('batch_id', batch_id).not('gift_id', 'is', null),
    db.from('recommendations').select('event_id').eq('batch_id', batch_id).limit(1).single(),
  ]);
  if (ce || !contact) return void res.status(404).json({ error: 'Contact not found' });
  if (!firstRow) return void res.status(404).json({ error: 'Batch not found' });

  const { data: event } = await db.from('events').select('*').eq('id', firstRow.event_id).single();
  if (!event) return void res.status(404).json({ error: 'Event not found' });

  const ctx = await loadEffectiveContext(db, contact);
  const alreadyShownIds = new Set((shown ?? []).map(r => r.gift_id as string));
  const dedupExclude = await getExclusionSet(db, contact);
  const excludeIds = new Set([...alreadyShownIds, ...dedupExclude]);
  // Re-seed CF from the same tier1 gifts the first page used, so the pool
  // this page draws from is consistent with the one computed in §6.1 —
  // tier1 items themselves are already excluded via alreadyShownIds.
  const tier1Ids = contact.linked_user_id
    ? (await getSelfApprovedGifts(db, contact.linked_user_id, new Set())).map(g => g.id)
    : [];

  const ranked = await getContactRankedCandidates(db, {
    cleanInterests: ctx.cleanInterests, budgetMin: event.budget_min, budgetMax: event.budget_max,
    ageBucket: ctx.ageBucket, gender: ctx.gender, country: ctx.country, tier1GiftIds: tier1Ids, excludeIds,
  });

  const pageSize = Math.min(PAGE_SIZE, SESSION_CAP - (shownCount ?? 0));
  const nextPage = ranked.slice(0, pageSize);
  if (nextPage.length === 0) return void res.json({ done: true, items: [] });

  const rows = nextPage.map(t => catalogRow(t.gift, contact_id, event.id, batch_id, 'compute', t.score));
  const { data: saved, error: se } = await db.from('recommendations').insert(rows).select();
  if (se) return void res.status(500).json({ error: se.message });

  res.json({ done: nextPage.length < pageSize, items: saved });
});

// PATCH /api/recommendations/:id/rate — binary fit/not-fit (spec §7.3)
router.patch('/:id/rate', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { fit } = req.body as { fit: 'FIT' | 'NOT_FIT' };
  if (fit !== 'FIT' && fit !== 'NOT_FIT') return void res.status(400).json({ error: 'fit must be FIT or NOT_FIT' });

  const db = supabaseForUser(token);
  const { data: rec, error: fe } = await db.from('recommendations').select('*').eq('id', req.params.id).single();
  if (fe || !rec) return void res.status(404).json({ error: 'Recommendation not found' });

  const { data: contact } = await db.from('contacts').select('*').eq('id', rec.contact_id).single();
  const ctx = contact ? await loadEffectiveContext(db, contact) : null;
  const rating = fit === 'FIT' ? 5 : 2;

  await applyRatingFeedback(db, {
    giftId: rec.gift_id ?? null, categoryTag: rec.category_tag ?? null,
    birthDate: ctx?.birthDate ?? null, gender: ctx?.gender ?? null, country: ctx?.country ?? null,
    rating, feedbackReason: null, // spec §7.3 — binary flow never asks a reason
  });

  const { data, error } = await db.from('recommendations').update({ rating }).eq('id', req.params.id).select().single();
  if (error) { logger.error('Rate recommendation failed', error); return void res.status(400).json({ error: error.message }); }
  res.json(data);
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  let query = db.from('recommendations').select('*, contact:contacts(name)').order('created_at', { ascending: false });
  if (req.query.contact_id) query = query.eq('contact_id', req.query.contact_id as string);
  if (req.query.event_id) query = query.eq('event_id', req.query.event_id as string);
  const { data, error } = await query;
  if (error) return void res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
