// Gate used by insertValidatedDeal (dealFinder.ts) — the single insert
// choke point both the automated site-search job and the manual
// WhatsApp-curated import (backend/scripts/insertManualDeals.ts) go
// through. A steep discount doesn't make something a good gift: chargers,
// cables, power banks, basic appliances etc. are real, legitimately
// discounted products that nobody would actually want to receive AS A GIFT.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../lib/logger.js';
import { parseJsonObjectLoose } from '../lib/jsonExtract.js';

const logger = new Logger('giftAppropriateness');
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

export interface AppropriatenessResult { ok: boolean; reason?: string }

export async function isGiftAppropriate(title: string, description?: string | null): Promise<AppropriatenessResult> {
  const prompt = `
האם המוצר הבא הגיוני כרעיון למתנה שאדם אחד נותן לאדם אחר (יום הולדת, חתונה, וכו')?

כותרת: ${title}
${description ? `תיאור: ${description}` : ''}

ענה "לא" למוצרים שהם רכיבים/אביזרים שגרתיים, ציוד תפעולי/צריכה בסיסי, או מוצר שנתפס כרכישה פרקטית לבית ולא כמתנה — למשל: מטענים, כבלים, סוללות גיבוי, כירות/מאווררים/מכשירי חשמל ביתיים בסיסיים, חלקי חילוף, מוצרי ניקיון.
ענה "כן" למוצרים בעלי ערך רגשי/חוויתי/אישי — תכשיטים, בגדים, גאדג'טים ייעודיים (לא רכיבים גנריים), ציוד תחביב/ספורט, מוצרי טיפוח/פינוק, חוויות, ספרים, צעצועים וכו'.

החזר JSON בלבד (ללא markdown): {"appropriate": true, "reason": "משפט קצר"}
`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = parseJsonObjectLoose<{ appropriate?: boolean; reason?: string }>(result.response.text());
    if (!parsed || typeof parsed.appropriate !== 'boolean') {
      logger.warn('Could not parse gift-appropriateness verdict — defaulting to allow', { title });
      return { ok: true };
    }
    return { ok: parsed.appropriate, reason: parsed.reason };
  } catch (err) {
    // Fail-open: a transient classifier hiccup shouldn't block an otherwise
    // valid insert, matching the per-site try/catch pattern in dealFinder.ts.
    logger.warn('Gift-appropriateness check failed — defaulting to allow', { title, err: (err as Error).message });
    return { ok: true };
  }
}
