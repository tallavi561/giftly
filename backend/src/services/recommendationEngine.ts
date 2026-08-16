// Shared recommendation scoring core — used identically by both the self-facing
// flow (routes/selfRecommendations.ts) and the per-contact flow
// (routes/recommendations.ts). The only difference between the two consumers
// is batch composition (how many items from which source), not this module.
//
// Implements spec §3-4 of Specs/Back/Giftly_FullSpec_ForImplementation_v1.1.pdf.
// See Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md §3 for the map from
// spec sections to the functions below.

import type { SupabaseClient } from '@supabase/supabase-js';
import { MASTER_TAG_LIST } from '../types/index.js';
import type {
  AgeBucket, CatalogGift, CatalogTag, SegmentStats, ScoredGift, TagStatsRow, CountryStatsRow,
} from '../types/index.js';

// ---- Tunable constants (spec Appendix A — recommended defaults) ----
export const MIN_PAIR_SUPPORT = 20;
export const MIN_TAG_SUPPORT = 15;
export const GLOBAL_MEAN = 0.6;
export const K_PRIOR_TAG = 10;
export const K_PRIOR_PAIR = 15;
export const DEMOGRAPHIC_WEIGHTS = { age: 1.2, gender: 1.0, country: 1.0 };
export const COARSE_FILTER_LIMIT = 100;

const AGE_BUCKETS: { max: number; label: AgeBucket }[] = [
  { max: 24, label: '18-24' }, { max: 34, label: '25-34' }, { max: 44, label: '35-44' },
  { max: 54, label: '45-54' }, { max: 64, label: '55-64' }, { max: Infinity, label: '65+' },
];

const AGE_BUCKET_COLUMN_PREFIX: Record<AgeBucket, string> = {
  '18-24': 'age_18_24', '25-34': 'age_25_34', '35-44': 'age_35_44',
  '45-54': 'age_45_54', '55-64': 'age_55_64', '65+': 'age_65p',
};

// ---- §3.2 / §3.3 — effective profile resolution (per-contact flow only) ----

export interface PreferenceSource {
  interests?: string[] | null;
  negative_prefs?: string[] | null;
}

export function resolveEffectivePreferences(
  selfProfile: PreferenceSource | null,
  contactAssessment: PreferenceSource,
): { effectivePositive: string[]; effectiveNegative: string[] } {
  const selfPositive = new Set(selfProfile?.interests ?? []);
  const selfNegative = new Set(selfProfile?.negative_prefs ?? []);
  const thirdPartyPositive = new Set(contactAssessment.interests ?? []);
  const thirdPartyNegative = new Set(contactAssessment.negative_prefs ?? []);

  const effectivePositive = new Set<string>();
  const effectiveNegative = new Set<string>();
  const allTags = new Set([...selfPositive, ...selfNegative, ...thirdPartyPositive, ...thirdPartyNegative]);

  for (const tag of allTags) {
    if (selfPositive.has(tag) || selfNegative.has(tag)) {
      // Self has a stated position — it wins, regardless of the third party's view.
      if (selfPositive.has(tag)) effectivePositive.add(tag);
      else effectiveNegative.add(tag);
    } else {
      // No self position — fall back to the third party's assessment.
      if (thirdPartyPositive.has(tag)) effectivePositive.add(tag);
      else if (thirdPartyNegative.has(tag)) effectiveNegative.add(tag);
    }
  }
  return { effectivePositive: [...effectivePositive], effectiveNegative: [...effectiveNegative] };
}

export function resolveEffectiveDemographics(
  selfProfile: { birth_date?: string | null; country?: string | null } | null,
  contact: { birth_date?: string | null; country?: string | null },
): { birthDate: string | null; country: string | null } {
  return {
    birthDate: selfProfile?.birth_date ?? contact.birth_date ?? null,
    country: selfProfile?.country ?? contact.country ?? null,
  };
}

// ---- §4.1 — sanitization ----

export function sanitize(effectivePositive: string[], effectiveNegative: string[]) {
  const negativeSet = new Set(effectiveNegative);
  const cleanInterests = effectivePositive.filter(t => !negativeSet.has(t));
  const promptNegatives = effectiveNegative.slice(-4); // token budget — only the 4 most recent
  return { cleanInterests, promptNegatives };
}

// ---- §4.4 — age bucket ----

