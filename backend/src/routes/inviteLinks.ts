import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase, supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('invite-links');

// POST /api/contact-invite-link — create/refresh my personal "add me to your
// distribution list" link (spec §14.2, target_type='CONTACT_LIST')
router.post('/contact-invite-link', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);

  const { data: existing } = await db.from('invite_links').select('*').eq('owner_user_id', user.id).eq('target_type', 'CONTACT_LIST').maybeSingle();
  if (existing) return void res.json(existing);

  const { data, error } = await db.from('invite_links').insert({
    token: randomUUID(), owner_user_id: user.id, target_type: 'CONTACT_LIST', group_id: null,
  }).select().single();
  if (error) { logger.error('Create contact invite link failed', error); return void res.status(400).json({ error: error.message }); }
  res.status(201).json(data);
});

// POST /api/join/:token — clicking an invite link (spec §14.2). Requires the
// clicker to already be signed in and registered; a not-yet-registered
// visitor is expected to be sent to sign-up first by whatever surface shows
// this link (no frontend for this feature yet — see Phase 5 note).
router.post('/join/:token', requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthRequest;
  const { data: link, error: le } = await supabase.from('invite_links').select('*').eq('token', req.params.token).single();
  if (le || !link) return void res.status(404).json({ error: 'קישור לא נמצא' });

  if (link.target_type === 'GROUP') {
    const { data, error } = await supabase.from('group_members').upsert({
      group_id: link.group_id, user_id: user.id, joined_via: 'LINK', initiated_by: null,
      status: 'MEMBER', responded_at: new Date().toISOString(),
    }, { onConflict: 'group_id,user_id' }).select().single();
    if (error) { logger.error('Join via group link failed', error); return void res.status(400).json({ error: error.message }); }
    logger.info('Joined group via link', { groupId: link.group_id, userId: user.id });
    return void res.json({ target_type: 'GROUP', membership: data });
  }

  // CONTACT_LIST — one-directional: the clicker is added as a contact of the
  // link owner. No assumption the reverse relationship is created too.
  const { data: existingContact } = await supabase.from('contacts').select('id').eq('owner_id', link.owner_user_id).eq('linked_user_id', user.id).maybeSingle();
  if (existingContact) return void res.json({ target_type: 'CONTACT_LIST', contact: existingContact, already_existed: true });

  const { data: clickerProfile } = await supabase.from('user_profiles').select('display_name').eq('user_id', user.id).single();
  const { data: contact, error: ce } = await supabase.from('contacts').insert({
    owner_id: link.owner_user_id, name: clickerProfile?.display_name ?? 'איש קשר', linked_user_id: user.id,
  }).select().single();
  if (ce) { logger.error('Join via contact-list link failed', ce); return void res.status(400).json({ error: ce.message }); }
  logger.info('Added as contact via distribution link', { ownerUserId: link.owner_user_id, userId: user.id });
  res.json({ target_type: 'CONTACT_LIST', contact });
});

export default router;
