import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase, supabaseForUser } from '../lib/supabase.js';
import { generateSelfGiftSuggestions } from '../services/gemini.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('self-recommendations');

// GET /api/self-recommendations — current user's suggestions
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('self_gift_suggestions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { logger.error('List self suggestions failed', error); return void res.status(500).json({ error: error.message }); }
  res.json(data);
});

// PATCH /api/self-recommendations/:id/rate — save a rating (1–5)
router.patch('/:id/rate', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { rating } = req.body as { rating: number };
  if (!rating || rating < 1 || rating > 5) return void res.status(400).json({ error: 'Rating must be 1–5' });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('self_gift_suggestions')
    .update({ rating })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) { logger.error('Rate suggestion failed', error); return void res.status(400).json({ error: error.message }); }
  res.json(data);
});

// POST /api/self-recommendations/generate — admin only (requires x-admin-secret header)
router.post('/generate', async (_req: Request, res: Response) => {
  const secret = _req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return void res.status(401).json({ error: 'Unauthorized' });
  }
  logger.info('Batch self-suggestion generation started');

  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, gender, birth_date, interests, bio, city, country');

  if (error) { logger.error('Fetch profiles failed', error); return void res.status(500).json({ error: error.message }); }
  if (!profiles?.length) return void res.json({ generated: 0, profiles: 0 });

  const batchId = new Date().toISOString();
  let generated = 0;

  for (const profile of profiles) {
    try {
      const suggestions = await generateSelfGiftSuggestions(profile);
      const rows = suggestions.map(s => ({
        user_id: profile.user_id,
        title: s.title,
        description: s.description,
        estimated_price: s.estimated_price,
        category: s.category,
        search_query: s.search_query,
        batch_id: batchId,
      }));
      const { error: ie } = await supabase.from('self_gift_suggestions').insert(rows);
      if (ie) { logger.error('Insert suggestions failed', { user_id: profile.user_id, error: ie }); }
      else generated += rows.length;
    } catch (err) {
      logger.error('Gemini failed for profile', { user_id: profile.user_id, err: (err as Error).message });
    }
  }

  logger.info('Batch done', { generated, profiles: profiles.length });
  res.json({ generated, profiles: profiles.length });
});

export default router;
