// Turns a rating into catalog/stats writes — the write side of the feedback
// loop (spec §7.1-§7.2, §7.5-§7.6). Shared by both flows' rate endpoints.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgeBucket, CatalogGift, FeedbackReason } from '../types/index.js';
import { getAgeBucket } from './recommendationEngine.js';

const AGE_BUCKET_COLUMN_PREFIX: Record<AgeBucket, string> = {
  '18-24': 'age_18_24', '25-34': 'age_25_34', '35-44': 'age_35_44',
  '45-54': 'age_45_54', '55-64': 'age_55_64', '65+': 'age_65p',
};

// spec §7.6 — bridges free-text `category` to the closed negative_prefs vocabulary.
export function resolveCategoryTag(
  rec: { category_tag?: string | null },
  matchedGift: CatalogGift | null,
  primaryTag: string | null,
): string | null {
  if (matchedGift) return primaryTag ?? matchedGift.tags[0] ?? null;
  return rec.category_tag ?? null; // caller must already have validated this against MASTER_TAG_LIST
}

export interface ApplyFeedbackParams {
  giftId: string | null;
  categoryTag: string | null;
  birthDate: string | null; // of the person the gift was FOR — used to bucket the stat update
  gender: string | null;
  country: string | null;
  rating: number; // 1-5
  feedbackReason: FeedbackReason | null;
}

export interface ApplyFeedbackResult {
  negativePrefToAdd: string | null; // caller appends this to the right negative_prefs array (spec §7.5)
}

/**
 * Updates good_gifts_catalog + gift_stats_<tag> + gift_country_stats for a
 * single rated item, per the spec §7.2 mapping. Both this function and the
 * two rate endpoints treat rating>=4 as "liked" and rating<=3 as "shown only".
 */
export async function applyRatingFeedback(db: SupabaseClient, params: ApplyFeedbackParams): Promise<ApplyFeedbackResult> {
  const liked = params.rating >= 4;
  const negativePrefToAdd = !liked && params.feedbackReason === 'WRONG_CONCEPT' ? params.categoryTag : null;

  if (!params.giftId) return { negativePrefToAdd }; // pure-Gemini item never matched a catalog row — nothing to update

  const { data: gift, error: ge } = await db.from('good_gifts_catalog').select('*').eq('id', params.giftId).single();
  if (ge || !gift) return { negativePrefToAdd };

  await db.from('good_gifts_catalog').update({
    global_shown: gift.global_shown + 1,
    global_liked: gift.global_liked + (liked ? 1 : 0),
  }).eq('id', params.giftId);

  const ageBucket = getAgeBucket(params.birthDate);
  const ageCol = ageBucket ? AGE_BUCKET_COLUMN_PREFIX[ageBucket] : null;
  const genderCol = params.gender === 'male' || params.gender === 'female' ? params.gender : null;

  await Promise.all((gift.tags as string[]).map(async tag => {
    const { data: row } = await db.from(`gift_stats_${tag}`).select('*').eq('gift_id', params.giftId).maybeSingle();
    const current = row ?? { gift_id: params.giftId, overall_shown: 0, overall_liked: 0 };
    const update: Record<string, number> = {
      overall_shown: (current.overall_shown ?? 0) + 1,
      overall_liked: (current.overall_liked ?? 0) + (liked ? 1 : 0),
    };
    if (ageCol) {
      update[`${ageCol}_shown`] = ((current as Record<string, number>)[`${ageCol}_shown`] ?? 0) + 1;
      update[`${ageCol}_liked`] = ((current as Record<string, number>)[`${ageCol}_liked`] ?? 0) + (liked ? 1 : 0);
    }
    if (genderCol) {
      update[`gender_${genderCol}_shown`] = ((current as Record<string, number>)[`gender_${genderCol}_shown`] ?? 0) + 1;
      update[`gender_${genderCol}_liked`] = ((current as Record<string, number>)[`gender_${genderCol}_liked`] ?? 0) + (liked ? 1 : 0);
    }
    await db.from(`gift_stats_${tag}`).upsert({ gift_id: params.giftId, ...update });

    if (params.country) {
      const { data: cRow } = await db.from('gift_country_stats').select('*')
        .eq('gift_id', params.giftId).eq('tag', tag).eq('country', params.country).maybeSingle();
      await db.from('gift_country_stats').upsert({
        gift_id: params.giftId, tag, country: params.country,
        shown: (cRow?.shown ?? 0) + 1,
        liked: (cRow?.liked ?? 0) + (liked ? 1 : 0),
      });
    }
  }));

  return { negativePrefToAdd };
}
