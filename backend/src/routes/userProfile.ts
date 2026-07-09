import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { hashPassword } from './contacts.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('userProfile');

// GET /api/user-profile/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('user_profiles')
    .select('user_id, display_name, nickname, email, interests, bio, birth_date, city, country, privacy_level, created_at, updated_at')
    .eq('user_id', user.id)
    .single();
  if (error) return void res.status(404).json({ error: 'No profile yet' });
  res.json(data);
});

// POST /api/user-profile — יצירת פרופיל
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { display_name, nickname, interests, bio, birth_date, city, country, privacy_level, privacy_password } =
    req.body as Record<string, unknown>;

  if (!display_name || !nickname)
    return void res.status(400).json({ error: 'display_name ו-nickname הם שדות חובה' });

  const level = (privacy_level as string) || 'approval';
  let passwordHash: string | null = null;
  if (level === 'password') {
    if (!privacy_password || typeof privacy_password !== 'string')
      return void res.status(400).json({ error: 'נדרשת סיסמה עבור רמת פרטיות זו' });
    passwordHash = hashPassword(privacy_password);
  }

  logger.info('Create user profile', { userId: user.id, nickname, privacy_level: level });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('user_profiles')
    .insert({
      user_id: user.id, email: user.email, display_name, nickname,
      interests, bio, birth_date: birth_date || null, city: city || null, country: country || null,
      privacy_level: level, privacy_password_hash: passwordHash,
    })
    .select('user_id, display_name, nickname, email, interests, bio, birth_date, city, country, privacy_level, created_at, updated_at')
    .single();
  if (error) {
    logger.error('Create user profile failed', error);
    const msg = error.code === '23505' ? 'הכינוי כבר תפוס — בחר כינוי אחר' : error.message;
    return void res.status(400).json({ error: msg });
  }
  res.status(201).json(data);
});

// PATCH /api/user-profile — עדכון פרופיל
router.patch('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { display_name, nickname, interests, bio, birth_date, city, country, privacy_level, privacy_password } =
    req.body as Record<string, unknown>;

  const updateData: Record<string, unknown> = {
    display_name, nickname, interests, bio,
    birth_date: birth_date || null, city: city || null, country: country || null,
    updated_at: new Date().toISOString(),
  };

  if (privacy_level) {
    updateData.privacy_level = privacy_level;
    if (privacy_level === 'password') {
      if (!privacy_password || typeof privacy_password !== 'string')
        return void res.status(400).json({ error: 'נדרשת סיסמה עבור רמת פרטיות זו' });
      updateData.privacy_password_hash = hashPassword(privacy_password as string);
    } else {
      updateData.privacy_password_hash = null;
    }
  }

  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('user_profiles')
    .update(updateData)
    .eq('user_id', user.id)
    .select('user_id, display_name, nickname, email, interests, bio, birth_date, city, country, privacy_level, created_at, updated_at')
    .single();
  if (error) {
    const msg = error.code === '23505' ? 'הכינוי כבר תפוס — בחר כינוי אחר' : error.message;
    return void res.status(400).json({ error: msg });
  }
  res.json(data);
});

// GET /api/user-profile/search?q=...
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const q = (req.query.q as string)?.trim();
  if (!q || q.length < 2) return void res.status(400).json({ error: 'שאילתה קצרה מדי' });

  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('user_profiles')
    .select('user_id, display_name, nickname, email, interests, bio, privacy_level')
    .or(`nickname.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10);
  if (error) return void res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
