// Independent acceptance probe for view_image symlink/junction escape + edge cases.
// Not part of the repo; run with node from the worktree.
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repo = process.argv[2];
const { pathToFileURL } = await import("node:url");
const u = (p) => pathToFileURL(p).href;
const { buildGovernedTools } = await import(u(repo + "/src/provider/runtime/tools.ts"));
const { allow } = await import(u(repo + "/test/runtime-core/fixtures.ts"));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const base = await mkdtemp(path.join(os.tmpdir(), "ans-vi-probe-"));
const root = path.join(base, "root");
const outside = path.join(base, "outside");
await mkdir(root, { recursive: true });
await mkdir(outside, { recursive: true });
await writeFile(path.join(outside, "evil.png"), PNG);
await writeFile(path.join(root, "ok.png"), PNG);
await mkdir(path.join(root, "dir.png"), { recursive: true });

let calls = 0;
const seen = [];
const fn = async (input) => { calls += 1; seen.push(input); return { ok: true }; };
const tools = new Map(buildGovernedTools(allow, { readRoot: root, viewImage: fn }).map((t) => [t.name, t]));
const tool = tools.get("view_image");
const call = (p) => tool.handler({ name: "view_image", args: p === undefined ? {} : { path: p } });

const report = [];
let junctionMade = false;
let fileSymlinkMade = false;
try {
  await symlink(outside, path.join(root, "escape"), "junction");
  junctionMade = true;
} catch (err) {
  report.push(["junction-create", "SKIP", String(err && err.code || err)]);
}
try {
  await symlink(path.join(root, "ok.png"), path.join(root, "inside-link.png"), "file");
  fileSymlinkMade = true;
} catch (err) {
  report.push(["file-symlink-create", "SKIP", String(err && err.code || err)]);
}

async function expectFail(label, p, pattern) {
  const before = calls;
  const r = await call(p);
  const okOk = r.ok === false && pattern.test(r.message) && calls === before;
  report.push([label, okOk ? "PASS" : "FAIL", `${r.ok} calls+${calls - before} :: ${r.message}`]);
}

async function expectPass(label, p) {
  const before = calls;
  const r = await call(p);
  report.push([label, r.ok === true && calls === before + 1 ? "PASS" : "FAIL", `${r.ok} calls+${calls - before} :: ${r.message}`]);
}

await expectPass("inside file", "ok.png");
if (junctionMade) await expectFail("junction escape", "escape/evil.png", /读取根之外/);
if (fileSymlinkMade) await expectFail("file symlink escape", "inside-link.png", /读取根之外/);
await expectFail("root as path", ".", /是目录/);
await expectFail("dot segment traversal", "dir/../ok.png", /`\.\.`|\.\./);
await expectFail("trailing-dot file", "ok.png.", /不存在|不可访问|不支持/);
await expectFail("absolute posix", `/${path.posix.join(root.replace(/\\/g, "/"), "ok.png")}`, /项目相对路径/);
await expectFail("encoded NUL", "ok.png\u0000x", /NUL/);
await expectFail("empty", "", /path 为空/);
await expectFail("spaces", "   ", /path 为空/);

console.log("junctionMade=" + junctionMade + " fileSymlinkMade=" + fileSymlinkMade);
for (const [label, verdict, detail] of report) console.log(`${verdict}\t${label}\t${detail}`);
const fails = report.filter(([, v]) => v === "FAIL");
await rm(base, { recursive: true, force: true });
process.exitCode = fails.length === 0 ? 0 : 1;
