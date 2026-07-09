import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';

export interface AuthRequest extends Request {
  user: User;
  token: string;
}

// Profile shape passed to Gemini (merged from contact + optional linked user_profile)
export interface Profile {
  name: string;
  relationship: string | null;
  interests: string[];
  free_text: string | null;
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
}

export interface GeminiRecommendation {
  title: string;
  description: string;
  estimated_price: number;
  category: string;
  search_query: string;
}