export function getAgeBucket(birthDate: string | null): AgeBucket | null {
  if (!birthDate) return null;
  const ageMs = Date.now() - new Date(birthDate).getTime();
  const age = Math.floor(ageMs / (365.25 * 24 * 3600 * 1000));
  return AGE_BUCKETS.find(b => age <= b.max)!.label;
}

// ---- §4.2 — coarse filter (SQL) ----

export async function coarseFilter(
  db: SupabaseClient,
  cleanInterests: string[],
  budgetMin?: number | null,
  budgetMax?: number | null,
): Promise<CatalogGift[]> {
  if (cleanInterests.length === 0) return [];
  let query = db.from('good_gifts_catalog').select('*').overlaps('tags', cleanInterests).limit(COARSE_FILTER_LIMIT);
  if (budgetMin != null) query = query.gte('estimated_price', budgetMin);
  if (budgetMax != null) query = query.lte('estimated_price', budgetMax);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CatalogGift[];
}

// ---- §4.3 — fetchSegmentStats: one query per tag present among candidates, not N+1 ----

function groupCandidatesByTag(candidates: CatalogGift[]): Map<string, string[]> {
  const byTag = new Map<string, string[]>();
  for (const gift of candidates) {
    for (const tag of gift.tags) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push(gift.id);
    }
  }
  return byTag;
}

export async function fetchSegmentStats(
  db: SupabaseClient,
  candidates: CatalogGift[],
  ageBucket: AgeBucket | null,
  country: string | null,
): Promise<Map<string, SegmentStats>> {
  const result = new Map<string, SegmentStats>();
  const ensure = (giftId: string): SegmentStats => {
    if (!result.has(giftId)) result.set(giftId, { interests: {}, interest_age: {}, interest_country: {} });
    return result.get(giftId)!;
  };

  const byTag = groupCandidatesByTag(candidates);
  const ageCol = ageBucket ? AGE_BUCKET_COLUMN_PREFIX[ageBucket] : null;

  for (const [tag, ids] of byTag) {
    if (!isKnownTag(tag)) continue; // ignore any stray tag not backed by a gift_stats_<tag> table
    const { data: rows, error } = await db.from(`gift_stats_${tag}`).select('*').in('gift_id', ids);
    if (error) throw error;
    for (const row of (rows ?? []) as TagStatsRow[]) {
      const stats = ensure(row.gift_id);
      stats.interests[tag] = { shown: row.overall_shown, liked: row.overall_liked };
      if (ageCol) {
        const shown = (row as unknown as Record<string, number>)[`${ageCol}_shown`];
        const liked = (row as unknown as Record<string, number>)[`${ageCol}_liked`];
        stats.interest_age[`${tag}|${ageBucket}`] = { shown, liked };
      }
    }

    if (country) {
      const { data: countryRows, error: ce } = await db
        .from('gift_country_stats').select('*').eq('tag', tag).eq('country', country).in('gift_id', ids);
      if (ce) throw ce;
      for (const row of (countryRows ?? []) as CountryStatsRow[]) {
        ensure(row.gift_id).interest_country[`${tag}|${country}`] = { shown: row.shown, liked: row.liked };
      }
    }
  }
  return result;
}

function isKnownTag(tag: string): tag is CatalogTag {
  return (MASTER_TAG_LIST as readonly string[]).includes(tag) || tag === 'general';
}

// ---- §4.4 — primaryTag ----

export function getPrimaryTag(gift: CatalogGift, segmentStats: SegmentStats | undefined, cleanInterests: string[]): string | null {
  const overlap = gift.tags.filter(t => cleanInterests.includes(t));
  if (overlap.length === 0) return null;
  if (overlap.length === 1) return overlap[0];
  // Multiple overlapping tags — pick the one with the highest `shown` in this segment,
  // not an average/intersection across unrelated tags.
  return overlap.reduce((best, tag) => {
    const shown = segmentStats?.interests?.[tag]?.shown ?? 0;
    const bestShown = segmentStats?.interests?.[best]?.shown ?? 0;
    return shown > bestShown ? tag : best;
  }, overlap[0]);
}

// ---- §4.5 — hierarchical two-dimensional backoff ----

export interface EffectiveRate { liked: number; shown: number; source: string }

