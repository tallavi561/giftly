import type { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { supabase } from '../lib/supabase.js';
import { Logger } from '../lib/logger.js';

const logger = new Logger('auth');

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    logger.warn('Request missing auth token', { path: req.path });
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    logger.warn('Invalid auth token', { path: req.path });
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  (req as any).user = data.user;
  (req as any).token = token;
  next();
}
