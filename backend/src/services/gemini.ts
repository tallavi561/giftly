import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../lib/logger.js';
import type { Profile, Event, GiftHistory, GeminiRecommendation } from '../types/index.js';

const logger = new Logger('gemini');
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

interface GenerateParams {
  profile: Profile;
  event: Event;
  budget_min?: number | null;
  budget_max?: number | null;
  pastGifts: Pick<GiftHistory, 'title'>[];
}

interface GeminiResponse {
  recommendations: GeminiRecommendation[];
}

export async function generateGiftRecommendations(params: GenerateParams): Promise<GeminiResponse> {
  const { profile, event, budget_min, budget_max, pastGifts } = params;

  logger.info('Generating recommendations', { profile: profile.name, event: event.type });

  const pastGiftsList = pastGifts.length
    ? `מתנות שכבר ניתנו בעבר (לא לחזור עליהן): ${pastGifts.map(g => g.title).join(', ')}`
    : '';

  const prompt = `
אתה מומחה בבחירת מתנות. עזור לי למצוא מתנה מתאימה.

פרטי האדם:
- שם: ${profile.name}
- קשר: ${profile.relationship ?? ''}
- תחומי עניין: ${(profile.interests ?? []).join(', ')}
- תיאור חופשי: ${profile.free_text ?? ''}
- אירוע: ${event.type}
- תקציב: ${budget_min ?? 50}–${budget_max ?? 300} ₪
${pastGiftsList}

החזר JSON בלבד (ללא markdown), עם המבנה הבא:
{
  "recommendations": [
    {
      "title": "שם המתנה",
      "description": "תיאור קצר למה זה מתאים",
      "estimated_price": 150,
      "category": "קטגוריה",
      "search_query": "מה לחפש בגוגל/אמזון/יד2"
    }
  ]
}

החזר 5 המלצות ממוינות מהמתאימה ביותר לפחות.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const json = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');

  const parsed = JSON.parse(json) as GeminiResponse;
  logger.info('Recommendations generated', { count: parsed.recommendations.length });
  return parsed;
}
