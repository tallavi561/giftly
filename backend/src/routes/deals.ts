import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { loadEffectiveContext } from '../services/contactRecommendationBatch.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest, DealAlert, CatalogTag } from '../types/index.js';
import { TAG_LABEL_HE } from '../types/index.js';

const router = Router();
const logger = new Logger('deals');

const MAX_RESULTS = 10;

export interface MatchedDeal {
  deal: DealAlert;
  contact_id: string;
  contact_name: string;
  matched_tags: string[];
  category_label: string; // Hebrew label for the tag the deal matched on — "כללי" if only 'general' matched
  match_reason: string; // short human-readable "why this deal" sentence
}

// Picks which of the deal's matched tags to surface as "the" category: the
// first non-general one if any actually matched the contact's interests,
// otherwise 'general' — matches the user's ask to always label a deal, and
// to write "כללי" explicitly rather than leaving it blank.
function pickDisplayCategory(matchedTags: string[]): CatalogTag {
  const specific = matchedTags.find(t => t !== 'general') as CatalogTag | undefined;
  return specific ?? 'general';
}

function buildMatchReason(category: CatalogTag, contactName: string): string {
  if (category === 'general') return 'מבצע כללי';
  return `נבחר כי ${TAG_LABEL_HE[category]} מתאים לתחומי העניין של ${contactName}`;
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

    // 'general' is never a selectable interest, so it's added here only to
    // let general-tagged deals through the overlap filter — matched_tags
    // below still checks against the real interests only, so a deal that
    // only matched via 'general' correctly ends up with no specific match.
    const { data: deals, error: de } = await db
      .from('deal_alerts')
      .select('*')
      .eq('is_active', true)
      .gt('expires_at', now)
      .overlaps('tags', [...ctx.cleanInterests, 'general'])
      .order('discount_pct', { ascending: false })
      .limit(5);
    if (de) { logger.error('Match deals failed', { contact_id: contact.id, error: de }); continue; }

    const contactName = contact.user_profile?.display_name ?? contact.name;
    for (const deal of (deals ?? []) as DealAlert[]) {
      const matched_tags = deal.tags.filter(t => ctx.cleanInterests.includes(t));
      const category = pickDisplayCategory(matched_tags);
      matches.push({
        deal,
        contact_id: contact.id,
        contact_name: contactName,
        matched_tags,
        category_label: TAG_LABEL_HE[category],
        match_reason: buildMatchReason(category, contactName),
      });
    }
  }

  matches.sort((a, b) => (b.deal.discount_pct ?? 0) - (a.deal.discount_pct ?? 0));
  res.json(matches.slice(0, MAX_RESULTS));
});

export default router;
