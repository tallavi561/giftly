export interface UserProfile {
  user_id: string;
  display_name: string;
  nickname: string;
  email: string;
  interests: string[];
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  owner_id: string;
  name: string;
  relationship: string | null;
  linked_user_id: string | null;
  interests: string[];
  free_text: string | null;
  budget_min: number | null;
  budget_max: number | null;
  created_at: string;
  // joined from user_profiles when linked
  user_profile?: UserProfile;
}

export interface Event {
  id: string;
  contact_id: string;
  type: string;
  date: string;
  reminder_days: number;
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
  search_query: string | null;
  score: number | null;
  created_at: string;
}
