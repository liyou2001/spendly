// Runs a folder of real receipt photos through the same extraction the app uses, with each
// model, and reports how often the result adds up and matches what you expect. Uses the same
// keys and RECEIPT_PROVIDER as the Edge Functions, read from supabase/functions/.env.
//
//   npm run receipts:accuracy                      # reads ./receipts
//   npm run receipts:accuracy -- path/to/folder
//
// Put .jpg or .png photos in the folder (it's git-ignored). For any photo, an optional
// <name>.json next to it says what's right: {"total_cents": 14000, "items": 9}.
import { receiptReader } from '../supabase/functions/_shared/reader.ts';
import { mathGap, parseReading, toBase64 } from '../supabase/functions/_shared/receipt.ts';

const folder = Deno.args[0] ?? 'receipts';
const reader = receiptReader();
if (!reader) {
  console.error('Set GEMINI_API_KEY or ANTHROPIC_API_KEY in supabase/functions/.env first.');
  Deno.exit(1);
}
console.log(`Reading with ${reader.provider}: ${reader.models.join(', ')}\n`);

interface Expected {
  total_cents?: number;
  items?: number;
}

const photos: { name: string; path: string; mediaType: 'image/jpeg' | 'image/png' }[] = [];
for await (const entry of Deno.readDir(folder)) {
  const match = /^(.*)\.(jpe?g|png)$/i.exec(entry.name);
  const [, name, extension] = match ?? [];
  if (!entry.isFile || !name || !extension) continue;
  photos.push({
    name,
    path: `${folder}/${entry.name}`,
    mediaType: extension.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg',
  });
}
photos.sort((a, b) => a.name.localeCompare(b.name));
if (photos.length === 0) {
  console.error(`No .jpg or .png photos in ${folder}/.`);
  Deno.exit(1);
}

async function expectedFor(name: string): Promise<Expected | null> {
  try {
    return JSON.parse(await Deno.readTextFile(`${folder}/${name}.json`));
  } catch {
    return null;
  }
}

interface Tally {
  readable: number;
  addsUp: number;
  totalRight: number;
  totalChecked: number;
  itemsRight: number;
  itemsChecked: number;
  seconds: number;
}
const tally = new Map<string, Tally>(
  reader.models.map((model) => [
    model,
    {
      readable: 0,
      addsUp: 0,
      totalRight: 0,
      totalChecked: 0,
      itemsRight: 0,
      itemsChecked: 0,
      seconds: 0,
    },
  ]),
);
const rows: string[][] = [['photo', 'model', 'result', 'total', 'items', 'seconds']];

for (const photo of photos) {
  const bytes = await Deno.readFile(photo.path);
  if (bytes.length > 5 * 1024 * 1024) {
    console.warn(`Skipping ${photo.name}: over 5 MB. Export it smaller.`);
    continue;
  }
  const image = { base64: toBase64(bytes), mediaType: photo.mediaType };
  const expected = await expectedFor(photo.name);

  for (const model of reader.models) {
    const t = tally.get(model);
    if (!t) continue;
    const started = performance.now();
    let result = 'error';
    let total = '';
    let items = '';
    try {
      const parsed = parseReading(await reader.ask(model, image, []));
      if (!parsed.ok) result = `invalid: ${parsed.error}`;
      else if (!parsed.readable) result = `unreadable: ${parsed.problem}`;
      else {
        t.readable++;
        const gap = mathGap(parsed.receipt);
        if (gap === 0) t.addsUp++;
        result = gap === 0 ? 'adds up' : `off by ${gap}¢`;
        total = String(parsed.receipt.total_cents);
        items = String(parsed.receipt.items.length);
        if (expected?.total_cents !== undefined) {
          t.totalChecked++;
          if (parsed.receipt.total_cents === expected.total_cents) t.totalRight++;
          else total += ` (want ${expected.total_cents})`;
        }
        if (expected?.items !== undefined) {
          t.itemsChecked++;
          if (parsed.receipt.items.length === expected.items) t.itemsRight++;
          else items += ` (want ${expected.items})`;
        }
      }
    } catch (e) {
      result = `error: ${String(e).slice(0, 80)}`;
    }
    const seconds = (performance.now() - started) / 1000;
    t.seconds += seconds;
    rows.push([photo.name, model, result, total, items, seconds.toFixed(1)]);
  }
}

const widths = (rows[0] ?? []).map((_, col) =>
  Math.max(...rows.map((row) => row[col]?.length ?? 0)),
);
for (const row of rows) {
  console.log(row.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join('  '));
}

console.log('');
const n = photos.length;
const pct = (part: number, whole: number) =>
  whole === 0 ? '–' : `${part}/${whole} (${Math.round((part / whole) * 100)}%)`;
for (const [model, t] of tally) {
  console.log(
    `${model}: readable ${pct(t.readable, n)} · adds up ${pct(t.addsUp, n)} · right total ${pct(t.totalRight, t.totalChecked)} · right item count ${pct(t.itemsRight, t.itemsChecked)} · ${(t.seconds / n).toFixed(1)}s each`,
  );
}
