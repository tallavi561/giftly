// One-off backfill: good_gifts_catalog rows inserted before image sourcing
// existed (the original insertManualGifts.ts / seedCatalog.ts runs) have a
// source_url but no image_url. For every row that has a real link and no
// image yet, fetch the page's own og:image and store it — same "hotlink,
// never host" approach as the rest of the feature (backend/src/lib/ogImage.ts).
// Rows with no source_url (most seedCatalog.ts items) are skipped — there's
// no real link to pull a trustworthy image from, so they keep falling back
// to the category-gradient placeholder on the frontend.
//
// Not run automatically — network-heavy, one-off. Run yourself when ready:
//   cd backend && npm run backfill:catalog-images

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isUrlLive } from '../src/services/dealFinder.js';
import { fetchOgImage } from '../src/lib/ogImage.js';
import { logScriptOutput } from './lib/scriptOutput.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  logScriptOutput('backfillCatalogImages');

  const { data: gifts, error } = await supabase
    .from('good_gifts_catalog')
    .select('id, title, source_url')
    .is('image_url', null)
    .not('source_url', 'is', null);
  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }
  if (!gifts?.length) { console.log('Nothing to backfill — every catalog gift with a source_url already has an image.'); return; }

  console.log(`${gifts.length} catalog gift(s) with a source_url and no image_url yet.`);

  // Same lesson as deal_alerts (see dealFinder.ts's isImageUsedElsewhere):
  // og:image on a listing/category page (or a page missing a dedicated
  // product image) commonly falls back to the site's own logo/banner —
  // reject an image already sitting on a different catalog gift rather than
  // show the same picture on unrelated products.
  async function isImageUsedElsewhere(url: string, excludeId: string): Promise<boolean> {
    const { count, error: cErr } = await supabase.from('good_gifts_catalog')
      .select('id', { count: 'exact', head: true }).eq('image_url', url).neq('id', excludeId);
    if (cErr) { console.log(`  duplicate-image check failed, treating as untrustworthy: ${cErr.message}`); return true; }
    return (count ?? 0) > 0;
  }

  let updated = 0, noImageFound = 0, deadLink = 0;
  for (const gift of gifts) {
    const live = await isUrlLive(gift.source_url);
    if (!live) { console.log(`  skip (dead link): ${gift.title}`); deadLink++; continue; }

    const found = await fetchOgImage(gift.source_url);
    if (!found || !(await isUrlLive(found)) || await isImageUsedElsewhere(found, gift.id)) {
      console.log(`  no image found: ${gift.title}`); noImageFound++; continue;
    }

    const { error: upErr } = await supabase.from('good_gifts_catalog').update({ image_url: found }).eq('id', gift.id);
    if (upErr) { console.log(`  UPDATE FAILED: ${gift.title} — ${upErr.message}`); continue; }
    updated++;
    console.log(`  + ${gift.title}`);
  }

  console.log(`\nDone. Updated ${updated}, no image found ${noImageFound}, dead link ${deadLink}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
