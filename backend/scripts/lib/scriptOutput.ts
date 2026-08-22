// Shared helper: mirrors console.log/warn/error to
// backend/scripts/SCRIPTS-OUTPUT/<scriptName>/<run timestamp>.txt, in
// addition to the normal terminal output, so every script run leaves a
// record on disk. Call once, as the first line of main().
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // backend/scripts

function runTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function formatArgs(args: unknown[]): string {
  return args.map(a => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join(' ');
}

export function logScriptOutput(scriptName: string): void {
  const dir = path.join(SCRIPTS_DIR, 'SCRIPTS-OUTPUT', scriptName);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${runTimestamp()}.txt`);

  for (const method of ['log', 'warn', 'error'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      fs.appendFileSync(filePath, formatArgs(args) + '\n');
    };
  }
}
