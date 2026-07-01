import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('profiles');

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  logger.debug('List profiles', { userId: user.id });
  const db = supabaseForUser(token);
  const { data, error } = await db.from('profiles').select('*').order('name');
  if (error) { logger.error('List profiles failed', error); return void res.status(500).json({ error: error.message }); }
  res.json(data);
});

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data, error } = await db.from('profiles').select('*').eq('id', req.params.id).single();
  if (error) return void res.status(404).json({ error: 'Profile not found' });
  res.json(data);
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { name, relationship, interests, free_text, budget_min, budget_max, is_self } = req.body as Record<string, unknown>;
  logger.info('Create profile', { userId: user.id, name, is_self });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('profiles')
    .insert({ owner_id: user.id, name, relationship, interests, free_text, budget_min, budget_max, is_self: is_self ?? false })
    .select()
    .single();
  if (error) { logger.error('Create profile failed', error); return void res.status(400).json({ error: error.message }); }
  res.status(201).json(data);
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { name, relationship, interests, free_text, budget_min, budget_max } = req.body as Record<string, unknown>;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('profiles')
    .update({ name, relationship, interests, free_text, budget_min, budget_max })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) { logger.error('Update profile failed', error); return void res.status(400).json({ error: error.message }); }
  res.json(data);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  logger.info('Delete profile', { id: req.params.id });
  const db = supabaseForUser(token);
  const { error } = await db.from('profiles').delete().eq('id', req.params.id);
  if (error) return void res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
