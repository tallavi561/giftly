import { Router, type Request, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { sendReminderEmail } from '../services/email.js';
import { Logger } from '../lib/logger.js';

const router = Router();
const logger = new Logger('cron');

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
