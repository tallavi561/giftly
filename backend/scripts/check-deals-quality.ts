import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { logScriptOutput } from './lib/scriptOutput.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  logScriptOutput('check-deals-quality');
  const { data, error } = await supabase.from('deal_alerts')
    .select('id, title, source_site, tags, current_price, is_active, found_at')
    .eq('is_active', true)
    .order('found_at', { ascending: false });
  if (error) { console.error(error); return; }
  console.log(`Total active deals: ${data?.length}\n`);
  for (const d of data ?? []) {
    console.log(`[${d.id.slice(0, 8)}] ${d.title} | ${d.tags} | ${d.source_site} | ₪${d.current_price}`);
  }
}
main();
