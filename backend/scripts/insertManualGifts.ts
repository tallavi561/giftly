// Inserts manually-curated gift ideas (e.g. extracted from a WhatsApp deals
// channel export) into good_gifts_catalog, is_seed=true / shown=0/liked=0
// — same "structural readiness, not fabricated stats" principle as
// scripts/seedCatalog.ts, just from a JSON file instead of a Gemini call.
//
// Usage:
//   cd backend && npm run insert:gifts -- path/to/gifts.json
//   (defaults to scripts/manual-gifts.json if no path is given)
//
// Input file shape: a JSON array of objects — title, tags (from the Master
// Tag List) and estimated_price are required; description, category,
// search_query, source_url are optional. Requires migration_v22
// (good_gifts_catalog.source_url) to have been applied.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { MASTER_TAG_LIST } from '../src/types/index.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const VALID_TAGS = new Set<string>([...MASTER_TAG_LIST, 'general']);

interface GiftInput {
  title: string;
  description?: string | null;
  estimated_price: number;
  category?: string | null;
  search_query?: string | null;
  source_url?: string | null;
  tags: string[];
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
}

async function main() {
  const path = process.argv[2] ?? 'scripts/manual-gifts.json';
  console.log(`Reading gifts from ${path}...`);

  const raw = readFileSync(path, 'utf-8');
  const gifts = JSON.parse(raw) as GiftInput[];
  console.log(`${gifts.length} gifts to insert.`);

  const { data: existing } = await supabase.from('good_gifts_catalog').select('title');
  const seenTitles = new Set((existing ?? []).map(r => normalizeTitle(r.title)));

  let inserted = 0, skipped = 0;
  for (const gift of gifts) {
    const normalized = normalizeTitle(gift.title);
    if (seenTitles.has(normalized)) { console.log(`  skip (duplicate title): ${gift.title}`); skipped++; continue; }
    if (!gift.title || gift.estimated_price == null) { console.log(`  skip (missing title/price): ${gift.title}`); skipped++; continue; }

    const tags = (gift.tags ?? []).filter(t => VALID_TAGS.has(t));
    if (tags.length === 0) { console.log(`  skip (no valid tags): ${gift.title}`); skipped++; continue; }

    const { data: row, error } = await supabase.from('good_gifts_catalog').insert({
      title: gift.title, description: gift.description ?? null, estimated_price: gift.estimated_price,
      category: gift.category ?? null, search_query: gift.search_query ?? gift.title,
      source_url: gift.source_url ?? null, tags, global_shown: 0, global_liked: 0, is_seed: true,
    }).select().single();

    if (error || !row) { console.log(`  INSERT FAILED: ${gift.title} — ${error?.message}`); skipped++; continue; }

    // Structural readiness in every relevant gift_stats_<tag> table (spec §10)
    await Promise.all(tags.map(t =>
      supabase.from(`gift_stats_${t}`).upsert({ gift_id: row.id }, { onConflict: 'gift_id' }),
    ));

    seenTitles.add(normalized);
    inserted++;
    console.log(`  + ${gift.title} [${tags.join(', ')}] — ₪${gift.estimated_price}`);
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
