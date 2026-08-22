// Read-only check: probes the live Supabase DB for the tables/columns each
// of migration_v15..v22 is supposed to create, and reports which ones are
// actually present. Doesn't touch data, doesn't run any DDL.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { logScriptOutput } from './lib/scriptOutput.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Check { migration: string; label: string; table: string; column?: string }

const CHECKS: Check[] = [
  { migration: 'v15', label: 'user_profiles.negative_prefs', table: 'user_profiles', column: 'negative_prefs' },
  { migration: 'v15', label: 'contacts.negative_prefs', table: 'contacts', column: 'negative_prefs' },
  { migration: 'v16', label: 'good_gifts_catalog (table)', table: 'good_gifts_catalog' },
  { migration: 'v16', label: 'gift_country_stats (table)', table: 'gift_country_stats', column: 'gift_id' },
  { migration: 'v16', label: 'gift_neighbors (table)', table: 'gift_neighbors', column: 'gift_id' },
  { migration: 'v17', label: 'recommendations.rating', table: 'recommendations', column: 'rating' },
  { migration: 'v17', label: 'recommendations.gift_id', table: 'recommendations', column: 'gift_id' },
  { migration: 'v17', label: 'recommendations.category_tag', table: 'recommendations', column: 'category_tag' },
  { migration: 'v17', label: 'recommendations.batch_id', table: 'recommendations', column: 'batch_id' },
  { migration: 'v17', label: 'recommendations.feedback_reason', table: 'recommendations', column: 'feedback_reason' },
  { migration: 'v18', label: 'self_gift_suggestions.gift_id', table: 'self_gift_suggestions', column: 'gift_id' },
  { migration: 'v18', label: 'self_gift_suggestions.category_tag', table: 'self_gift_suggestions', column: 'category_tag' },
  { migration: 'v18', label: 'self_gift_suggestions.feedback_reason', table: 'self_gift_suggestions', column: 'feedback_reason' },
  { migration: 'v19', label: 'recommendations.second_chance_shown_at', table: 'recommendations', column: 'second_chance_shown_at' },
  { migration: 'v19', label: 'cron_job_runs (table)', table: 'cron_job_runs', column: 'job_name' },
  { migration: 'v20', label: 'user_profiles.require_approval_for_group_invites', table: 'user_profiles', column: 'require_approval_for_group_invites' },
  { migration: 'v20', label: 'hosted_events (table)', table: 'hosted_events' },
  { migration: 'v20', label: 'groups (table)', table: 'groups' },
  { migration: 'v20', label: 'group_members (table)', table: 'group_members' },
  { migration: 'v20', label: 'invite_links (table)', table: 'invite_links' },
  { migration: 'v20', label: 'event_audience (table)', table: 'event_audience' },
  { migration: 'v21', label: 'deal_alerts (table)', table: 'deal_alerts' },
  { migration: 'v22', label: 'good_gifts_catalog.source_url', table: 'good_gifts_catalog', column: 'source_url' },
];

async function main() {
  logScriptOutput('check-migrations');
  const results: { migration: string; label: string; ok: boolean; err?: string }[] = [];

  for (const check of CHECKS) {
    const selectCols = check.column ? check.column : 'id';
    const { error } = await supabase.from(check.table).select(selectCols).limit(1);
    results.push({ migration: check.migration, label: check.label, ok: !error, err: error?.message });
  }

  const byMigration = new Map<string, typeof results>();
  for (const r of results) {
    if (!byMigration.has(r.migration)) byMigration.set(r.migration, []);
    byMigration.get(r.migration)!.push(r);
  }

  console.log('=== Migration status on live Supabase DB ===\n');
  for (const [migration, checks] of byMigration) {
    const allOk = checks.every(c => c.ok);
    console.log(`${migration}: ${allOk ? 'APPLIED' : 'MISSING / PARTIAL'}`);
    for (const c of checks) {
      console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.label}${c.err ? ` — ${c.err}` : ''}`);
    }
  }

  const missing = results.filter(r => !r.ok);
  console.log(`\n${missing.length === 0 ? 'All checks passed — v15 through v22 are fully applied.' : `${missing.length} check(s) failed — see FAIL lines above.`}`);
}

main().catch(err => { console.error(err); process.exit(1); });
