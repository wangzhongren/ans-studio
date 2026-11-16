import fs from 'node:fs';
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
let cur = null;
const fails = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m = l.match(/^test at (.+?):(\d+):(\d+)$/);
  if (m) { cur = { file: m[1], line: Number(m[2]), col: Number(m[3]), name: null, duration: null, error: [] }; continue; }
  const x = l.match(/^✖ (.+?) \(([\d.,]+)ms\)$/);
  if (x && cur) { cur.name = x[1]; cur.duration = x[2]; fails.push(cur); continue; }
  if (cur && cur.name && cur.error.length < 6 && !/^\s*$/.test(l)) cur.error.push(l.trim().slice(0, 300));
}
for (const f of fails) {
  console.log(`--- ${f.file}:${f.line}\nNAME: ${f.name}\nDUR: ${f.duration}\nERR: ${f.error.slice(0,4).join(' | ')}\n`);
}
