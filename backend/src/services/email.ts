import { Resend } from 'resend';
import { Logger } from '../lib/logger.js';
import type { GeminiRecommendation } from '../types/index.js';

const logger = new Logger('email');
const resend = new Resend(process.env.RESEND_API_KEY!);

interface SendReminderParams {
  to: string;
  profileName: string;
  eventType: string;
  eventDate: string;
  recommendations: GeminiRecommendation[];
}

export async function sendReminderEmail(params: SendReminderParams): Promise<void> {
  const { to, profileName, eventType, eventDate, recommendations } = params;

  logger.info('Sending reminder email', { to, profileName, eventType });

  const giftList = recommendations
    .slice(0, 3)
    .map(r => `<li><strong>${r.title}</strong> (~${r.estimated_price} ₪) — ${r.description}</li>`)
    .join('');

  await resend.emails.send({
    from: 'Giftly <reminders@giftly.app>',
    to,
    subject: `🎁 תזכורת: ${eventType} של ${profileName} מתקרב`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>היי! ${eventType} של ${profileName} בתאריך ${eventDate}</h2>
        <p>הנה כמה רעיונות למתנה שמתאימים במיוחד:</p>
        <ul>${giftList}</ul>
        <p><a href="${process.env.FRONTEND_URL}">לכל ההמלצות &rarr;</a></p>
      </div>
    `,
  });

  logger.info('Reminder email sent', { to });
}
