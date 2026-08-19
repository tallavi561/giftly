// Inserts a batch of manually-curated deals (e.g. extracted + verified from
// a WhatsApp group export) into deal_alerts, using the exact same
// validation as the automated site-search job (dealFinder.ts) — just
// without that job's site allow-list check, since a manually-curated deal
// can legitimately come from anywhere.
//
// Usage:
//   cd backend && npm run insert:deals -- path/to/deals.json
//   (defaults to scripts/manual-deals.json if no path is given)
//
// Input file shape: a JSON array of objects matching DealInput
// (see services/dealFinder.ts) — title and current_price are required,
// tags must be from the Master Tag List (invalid entries are skipped, not
// guessed at), expires_at is optional (ISO date; defaults to
// DEAL_DEFAULT_EXPIRY_DAYS from now if omitted).

import 'dotenv/config';
import { readFileSync } from 'fs';
import { insertValidatedDeal, deactivateExpiredDeals, type DealInput } from '../src/services/dealFinder.js';

async function main() {
  const path = process.argv[2] ?? 'scripts/manual-deals.json';
  console.log(`Reading deals from ${path}...`);

  const raw = readFileSync(path, 'utf-8');
  const deals = JSON.parse(raw) as DealInput[];
  console.log(`${deals.length} deals to insert.`);

  let inserted = 0, skipped = 0;
  for (const deal of deals) {
    const outcome = await insertValidatedDeal(deal);
    if (outcome.ok) { inserted++; console.log(`  + ${deal.title}`); }
    else { skipped++; console.log(`  skip (${outcome.reason}): ${deal.title}`); }
  }

  await deactivateExpiredDeals();

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
