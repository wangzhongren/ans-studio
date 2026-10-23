import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, existsSync } from 'node:fs';
import path from 'node:path';

const cwd = process.argv[2] || process.cwd();
const out = execFileSync('git', ['-c','core.quotePath=false','status','--porcelain=v1','-z','-uall','--','src','app','test'], {cwd, encoding:'buffer'});
const parts = out.toString('utf8').split('\0');
const paths = new Set();
for (let i=0;i<parts.length;i++){
  const rec = parts[i];
  if (!rec) continue;
  const xy = rec.slice(0,2);
  const rest = rec.slice(3);
  if (xy[0]==='R'||xy[0]==='C'){ paths.add(rest); i++; continue; }
  paths.add(rest);
}
const sorted = [...paths].sort((a,b)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8')));
const lines = [];
const details = [];
for (const p of sorted) {
  const abs = path.join(cwd, p);
  if (!existsSync(abs)) { lines.push(`MISSING  ${p}`); details.push({status:'MISSING', path:p}); continue; }
  const st = lstatSync(abs);
  if (!st.isFile()) { lines.push(`NONFILE  ${p}`); details.push({status:'NONFILE', path:p}); continue; }
  const buf = readFileSync(abs);
  const sha = createHash('sha256').update(buf).digest('hex');
  const gitBlob = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
  lines.push(`${sha}  ${p}`);
  details.push({status:'OK', path:p, sha256:sha, gitBlob, size:buf.length});
}
const canonical = lines.join('\n') + '\n';
const snapshot = createHash('sha256').update(canonical, 'utf8').digest('hex');
const listHash = createHash('sha256').update(sorted.join('\n')+'\n','utf8').digest('hex');
process.stdout.write(`file_count=${sorted.length}\nsnapshot_sha256=${snapshot}\nfile_list_sha256=${listHash}\n\n`);
process.stdout.write('## FILES\n');
process.stdout.write(sorted.join('\n')+'\n');
process.stdout.write('\n## HASHES\n');
process.stdout.write(lines.join('\n')+'\n');
process.stdout.write('\n## DETAILS_JSON\n');
process.stdout.write(JSON.stringify(details)+'\n');
