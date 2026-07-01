import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('contacts');

// GET /api/contacts
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  logger.debug('List contacts', { userId: user.id });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('contacts')
    .select('*, user_profile:user_profiles(user_id, display_name, nickname, interests, bio)')
    .order('name');
  if (error) { logger.error('List contacts failed', error); return void res.status(500).json({ error: error.message }); }
  res.json(data);
});

// GET /api/contacts/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('contacts')
    .select('*, user_profile:user_profiles(user_id, display_name, nickname, interests, bio)')
    .eq('id', req.params.id)
    .single();
  if (error) return void res.status(404).json({ error: 'Contact not found' });
  res.json(data);
});

// POST /api/contacts
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { name, relationship, linked_user_id, interests, free_text, budget_min, budget_max } =
    req.body as Record<string, unknown>;
  logger.info('Create contact', { userId: user.id, name });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('contacts')
    .insert({ owner_id: user.id, name, relationship, linked_user_id: linked_user_id ?? null, interests, free_text, budget_min, budget_max })
    .select()
    .single();
  if (error) { logger.error('Create contact failed', error); return void res.status(400).json({ error: error.message }); }
  res.status(201).json(data);
});

// PATCH /api/contacts/:id
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { name, relationship, linked_user_id, interests, free_text, budget_min, budget_max } =
    req.body as Record<string, unknown>;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('contacts')
    .update({ name, relationship, linked_user_id: linked_user_id ?? null, interests, free_text, budget_min, budget_max })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) { logger.error('Update contact failed', error); return void res.status(400).json({ error: error.message }); }
  res.json(data);
});

// DELETE /api/contacts/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  logger.info('Delete contact', { id: req.params.id });
  const db = supabaseForUser(token);
  const { error } = await db.from('contacts').delete().eq('id', req.params.id);
  if (error) return void res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