export function getEffectiveRate(
  gift: CatalogGift,
  segmentStats: SegmentStats | undefined,
  primaryTag: string | null,
  ageBucket: AgeBucket | null,
  country: string | null,
  thresholds = { pair: MIN_PAIR_SUPPORT, tag: MIN_TAG_SUPPORT },
): EffectiveRate {
  if (!primaryTag) return { liked: gift.global_liked, shown: gift.global_shown, source: 'global' };

  const pairCandidates: EffectiveRate[] = [];
  if (ageBucket) {
    const ageKey = `${primaryTag}|${ageBucket}`;
    const ageStats = segmentStats?.interest_age?.[ageKey];
    if (ageStats && ageStats.shown >= thresholds.pair) {
      pairCandidates.push({ liked: ageStats.liked, shown: ageStats.shown, source: `interest+age:${ageKey}` });
    }
  }
  if (country) {
    const countryKey = `${primaryTag}|${country}`;
    const countryStats = segmentStats?.interest_country?.[countryKey];
    if (countryStats && countryStats.shown >= thresholds.pair) {
      pairCandidates.push({ liked: countryStats.liked, shown: countryStats.shown, source: `interest+country:${countryKey}` });
    }
  }
  if (pairCandidates.length > 0) {
    return pairCandidates.sort((a, b) => b.shown - a.shown)[0]; // prefer whichever has more `shown`
  }

  const tagStats = segmentStats?.interests?.[primaryTag];
  if (tagStats && tagStats.shown >= thresholds.tag) {
    return { liked: tagStats.liked, shown: tagStats.shown, source: `interest:${primaryTag}` };
  }

  return { liked: gift.global_liked, shown: gift.global_shown, source: 'global' };
}

// ---- §4.6 — Bayesian smoothing ----

export function smoothedRate(liked: number, shown: number, globalMean = GLOBAL_MEAN, k = K_PRIOR_TAG): number {
  const alpha = globalMean * k;
  const beta = (1 - globalMean) * k;
  return (liked + alpha) / (shown + alpha + beta);
}

function kForSource(source: string): number {
  return source.startsWith('interest+') ? K_PRIOR_PAIR : K_PRIOR_TAG;
}

// ---- §4.7 — full ranked candidate list ----

export function computeScore(
  gift: CatalogGift,
  segmentStats: SegmentStats | undefined,
  cleanInterests: string[],
  ageBucket: AgeBucket | null,
  country: string | null,
): { score: number; primaryTag: string | null } {
  const primaryTag = getPrimaryTag(gift, segmentStats, cleanInterests);
  const rate = getEffectiveRate(gift, segmentStats, primaryTag, ageBucket, country);
  const score = smoothedRate(rate.liked, rate.shown, GLOBAL_MEAN, kForSource(rate.source));
  return { score, primaryTag };
}

export async function getRankedCandidates(
  db: SupabaseClient,
  params: { cleanInterests: string[]; budgetMin?: number | null; budgetMax?: number | null; ageBucket: AgeBucket | null; country: string | null },
): Promise<ScoredGift[]> {
  const candidates = await coarseFilter(db, params.cleanInterests, params.budgetMin, params.budgetMax);
  if (candidates.length === 0) return []; // no catalog match — caller falls back to pure Gemini exploration
  const statsByGift = await fetchSegmentStats(db, candidates, params.ageBucket, params.country);

  return candidates
    .map((gift): ScoredGift => {
      const segmentStats = statsByGift.get(gift.id);
      const { score, primaryTag } = computeScore(gift, segmentStats, params.cleanInterests, params.ageBucket, params.country);
      return { ...gift, segment_stats: segmentStats, score, primaryTag };
    })
    .sort((a, b) => b.score - a.score);
}

// ---- §4.8 — demographic closeness (independent of interest tags) ----

async function sumStatColumnAcrossTagTables(
  db: SupabaseClient, giftId: string, shownCol: string, likedCol: string,
): Promise<{ shown: number; liked: number }> {
  let shown = 0, liked = 0;
  await Promise.all(ALL_TAG_TABLES.map(async tag => {
    const { data, error } = await db.from(`gift_stats_${tag}`).select('*').eq('gift_id', giftId).maybeSingle();
    if (error || !data) return;
    const row = data as unknown as Record<string, number>;
    shown += row[shownCol] ?? 0;
    liked += row[likedCol] ?? 0;
  }));
  return { shown, liked };
}

const ALL_TAG_TABLES = [...MASTER_TAG_LIST, 'general'];

