import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import userProfileRouter from './routes/userProfile.js';
import contactsRouter from './routes/contacts.js';
import eventsRouter from './routes/events.js';
import giftsRouter from './routes/gifts.js';
import recommendationsRouter from './routes/recommendations.js';
import contactRequestsRouter from './routes/contactRequests.js';
import selfRecommendationsRouter from './routes/selfRecommendations.js';
import cronRouter, { runReminders, runSecondChance, runComputeGiftNeighbors, runFindDeals } from './routes/cron.js';
import dealsRouter from './routes/deals.js';
import hostedEventsRouter from './routes/hostedEvents.js';
import groupsRouter from './routes/groups.js';
import groupInvitesRouter from './routes/groupInvites.js';
import inviteLinksRouter from './routes/inviteLinks.js';
import { Logger } from './lib/logger.js';

const logger = new Logger('server');
const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

app.use('/api/user-profile', userProfileRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/gifts', giftsRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/contact-requests', contactRequestsRouter);
app.use('/api/self-recommendations', selfRecommendationsRouter);
app.use('/api/cron', cronRouter);
app.use('/api/hosted-events', hostedEventsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/group-invites', groupInvitesRouter);
app.use('/api', inviteLinksRouter); // defines its own /contact-invite-link and /join/:token paths
app.use('/api/deals', dealsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  logger.info(`Giftly backend running on port ${PORT}`);

  const cronExpr = process.env.REMINDER_CRON ?? '0 7 * * *';
  cron.schedule(cronExpr, () => {
    logger.info('Scheduled reminder cron triggered');
    runReminders().catch(err => logger.error('Reminder cron failed', err));
  }, { timezone: 'Asia/Jerusalem' });

  // spec §7.4 / §4.9 — same daily cadence as reminders, offset an hour so
  // they don't all hit Supabase at once.
  const secondChanceCronExpr = process.env.SECOND_CHANCE_CRON ?? '0 8 * * *';
  cron.schedule(secondChanceCronExpr, () => {
    logger.info('Scheduled second-chance cron triggered');
    runSecondChance().catch(err => logger.error('Second-chance cron failed', err));
  }, { timezone: 'Asia/Jerusalem' });

  const cfNeighborsCronExpr = process.env.CF_NEIGHBORS_CRON ?? '0 9 * * *';
  cron.schedule(cfNeighborsCronExpr, () => {
    logger.info('Scheduled CF-neighbors cron triggered');
    runComputeGiftNeighbors().catch(err => logger.error('CF-neighbors cron failed', err));
  }, { timezone: 'Asia/Jerusalem' });

  // Twice a week, not daily like the others — each run is ~10 real Gemini
  // calls with search grounding (pricier than a normal generation call),
  // against 10 sites. Sunday (start of the Israeli work/shopping week, new
  // weekly promotions land) and Thursday (many Israeli retailers push their
  // weekend sales specifically on Thursday) at 6am, same hour as before.
  const findDealsCronExpr = process.env.DEAL_FINDER_CRON ?? '0 6 * * 0,4';
  cron.schedule(findDealsCronExpr, () => {
    logger.info('Scheduled deal-finder cron triggered');
    runFindDeals().catch(err => logger.error('Deal-finder cron failed', err));
  }, { timezone: 'Asia/Jerusalem' });
});
