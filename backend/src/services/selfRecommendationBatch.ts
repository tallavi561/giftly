// Composes the 15-item self-suggestion batch (spec §5.2): a fixed mix of five
// sources so the feed stays useful even when the catalog is young/empty, and
// never turns into a pure echo chamber of "what you already said you like".

import type { SupabaseClient } from '@supabase/supabase-js';
import { MASTER_TAG_LIST } from '../types/index.js';
import type { AgeBucket, CatalogGift } from '../types/index.js';
import { getRankedCandidates, getDemographicCloseness, smoothedRate, GLOBAL_MEAN, K_PRIOR_TAG } from './recommendationEngine.js';

const OFF_TAG_PROBABILITY = 0.075; // 5-10% recommended range (spec Appendix A)
const DEMOGRAPHIC_SAMPLE_POOL = 50; // perf simplification — see getDemographicSample below

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sampleWithoutReplacement<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

async function rankedGiftsForTag(db: SupabaseClient, tag: string, ageBucket: AgeBucket | null, country: string | null): Promise<CatalogGift[]> {
  const ranked = await getRankedCandidates(db, { cleanInterests: [tag], budgetMin: null, budgetMax: null, ageBucket, country });
  return ranked;
}

// spec §5.2 sub-table: top-5-random exploitation (2) / niche 30%-bottom explore (1) / broad-random explore (1)
async function buildSlotsForTag(db: SupabaseClient, tag: string, ageBucket: AgeBucket | null, country: string | null): Promise<CatalogGift[]> {
  const tagGifts = await rankedGiftsForTag(db, tag, ageBucket, country);
  if (tagGifts.length === 0) return [];

  const top5 = tagGifts.slice(0, 5);
  const bottomCount = Math.max(1, Math.ceil(tagGifts.length * 0.3));
  const bottom30 = tagGifts.slice(-bottomCount);
  const middle = tagGifts.slice(5, tagGifts.length - bottom30.length);

  const exploitation = sampleWithoutReplacement(top5.length ? top5 : tagGifts, Math.min(2, top5.length || tagGifts.length));
  const explorationNiche = [randomFrom(bottom30)];
  const explorationBroad = middle.length ? [randomFrom(middle)] : [randomFrom(tagGifts)];

  return [...exploitation, ...explorationNiche, ...explorationBroad];
}

async function getTopGlobalSample(db: SupabaseClient, n: number): Promise<CatalogGift[]> {
  const { data, error } = await db.from('good_gifts_catalog').select('*').limit(200);
  if (error) throw error;
  const ranked = ((data ?? []) as CatalogGift[])
    .map(g => ({ gift: g, rate: smoothedRate(g.global_liked, g.global_shown, GLOBAL_MEAN, K_PRIOR_TAG) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10)
    .map(x => x.gift);
  return sampleWithoutReplacement(ranked, Math.min(n, ranked.length));
}

// Perf simplification for phase 1: demographic closeness is computed over a
// bounded pool rather than the whole catalog (each computation does per-tag-
// table lookups). Fine while the catalog is seed-sized; revisit with a SQL-
// side aggregate once it grows.
async function getDemographicSample(
  db: SupabaseClient, n: number, ageBucket: AgeBucket | null, gender: string | null, country: string | null,
): Promise<CatalogGift[]> {
  const { data, error } = await db.from('good_gifts_catalog').select('*').limit(DEMOGRAPHIC_SAMPLE_POOL);
  if (error) throw error;
  const pool = (data ?? []) as CatalogGift[];
  if (pool.length === 0) return [];
  const scored = await Promise.all(pool.map(async gift => ({
    gift, closeness: await getDemographicCloseness(db, gift.id, ageBucket, gender, country),
  })));
  const top5 = scored.sort((a, b) => b.closeness - a.closeness).slice(0, 5).map(x => x.gift);
  return sampleWithoutReplacement(top5, Math.min(n, top5.length));
}

export interface SelfBatchPlan {
  catalogItems: CatalogGift[]; // already resolved from the catalog, shown as-is
  geminiCount: number; // how many more items Gemini's full-context call must supply to reach 15
}

export async function composeSelfBatch(
  db: SupabaseClient,
  params: { interests: string[]; ageBucket: AgeBucket | null; gender: string | null; country: string | null },
): Promise<SelfBatchPlan> {
  const { interests, ageBucket, gender, country } = params;
  const zeroTags = interests.length === 0;

  const topGlobal = await getTopGlobalSample(db, 3);

  let interestSourceItems: CatalogGift[] = [];
  let generalSourceItems: CatalogGift[] = [];
  if (zeroTags) {
    // spec §5.2 edge case (a): source #3's 4 slots move to "general";
    // source #4 effectively gets 8 by running the same slot-builder twice.
    const [a, b] = await Promise.all([buildSlotsForTag(db, 'general', ageBucket, country), buildSlotsForTag(db, 'general', ageBucket, country)]);
    generalSourceItems = [...a, ...b];
  } else {
    const useOffTag = Math.random() < OFF_TAG_PROBABILITY;
    const chosenTag = useOffTag ? randomFrom(MASTER_TAG_LIST.filter(t => !interests.includes(t))) : randomFrom(interests);
    [interestSourceItems, generalSourceItems] = await Promise.all([
      buildSlotsForTag(db, chosenTag, ageBucket, country),
      buildSlotsForTag(db, 'general', ageBucket, country),
    ]);
  }

  const demographic = await getDemographicSample(db, 2, ageBucket, gender, country);

  const seen = new Set<string>();
  const catalogItems: CatalogGift[] = [];
  for (const gift of [...topGlobal, ...interestSourceItems, ...generalSourceItems, ...demographic]) {
    if (seen.has(gift.id)) continue;
    seen.add(gift.id);
    catalogItems.push(gift);
  }

  const geminiCount = Math.max(2, 15 - catalogItems.length); // never below the base 2 (spec §5.2, source #2)
  return { catalogItems: catalogItems.slice(0, 15 - geminiCount), geminiCount };
}
