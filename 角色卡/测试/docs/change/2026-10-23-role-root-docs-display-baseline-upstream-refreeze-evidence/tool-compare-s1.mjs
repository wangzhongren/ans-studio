import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const cwd = process.argv[2];
const s1dir = process.argv[3];
const curSnapshotFile = process.argv[4];

function unquote(s) {
  if (!(s.startsWith('"') && s.endsWith('"'))) return s;
  const body = s.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== String.fromCharCode(92)) { out += c; continue; }
    const n = body[i + 1];
    if (n === undefined) { out += String.fromCharCode(92); continue; }
    if (n >= '0' && n <= '7') {
      let oct = n; i++;
      for (let k = 0; k < 2; k++) { const d = body[i + 1]; if (d >= '0' && d <= '7') { oct += d; i++; } else break; }
      out += String.fromCharCode(parseInt(oct, 8));
    } else {
      const map = { n: '\n', t: '\t', r: '\r', a: String.fromCharCode(7), b: '\b', f: '\f', v: String.fromCharCode(11) };
      if (n === String.fromCharCode(92)) { out += n; i++; }
      else if (n === '"') { out += '"'; i++; }
      else if (map[n] !== undefined) { out += map[n]; i++; }
      else if (n === 'x') { out += String.fromCharCode(parseInt(body.slice(i + 2, i + 4), 16)); i += 3; }
      else { out += n; i++; }
    }
  }
  return Buffer.from(out, 'latin1').toString('utf8');
}
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }
function gitBlob(buf) { return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex'); }

const curTxt = readFileSync(curSnapshotFile, 'utf8');
const curFilesSection = curTxt.split('## FILES\n')[1].split('\n## HASHES\n')[0].trimEnd();
const curFiles = curFilesSection.split('\n').filter(Boolean);
const curHashMap = new Map();
for (const line of curTxt.split('## HASHES\n')[1].split('\n## DETAILS_JSON\n')[0].trimEnd().split('\n')) {
  const m = line.match(/^([0-9a-f]{64})  (.*)$/);
  if (m) curHashMap.set(m[2], m[1]);
}
const out = [];
const diffs = [];

const s1files = readFileSync(path.join(s1dir, 'worktree-start-src-app-test-files.txt'), 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(unquote);
const curSet = new Set(curFiles);
const s1Set = new Set(s1files);
out.push(`s1_file_count=${s1files.length}`);
out.push(`current_file_count=${curFiles.length}`);
out.push(`only_in_s1=${[...s1Set].filter(p => !curSet.has(p)).length}`);
out.push(`only_in_current=${[...curSet].filter(p => !s1Set.has(p)).length}`);
for (const p of [...s1Set].filter(p => !curSet.has(p))) diffs.push(`ONLY_IN_S1 ${p}`);
for (const p of [...curSet].filter(p => !s1Set.has(p))) diffs.push(`ONLY_IN_CURRENT ${p}`);

const s1hashMap = new Map();
const s1markers = new Map();
for (const line of readFileSync(path.join(s1dir, 'worktree-start-src-app-test-hashes.txt'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  let m = line.match(/^([0-9a-f]{64})  (.*)$/);
  if (m) { s1hashMap.set(unquote(m[2]), m[1]); continue; }
  m = line.match(/^DELETED_OR_MISSING  (.*)$/);
  if (m) { s1markers.set(unquote(m[1]), true); }
}
out.push(`s1_recorded_content_hashes=${s1hashMap.size}`);
out.push(`s1_no_content_hash_markers=${s1markers.size}`);
let hashMatches = 0, hashMismatches = 0;
for (const [p, h] of s1hashMap) {
  const c = curHashMap.get(p);
  if (c === h) { hashMatches++; }
  else { hashMismatches++; diffs.push(`HASH_CHANGED ${p}\n  s1=${h}\n  now=${c}`); }
}
out.push(`s1_hash_match=${hashMatches}`);
out.push(`s1_hash_mismatch=${hashMismatches}`);

out.push('');
out.push('## paths without S1 content hash (S1 quoting bug: literal quoted name -> DELETED_OR_MISSING)');
const S1_FREEZE_END_MS = Date.parse('2026-10-23T13:56:30Z');
let newerThanFreeze = 0;
for (const p of [...s1markers.keys()].sort()) {
  const abs = path.join(cwd, p);
  if (existsSync(abs)) {
    const st = statSync(abs);
    const buf = readFileSync(abs);
    if (st.mtimeMs > S1_FREEZE_END_MS) newerThanFreeze++;
    out.push(`${sha256(buf)}  ${buf.length}  ${st.mtime.toISOString()}  ${st.mtimeMs > S1_FREEZE_END_MS ? 'NEWER_THAN_S1_FREEZE' : 'older_than_s1_freeze'}  ${p}`);
  } else out.push(`MISSING_NOW  ${p}`);
}
out.push(`no_baseline_hash_paths=${s1markers.size} newer_than_s1_freeze=${newerThanFreeze}`);

out.push('');
out.push('## target files comparison vs S1 target-hashes.txt');
const tLines = readFileSync(path.join(s1dir, 'target-hashes.txt'), 'utf8').split('\n').filter(l => l.includes(' | '));
let tOk = 0, tDiff = 0, tMissing = 0;
for (const line of tLines) {
  const cols = line.split(' | ');
  const p = cols[0]; const exists = cols[1]; const s1sha = cols[4]; const s1bytes = cols[5];
  if (p.startsWith('columns:') || p.startsWith('recorded_at')) continue;
  const abs = path.join(cwd, p);
  if (!existsSync(abs)) {
    if (exists === 'NO') { tOk++; out.push(`ABSENT_AS_EXPECTED  ${p}`); }
    else { tMissing++; diffs.push(`TARGET_MISSING ${p}`); out.push(`MISSING  ${p}`); }
    continue;
  }
  const st = statSync(abs); const buf = readFileSync(abs);
  const nowSha = sha256(buf); const nowBlob = gitBlob(buf);
  if (exists === 'NO') { tDiff++; diffs.push(`TARGET_NEW_FILE ${p}`); out.push(`NOW_EXISTS ${p} sha256=${nowSha}`); continue; }
  const ok = nowSha === s1sha && String(buf.length) === s1bytes;
  if (ok) { tOk++; out.push(`UNCHANGED  ${p}  sha256=${nowSha}  git=${nowBlob}  bytes=${buf.length}`); }
  else { tDiff++; diffs.push(`TARGET_CHANGED ${p}\n  s1 sha=${s1sha} bytes=${s1bytes}\n  now sha=${nowSha} bytes=${buf.length}`); out.push(`CHANGED  ${p}  now_sha256=${nowSha}  now_git=${nowBlob}  now_bytes=${buf.length}`); }
}
out.push(`target_unchanged=${tOk} target_changed=${tDiff} target_missing=${tMissing}`);

out.push('');
out.push('## role card boundary hashes vs final-check.txt');
const fc = readFileSync(path.join(s1dir, 'final-check.txt'), 'utf8');
const bLines = fc.split('\n').filter(l => /^[0-9a-f]{64} 角色卡\//.test(l));
let bOk = 0, bDiff = 0;
for (const line of bLines) {
  const idx = line.indexOf(' ');
  const h = line.slice(0, idx);
  const p = line.slice(idx + 1).trim();
  const abs = path.join(cwd, p);
  const now = existsSync(abs) ? sha256(readFileSync(abs)) : 'MISSING';
  if (now === h) { bOk++; out.push(`UNCHANGED  ${p}`); }
  else { bDiff++; diffs.push(`BOUNDARY_CHANGED ${p} s1=${h} now=${now}`); out.push(`CHANGED  ${p} s1=${h} now=${now}`); }
}
out.push(`boundary_unchanged=${bOk} boundary_changed=${bDiff}`);

out.push('');
out.push('## DIFF LIST');
out.push(diffs.length ? diffs.join('\n') : '(none)');
process.stdout.write(out.join('\n') + '\n');
