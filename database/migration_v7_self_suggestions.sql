-- v7: self gift suggestions (gifts the user might enjoy for themselves)
CREATE TABLE IF NOT EXISTS self_gift_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  estimated_price INTEGER,
  category TEXT,
  search_query TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  batch_id TEXT,  -- groups suggestions from the same generation run
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE self_gift_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own self suggestions" ON self_gift_suggestions
  FOR ALL USING (auth.uid() = user_id);
