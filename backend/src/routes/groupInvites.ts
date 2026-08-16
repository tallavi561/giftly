import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase, supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('group-invites');

// GET /api/group-invites — my pending (INVITED) group invitations
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data: invites, error } = await db
    .from('group_members').select('*, groups(name)')
    .eq('user_id', user.id).eq('status', 'INVITED')
    .order('created_at', { ascending: false });
  if (error) { logger.error('List pending invites failed', error); return void res.status(500).json({ error: error.message }); }

  // initiated_by references auth.users, not user_profiles directly, so
  // PostgREST can't embed it — resolve inviter names in a second lookup
  // (same pattern as contactRequests.ts).
  const inviterIds = [...new Set((invites ?? []).map(i => i.initiated_by).filter(Boolean))];
  const inviterNames: Record<string, string> = {};
  if (inviterIds.length) {
    const { data: profiles } = await supabase.from('user_profiles').select('user_id, display_name').in('user_id', inviterIds);
    for (const p of profiles ?? []) inviterNames[p.user_id] = p.display_name;
  }

  res.json((invites ?? []).map(i => ({ ...i, inviter_name: i.initiated_by ? inviterNames[i.initiated_by] ?? null : null })));
});

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
