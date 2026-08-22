import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { logScriptOutput } from './lib/scriptOutput.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOURCE = 'whatsapp-haregakaniti';

async function main() {
  logScriptOutput('delete-whatsapp-deals');

  const { data: toDelete, error: selErr } = await supabase.from('deal_alerts').select('id, title').eq('source_site', SOURCE);
  if (selErr) { console.error(selErr); return; }
  console.log(`Found ${toDelete?.length ?? 0} rows with source_site='${SOURCE}':`);
  for (const r of toDelete ?? []) console.log(`  - ${r.title}`);

  if (!toDelete?.length) { console.log('Nothing to delete.'); return; }

  const { error: delErr, count } = await supabase.from('deal_alerts').delete({ count: 'exact' }).eq('source_site', SOURCE);
  if (delErr) { console.error('DELETE FAILED', delErr); return; }
  console.log(`\nDeleted ${count} rows.`);
}

main().catch(err => { console.error(err); process.exit(1); });
