import { Router, type Request, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { sendReminderEmail } from '../services/email.js';
import { Logger } from '../lib/logger.js';
import { loadEffectiveContext } from '../services/contactRecommendationBatch.js';
import { applyRatingFeedback } from '../services/catalogFeedback.js';
import { runFindDeals as runFindDealsJob, runVerifyDealLinks as runVerifyDealLinksJob } from '../services/dealFinder.js';

const router = Router();
const logger = new Logger('cron');

// Once-per-day guard for a named job, using cron_job_runs (migration_v19) —
// separate from the legacy single-row cron_runs table that only ever
// tracked the reminders job.
async function hasRunToday(jobName: string): Promise<boolean> {
  const todayStr = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('cron_job_runs').select('run_date').eq('job_name', jobName).eq('run_date', todayStr).maybeSingle();
  return !!data;
}

async function recordRun(jobName: string, stats: Record<string, unknown>): Promise<void> {
  const todayStr = new Date().toISOString().split('T')[0];
  await supabase.from('cron_job_runs').upsert({ job_name: jobName, run_date: todayStr, stats });
}

/**
 * GET /api/cron/reminders
 * Protected by x-admin-secret header.
 * For each event whose reminder day falls on today, sends an email to the contact owner.
 *
 * Recurring events  (date = "MM-DD")   → sends every year, no permanent flag set
 * One-time events   (date = "YYYY-MM-DD") → sends once, then marks reminder_sent = true
 */
export async function runReminders(): Promise<{ sent: string[]; skipped: string[]; alreadyRan?: boolean }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const intervalDays = parseInt(process.env.REMINDER_INTERVAL_DAYS ?? '1', 10);

  // Check last run date
  const { data: lastRun } = await supabase
    .from('cron_runs')
    .select('run_date')
    .order('run_date', { ascending: false })
    .limit(1)
    .single();

  if (lastRun) {
    const daysSinceLast = Math.floor(
      (today.getTime() - new Date(lastRun.run_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLast < intervalDays) {
      logger.info('Reminder interval not reached, skipping', { daysSinceLast, intervalDays });
      return { sent: [], skipped: [], alreadyRan: true };
    }
  }

  // Mark today as ran (upsert to handle any duplicates)
  const { error: insertErr } = await supabase
    .from('cron_runs')
    .upsert({ run_date: todayStr });

  if (insertErr) {
    logger.error('Failed to record cron run', insertErr);
  }

  logger.info('Running reminder cron', { date: todayStr });

  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('*')
    .not('reminder_sent', 'eq', true);

  if (evErr) {
    logger.error('Failed to fetch events', evErr);
    throw new Error(evErr.message);
  }

  const sent: string[] = [];
  const skipped: string[] = [];

  for (const event of events ?? []) {
    const eventDateStr = resolveEventDate(event.date, event.date_type, today.getFullYear());
    if (!eventDateStr) { skipped.push(event.id); continue; }

    const reminderDate = new Date(eventDateStr);
    reminderDate.setDate(reminderDate.getDate() - (event.reminder_days ?? 14));
    const reminderDateStr = reminderDate.toISOString().split('T')[0];

    if (reminderDateStr !== todayStr) { skipped.push(event.id); continue; }

    const { data: contact } = await supabase
      .from('contacts')
      .select('name, owner_id')
      .eq('id', event.contact_id)
      .single();

    if (!contact) { skipped.push(event.id); continue; }

    const { data: ownerProfile } = await supabase
      .from('user_profiles')
      .select('email, display_name')
      .eq('user_id', contact.owner_id)
      .single();

    if (!ownerProfile?.email) { skipped.push(event.id); continue; }

    const { data: recs } = await supabase
      .from('recommendations')
      .select('title, description, estimated_price')
      .eq('contact_id', event.contact_id)
      .order('created_at', { ascending: false })
      .limit(3);

    try {
      await sendReminderEmail({
        to: ownerProfile.email,
        profileName: contact.name,
        eventType: event.type,
        eventDate: formatDisplayDate(eventDateStr),
        recommendations: (recs ?? []) as any,
      });

      sent.push(event.id);

      const isOneTime = event.date?.split('-').length === 3;
      if (isOneTime) {
        await supabase.from('events').update({ reminder_sent: true }).eq('id', event.id);
      }
    } catch (err) {
      logger.error('Failed to send reminder', { eventId: event.id, err });
      skipped.push(event.id);
    }
  }

  // Update the run record with actual counts
  await supabase
    .from('cron_runs')
    .update({ sent: sent.length, skipped: skipped.length })
    .eq('run_date', todayStr);

  logger.info('Reminder cron done', { sent: sent.length, skipped: skipped.length });
  return { sent, skipped };
}

router.get('/reminders', async (req: Request, res: Response) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return void res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runReminders();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// spec §7.4 — "second chance" for recommendations nobody rated. Two stages,
// each gated by SECOND_CHANCE_WINDOW_DAYS (recommended 3-5): first re-expose
// (exempt once from the 30-day dedup, see getExclusionSet), then — if still
// unrated after another window — auto-mark rating=2, same as an explicit
// "not fit" (spec §7.3), including the catalog/gift_stats write.
const SECOND_CHANCE_WINDOW_DAYS = parseInt(process.env.SECOND_CHANCE_WINDOW_DAYS ?? '4', 10);

export async function runSecondChance(): Promise<{ reshown: number; autoRated: number; alreadyRan?: boolean }> {
  if (await hasRunToday('second_chance')) {
    logger.info('Second-chance cron already ran today');
    return { reshown: 0, autoRated: 0, alreadyRan: true };
  }

  const cutoff = new Date(Date.now() - SECOND_CHANCE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

  const { data: toReshow, error: re } = await supabase
    .from('recommendations').select('id').is('rating', null).is('second_chance_shown_at', null).lte('created_at', cutoff);
  if (re) { logger.error('Fetch reshow candidates failed', re); throw new Error(re.message); }

  if (toReshow?.length) {
    await supabase.from('recommendations')
      .update({ second_chance_shown_at: new Date().toISOString() })
      .in('id', toReshow.map(r => r.id));
  }

  const { data: toAutoRate, error: ae } = await supabase
    .from('recommendations').select('*').is('rating', null).not('second_chance_shown_at', 'is', null).lte('second_chance_shown_at', cutoff);
  if (ae) { logger.error('Fetch auto-rate candidates failed', ae); throw new Error(ae.message); }

  let autoRated = 0;
  for (const rec of toAutoRate ?? []) {
    const { data: contact } = await supabase.from('contacts').select('*').eq('id', rec.contact_id).single();
    if (!contact) continue;
    const ctx = await loadEffectiveContext(supabase, contact);
    await applyRatingFeedback(supabase, {
      giftId: rec.gift_id, categoryTag: rec.category_tag, birthDate: ctx.birthDate, gender: ctx.gender, country: ctx.country,
      rating: 2, feedbackReason: null,
    });
    await supabase.from('recommendations').update({ rating: 2 }).eq('id', rec.id);
    autoRated++;
  }

  const reshown = toReshow?.length ?? 0;
  await recordRun('second_chance', { reshown, autoRated });
  logger.info('Second-chance cron done', { reshown, autoRated });
  return { reshown, autoRated };
}

router.get('/second-chance', async (req: Request, res: Response) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) return void res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await runSecondChance());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// spec §4.9 — item-based collaborative filtering, computed as a scheduled
// batch job (not per-request). Jaccard similarity on co-rating (rating>=4)
// from self_gift_suggestions only — per-gift top-K neighbors, fully
// recomputed each run (simplest correct approach at this data scale; an
// incremental update would be the next step if the table grows large).
const CF_MIN_COOCCURRENCE_SUPPORT = parseInt(process.env.CF_MIN_COOCCURRENCE ?? '5', 10);
const CF_TOP_K = parseInt(process.env.CF_TOP_K ?? '10', 10);

export async function runComputeGiftNeighbors(): Promise<{ pairsComputed: number; alreadyRan?: boolean }> {
  if (await hasRunToday('cf_neighbors')) {
    logger.info('CF-neighbors cron already ran today');
    return { pairsComputed: 0, alreadyRan: true };
  }

  const { data: liked, error } = await supabase
    .from('self_gift_suggestions').select('user_id, gift_id').gte('rating', 4).not('gift_id', 'is', null);
  if (error) { logger.error('Fetch liked gifts failed', error); throw new Error(error.message); }

  const byUser = new Map<string, Set<string>>();
  for (const row of liked ?? []) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Set());
    byUser.get(row.user_id)!.add(row.gift_id);
  }

  const giftLikedCount = new Map<string, number>();
  for (const set of byUser.values()) {
    for (const giftId of set) giftLikedCount.set(giftId, (giftLikedCount.get(giftId) ?? 0) + 1);
  }

  const coCount = new Map<string, number>(); // key "a|b", a<b lexicographically
  for (const set of byUser.values()) {
    const ids = [...set].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        coCount.set(key, (coCount.get(key) ?? 0) + 1);
      }
    }
  }

  const neighborsByGift = new Map<string, { neighbor: string; similarity: number }[]>();
  for (const [key, bothLiked] of coCount) {
    if (bothLiked < CF_MIN_COOCCURRENCE_SUPPORT) continue;
    const [a, b] = key.split('|');
    const union = (giftLikedCount.get(a) ?? 0) + (giftLikedCount.get(b) ?? 0) - bothLiked;
    if (union <= 0) continue;
    const similarity = bothLiked / union; // Jaccard
    if (!neighborsByGift.has(a)) neighborsByGift.set(a, []);
    if (!neighborsByGift.has(b)) neighborsByGift.set(b, []);
    neighborsByGift.get(a)!.push({ neighbor: b, similarity });
    neighborsByGift.get(b)!.push({ neighbor: a, similarity });
  }

  const now = new Date().toISOString();
  const rows = [...neighborsByGift.entries()].flatMap(([giftId, neighbors]) =>
    neighbors.sort((x, y) => y.similarity - x.similarity).slice(0, CF_TOP_K)
      .map(n => ({ gift_id: giftId, neighbor_gift_id: n.neighbor, similarity: n.similarity, computed_at: now })),
  );

  // Full recompute: clear, then repopulate. Simplest correct approach for a
  // periodic batch job — the `neq` is Postgres's idiom for an unconditional
  // bulk delete (a DELETE with no WHERE is rejected without a filter).
  const { error: de } = await supabase.from('gift_neighbors').delete().neq('gift_id', '00000000-0000-0000-0000-000000000000');
  if (de) { logger.error('Clear gift_neighbors failed', de); throw new Error(de.message); }
  if (rows.length) {
    const { error: ie } = await supabase.from('gift_neighbors').insert(rows);
    if (ie) { logger.error('Insert gift_neighbors failed', ie); throw new Error(ie.message); }
  }

  await recordRun('cf_neighbors', { pairsComputed: rows.length });
  logger.info('CF-neighbors cron done', { pairsComputed: rows.length });
  return { pairsComputed: rows.length };
}

