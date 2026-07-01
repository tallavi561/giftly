import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('gifts');

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  let query = db.from('gift_history').select('*').order('given_at', { ascending: false });
  if (req.query.profile_id) query = query.eq('profile_id', req.query.profile_id as string);
  const { data, error } = await query;
  if (error) { logger.error('List gifts failed', error); return void res.status(500).json({ error: error.message }); }
  res.json(data);
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { profile_id, event_id, title, url, price, source, given_at } = req.body as Record<string, unknown>;
  logger.info('Log gift', { profile_id, title });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('gift_history')
    .insert({ profile_id, event_id, title, url, price, source, given_at })
    .select()
    .single();
  if (error) { logger.error('Create gift failed', error); return void res.status(400).json({ error: error.message }); }
  res.status(201).json(data);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { error } = await db.from('gift_history').delete().eq('id', req.params.id);
  if (error) return void res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