export async function getDemographicCloseness(
  db: SupabaseClient,
  giftId: string,
  ageBucket: AgeBucket | null,
  gender: string | null,
  country: string | null,
): Promise<number> {
  const [ageAgg, genderAgg, countryRow] = await Promise.all([
    ageBucket
      ? sumStatColumnAcrossTagTables(db, giftId, `${AGE_BUCKET_COLUMN_PREFIX[ageBucket]}_shown`, `${AGE_BUCKET_COLUMN_PREFIX[ageBucket]}_liked`)
      : Promise.resolve({ shown: 0, liked: 0 }),
    gender === 'male' || gender === 'female'
      ? sumStatColumnAcrossTagTables(db, giftId, `gender_${gender}_shown`, `gender_${gender}_liked`)
      : Promise.resolve({ shown: 0, liked: 0 }),
    country
      ? db.from('gift_country_stats').select('shown, liked').eq('gift_id', giftId).eq('country', country)
          .then(({ data }) => (data ?? []).reduce((acc, r) => ({ shown: acc.shown + r.shown, liked: acc.liked + r.liked }), { shown: 0, liked: 0 }))
      : Promise.resolve({ shown: 0, liked: 0 }),
  ]);

  const rateAge = smoothedRate(ageAgg.liked, ageAgg.shown, GLOBAL_MEAN, K_PRIOR_TAG);
  const rateGender = smoothedRate(genderAgg.liked, genderAgg.shown, GLOBAL_MEAN, K_PRIOR_TAG);
  const rateCountry = smoothedRate(countryRow.liked, countryRow.shown, GLOBAL_MEAN, K_PRIOR_TAG);

  return DEMOGRAPHIC_WEIGHTS.age * rateAge + DEMOGRAPHIC_WEIGHTS.gender * rateGender + DEMOGRAPHIC_WEIGHTS.country * rateCountry;
}

// ---- §4.9 — item-based collaborative filtering (read side; the batch job that
// computes gift_neighbors lives in routes/cron.ts) ----

export async function getCollaborativeNeighbors(
  db: SupabaseClient,
  likedGiftIds: string[],
  budgetMin?: number | null,
  budgetMax?: number | null,
  excludeIds: string[] = [],
): Promise<CatalogGift[]> {
  if (likedGiftIds.length === 0) return [];
  const { data: neighborRows, error } = await db
    .from('gift_neighbors').select('neighbor_gift_id, similarity').in('gift_id', likedGiftIds).order('similarity', { ascending: false });
  if (error) throw error;

  const excludeSet = new Set(excludeIds);
  const neighborIds = [...new Set((neighborRows ?? []).map(r => r.neighbor_gift_id))].filter(id => !excludeSet.has(id));
  if (neighborIds.length === 0) return [];

  let query = db.from('good_gifts_catalog').select('*').in('id', neighborIds);
  if (budgetMin != null) query = query.gte('estimated_price', budgetMin);
  if (budgetMax != null) query = query.lte('estimated_price', budgetMax);
  const { data, error: ge } = await query;
  if (ge) throw ge;
  return (data ?? []) as CatalogGift[];
}

// ---- shared entry point (spec §1.3 / §2 "core") ----

export interface CoreResult {
  cleanInterests: string[];
  promptNegatives: string[];
  effectiveAgeBucket: AgeBucket | null;
  effectiveCountry: string | null;
  rankedCandidates: ScoredGift[];
}

/**
 * The single core both flows call. selfProfile is null for the self-facing
 * flow (no third party involved — effectivePositive/effectiveNegative are
 * simply the person's own interests/negative_prefs, passed as contactAssessment).
 */
export async function getRecommendations(
  db: SupabaseClient,
  params: {
    selfProfile: PreferenceSource & { birth_date?: string | null; country?: string | null } | null;
    contactAssessment: PreferenceSource & { birth_date?: string | null; country?: string | null };
    budgetMin?: number | null;
    budgetMax?: number | null;
  },
): Promise<CoreResult> {
  const { effectivePositive, effectiveNegative } = resolveEffectivePreferences(params.selfProfile, params.contactAssessment);
  const { birthDate, country } = resolveEffectiveDemographics(params.selfProfile, params.contactAssessment);
  const { cleanInterests, promptNegatives } = sanitize(effectivePositive, effectiveNegative);
  const effectiveAgeBucket = getAgeBucket(birthDate);

  const rankedCandidates = await getRankedCandidates(db, {
    cleanInterests, budgetMin: params.budgetMin, budgetMax: params.budgetMax,
    ageBucket: effectiveAgeBucket, country,
  });

  return { cleanInterests, promptNegatives, effectiveAgeBucket, effectiveCountry: country, rankedCandidates };
}
