import fs from 'node:fs';
const [file, lineNo, marker] = process.argv.slice(2);
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const line = lines[Number(lineNo) - 1];
const at = line.indexOf(marker);
const start = line.indexOf('[', at);
const trace = JSON.parse(line.slice(start));
console.log(`trace entries: ${trace.length}`);
for (const [i, row] of trace.entries()) {
  const user = String(row.user ?? '').replace(/\n/g, '\n').slice(0, 110);
  const tools = (row.tools ?? []).map(t => String(t).replace(/\n/g, '\n').slice(0, 90));
  console.log(`${i} role=${row.role} lastRole=${row.lastRole} lastToolId=${row.lastToolId ?? ''} user="${user}" tools=${JSON.stringify(tools)}`);
}
