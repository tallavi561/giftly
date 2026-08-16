import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase, supabaseForUser } from '../lib/supabase.js';
import { assertContactReachable } from '../services/eventSharing.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('groups');

// POST /api/groups — create a group (spec §14.2)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { name } = req.body as { name: string };
  if (!name) return void res.status(400).json({ error: 'name הוא שדה חובה' });
  const db = supabaseForUser(token);
  const { data, error } = await db.from('groups').insert({ owner_user_id: user.id, name }).select().single();
  if (error) { logger.error('Create group failed', error); return void res.status(400).json({ error: error.message }); }
  logger.info('Group created', { id: data.id, name });
  res.status(201).json(data);
});

// GET /api/groups — groups I own or belong to
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const [{ data: owned, error: oe }, { data: memberOf, error: me }] = await Promise.all([
    db.from('groups').select('*').eq('owner_user_id', user.id),
    db.from('group_members').select('status, groups(*)').eq('user_id', user.id).eq('status', 'MEMBER'),
  ]);
  if (oe || me) return void res.status(500).json({ error: (oe ?? me)?.message });
  const byId = new Map<string, any>();
  for (const g of owned ?? []) byId.set(g.id, { ...g, role: 'owner' });
  for (const row of memberOf ?? []) { const g = (row as any).groups; if (g && !byId.has(g.id)) byId.set(g.id, { ...g, role: 'member' }); }
  res.json([...byId.values()]);
});

// POST /api/groups/:id/invite — direct invite of one of the owner's own
// linked contacts (spec §14.2 DIRECT_INVITE path)
router.post('/:id/invite', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { contact_id } = req.body as { contact_id: string };
  const db = supabaseForUser(token);

  const { data: group, error: ge } = await db.from('groups').select('*').eq('id', req.params.id).eq('owner_user_id', user.id).single();
  if (ge || !group) return void res.status(404).json({ error: 'קבוצה לא נמצאה' });

  let invitedUserId: string;
  try {
    invitedUserId = await assertContactReachable(db, contact_id, user.id);
  } catch (err) {
    return void res.status(400).json({ error: (err as Error).message });
  }

  const { data: targetProfile } = await supabase.from('user_profiles').select('require_approval_for_group_invites').eq('user_id', invitedUserId).single();
  const requiresApproval = targetProfile?.require_approval_for_group_invites ?? false;

  const { data, error } = await db.from('group_members').upsert({
    group_id: group.id, user_id: invitedUserId, joined_via: 'DIRECT_INVITE', initiated_by: user.id,
    status: requiresApproval ? 'INVITED' : 'MEMBER',
    responded_at: requiresApproval ? null : new Date().toISOString(),
  }, { onConflict: 'group_id,user_id' }).select().single();
  if (error) { logger.error('Invite to group failed', error); return void res.status(400).json({ error: error.message }); }

  logger.info('Group invite created', { groupId: group.id, userId: invitedUserId, status: data.status });
  res.status(201).json(data);
});

// POST /api/groups/:id/invite-link — create/refresh a GROUP-type invite_links row (spec §14.2, §2.17)
router.post('/:id/invite-link', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);

  const { data: group, error: ge } = await db.from('groups').select('id').eq('id', req.params.id).eq('owner_user_id', user.id).single();
  if (ge || !group) return void res.status(404).json({ error: 'קבוצה לא נמצאה' });

  const { data: existing } = await db.from('invite_links').select('*').eq('owner_user_id', user.id).eq('target_type', 'GROUP').eq('group_id', group.id).maybeSingle();
  if (existing) return void res.json(existing);

  const { data, error } = await db.from('invite_links').insert({
    token: randomUUID(), owner_user_id: user.id, target_type: 'GROUP', group_id: group.id,
  }).select().single();
  if (error) { logger.error('Create group invite link failed', error); return void res.status(400).json({ error: error.message }); }
  res.status(201).json(data);
});

// GET /api/groups/:id/members
router.get('/:id/members', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('group_members').select('*, user_profiles(user_id, display_name, nickname, avatar_mode, avatar_url)')
    .eq('group_id', req.params.id);
  if (error) return void res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
