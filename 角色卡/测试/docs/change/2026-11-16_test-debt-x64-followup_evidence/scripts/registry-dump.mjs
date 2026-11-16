import fs from 'node:fs';
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const idx = lines[i].indexOf('W52 init actual Core registry ');
  if (idx < 0) continue;
  // may be prefixed by console formatting; find first '['
  const arrStart = lines[i].indexOf('[', idx);
  let json = lines[i].slice(arrStart);
  let entries;
  try { entries = JSON.parse(json); } catch { console.log(`line ${i + 1}: PARSE FAIL len=${json.length}`); continue; }
  const abnormal = entries.filter(e => e.state !== 'disposed');
  console.log(`line ${i + 1}: total=${entries.length} non-disposed=${abnormal.length} ${JSON.stringify(abnormal)}`);
}
