import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('events');

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  let query = db.from('events').select('*').order('date');
  if (req.query.contact_id) query = query.eq('contact_id', req.query.contact_id as string);
  const { data, error } = await query;
  if (error) { logger.error('List events failed', error); return void res.status(500).json({ error: error.message }); }
  res.json(data);
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { contact_id, type, date, reminder_days, budget_min, budget_max } = req.body as Record<string, unknown>;
  const days = reminder_days !== undefined ? Number(reminder_days) : 14;
  if (days < 1) return void res.status(400).json({ error: 'reminder_days חייב להיות לפחות 1' });
  logger.info('Create event', { contact_id, type, date });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('events')
    .insert({ contact_id, type, date, reminder_days: days, budget_min: budget_min ?? null, budget_max: budget_max ?? null })
    .select()
    .single();
  if (error) { logger.error('Create event failed', error); return void res.status(400).json({ error: error.message }); }
  res.status(201).json(data);
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { type, date, reminder_days, budget_min, budget_max } = req.body as Record<string, unknown>;
  if (reminder_days !== undefined && Number(reminder_days) < 1)
    return void res.status(400).json({ error: 'reminder_days חייב להיות לפחות 1' });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('events')
    .update({ type, date, reminder_days, budget_min: budget_min ?? null, budget_max: budget_max ?? null })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return void res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  logger.info('Delete event', { id: req.params.id });
  const db = supabaseForUser(token);
  const { error } = await db.from('events').delete().eq('id', req.params.id);
  if (error) return void res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
