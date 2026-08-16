import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('group-invites');

// PATCH /api/group-invites/:id/respond — accept/decline a DIRECT_INVITE that
// required approval (spec §14.2). :id is the group_members row id.
router.patch('/:id/respond', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { action } = req.body as { action: 'ACCEPT' | 'DECLINE' };
  if (action !== 'ACCEPT' && action !== 'DECLINE') return void res.status(400).json({ error: 'action must be ACCEPT or DECLINE' });

  const db = supabaseForUser(token);
  const { data: invite, error: ie } = await db
    .from('group_members').select('*').eq('id', req.params.id).eq('user_id', user.id).eq('status', 'INVITED').single();
  if (ie || !invite) return void res.status(404).json({ error: 'הזמנה לא נמצאה' });

  const { data, error } = await db.from('group_members')
    .update({ status: action === 'ACCEPT' ? 'MEMBER' : 'DECLINED', responded_at: new Date().toISOString() })
    .eq('id', req.params.id).select().single();
  if (error) { logger.error('Respond to group invite failed', error); return void res.status(400).json({ error: error.message }); }

  logger.info('Group invite responded', { id: req.params.id, action });
  res.json(data);
});

export default router;
