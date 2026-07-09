import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase, supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('contactRequests');

// GET /api/contact-requests/incoming — בקשות שנשלחו אליי
router.get('/incoming', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data: reqs, error } = await db
    .from('contact_requests')
    .select('*')
    .eq('target_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) return void res.status(500).json({ error: error.message });

  // שליפת פרטי המבקשים מ-user_profiles
  const requesterIds = [...new Set((reqs ?? []).map((r: any) => r.requester_id))];
  const profiles: Record<string, any> = {};
  if (requesterIds.length > 0) {
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, nickname, email')
      .in('user_id', requesterIds);
    (profileData ?? []).forEach((p: any) => { profiles[p.user_id] = p; });
  }
  const data = (reqs ?? []).map((r: any) => ({ ...r, requester: profiles[r.requester_id] ?? null }));
  res.json(data);
});

// GET /api/contact-requests/outgoing — בקשות שאני שלחתי
router.get('/outgoing', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('contact_requests')
    .select('*, target_profile:user_profiles!contact_requests_target_user_id_fkey(display_name, nickname)')
    .eq('requester_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return void res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/contact-requests/:id/approve — אישור בקשה + יצירת איש קשר עבור המבקש
router.post('/:id/approve', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { contact_name, relationship } = req.body as { contact_name?: string; relationship?: string };
  const db = supabaseForUser(token);

  // שליפת הבקשה
  const { data: reqRow, error: re } = await db
    .from('contact_requests')
    .select('*')
    .eq('id', req.params.id)
    .eq('target_user_id', user.id)
    .eq('status', 'pending')
    .single();
  if (re || !reqRow) return void res.status(404).json({ error: 'בקשה לא נמצאה' });

  // יצירת איש קשר עבור המבקש (admin client — בשם owner אחר)
  const { error: ce } = await supabase
    .from('contacts')
    .insert({
      owner_id: reqRow.requester_id,
      name: contact_name || reqRow.requester_name || 'ללא שם',
      relationship: relationship || null,
      linked_user_id: user.id,
    });
  if (ce) { logger.error('Create contact on approve failed', ce); return void res.status(500).json({ error: ce.message }); }

  // עדכון סטטוס הבקשה
  await db.from('contact_requests').update({ status: 'approved' }).eq('id', req.params.id);

  logger.info('Request approved', { requestId: req.params.id });
  res.json({ ok: true });
});

// POST /api/contact-requests/:id/reject
router.post('/:id/reject', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { error } = await db
    .from('contact_requests')
    .update({ status: 'rejected' })
    .eq('id', req.params.id)
    .eq('target_user_id', user.id);
  if (error) return void res.status(400).json({ error: error.message });
  logger.info('Request rejected', { requestId: req.params.id });
  res.status(204).send();
});

// GET /api/contact-requests/action?token=REQUEST_ID&action=approve|reject
// endpoint ציבורי — מגיע מקישור במייל, ללא צורך ב-auth
router.get('/action', async (req: Request, res: Response) => {
  const { token, action } = req.query as { token?: string; action?: string };
  if (!token || !['approve', 'reject'].includes(action ?? ''))
    return void res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/approve-request?error=invalid`);

  const { data: reqRow, error: re } = await supabase
    .from('contact_requests')
    .select('*')
    .eq('id', token)
    .eq('status', 'pending')
    .single();

  if (re || !reqRow)
    return void res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/approve-request?error=notfound`);

  if (action === 'approve') {
    // יצירת איש קשר עבור המבקש
    const { data: targetProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', reqRow.target_user_id)
      .single();

    const { error: ce } = await supabase.from('contacts').insert({
      owner_id: reqRow.requester_id,
      name: targetProfile?.display_name ?? reqRow.requester_name ?? 'איש קשר',
      linked_user_id: reqRow.target_user_id,
    });

    if (ce) {
      logger.error('Create contact via email link failed', ce);
      return void res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/approve-request?error=server`);
    }

    await supabase.from('contact_requests').update({ status: 'approved' }).eq('id', token);
    logger.info('Request approved via email link', { requestId: token });
    return void res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/approve-request?result=approved`);
  }

  // action === 'reject'
  await supabase.from('contact_requests').update({ status: 'rejected' }).eq('id', token);
  logger.info('Request rejected via email link', { requestId: token });
  return void res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/approve-request?result=rejected`);
});

export default router;
