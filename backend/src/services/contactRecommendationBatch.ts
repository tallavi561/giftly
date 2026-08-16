// Batch composition for the per-contact recommendation flow (spec §6).
// Mirrors selfRecommendationBatch.ts's role for the self-facing flow: this is
// where "how many items from which source" lives, on top of the shared
// scoring core in recommendationEngine.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgeBucket, CatalogGift } from '../types/index.js';
import {
  getRankedCandidates, getDemographicCloseness, getCollaborativeNeighbors,
  DEMOGRAPHIC_WEIGHTS, resolveEffectivePreferences, resolveEffectiveDemographics, sanitize, getAgeBucket,
  type ScoredGiftRef,
} from './recommendationEngine.js';

const PROVEN_TARGET = 6; // spec §6.1 — tier1 + tier2 always fill up to 6
const DEMOGRAPHIC_POOL_SIZE = 50; // same perf simplification as selfRecommendationBatch.ts
const DEDUP_WINDOW_DAYS = 30;

// Resolves everything the scoring core + Gemini prompt need for one contact:
// effective preferences/demographics per spec §3, plus the fields §3 doesn't
// cover (name/gender/relationship_status/has_children/religion) using the
// same "linked profile wins, relationship label never overridden" rule.
// Shared by the recommendations routes and the second-chance cron job.
export async function loadEffectiveContext(db: SupabaseClient, contact: any) {
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

// spec §11 "Dedup לאותו נמען": 30-day window on this contact's own
// recommendations, unioned with everything ever shown to the recipient's own
// self-suggestions feed (no time limit) if the contact is linked.
//
// spec §7.4 "second chance": a row the second-chance cron has flagged
// (second_chance_shown_at set, still unrated) is exempted from this window
// exactly once, so it can be offered again instead of being silently
// dedup'd away forever.
export async function getExclusionSet(
  db: SupabaseClient,
  contact: { id: string; linked_user_id: string | null },
): Promise<Set<string>> {
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const [{ data: recentRecs }, selfShown] = await Promise.all([
    db.from('recommendations').select('gift_id').eq('contact_id', contact.id).gte('created_at', windowStart)
      .not('gift_id', 'is', null).is('second_chance_shown_at', null),
    contact.linked_user_id
      ? db.from('self_gift_suggestions').select('gift_id').eq('user_id', contact.linked_user_id).not('gift_id', 'is', null)
          .then(({ data }) => data ?? [])
      : Promise.resolve([] as { gift_id: string }[]),
  ]);
  const ids = [...(recentRecs ?? []).map(r => r.gift_id), ...selfShown.map(r => r.gift_id)] as string[];
  return new Set(ids);
}

// tier1 — "proven personally": gifts the linked recipient already rated >=4 on
// their own self-suggestions feed. Shown as-is, never rewritten by Gemini.
export async function getSelfApprovedGifts(
  db: SupabaseClient,
  linkedUserId: string,
  excludeIds: Set<string>,
): Promise<CatalogGift[]> {
  const { data, error } = await db
    .from('self_gift_suggestions')
    .select('gift_id, good_gifts_catalog(*)')
    .eq('user_id', linkedUserId)
    .gte('rating', 4)
    .not('gift_id', 'is', null);
  if (error) throw error;

  const seen = new Set<string>();
  const gifts: CatalogGift[] = [];
  for (const row of data ?? []) {
    const gift = (row as any).good_gifts_catalog as CatalogGift | null;
    if (!gift || seen.has(gift.id) || excludeIds.has(gift.id)) continue;
    seen.add(gift.id);
    gifts.push(gift);
  }
  return gifts;
}

// tier2 fill — the combined ranked pool per spec §6.1: interest-based
// candidates (§4.7), demographic closeness (§4.8), and CF neighbors seeded
// from tier1 (§4.9), merged into one list with a shared, comparable score.
// Interest score and CF similarity are both already ~0-1; demographic
// closeness is normalized by its own weight sum to land in the same range.
export async function getContactRankedCandidates(
  db: SupabaseClient,
  params: {
    cleanInterests: string[]; budgetMin?: number | null; budgetMax?: number | null;
    ageBucket: AgeBucket | null; gender: string | null; country: string | null;
    tier1GiftIds: string[]; excludeIds: Set<string>;
  },
): Promise<ScoredGiftRef[]> {
  const merged = new Map<string, ScoredGiftRef>();

  const interestRanked = await getRankedCandidates(db, {
    cleanInterests: params.cleanInterests, budgetMin: params.budgetMin, budgetMax: params.budgetMax,
    ageBucket: params.ageBucket, country: params.country,
  });
  for (const g of interestRanked) {
    if (params.excludeIds.has(g.id)) continue;
    merged.set(g.id, { gift: g, score: g.score });
  }

  const { data: pool } = await db.from('good_gifts_catalog').select('*').limit(DEMOGRAPHIC_POOL_SIZE);
  const demographicWeightSum = DEMOGRAPHIC_WEIGHTS.age + DEMOGRAPHIC_WEIGHTS.gender + DEMOGRAPHIC_WEIGHTS.country;
  for (const gift of (pool ?? []) as CatalogGift[]) {
    if (params.excludeIds.has(gift.id) || merged.has(gift.id)) continue;
    const price = gift.estimated_price ?? 0;
    if (params.budgetMin != null && price < params.budgetMin) continue;
    if (params.budgetMax != null && price > params.budgetMax) continue;
    const closeness = await getDemographicCloseness(db, gift.id, params.ageBucket, params.gender, params.country);
    merged.set(gift.id, { gift, score: closeness / demographicWeightSum });
  }

  if (params.tier1GiftIds.length > 0) {
    const neighbors = await getCollaborativeNeighbors(
      db, params.tier1GiftIds, params.budgetMin, params.budgetMax, [...params.excludeIds, ...merged.keys()],
    );
    for (const { gift, similarity } of neighbors) {
      if (merged.has(gift.id)) continue;
      merged.set(gift.id, { gift, score: similarity });
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score);
}

export interface ProvenCandidates { tier1: CatalogGift[]; tier2: ScoredGiftRef[] }

export async function getProvenCandidates(
  db: SupabaseClient,
  params: {
    linkedUserId: string | null; cleanInterests: string[]; budgetMin?: number | null; budgetMax?: number | null;
    ageBucket: AgeBucket | null; gender: string | null; country: string | null; excludeIds: Set<string>;
  },
): Promise<ProvenCandidates> {
  const tier1 = params.linkedUserId ? await getSelfApprovedGifts(db, params.linkedUserId, params.excludeIds) : [];
  const remaining = PROVEN_TARGET - tier1.length;
  if (remaining <= 0) return { tier1: tier1.slice(0, PROVEN_TARGET), tier2: [] };

  const tier1Ids = new Set(tier1.map(g => g.id));
  const combinedExclude = new Set([...params.excludeIds, ...tier1Ids]);
  const ranked = await getContactRankedCandidates(db, {
    cleanInterests: params.cleanInterests, budgetMin: params.budgetMin, budgetMax: params.budgetMax,
    ageBucket: params.ageBucket, gender: params.gender, country: params.country,
    tier1GiftIds: [...tier1Ids], excludeIds: combinedExclude,
  });
  return { tier1, tier2: ranked.slice(0, remaining) };
}

// spec §8/Appendix A — dedup default: normalized exact match. Used to decide
// whether Gemini adopted one of the catalogExamples we offered it almost
// as-is, so future feedback lands on that catalog row instead of creating a
// duplicate (spec §8 matchToPromptCatalogExamples).
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
}

export function matchToPromptCatalogExamples(recTitle: string, catalogExamples: CatalogGift[]): CatalogGift | null {
  const normalized = normalizeTitle(recTitle);
  return catalogExamples.find(g => normalizeTitle(g.title) === normalized) ?? null;
}
