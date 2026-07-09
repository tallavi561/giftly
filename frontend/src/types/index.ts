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
  privacy_level: 'public' | 'approval' | 'password';
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
  birth_date: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  user_profile?: UserProfile;
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
  title: string;
  description: string | null;
  estimated_price: number | null;
  category: string | null;
  search_query: string | null;
  score: number | null;
  created_at: string;
  contact?: { name: string };
}