router.get('/compute-neighbors', async (req: Request, res: Response) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) return void res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await runComputeGiftNeighbors());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// spec §10 (FRONTEND_SPEC2.md) — real deals from a fixed site allow-list,
// see dealFinder.ts. Not run automatically by anything except the schedule
// below — each run costs real Gemini quota (search grounding) and writes
// real rows, so it's deliberately not something the agent triggers itself.
export async function runFindDeals(): Promise<{ inserted: number; skipped: number; searchesRun: number; alreadyRan?: boolean }> {
  if (await hasRunToday('find_deals')) {
    logger.info('Deal-finder cron already ran today');
    return { inserted: 0, skipped: 0, searchesRun: 0, alreadyRan: true };
  }
  const result = await runFindDealsJob();
  await recordRun('find_deals', { ...result });
  return result;
}

router.get('/find-deals', async (req: Request, res: Response) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) return void res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await runFindDeals());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Daily sweep re-checking every currently-active deal's link — a link live
// when found_at can still go dead later (sale ends, page moves), well
// within the 10-day default expiry. deals.ts also does a narrower check on
// just what's about to be shown to one user; this is the broad pass that
// keeps the whole active set healthy independent of user traffic.
export async function runVerifyDealLinks(): Promise<{ checked: number; deactivated: number; alreadyRan?: boolean }> {
  if (await hasRunToday('verify_deal_links')) {
    logger.info('Deal-link verification cron already ran today');
    return { checked: 0, deactivated: 0, alreadyRan: true };
  }
  const result = await runVerifyDealLinksJob();
  await recordRun('verify_deal_links', { ...result });
  return result;
}

router.get('/verify-deal-links', async (req: Request, res: Response) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) return void res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await runVerifyDealLinks());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * Resolve the concrete YYYY-MM-DD date for an event in the given Gregorian year.
 * Handles gregorian one-time (YYYY-MM-DD), recurring (MM-DD), and skips hebrew.
 */
function resolveEventDate(date: string, dateType: string, year: number): string | null {
  if (!date) return null;

  // Hebrew — skip for now (requires hebcal on backend; not installed)
  if (dateType === 'hebrew') return null;

  const parts = date.split('-');

  // One-time: YYYY-MM-DD
  if (parts.length === 3) return date;

  // Recurring: MM-DD — use this year's occurrence; if already passed, use next year
  if (parts.length === 2) {
    const [mm, dd] = parts;
    const thisYear = new Date(`${year}-${mm}-${dd}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (thisYear < today) {
      return `${year + 1}-${mm}-${dd}`;
    }
    return `${year}-${mm}-${dd}`;
  }

  return null;
}

function formatDisplayDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default router;
