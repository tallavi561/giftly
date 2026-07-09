import { Resend } from 'resend';
import { Logger } from '../lib/logger.js';
import type { GeminiRecommendation } from '../types/index.js';

const logger = new Logger('email');
const resend = new Resend(process.env.RESEND_API_KEY!);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

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
        <p><a href="${FRONTEND_URL}">לכל ההמלצות &rarr;</a></p>
      </div>
    `,
  });

  logger.info('Reminder email sent', { to });
}

export async function sendContactRequestEmail(opts: {
  toEmail: string;
  toName: string;
  requesterName: string;
  requestId: string;
}): Promise<void> {
  const approveUrl = `${FRONTEND_URL}/approve-request?token=${opts.requestId}&action=approve`;
  const rejectUrl  = `${FRONTEND_URL}/approve-request?token=${opts.requestId}&action=reject`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 32px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
    <h1 style="font-size: 1.8rem; margin: 0 0 4px;">🎁 Giftly</h1>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />

    <p style="font-size: 1rem; color: #1a1a1a; margin-bottom: 8px;">שלום ${opts.toName},</p>
    <p style="font-size: 1rem; color: #374151; margin-bottom: 8px;">
      <strong>${opts.requesterName}</strong> רוצה לשמור אותך כאיש קשר ב-Giftly
      כדי לקבל המלצות מתנה מותאמות אישית עבורך.
    </p>
    <p style="font-size: 0.9rem; color: #6b7280; margin-bottom: 24px;">
      אם תאשר, הם יוכלו לראות את הפרופיל הציבורי שלך (שם, תחומי עניין, תאריך לידה)
      אך לא יוכלו לערוך אותו.
    </p>

    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding-left: 8px;">
          <a href="${approveUrl}"
             style="display: inline-block; background: #4f46e5; color: #fff; text-decoration: none;
                    padding: 12px 28px; border-radius: 8px; font-size: 1rem; font-weight: 600;">
            ✅ אשר בקשה
          </a>
        </td>
        <td>
          <a href="${rejectUrl}"
             style="display: inline-block; background: #f3f4f6; color: #374151; text-decoration: none;
                    padding: 12px 28px; border-radius: 8px; font-size: 1rem;">
            ❌ דחה בקשה
          </a>
        </td>
      </tr>
    </table>

    <p style="font-size: 0.8rem; color: #9ca3af; margin-top: 32px; margin-bottom: 0;">
      אם לא ציפית להודעה זו — פשוט התעלם ממנה. לא יקרה כלום אם לא תגיב.
    </p>
  </div>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: 'Giftly <noreply@giftly.app>',
      to: opts.toEmail,
      subject: `${opts.requesterName} רוצה לשמור אותך כאיש קשר ב-Giftly`,
      html,
    });
    if (error) logger.error('Resend error', error);
    else logger.info('Contact request email sent', { to: opts.toEmail });
  } catch (err) {
    logger.error('Failed to send email', err);
  }
}
