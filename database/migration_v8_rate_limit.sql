-- v8: track AI recommendation generate calls per user for rate-limiting
CREATE TABLE IF NOT EXISTS recommendation_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recommendation_calls ENABLE ROW LEVEL SECURITY;

-- Users can only see/insert their own rows
CREATE POLICY "Users manage own calls" ON recommendation_calls
  FOR ALL USING (auth.uid() = user_id);
