// D3 独立非 UI 联调。真实公共 handler + gate + 临时文件；不声称隔离恶意 PATH/config。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
import { createShellGate } from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { OperatorOutcome, OperatorPrompt, WriteGate } from "../../src/model/runtime.ts";

const posix = process.platform !== "win32";
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-d3-independent-")));
  const project = path.join(root, "project");
  const skill = path.join(root, "skill");
  for (const dir of [project, skill, path.join(project, "owned"), path.join(project, "peer")]) fs.mkdirSync(dir, { recursive: true });
  return { root, project, skill, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
type Fixture = ReturnType<typeof fixture>;
function boundary(dirs: string[]): BoundarySection1 {
  return { entries: dirs.map(p => ({ root: "project", path: p, kind: "directory", purpose: "D3 independent" })), boundarySource: "D3 fixture", acceptance: { accepted: true, source: "D3 fixture" } };
}
function writeTools(workspace: Fixture, dirs: string[], writeSet?: string[], project = workspace.project) {
  const activeBoundary = boundary(dirs);
  const gate: WriteGate = target => resolveWrite(target, activeBoundary, writeSet ? { writeSet, conditions: [] } : undefined, { projectRoot: project, skillRoot: workspace.skill });
  return new Map(buildGovernedTools(gate, { writeRoot: project }).map(tool => [tool.name, tool]));
}
const denyWrites: WriteGate = () => ({ allowed: false, reason: "shell fixture has no write capability", allowedByRoot: { project: [], skill: [] } });
function shell(workspace: Fixture, outcome: OperatorOutcome | (() => Promise<OperatorOutcome>), mode: "operator" | "readonly" | "advisory" | "ordinary" = "operator") {
  const prompts: OperatorPrompt[] = [];
  const audit = createMemoryAuditSink();
  const operatorChannel = async (prompt: OperatorPrompt) => {
    prompts.push(prompt);
    return typeof outcome === "function" ? outcome() : outcome;
  };
  const gate = createShellGate({ classifyShell, rules: defaultShellRules(), audit, operatorChannel, operatorTimeoutMs: 25,
    ...(mode === "operator" ? { operatorOnly: true, approveDeny: true } : mode === "readonly" ? { readonlyOnly: true } : mode === "advisory" ? { advisoryRuleset: true } : {}) });
  const tool = buildGovernedTools(denyWrites, { shellGate: gate, shellCwd: workspace.project }).find(t => t.name === "run_shell")!;
  return { prompts, audit, run: (command: string, signal?: AbortSignal) => tool.handler({ name: "run_shell", args: { command }, toolCallId: "d3", signal }) };
}
const approved: OperatorOutcome = { outcome: "allow", operatorId: "D3 fixture customer" };
const refused: OperatorOutcome = { outcome: "deny", operatorId: "D3 fixture customer", reason: "independent refusal" };
function program(workspace: Fixture, name: string, body: string) {
  const abs = path.join(workspace.project, name);
  fs.writeFileSync(abs, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  return abs;
}
function link(target: string, dest: string) { fs.symlinkSync(target, dest, process.platform === "win32" ? "junction" : "dir"); }

test("D3 AC1/2: real handler refuses cross-role aliases and real-target writeSet omissions before any write", async () => {
  const workspace = fixture();
  try {
    link(path.join(workspace.project, "peer"), path.join(workspace.project, "owned", "alias"));
    fs.writeFileSync(path.join(workspace.project, "peer", "old.txt"), "old");
    for (const [dirs, set] of [[ ["owned"], undefined ], [ ["owned", "peer"], ["owned/alias/old.txt", "owned/alias/new/deep.txt"] ]] as [string[], string[] | undefined][]) {
      const tools = writeTools(workspace, dirs, set);
      for (const target of ["owned/alias/old.txt", "owned/alias/new/deep.txt"]) {
        const result = await tools.get("write_file")!.handler({ name: "write_file", args: { path: target, content: "changed" } });
        assert.equal(result.ok, false, JSON.stringify(result));
      }
      const edited = await tools.get("edit_file")!.handler({ name: "edit_file", args: { path: "owned/alias/old.txt", old_string: "old", new_string: "changed" } });
      assert.equal(edited.ok, false);
      assert.equal(fs.readFileSync(path.join(workspace.project, "peer", "old.txt"), "utf8"), "old");
      assert.deepEqual(fs.readdirSync(path.join(workspace.project, "peer")), ["old.txt"]);
    }
  } finally {
    workspace.cleanup();
  }
});

test("D3 AC2: complete alias authorization and a symlink project root still write; root escape and file symlink stay denied", async () => {
  const workspace = fixture();
  try {
    link(path.join(workspace.project, "peer"), path.join(workspace.project, "owned", "alias"));
    const tools = writeTools(workspace, ["owned", "peer"], ["owned/alias/new.txt", "peer/new.txt"]);
    assert.equal((await tools.get("write_file")!.handler({ name: "write_file", args: { path: "owned/alias/new.txt", content: "allowed" } })).ok, true);
    assert.equal(fs.readFileSync(path.join(workspace.project, "peer", "new.txt"), "utf8"), "allowed");
    const aliasRoot = path.join(workspace.root, "project-alias");
    link(workspace.project, aliasRoot);
    assert.equal((await writeTools(workspace, ["owned"], undefined, aliasRoot).get("write_file")!.handler({ name: "write_file", args: { path: "owned/plain.txt", content: "plain" } })).ok, true);
    link(workspace.skill, path.join(workspace.project, "owned", "outside"));
    const plain = writeTools(workspace, ["owned", "peer"]);
    assert.equal((await plain.get("write_file")!.handler({ name: "write_file", args: { path: "owned/outside/escape.txt", content: "bad" } })).ok, false);
    assert.deepEqual(fs.readdirSync(workspace.skill), []);
    if (posix) {
      fs.symlinkSync(path.join(workspace.project, "peer", "new.txt"), path.join(workspace.project, "owned", "file-link"));
      assert.equal((await plain.get("write_file")!.handler({ name: "write_file", args: { path: "owned/file-link", content: "bad" } })).ok, false);
      assert.equal(fs.lstatSync(path.join(workspace.project, "owned", "file-link")).isSymbolicLink(), true);
      assert.equal(fs.readFileSync(path.join(workspace.project, "peer", "new.txt"), "utf8"), "allowed");
    }
  } finally {
    workspace.cleanup();
  }
});

test("D3 AC7: second real gate observes revoked task scope after mkdir and stops before file commit", async () => {
  const workspace = fixture();
  try {
    const activeBoundary = boundary(["owned"]);
    const scope = { writeSet: ["owned/new-parent/target"], conditions: [] as string[] };
    let calls = 0;
    const gate: WriteGate = target => {
      calls += 1;
      if (calls === 2) scope.writeSet.length = 0;
      return resolveWrite(target, activeBoundary, scope, { projectRoot: workspace.project, skillRoot: workspace.skill });
    };
    const tool = buildGovernedTools(gate, { writeRoot: workspace.project }).find(t => t.name === "write_file")!;
    const result = await tool.handler({ name: "write_file", args: { path: "owned/new-parent/target", content: "must not commit" } });
    assert.equal(result.ok, false);
    assert.equal(calls, 2, "Core must reuse the injected gate immediately before write");
    assert.equal(fs.existsSync(path.join(workspace.project, "owned/new-parent/target")), false);
    assert.deepEqual(fs.readdirSync(path.join(workspace.project, "owned/new-parent")), [], "already-created legitimate empty parent may remain");
    assert.deepEqual(fs.readdirSync(path.join(workspace.project, "peer")), []);
  } finally {
    workspace.cleanup();
  }
});

test("D3 AC3: Windows-shaped paths and script suffixes review without claiming Windows native execution", () => {
  for (const program of ["./cat", "/bin/cat", "tools/cat", "C:\\tools\\cat.exe", "C:cat.exe", "\\\\host\\share\\cat.exe", "cat.cmd", "cat.bat", "cat.ps1"]) {
    assert.equal(classifyShell([program, "file"], defaultShellRules()), "review", program);
  }
});

test("D3 AC3/5: explicit cat executable requires existing approval; refusal, unavailable, timeout and abort never execute", { skip: !posix }, async () => {
  const workspace = fixture();
  try {
    const sentinel = path.join(workspace.project, "sentinel");
    const executable = program(workspace, "cat", `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed');`);
    for (const command of ["./cat", quote(executable)]) {
      for (const outcome of [refused, { outcome: "unavailable", reason: "offline" } as OperatorOutcome, () => new Promise<OperatorOutcome>(() => {})]) {
        const shellSession = shell(workspace, outcome);
        assert.equal((await shellSession.run(command)).ok, false);
        assert.equal(shellSession.prompts.length, 1);
        assert.equal(fs.existsSync(sentinel), false);
        assert.match(shellSession.audit.records[0]!.branch, /^c-review/);
      }
      const shellSession = shell(workspace, approved);
      assert.equal((await shellSession.run(command)).ok, true);
      assert.equal(shellSession.prompts.length, 1);
      assert.equal(fs.readFileSync(sentinel, "utf8"), "executed");
      fs.unlinkSync(sentinel);
    }
    const controller = new AbortController();
    const shellSession = shell(workspace, async () => {
      controller.abort();
      return approved;
    });
    assert.equal((await shellSession.run("./cat", controller.signal)).ok, false);
    assert.equal(fs.existsSync(sentinel), false);
  } finally {
    workspace.cleanup();
  }
});

test("D3 AC4: ordinary cat/ls/rg/git reads remain fast; rg --pre forms need approval without pattern/filename false positives", { skip: !posix }, async () => {
  const workspace = fixture();
  try {
    assert.equal(spawnSync("rg", ["--version"], { encoding: "utf8" }).status, 0, "real rg is required for this POSIX integration evidence");
    fs.writeFileSync(path.join(workspace.project, "data.txt"), "needle\n--pre\n");
    fs.writeFileSync(path.join(workspace.project, "--pre"), "needle\n");
    const sentinel = path.join(workspace.project, "pre-sentinel");
    program(workspace, "preprocessor", `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(sentinel)},'executed');process.stdout.write(fs.readFileSync(process.argv[2]));`);
    // Existing unbounded-search guard does not mark short -e as a pattern source.
    // Explicit depth preserves that existing guard while exercising the D3 classifier.
    assert.equal(classifyShell(["rg", "-e", "--pre", "data.txt"], defaultShellRules()), "allow");
    for (const command of ["cat data.txt", "ls owned", "rg needle data.txt", "rg --max-depth 1 -e --pre data.txt", "rg --regexp --pre data.txt", "rg needle -- --pre"]) {
      const shellSession = shell(workspace, refused);
      const result = await shellSession.run(command);
      assert.equal(result.ok, true, `${command}: ${JSON.stringify(result)}`);
      assert.equal(shellSession.prompts.length, 0, command);
      assert.equal(shellSession.audit.records[0]!.branch, "c-allow", command);
    }
    for (const argv of [["git", "status"], ["git", "diff"], ["git", "log"]]) assert.equal(classifyShell(argv, defaultShellRules()), "allow");
    for (const command of ["rg --pre ./preprocessor needle data.txt", "rg --pre=./preprocessor needle data.txt"]) {
      const no = shell(workspace, refused);
      assert.equal((await no.run(command)).ok, false);
      assert.equal(no.prompts.length, 1);
      assert.equal(fs.existsSync(sentinel), false);
      const yes = shell(workspace, approved);
      assert.equal((await yes.run(command)).ok, true, command);
      assert.equal(yes.prompts.length, 1);
      assert.equal(fs.readFileSync(sentinel, "utf8"), "executed");
      fs.unlinkSync(sentinel);
    }
  } finally {
    workspace.cleanup();
  }
});

test("D3 AC5: review follows ordinary/operator/advisory policy; readonly refuses without asking", { skip: !posix }, async () => {
  const workspace = fixture();
  try {
    const sentinel = path.join(workspace.project, "mode-sentinel");
    program(workspace, "cat", `require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'executed');`);
    for (const mode of ["ordinary", "operator", "advisory", "readonly"] as const) {
      const shellSession = shell(workspace, approved, mode);
      assert.equal((await shellSession.run("./cat")).ok, mode !== "readonly", mode);
      assert.equal(shellSession.prompts.length, mode === "readonly" ? 0 : 1, mode);
      assert.equal(fs.existsSync(sentinel), mode !== "readonly", mode);
      if (fs.existsSync(sentinel)) fs.unlinkSync(sentinel);
    }
    // F6（f5f1bdd）：短内联（≤2048B/≤10 行/≤1024B 每行）进入脚本审查 ⇒ review；
    // 长内联与 re-shell 仍是硬拒（不得把短内联的放行误扩到长内联）。
    assert.equal(classifyShell(["node", "-e", "1"], defaultShellRules()), "review");
    assert.equal(classifyShell(["node", "-e", "x".repeat(3000)], defaultShellRules()), "deny");
    assert.equal(classifyShell(["sh", "-c", "echo hi"], defaultShellRules()), "deny");
    assert.equal(classifyShell(["rm", "file"], defaultShellRules()), "risky");
  } finally {
    workspace.cleanup();
  }
});

test("D3 AC6: real write/edit preserve regular modes and new files use safe creation", { skip: !posix }, async () => {
  const workspace = fixture();
  try {
    const tools = writeTools(workspace, ["owned"]);
    for (const mode of [0o755, 0o644, 0o600]) {
      const name = `owned/mode-${mode}`;
      const abs = path.join(workspace.project, name);
      fs.writeFileSync(abs, "old");
      fs.chmodSync(abs, mode);
      assert.equal((await tools.get("write_file")!.handler({ name: "write_file", args: { path: name, content: "middle" } })).ok, true);
      assert.equal(fs.statSync(abs).mode & 0o777, mode);
      assert.equal((await tools.get("edit_file")!.handler({ name: "edit_file", args: { path: name, old_string: "middle", new_string: "final" } })).ok, true);
      assert.equal(fs.statSync(abs).mode & 0o777, mode);
      assert.equal(fs.readFileSync(abs, "utf8"), "final");
    }
    assert.equal((await tools.get("write_file")!.handler({ name: "write_file", args: { path: "owned/new", content: "new" } })).ok, true);
    assert.equal(fs.statSync(path.join(workspace.project, "owned/new")).mode & 0o777, 0o600 & ~process.umask());
  } finally {
    workspace.cleanup();
  }
});

test("D3 AC6: strict umask in isolated child cannot strip old executable mode", { skip: !posix }, () => {
  const workspace = fixture();
  try {
    const target = path.join(workspace.project, "owned", "executable");
    fs.writeFileSync(target, "old");
    fs.chmodSync(target, 0o755);
    const moduleUrl = pathToFileURL(path.resolve("src/provider/runtime/tools.ts")).href;
    const script = `import {buildGovernedTools} from ${JSON.stringify(moduleUrl)};process.umask(0o077);const gate=()=>({allowed:true,matchedEntry:{root:'project',path:'owned',kind:'directory',purpose:'fixture'}});const tool=buildGovernedTools(gate,{writeRoot:${JSON.stringify(workspace.project)}}).find(t=>t.name==='write_file');const result=await tool.handler({name:'write_file',args:{path:'owned/executable',content:'new'}});if(!result.ok)throw new Error(JSON.stringify(result));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.statSync(target).mode & 0o777, 0o755);
    assert.equal(fs.readFileSync(target, "utf8"), "new");
  } finally {
    workspace.cleanup();
  }
});

test("D3 AC7: chmod/fsync failure and abort do not commit or leave a temp", { skip: !posix }, async t => {
  const workspace = fixture();
  try {
    const target = path.join(workspace.project, "owned", "keep");
    fs.writeFileSync(target, "old");
    fs.chmodSync(target, 0o755);
    const probe = await open(path.join(workspace.root, "probe"), "wx");
    const prototype = Object.getPrototypeOf(probe);
    await probe.close();
    fs.unlinkSync(path.join(workspace.root, "probe"));
    const tools = writeTools(workspace, ["owned"]);
    for (const method of ["chmod", "sync"] as const) {
      const injected = t.mock.method(prototype, method, async () => { throw Object.assign(new Error(`D3 ${method} failure`), { code: "EIO" }); });
      try {
        const result = await tools.get("write_file")!.handler({ name: "write_file", args: { path: "owned/keep", content: "new" } });
        assert.equal(result.ok, false, method);
      } finally {
        injected.mock.restore();
      }
      assert.equal(fs.readFileSync(target, "utf8"), "old");
      assert.equal(fs.statSync(target).mode & 0o777, 0o755);
      assert.deepEqual(fs.readdirSync(path.dirname(target)), ["keep"]);
    }
    const controller = new AbortController();
    controller.abort();
    assert.equal((await tools.get("write_file")!.handler({ name: "write_file", args: { path: "owned/keep", content: "new" }, signal: controller.signal })).ok, false);
    assert.equal(fs.readFileSync(target, "utf8"), "old");
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ["keep"]);
  } finally {
    workspace.cleanup();
  }
});
