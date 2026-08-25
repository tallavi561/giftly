// One-off manual trigger for the same link-verification sweep the daily
// cron job (runVerifyDealLinks in dealFinder.ts, wired in cron.ts/index.ts)
// runs automatically — useful to run on demand instead of waiting for the
// schedule.
//
// Usage:
//   cd backend && npm run backfill:dead-links

import 'dotenv/config';
import { runVerifyDealLinks } from '../src/services/dealFinder.js';
import { logScriptOutput } from './lib/scriptOutput.js';

async function main() {
  logScriptOutput('deactivateDeadDealLinks');
  const { checked, deactivated } = await runVerifyDealLinks();
  console.log(`Checked ${checked} active deals, deactivated ${deactivated} dead links.`);
}

main().catch(err => { console.error(err); process.exit(1); });
