import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
const logger = new Logger('userProfile');

// GET /api/user-profile — פרופיל של המשתמש המחובר
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data, error } = await db.from('user_profiles').select('*').eq('user_id', user.id).single();
  if (error) return void res.status(404).json({ error: 'No profile yet' });
  res.json(data);
});

// POST /api/user-profile — יצירת פרופיל עצמי (בהרשמה)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { display_name, nickname, interests, bio } = req.body as Record<string, unknown>;

  if (!display_name || !nickname)
    return void res.status(400).json({ error: 'display_name ו-nickname הם שדות חובה' });

  logger.info('Create user profile', { userId: user.id, nickname });
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('user_profiles')
    .insert({ user_id: user.id, email: user.email, display_name, nickname, interests, bio })
    .select()
    .single();
  if (error) {
    logger.error('Create user profile failed', error);
    const msg = error.code === '23505' ? 'הכינוי כבר תפוס — בחר כינוי אחר' : error.message;
    return void res.status(400).json({ error: msg });
  }
  res.status(201).json(data);
});

// PATCH /api/user-profile — עדכון פרופיל עצמי
router.patch('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { display_name, nickname, interests, bio } = req.body as Record<string, unknown>;
  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('user_profiles')
    .update({ display_name, nickname, interests, bio, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) {
    const msg = error.code === '23505' ? 'הכינוי כבר תפוס — בחר כינוי אחר' : error.message;
    return void res.status(400).json({ error: msg });
  }
  res.json(data);
});

// GET /api/user-profile/search?q=... — חיפוש לפי כינוי או מייל
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const q = (req.query.q as string)?.trim();
  if (!q || q.length < 2) return void res.status(400).json({ error: 'שאילתה קצרה מדי' });

  const db = supabaseForUser(token);
  const { data, error } = await db
    .from('user_profiles')
    .select('user_id, display_name, nickname, email, interests, bio')
    .or(`nickname.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10);
  if (error) return void res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
