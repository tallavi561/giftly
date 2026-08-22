// Pre-processing seed data (spec §10): populates good_gifts_catalog with
// ~300 LLM-tagged gift ideas, is_seed=true, shown=0/liked=0 everywhere —
// structural readiness, not fabricated statistics (smoothedRate already
// defaults an untouched gift to GLOBAL_MEAN).
//
// This is a one-off admin operation, not part of the running app — it
// bypasses the user-facing Gemini daily quota (checkGeminiQuota) on purpose,
// and is NOT run automatically by anything. Run it yourself when ready:
//
//   cd backend && npm run seed:catalog
//
// Idempotent-ish: re-running skips titles that already exist in the catalog
// (normalized exact match, same dedup default as the rest of the spec), so
// it's safe to re-run to top up a tag that came up short.

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { MASTER_TAG_LIST } from '../src/types/index.js';
import { isGiftAppropriate } from '../src/services/giftAppropriateness.js';
import { logScriptOutput } from './lib/scriptOutput.js';

const ITEMS_PER_TAG = 25; // 11 interest tags + general = 12 * 25 = 300
const ALL_TAGS = [...MASTER_TAG_LIST, 'general'] as const;

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

interface SeedGiftIdea {
  title: string;
  description: string;
  estimated_price: number;
  category: string;
  search_query: string;
  secondary_tags?: string[]; // e.g. a hiking thermos is also tagged "sports"
}

const TAG_LABEL_HE: Record<string, string> = {
  sports: 'ספורט', music: 'נגינה', performances: 'הופעות/סטנדאפ', art: 'ציור/אומנות',
  culinary: 'קפה/קולינריה', travel: 'טיולים/טבע', extreme: 'אקסטרים', workshops: 'סדנאות/זוגיות',
  tech: 'טכנולוגיה/גאדטים', books: 'ספרים/ידע', gaming: 'גיימינג', general: 'כללי (לא תחום עניין ספציפי)',
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
}

async function generateIdeasForTag(tag: string, avoidTitles: string[]): Promise<SeedGiftIdea[]> {
  const prompt = `
אתה מומחה בבחירת מתנות. הצע ${ITEMS_PER_TAG} רעיונות למתנות מוצקות ומגוונות בתחום "${TAG_LABEL_HE[tag]}".
מגוון מחירים (מ-30 ₪ ועד 800 ₪), לא כפילויות זו של זו.
${avoidTitles.length ? `אל תציע שוב את אלה (כבר קיימים בקטלוג): ${avoidTitles.slice(0, 40).join(', ')}` : ''}

רשימת התגיות המותרת (למקרה שהמתנה שייכת גם לתחום עניין נוסף באמת, לא רק בקירוב):
${ALL_TAGS.join(', ')}

החזר JSON בלבד (ללא markdown):
{
  "items": [
    {
      "title": "שם המתנה",
      "description": "תיאור קצר",
      "estimated_price": 150,
      "category": "קטגוריה חופשית לתצוגה",
      "search_query": "מה לחפש בגוגל/אמזון",
      "secondary_tags": ["תגית נוספת אם באמת רלוונטית, אחרת מערך ריק"]
    }
  ]
}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON in Gemini response for tag ${tag}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as { items: SeedGiftIdea[] };
  return parsed.items;
}

async function main() {
  logScriptOutput('seedCatalog');
  console.log(`Seeding ~${ITEMS_PER_TAG * ALL_TAGS.length} catalog items across ${ALL_TAGS.length} tags...`);

  const { data: existing } = await supabase.from('good_gifts_catalog').select('title');
  const seenTitles = new Set((existing ?? []).map(r => normalizeTitle(r.title)));
  console.log(`${seenTitles.size} titles already in catalog — will be skipped if regenerated.`);

  let inserted = 0;
  for (const tag of ALL_TAGS) {
    console.log(`\n--- ${tag} (${TAG_LABEL_HE[tag]}) ---`);
    let ideas: SeedGiftIdea[];
    try {
      ideas = await generateIdeasForTag(tag, [...seenTitles]);
    } catch (err) {
      console.error(`Failed to generate ideas for ${tag}:`, (err as Error).message);
      continue;
    }

    for (const idea of ideas) {
      const normalized = normalizeTitle(idea.title);
      if (seenTitles.has(normalized)) { console.log(`  skip (duplicate): ${idea.title}`); continue; }
      seenTitles.add(normalized);

      const validSecondary = (idea.secondary_tags ?? []).filter(t => (ALL_TAGS as readonly string[]).includes(t) && t !== tag);
      const tags = [tag, ...validSecondary];

      const appropriateness = await isGiftAppropriate(idea.title, idea.description);
      if (!appropriateness.ok) { console.log(`  skip (not gift-appropriate: ${appropriateness.reason}): ${idea.title}`); continue; }

      const { data: gift, error } = await supabase.from('good_gifts_catalog').insert({
        title: idea.title, description: idea.description, estimated_price: idea.estimated_price,
        category: idea.category, search_query: idea.search_query, tags,
        global_shown: 0, global_liked: 0, is_seed: true,
      }).select().single();

      if (error || !gift) { console.error(`  INSERT FAILED: ${idea.title}`, error?.message); continue; }

      // Structural readiness in every relevant gift_stats_<tag> table (spec §10)
      await Promise.all(tags.map(t =>
        supabase.from(`gift_stats_${t}`).upsert({ gift_id: gift.id }, { onConflict: 'gift_id' }),
      ));

      inserted++;
      console.log(`  + ${idea.title} [${tags.join(', ')}] — ₪${idea.estimated_price}`);
    }
  }

  console.log(`\nDone. Inserted ${inserted} new catalog items.`);
}

main().catch(err => { console.error(err); process.exit(1); });
