import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { logScriptOutput } from './lib/scriptOutput.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  logScriptOutput('check-catalog-quality');

  const { count: total } = await supabase.from('good_gifts_catalog').select('*', { count: 'exact', head: true });
  console.log(`Total rows in good_gifts_catalog: ${total}`);

  const { count: seedCount } = await supabase.from('good_gifts_catalog').select('*', { count: 'exact', head: true }).eq('is_seed', true);
  console.log(`is_seed=true: ${seedCount}`);

  const { data: nullPrice, count: nullPriceCount } = await supabase.from('good_gifts_catalog').select('title', { count: 'exact' }).is('estimated_price', null);
  console.log(`\nNull estimated_price: ${nullPriceCount}`);
  for (const r of (nullPrice ?? []).slice(0, 10)) console.log('  -', r.title);

  const { data: noTags, count: noTagsCount } = await supabase.from('good_gifts_catalog').select('title').eq('tags', '{}');
  console.log(`\nEmpty tags: ${noTagsCount ?? (noTags?.length ?? 0)}`);
  for (const r of (noTags ?? []).slice(0, 10)) console.log('  -', r.title);

  const { data: shortTitle } = await supabase.from('good_gifts_catalog').select('title, estimated_price, tags').order('created_at', { ascending: false }).limit(400);
  const suspicious = (shortTitle ?? []).filter(r => !r.title || r.title.trim().length < 3);
  console.log(`\nSuspiciously short/empty titles (last 400 rows scanned): ${suspicious.length}`);
  for (const r of suspicious.slice(0, 10)) console.log('  -', JSON.stringify(r.title));

  console.log('\n--- Sample of 15 most recent rows (eyeball check) ---');
  for (const r of (shortTitle ?? []).slice(0, 15)) console.log(`  ${r.title} | ₪${r.estimated_price} | ${r.tags}`);
}

main().catch(err => { console.error(err); process.exit(1); });
