import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { getVisibleHostedEvents, assertContactReachable } from '../services/eventSharing.js';
import { Logger } from '../lib/logger.js';
import type { AuthRequest, EventAudienceTargetType } from '../types/index.js';

const router = Router();
const logger = new Logger('hosted-events');

interface AudienceInput { target_type: EventAudienceTargetType; target_group_id?: string; target_contact_id?: string }

// POST /api/hosted-events — create a hosted event + its audience (spec §14.1, §14.3)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const { type, date, date_type, description, audience } = req.body as {
    type: string; date: string; date_type?: 'gregorian' | 'hebrew'; description?: string; audience: AudienceInput[];
  };
  if (!type || !date) return void res.status(400).json({ error: 'type ו-date הם שדות חובה' });
  if (!audience?.length) return void res.status(400).json({ error: 'audience חייב לכלול לפחות יעד אחד' });

  const db = supabaseForUser(token);

  // spec §14.4 — a CONTACT target must be reachable (linked to a registered user)
  for (const a of audience) {
    if (a.target_type === 'CONTACT' && a.target_contact_id) {
      try {
        await assertContactReachable(db, a.target_contact_id, user.id);
      } catch (err) {
        return void res.status(400).json({ error: (err as Error).message });
      }
    }
  }

  const { data: hostedEvent, error: he } = await db.from('hosted_events').insert({
    owner_user_id: user.id, type, date, date_type: date_type ?? 'gregorian', description: description ?? null,
  }).select().single();
  if (he || !hostedEvent) { logger.error('Create hosted_event failed', he); return void res.status(400).json({ error: he?.message }); }

  const audienceRows = audience.map(a => ({
    hosted_event_id: hostedEvent.id, target_type: a.target_type,
    target_group_id: a.target_type === 'GROUP' ? a.target_group_id : null,
    target_contact_id: a.target_type === 'CONTACT' ? a.target_contact_id : null,
  }));
  const { error: ae } = await db.from('event_audience').insert(audienceRows);
  if (ae) { logger.error('Create event_audience failed', ae); return void res.status(400).json({ error: ae.message }); }

  logger.info('Hosted event created', { id: hostedEvent.id, audienceCount: audienceRows.length });
  res.status(201).json(hostedEvent);
});

// GET /api/hosted-events — hosted events I created
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  const { data, error } = await db.from('hosted_events').select('*, event_audience(*)').eq('owner_user_id', user.id).order('created_at', { ascending: false });
  if (error) return void res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/hosted-events/visible — hosted events shared WITH me (spec §14.3)
router.get('/visible', requireAuth, async (req: Request, res: Response) => {
  const { user, token } = req as AuthRequest;
  const db = supabaseForUser(token);
  try {
    const events = await getVisibleHostedEvents(db, user.id);
    res.json(events);
  } catch (err) {
    logger.error('Resolve visible hosted_events failed', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
