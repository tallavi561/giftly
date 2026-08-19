import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { loadEffectiveContext } from '../services/contactRecommendationBatch.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest, DealAlert } from '../types/index.js';

const router = Router();
const logger = new Logger('deals');

const MAX_RESULTS = 10;

export interface MatchedDeal {
  deal: DealAlert;
  contact_id: string;
  contact_name: string;
  matched_tags: string[];
}

// GET /api/deals/for-me — active deals matched to the caller's own contacts
// by effective-interest tag overlap (spec §10 in FRONTEND_SPEC2.md). One
// query per contact-with-an-upcoming-need is fine here — this is a Home
// page read, not a hot path, and contact counts are small in practice.
router.get('/for-me', requireAuth, async (req: Request, res: Response) => {
  const { token } = req as AuthRequest;
  const db = supabaseForUser(token);

  const { data: contacts, error: ce } = await db.from('contacts').select('*, user_profile:user_profiles(display_name)');
  if (ce) { logger.error('List contacts failed', ce); return void res.status(500).json({ error: ce.message }); }
  if (!contacts?.length) return void res.json([]);

  const matches: MatchedDeal[] = [];
  const now = new Date().toISOString();

  for (const contact of contacts) {
    const ctx = await loadEffectiveContext(db, contact);
    if (ctx.cleanInterests.length === 0) continue;

    const { data: deals, error: de } = await db
      .from('deal_alerts')
      .select('*')
      .eq('is_active', true)
      .gt('expires_at', now)
      .overlaps('tags', ctx.cleanInterests)
      .order('discount_pct', { ascending: false })
      .limit(5);
    if (de) { logger.error('Match deals failed', { contact_id: contact.id, error: de }); continue; }

    for (const deal of (deals ?? []) as DealAlert[]) {
      matches.push({
        deal,
        contact_id: contact.id,
        contact_name: contact.user_profile?.display_name ?? contact.name,
        matched_tags: deal.tags.filter(t => ctx.cleanInterests.includes(t)),
      });
    }
  }

  matches.sort((a, b) => (b.deal.discount_pct ?? 0) - (a.deal.discount_pct ?? 0));
  res.json(matches.slice(0, MAX_RESULTS));
});

export default router;
