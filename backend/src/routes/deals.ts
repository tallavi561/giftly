import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase, supabaseForUser } from '../lib/supabase.js';
import { loadEffectiveContext } from '../services/contactRecommendationBatch.js';
import { isUrlLive } from '../services/dealFinder.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest, DealAlert, CatalogTag } from '../types/index.js';
import { TAG_LABEL_HE } from '../types/index.js';

const router = Router();
const logger = new Logger('deals');

const MAX_RESULTS = 10;

export interface MatchedDeal {
  deal: DealAlert;
  contacts: { contact_id: string; contact_name: string }[];
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

// "X" / "X ו-Y" / "X, Y ו-Z" — standard Hebrew list joining, used when the
// same deal matches more than one of the caller's contacts.
function joinHebrewNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
}

function buildMatchReason(category: CatalogTag, contactNames: string[]): string {
  if (category === 'general') return 'מבצע כללי';
  return `נבחר כי ${TAG_LABEL_HE[category]} מתאים לתחומי העניין של ${joinHebrewNames(contactNames)}`;
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

  // Keyed by deal id so a deal matching several of the caller's contacts
  // (e.g. two contacts who both like books) surfaces once, with every
  // matching contact listed on it — not once per contact.
  const byDealId = new Map<string, { deal: DealAlert; contacts: { contact_id: string; contact_name: string }[]; matchedTags: Set<string> }>();
  const now = new Date().toISOString();

  for (const contact of contacts) {
    const ctx = await loadEffectiveContext(db, contact);
    if (ctx.cleanInterests.length === 0) continue;

    // 'general' is never a selectable interest, so it's added here only to
    // let general-tagged deals through the overlap filter — matched_tags
    // below still checks against the real interests only, so a deal that
    // only matched via 'general' correctly ends up with no specific match.
    let query = db
      .from('deal_alerts')
      .select('*')
      .eq('is_active', true)
      .gt('expires_at', now)
      .overlaps('tags', [...ctx.cleanInterests, 'general']);

    // Only filter on gender when it's known — use the *effective* gender
    // (linked profile's gender takes priority over the contact record's own,
    // same precedence as loadEffectiveContext above), since a linked
    // contact's own `contacts.gender` is often left null with the real value
    // only set on their profile. A deal clearly targeted at the other gender
    // (e.g. women's clothing) shouldn't reach a contact of the opposite
    // gender regardless of tag overlap.
    if (ctx.gender === 'male' || ctx.gender === 'female') {
      query = query.in('target_gender', [ctx.gender, 'unisex']);
    }

    const { data: deals, error: de } = await query
      .order('discount_pct', { ascending: false })
      .limit(5);
    if (de) { logger.error('Match deals failed', { contact_id: contact.id, error: de }); continue; }

    const contactName = contact.user_profile?.display_name ?? contact.name;
    for (const deal of (deals ?? []) as DealAlert[]) {
      const matched_tags = deal.tags.filter(t => ctx.cleanInterests.includes(t));
      const existing = byDealId.get(deal.id);
      if (existing) {
        existing.contacts.push({ contact_id: contact.id, contact_name: contactName });
        for (const t of matched_tags) existing.matchedTags.add(t);
      } else {
        byDealId.set(deal.id, { deal, contacts: [{ contact_id: contact.id, contact_name: contactName }], matchedTags: new Set(matched_tags) });
      }
    }
  }

  let matches: MatchedDeal[] = Array.from(byDealId.values()).map(entry => {
    const matched_tags = Array.from(entry.matchedTags);
    const category = pickDisplayCategory(matched_tags);
    return {
      deal: entry.deal,
      contacts: entry.contacts,
      matched_tags,
      category_label: TAG_LABEL_HE[category],
      match_reason: buildMatchReason(category, entry.contacts.map(c => c.contact_name)),
    };
  });

  matches.sort((a, b) => (b.deal.discount_pct ?? 0) - (a.deal.discount_pct ?? 0));
  matches = matches.slice(0, MAX_RESULTS);

  // Final serve-time liveness check on just the handful of deals actually
  // about to be shown to this user — the daily cron (runVerifyDealLinks)
  // sweeps the whole active set, but this closes the gap for anything that
  // went dead since the last sweep. Bounded to MAX_RESULTS links, checked in
  // parallel, so it doesn't meaningfully slow this page down. Any dead one
  // found here is deactivated in the DB too, so it self-heals for every
  // other user instead of only being hidden from this response.
  const liveFlags = await Promise.all(matches.map(m => isUrlLive(m.deal.source_url)));
  const dead = matches.filter((_, i) => !liveFlags[i]);
  if (dead.length) {
    const deadIds = dead.map(m => m.deal.id);
    logger.info('Deactivating dead deals found at serve time', { count: dead.length, ids: deadIds });
    (async () => {
      try {
        const { error } = await supabase.from('deal_alerts').update({ is_active: false }).in('id', deadIds);
        if (error) logger.warn('Failed to deactivate dead deals found at serve time', { error: error.message });
      } catch (err) {
        logger.warn('Failed to deactivate dead deals found at serve time', { error: (err as Error).message });
      }
    })();
  }
  matches = matches.filter((_, i) => liveFlags[i]);

  res.json(matches);
});

export default router;
