import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { generateGiftRecommendations } from '../services/gemini.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('recommendations');

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { contact_id, event_id } = req.body as { contact_id: string; event_id: string };
  logger.info('Generate recommendations', { contact_id, event_id });

  const db = supabaseForUser(token);

  const [{ data: contact, error: ce }, { data: event, error: ee }, { data: pastGifts }] =
    await Promise.all([
      db.from('contacts')
        .select('*, user_profile:user_profiles(display_name, interests, bio)')
        .eq('id', contact_id)
        .single(),
      db.from('events').select('*').eq('id', event_id).single(),
      db.from('gift_history').select('title').eq('contact_id', contact_id),
    ]);

  if (ce || !contact) return void res.status(404).json({ error: 'Contact not found' });
  if (ee || !event) return void res.status(404).json({ error: 'Event not found' });

  // מיזוג פרטי פרופיל מקושר (אם קיים) עם הנתונים הידניים
  const effectiveInterests: string[] =
    contact.user_profile?.interests?.length
      ? contact.user_profile.interests
      : (contact.interests ?? []);
  const effectiveBio: string | null = contact.user_profile?.bio ?? contact.free_text ?? null;
  const effectiveName: string = contact.user_profile?.display_name ?? contact.name;

  let result;
  try {
    result = await generateGiftRecommendations({
      profile: { name: effectiveName, relationship: contact.relationship, interests: effectiveInterests, free_text: effectiveBio },
      event,
      budget_min: contact.budget_min,
      budget_max: contact.budget_max,
      pastGifts: pastGifts ?? [],
    });
  } catch (err) {
    logger.error('Gemini generation failed', err);
    return void res.status(502).json({ error: `Gemini error: ${(err as Error).message}` });
  }

  const toInsert = result.recommendations.map(r => ({
    contact_id,
    event_id,
    title: r.title,
    description: r.description,
    estimated_price: r.estimated_price,
    category: r.category,
    search_query: r.search_query,
    score: null,
  }));

  const { data: saved, error: se } = await db.from('recommendations').insert(toInsert).select();
  if (se) { logger.error('Save recommendations failed', se); return void res.status(500).json({ error: se.message }); }

  logger.info('Recommendations saved', { count: saved?.length });
  res.json(saved);
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  let query = db.from('recommendations').select('*').order('created_at', { ascending: false });
  if (req.query.contact_id) query = query.eq('contact_id', req.query.contact_id as string);
  if (req.query.event_id) query = query.eq('event_id', req.query.event_id as string);
  const { data, error } = await query;
  if (error) return void res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
