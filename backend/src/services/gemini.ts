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

export interface SelfProfile {
  display_name: string;
  gender: string | null;
  birth_date: string | null;
  interests: string[] | null;
  bio: string | null;
  city: string | null;
  country: string | null;
}

export async function generateSelfGiftSuggestions(profile: SelfProfile): Promise<GeminiRecommendation[]> {
  logger.info('Generating self suggestions', { name: profile.display_name });

  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const prompt = `
אתה מומחה בבחירת מתנות. עזור לאדם הבא לגלות מתנות שהוא עצמו ירצה לקבל או לפנק את עצמו בהן.

פרטי האדם:
- שם: ${profile.display_name}
- מגדר: ${profile.gender === 'male' ? 'זכר' : profile.gender === 'female' ? 'נקבה' : 'לא ידוע'}
${age ? `- גיל: ${age}` : ''}
- תחומי עניין: ${(profile.interests ?? []).join(', ') || 'לא ידוע'}
- תיאור: ${profile.bio ?? ''}
${profile.city ? `- מיקום: ${profile.city}, ${profile.country ?? ''}` : ''}

החזר JSON בלבד (ללא markdown), עם המבנה הבא:
{
  "recommendations": [
    {
      "title": "שם המתנה",
      "description": "למה זה מתאים לאדם הזה",
      "estimated_price": 150,
      "category": "קטגוריה",
      "search_query": "מה לחפש בגוגל"
    }
  ]
}

החזר 5 המלצות ממוינות מהמתאימה ביותר לפחות.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in Gemini response');
  const parsed = JSON.parse(text.slice(start, end + 1)) as GeminiResponse;
  return parsed.recommendations;
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
- מגדר: ${profile.gender === 'male' ? 'זכר' : profile.gender === 'female' ? 'נקבה' : profile.gender ? 'אחר' : 'לא ידוע'}
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
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in Gemini response');
  const json = text.slice(start, end + 1);

  const parsed = JSON.parse(json) as GeminiResponse;
  logger.info('Recommendations generated', { count: parsed.recommendations.length });
  return parsed;
}
