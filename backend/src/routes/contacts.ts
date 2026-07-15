import { Router, type Request, type Response } from 'express';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { supabase, supabaseForUser } from '../lib/supabase.js';
import { sendContactRequestEmail } from '../services/email.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('contacts');

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    const candidate = scryptSync(plain, salt, 32);
    return timingSafeEqual(Buffer.from(hash, 'hex'), candidate);
  } catch { return false; }
}

// GET /api/contacts
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  logger.debug('List contacts', { userId: user.id });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('contacts')
    .select('*, user_profile:user_profiles(user_id, display_name, nickname, interests, bio, birth_date, city, country, privacy_level)')
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
    .select('*, user_profile:user_profiles(user_id, display_name, nickname, interests, bio, birth_date, city, country, privacy_level)')
    .eq('id', req.params.id)
    .single();
  if (error) return void res.status(404).json({ error: 'Contact not found' });
  res.json(data);
});

// POST /api/contacts
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { name, relationship, linked_user_id, interests, free_text, notes, gender, birth_date, city, country, privacy_password } =
    req.body as Record<string, unknown>;

  // בדיקת פרטיות אם יש linked_user_id
  if (linked_user_id) {
    const { data: targetProfile, error: pe } = await supabase
      .from('user_profiles')
      .select('privacy_level, privacy_password_hash')
      .eq('user_id', linked_user_id as string)
      .single();

    if (pe || !targetProfile) return void res.status(404).json({ error: 'משתמש לא נמצא' });

    if (targetProfile.privacy_level === 'approval') {
      // יצירת בקשת מעקב
      const { data: myProfile } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .single();
      const { data: newReq } = await supabase.from('contact_requests').upsert({
        requester_id: user.id,
        requester_name: myProfile?.display_name ?? null,
        target_user_id: linked_user_id as string,
        status: 'pending',
      }, { onConflict: 'requester_id,target_user_id' }).select().single();

      logger.info('Contact request created', { requester: user.id, target: linked_user_id });

      // שליחת מייל ל-target
      const { data: targetProfile } = await supabase
        .from('user_profiles')
        .select('email, display_name')
        .eq('user_id', linked_user_id as string)
        .single();
      if (targetProfile && newReq) {
        sendContactRequestEmail({
          toEmail: targetProfile.email,
          toName: targetProfile.display_name,
          requesterName: myProfile?.display_name ?? 'מישהו',
          requestId: newReq.id,
        });
      }

      return void res.status(202).json({ status: 'pending_approval' });
    }

    if (targetProfile.privacy_level === 'password') {
      if (!privacy_password || typeof privacy_password !== 'string')
        return void res.status(403).json({ error: 'נדרשת סיסמת הגישה של המשתמש' });
      if (!targetProfile.privacy_password_hash || !verifyPassword(privacy_password, targetProfile.privacy_password_hash))
        return void res.status(403).json({ error: 'סיסמה שגויה' });
    }
    // privacy_level === 'public' → ממשיכים ישר
  }

  logger.info('Create contact', { userId: user.id, name });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('contacts')
    .insert({ owner_id: user.id, name, relationship, linked_user_id: linked_user_id ?? null, interests, free_text, notes: notes || null, gender: gender || null, birth_date: birth_date || null, city: city || null, country: country || null })
    .select()
    .single();
  if (error) { logger.error('Create contact failed', error); return void res.status(400).json({ error: error.message }); }
  res.status(201).json(data);
});

// PATCH /api/contacts/:id
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const { name, relationship, linked_user_id, interests, free_text, notes, gender, birth_date, city, country } =
    req.body as Record<string, unknown>;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('contacts')
    .update({ name, relationship, linked_user_id: linked_user_id ?? null, interests, free_text, notes: notes || null, gender: gender || null, birth_date: birth_date || null, city: city || null, country: country || null })
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

export { hashPassword };
export default router;
