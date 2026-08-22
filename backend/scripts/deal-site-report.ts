// Reads backend/database/migration_v23's deal_site_search_log and prints a
// per-site success summary — how many times each (site, category) pair was
// actually searched, how many times it errored or returned zero deals, and
// how many deals it has produced overall. Use this to decide which sites in
// CATEGORY_SITES (dealFinder.ts) are dead weight worth pruning.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { logScriptOutput } from './lib/scriptOutput.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Row { site_domain: string; category: string; found_count: number; inserted_count: number; error: string | null }

async function main() {
  logScriptOutput('deal-site-report');

  const { data, error } = await supabase.from('deal_site_search_log').select('site_domain, category, found_count, inserted_count, error').order('run_at', { ascending: false });
  if (error) { console.error(error); return; }
  const rows = (data ?? []) as Row[];

  if (rows.length === 0) {
    console.log('No search history yet — deal_site_search_log is empty. Run find-deals at least once.');
    return;
  }

  const byKey = new Map<string, { site: string; category: string; runs: number; errors: number; zeroFinds: number; totalFound: number; totalInserted: number }>();
  for (const r of rows) {
    const key = `${r.site_domain}::${r.category}`;
    if (!byKey.has(key)) byKey.set(key, { site: r.site_domain, category: r.category, runs: 0, errors: 0, zeroFinds: 0, totalFound: 0, totalInserted: 0 });
    const agg = byKey.get(key)!;
    agg.runs++;
    if (r.error) agg.errors++;
    if (!r.error && r.found_count === 0) agg.zeroFinds++;
    agg.totalFound += r.found_count;
    agg.totalInserted += r.inserted_count;
  }

  const sorted = [...byKey.values()].sort((a, b) => a.category.localeCompare(b.category) || b.totalInserted - a.totalInserted);

  console.log('site                     | category      | runs | errors | zero-finds | found | inserted | verdict');
  console.log('-'.repeat(100));
  for (const s of sorted) {
    const deadRate = (s.errors + s.zeroFinds) / s.runs;
    const verdict = s.runs < 2 ? 'not enough data' : deadRate >= 0.8 ? 'CONSIDER PRUNING' : deadRate >= 0.5 ? 'weak' : 'productive';
    console.log(
      `${s.site.padEnd(24)} | ${s.category.padEnd(13)} | ${String(s.runs).padStart(4)} | ${String(s.errors).padStart(6)} | ${String(s.zeroFinds).padStart(10)} | ${String(s.totalFound).padStart(5)} | ${String(s.totalInserted).padStart(8)} | ${verdict}`,
    );
  }
}

main().catch(err => { console.error(err); process.exit(1); });
