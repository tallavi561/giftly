import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase, supabaseForUser } from '../lib/supabase.js';
import { generateSelfGiftSuggestions } from '../services/gemini.js';
import { composeSelfBatch } from '../services/selfRecommendationBatch.js';
import { getAgeBucket } from '../services/recommendationEngine.js';
import { applyRatingFeedback } from '../services/catalogFeedback.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest, FeedbackReason } from '../types/index.js';

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

// PATCH /api/self-recommendations/:id/rate — 1-5, with a reason required for 1-3 (spec §7.1)
router.patch('/:id/rate', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { rating, feedback_reason } = req.body as { rating: number; feedback_reason?: FeedbackReason };
  if (!rating || rating < 1 || rating > 5) return void res.status(400).json({ error: 'Rating must be 1–5' });
  if (rating <= 3 && !feedback_reason) return void res.status(400).json({ error: 'feedback_reason is required for ratings 1-3' });

  const db = supabaseForUser(token);
  const { data: suggestion, error: fe } = await db.from('self_gift_suggestions').select('*').eq('id', req.params.id).single();
  if (fe || !suggestion) return void res.status(404).json({ error: 'Suggestion not found' });

  const { data: profile } = await db.from('user_profiles')
    .select('birth_date, gender, country, negative_prefs').eq('user_id', user.id).single();

  const { negativePrefToAdd } = await applyRatingFeedback(db, {
    giftId: suggestion.gift_id ?? null,
    categoryTag: suggestion.category_tag ?? null,
    birthDate: profile?.birth_date ?? null,
    gender: profile?.gender ?? null,
    country: profile?.country ?? null,
    rating,
    feedbackReason: rating <= 3 ? (feedback_reason ?? null) : null,
  });

  if (negativePrefToAdd) {
    const current: string[] = profile?.negative_prefs ?? [];
    if (!current.includes(negativePrefToAdd)) {
      await db.from('user_profiles').update({ negative_prefs: [...current, negativePrefToAdd] }).eq('user_id', user.id);
    }
  }

  const { data, error } = await db
    .from('self_gift_suggestions')
    .update({ rating, feedback_reason: rating <= 3 ? feedback_reason : null })
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
    .select('user_id, display_name, gender, birth_date, interests, negative_prefs, bio, city, country');

  if (error) { logger.error('Fetch profiles failed', error); return void res.status(500).json({ error: error.message }); }
  if (!profiles?.length) return void res.json({ generated: 0, profiles: 0 });

  let generated = 0;

  for (const profile of profiles) {
    const batchId = randomUUID();
    try {
      const ageBucket = getAgeBucket(profile.birth_date);
      const plan = await composeSelfBatch(supabase, {
        interests: profile.interests ?? [],
        ageBucket, gender: profile.gender, country: profile.country,
      });

      interface SelfSuggestionRow {
        user_id: string; title: string; description: string | null; estimated_price: number | null;
        category: string | null; category_tag: string | null; search_query: string | null;
        source_url: string | null; image_url: string | null;
        gift_id: string | null; batch_id: string;
      }

      const catalogRows: SelfSuggestionRow[] = plan.catalogItems.map(gift => ({
        user_id: profile.user_id,
        title: gift.title,
        description: gift.description,
        estimated_price: gift.estimated_price,
        category: gift.category,
        category_tag: gift.tags[0] ?? null,
        search_query: gift.search_query,
        source_url: gift.source_url,
        image_url: gift.image_url,
        gift_id: gift.id,
        batch_id: batchId,
      }));

      let geminiRows: SelfSuggestionRow[] = [];
      if (plan.geminiCount > 0) {
        const suggestions = await generateSelfGiftSuggestions({
          display_name: profile.display_name, gender: profile.gender, birth_date: profile.birth_date,
          interests: profile.interests, negative_prefs: profile.negative_prefs,
          bio: profile.bio, city: profile.city, country: profile.country,
        }, plan.geminiCount);
        // Ungrounded Gemini generation — no verified real link, so never
        // fabricate a source_url/image_url here (see recommendations.ts for
        // the same rule on the per-contact side).
        geminiRows = suggestions.map(s => ({
          user_id: profile.user_id,
          title: s.title,
          description: s.description,
          estimated_price: s.estimated_price,
          category: s.category,
          category_tag: s.category_tag ?? null,
          search_query: s.search_query,
          source_url: null,
          image_url: null,
          gift_id: null,
          batch_id: batchId,
        }));
      }

      const rows = [...catalogRows, ...geminiRows];
      const { error: ie } = await supabase.from('self_gift_suggestions').insert(rows);
      if (ie) { logger.error('Insert suggestions failed', { user_id: profile.user_id, error: ie }); }
      else generated += rows.length;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'GEMINI_QUOTA_EXCEEDED') {
        logger.warn('Global Gemini quota reached, stopping self-suggestions batch');
        break;
      }
      logger.error('Batch generation failed for profile', { user_id: profile.user_id, err: msg });
    }
  }

  logger.info('Batch done', { generated, profiles: profiles.length });
  res.json({ generated, profiles: profiles.length });
});

export default router;
