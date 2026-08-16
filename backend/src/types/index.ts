import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';

export interface AuthRequest extends Request {
  user: User;
  token: string;
}

// Master Tag List (spec §2.7) — must stay in sync with the gift_stats_<tag>
// table names created in database/migration_v16_recommendation_engine_core.sql.
export const MASTER_TAG_LIST = [
  'sports', 'music', 'performances', 'art', 'culinary', 'travel',
  'extreme', 'workshops', 'tech', 'books', 'gaming',
] as const;
export type InterestTag = typeof MASTER_TAG_LIST[number];
// 'general' is the catch-all bucket — valid as a category_tag/gift_stats table,
// but never user-selectable as an interest.
export type CatalogTag = InterestTag | 'general';

export type FeedbackReason = 'WRONG_CONCEPT' | 'WRONG_PRODUCT' | 'TOO_GENERIC';
export type RecommendationSource = 'gemini' | 'compute';

export type AgeBucket = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';

// Profile shape passed to Gemini (merged from contact + optional linked user_profile)
export interface Profile {
  name: string;
  relationship: string | null;
  interests: string[];
  negative_prefs?: string[];
  free_text: string | null;
  gender: string | null;
  relationship_status: string | null;
  has_children: boolean | null;
  religion: string | null;
}

// good_gifts_catalog row (spec §2.6)
export interface CatalogGift {
  id: string;
  title: string;
  description: string | null;
  estimated_price: number | null;
  category: string | null;
  search_query: string | null;
  tags: string[];
  global_shown: number;
  global_liked: number;
  last_verified_at: string | null;
  is_seed: boolean;
  created_at: string;
}

// One row of gift_stats_<tag> (spec §2.8), merged in memory by fetchSegmentStats
export interface TagStatsRow {
  gift_id: string;
  overall_shown: number; overall_liked: number;
  age_18_24_shown: number; age_18_24_liked: number;
  age_25_34_shown: number; age_25_34_liked: number;
  age_35_44_shown: number; age_35_44_liked: number;
  age_45_54_shown: number; age_45_54_liked: number;
  age_55_64_shown: number; age_55_64_liked: number;
  age_65p_shown: number; age_65p_liked: number;
  gender_male_shown: number; gender_male_liked: number;
  gender_female_shown: number; gender_female_liked: number;
}

export interface CountryStatsRow {
  gift_id: string;
  tag: string;
  country: string;
  shown: number;
  liked: number;
}

// In-memory shape expected by the scoring functions (spec §4.3) —
// not a stored column, assembled by fetchSegmentStats per request.
export interface SegmentStats {
  interests: Record<string, { shown: number; liked: number }>; // key: tag
  interest_age: Record<string, { shown: number; liked: number }>; // key: "tag|ageBucket"
  interest_country: Record<string, { shown: number; liked: number }>; // key: "tag|country"
}

export interface ScoredGift extends CatalogGift {
  segment_stats?: SegmentStats;
  score: number;
  primaryTag: string | null;
}

export interface Event {
  id: string;
  contact_id: string;
  type: string;
  date: string;
  reminder_days: number;
  budget_min: number | null;
  budget_max: number | null;
  reminder_sent: boolean;
  created_at: string;
}

export interface GiftHistory {
  id: string;
  contact_id: string;
  event_id: string | null;
  title: string;
  url: string | null;
  price: number | null;
  source: string | null;
  given_at: string | null;
  created_at: string;
}

export interface Recommendation {
  id: string;
  contact_id: string;
  event_id: string | null;
  gift_id: string | null;
  title: string;
  description: string | null;
  estimated_price: number | null;
  category: string | null;
  category_tag: string | null;
  search_query: string | null;
  score: number | null;
  rating: number | null;
  feedback_reason: FeedbackReason | null;
  batch_id: string | null;
  source: RecommendationSource;
  created_at: string;
}

export interface GeminiRecommendation {
  title: string;
  description: string;
  estimated_price: number;
  category: string;
  category_tag: CatalogTag | null;
  search_query: string;
}

// ---- Event sharing / groups (spec §14) ----

export interface HostedEvent {
  id: string;
  owner_user_id: string;
  type: string;
  date: string;
  date_type: 'gregorian' | 'hebrew';
  description: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
}

export type GroupMemberStatus = 'INVITED' | 'MEMBER' | 'DECLINED';
export type JoinedVia = 'DIRECT_INVITE' | 'LINK';

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  status: GroupMemberStatus;
  joined_via: JoinedVia;
  initiated_by: string | null;
  created_at: string;
  responded_at: string | null;
}

export type InviteLinkTargetType = 'GROUP' | 'CONTACT_LIST';

export interface InviteLink {
  id: string;
  token: string;
  owner_user_id: string;
  target_type: InviteLinkTargetType;
  group_id: string | null;
  created_at: string;
}

export type EventAudienceTargetType = 'GROUP' | 'CONTACT' | 'ALL_CONTACTS';

export interface EventAudience {
  id: string;
  hosted_event_id: string;
  target_type: EventAudienceTargetType;
  target_group_id: string | null;
  target_contact_id: string | null;
  created_at: string;
}
