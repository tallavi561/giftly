// One-off backfill: migration_v24 added deal_alerts.target_gender with a
// default of 'unisex' for existing rows, since the column didn't exist when
// they were inserted. That default is just "unclassified", not a real
// verdict, so an already-gendered deal (e.g. women's clothing) would keep
// matching contacts of the wrong gender until it naturally expires. This
// re-runs the same Gemini classification giftAppropriateness.ts uses at
// insert time over every currently-active deal and updates target_gender.
//
// Usage:
//   cd backend && npm run backfill:deal-gender

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isGiftAppropriate } from '../src/services/giftAppropriateness.js';
import { logScriptOutput } from './lib/scriptOutput.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  logScriptOutput('backfillDealGender');

  const { data, error } = await supabase.from('deal_alerts')
    .select('id, title, description, target_gender')
    .eq('is_active', true);
  if (error) { console.error(error); process.exit(1); }

  console.log(`${data?.length ?? 0} active deals to classify.`);

  let changed = 0, unchanged = 0, failed = 0;
  for (const deal of data ?? []) {
    try {
      const { targetGender } = await isGiftAppropriate(deal.title, deal.description);
      if (targetGender !== deal.target_gender) {
        const { error: upErr } = await supabase.from('deal_alerts').update({ target_gender: targetGender }).eq('id', deal.id);
        if (upErr) { console.log(`  FAILED update ${deal.title}: ${upErr.message}`); failed++; continue; }
        console.log(`  ${deal.target_gender} -> ${targetGender}: ${deal.title}`);
        changed++;
      } else {
        unchanged++;
      }
    } catch (err) {
      console.log(`  FAILED classify ${deal.title}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. Changed ${changed}, unchanged ${unchanged}, failed ${failed}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
