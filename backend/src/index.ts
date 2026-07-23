import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import userProfileRouter from './routes/userProfile.js';
import contactsRouter from './routes/contacts.js';
import eventsRouter from './routes/events.js';
import giftsRouter from './routes/gifts.js';
import recommendationsRouter from './routes/recommendations.js';
import contactRequestsRouter from './routes/contactRequests.js';
import selfRecommendationsRouter from './routes/selfRecommendations.js';
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

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => logger.info(`Giftly backend running on port ${PORT}`));
