// B2.1 desktop per-file TAP runner (scratch tool stored with evidence; not product code).
// Usage: node run-tests.mjs <repoRoot> <outDir> <fileListFile> [--max=300000] [--hang=90000]
// Same discipline as B5/B5.1 desktop evidence runner: one process per file, TAP captured,
// results.tsv + failing-names.json + totals.json.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const [repoRoot, outDir, listFile] = process.argv.slice(2);
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const hangArg = process.argv.find((a) => a.startsWith("--hang="));
const MAX = maxArg ? Number(maxArg.slice(6)) : 300000;
const HANG = hangArg ? Number(hangArg.slice(7)) : 90000;
const HANG_NAMES = [
  "write-sequencing", "customer-authorization-plane-integration", "directive-decision",
  "optional-acceptance", "session-rebuild-race", "stuck-redispatch",
];

await fs.mkdir(outDir, { recursive: true });
const files = (await fs.readFile(listFile, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
const results = [];
const failNames = {};

function runOne(file) {
  return new Promise((resolve) => {
    const base = path.basename(file).replace(/\.test\.ts$/, "");
    const timeout = HANG_NAMES.includes(base) ? HANG : MAX;
    const started = Date.now();
    const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", file], {
      cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill("SIGKILL"); } catch {}
    }, timeout);
    child.on("exit", async (code, signal) => {
      clearTimeout(timer);
      const duration = Date.now() - started;
      const summary = {};
      for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
        const m = new RegExp(`^# ${key} (\\d+)$`, "m").exec(out);
        summary[key] = m ? Number(m[1]) : null;
      }
      const names = [];
      for (const line of out.split(/\r?\n/)) {
        const m = /^not ok \d+ - (.*)$/.exec(line);
        if (m) names.push(m[1].replace(/\\#/g, "#"));
      }
      failNames[file] = names;
      const logName = file.replace(/[\\/:*?"<>|]/g, "_") + ".tap";
      await fs.writeFile(path.join(outDir, logName), out + (err !== "" ? `\n---STDERR---\n${err}` : ""), "utf8");
      resolve({ file, code, signal: killed ? "watchdog" : signal, duration, ...summary, failing: names.length });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ file, code: null, signal: "spawn-error", duration: Date.now() - started, tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null, failing: 0, error: String(e) });
    });
  });
}

const tsv = ["file\tcode\tsignal\tduration_ms\ttests\tpass\tfail\tcancelled\tskipped\ttodo\tfailing_names"];
for (const file of files) {
  const r = await runOne(file);
  tsv.push([r.file, r.code ?? "", r.signal ?? "", r.duration, r.tests ?? "", r.pass ?? "", r.fail ?? "", r.cancelled ?? "", r.skipped ?? "", r.todo ?? "", r.failing].join("\t"));
  results.push(r);
  process.stdout.write(`[${results.length}/${files.length}] ${file} tests=${r.tests} pass=${r.pass} fail=${r.fail} cancelled=${r.cancelled} skip=${r.skipped} ${r.signal ?? ""} ${r.duration}ms\n`);
}
await fs.writeFile(path.join(outDir, "results.tsv"), tsv.join("\n") + "\n", "utf8");
await fs.writeFile(path.join(outDir, "failing-names.json"), JSON.stringify(failNames, null, 2), "utf8");
const totals = results.reduce((acc, r) => {
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) acc[key] += r[key] ?? 0;
  if (r.signal === "watchdog") acc.hangs += 1;
  return acc;
}, { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0, hangs: 0 });
await fs.writeFile(path.join(outDir, "totals.json"), JSON.stringify(totals, null, 2), "utf8");
console.log("DONE", JSON.stringify(totals));
