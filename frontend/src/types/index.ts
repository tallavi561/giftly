export interface UserProfile {
  user_id: string;
  display_name: string;
  nickname: string;
  email: string;
  interests: string[];
  bio: string | null;
  birth_date: string | null;
  city: string | null;
  country: string | null;
  gender: 'male' | 'female' | 'other' | null;
  privacy_level: 'public' | 'approval' | 'password';
  avatar_mode: 'illustrated' | 'silhouette' | 'photo';
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactRequest {
  id: string;
  requester_id: string;
  requester_name: string | null;
  target_user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  target_profile?: Pick<UserProfile, 'display_name' | 'nickname'>;
}

export interface Contact {
  id: string;
  owner_id: string;
  name: string;
  relationship: string | null;
  linked_user_id: string | null;
  interests: string[];
  free_text: string | null;
  notes: string | null;
  gender: 'male' | 'female' | 'other' | null;
  birth_date: string | null;
  city: string | null;
  country: string | null;
  relationship_status: string | null;
  has_children: boolean | null;
  religion: string | null;
  avatar_mode: 'illustrated' | 'silhouette' | 'photo';
  avatar_url: string | null;
  created_at: string;
  user_profile?: UserProfile;
}

export interface Event {
  id: string;
  contact_id: string;
  type: string;
  date: string;
  date_type: 'gregorian' | 'hebrew';
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
  title: string;
  description: string | null;
  estimated_price: number | null;
  category: string | null;
  category_tag: string | null;
  search_query: string | null;
  score: number | null;
  rating: number | null; // 5 = FIT, 2 = NOT_FIT, null = unrated (spec §7.3)
  batch_id: string | null;
  created_at: string;
  contact?: { name: string };
  image_url?: string | null; // not populated by the backend yet — falls back to a placeholder
}

export interface DealAlert {
  id: string;
  title: string;
  description: string | null;
  source_site: string;
  source_url: string;
  image_url: string | null;
  current_price: number | null;
  original_price: number | null;
  discount_pct: number | null;
  tags: string[];
  found_at: string;
  expires_at: string;
  is_active: boolean;
}

export interface MatchedDeal {
  deal: DealAlert;
  contact_id: string;
  contact_name: string;
  matched_tags: string[];
  category_label: string;
  match_reason: string;
}

// spec §7.1-§7.2 — required alongside a self-suggestion rating of 3 or below
export type FeedbackReason = 'WRONG_CONCEPT' | 'WRONG_PRODUCT' | 'TOO_GENERIC';
