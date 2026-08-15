import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { MASTER_TAG_LIST } from '../types/index.js';
import type { Profile, Event, GiftHistory, GeminiRecommendation, CatalogTag } from '../types/index.js';

const VALID_CATEGORY_TAGS = new Set<string>([...MASTER_TAG_LIST, 'general']);
function normalizeCategoryTag(value: unknown): CatalogTag | null {
  return typeof value === 'string' && VALID_CATEGORY_TAGS.has(value) ? (value as CatalogTag) : null;
}

const logger = new Logger('gemini');
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

const RELATIONSHIP_STATUS_HE: Record<string, string> = {
  single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', cohabiting: 'ידועים בציבור',
};
const RELIGION_HE: Record<string, string> = {
  jewish: 'יהודי/ה', muslim: 'מוסלמי/ת', christian: 'נוצרי/ת', druze: 'דרוזי/ת', secular: 'חילוני/ת', other: 'אחר',
};

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
  negative_prefs?: string[] | null;
  free_text?: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
}

const GEMINI_DAILY_LIMIT = parseInt(process.env.GEMINI_DAILY_LIMIT ?? '40', 10);

async function checkGeminiQuota(): Promise<void> {
  const { data: allowed } = await supabase.rpc('try_increment_gemini', { max_calls: GEMINI_DAILY_LIMIT });
  if (!allowed) throw new Error('GEMINI_QUOTA_EXCEEDED');
}

export async function generateSelfGiftSuggestions(profile: SelfProfile, count = 5): Promise<GeminiRecommendation[]> {
  await checkGeminiQuota();
  logger.info('Generating self suggestions', { name: profile.display_name, count });

  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const negatives = (profile.negative_prefs ?? []).slice(-4); // token budget — spec §4.1

  const prompt = `
אתה מומחה בבחירת מתנות. עזור לאדם הבא לגלות מתנות שהוא עצמו ירצה לקבל או לפנק את עצמו בהן.

פרטי האדם:
- שם: ${profile.display_name}
- מגדר: ${profile.gender === 'male' ? 'זכר' : profile.gender === 'female' ? 'נקבה' : 'לא ידוע'}
${age ? `- גיל: ${age}` : ''}
- תחומי עניין: ${(profile.interests ?? []).join(', ') || 'לא ידוע'}
- תיאור: ${profile.bio ?? ''}
${profile.free_text ? `- ניואנסים: ${profile.free_text}` : ''}
${profile.city ? `- מיקום: ${profile.city}, ${profile.country ?? ''}` : ''}
${negatives.length ? `- הימנע לחלוטין מהכיוונים הבאים: ${negatives.join(', ')}` : ''}

רשימת התגיות המותרת עבור category_tag (בחר בדיוק אחת, או null אם שום תגית לא מתאימה):
${MASTER_TAG_LIST.join(', ')}, general

החזר JSON בלבד (ללא markdown), עם המבנה הבא:
{
  "recommendations": [
    {
      "title": "שם המתנה",
      "description": "למה זה מתאים לאדם הזה",
      "estimated_price": 150,
      "category": "קטגוריה",
      "category_tag": "אחת מהתגיות המותרות למעלה, או null",
      "search_query": "מה לחפש בגוגל"
    }
  ]
}

החזר ${count} המלצות ממוינות מהמתאימה ביותר לפחות.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in Gemini response');
  const parsed = JSON.parse(text.slice(start, end + 1)) as GeminiResponse;
  return parsed.recommendations.map(r => ({ ...r, category_tag: normalizeCategoryTag(r.category_tag) }));
}

export async function generateGiftRecommendations(params: GenerateParams): Promise<GeminiResponse> {
  await checkGeminiQuota();
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
- מצב משפחתי: ${profile.relationship_status ? (RELATIONSHIP_STATUS_HE[profile.relationship_status] ?? profile.relationship_status) : 'לא ידוע'}
- ילדים: ${profile.has_children === true ? 'כן' : profile.has_children === false ? 'לא' : 'לא ידוע'}
- דת: ${profile.religion ? (RELIGION_HE[profile.religion] ?? profile.religion) : 'לא ידוע'}
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
