import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, open, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { existsSync, renameSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { WriteGate } from "../../src/model/runtime.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import { allow, deny } from "./fixtures.ts";

const tools = (root: string, gate: WriteGate = allow) =>
  new Map(buildGovernedTools(gate, { writeRoot: root }).map((tool) => [tool.name, tool]));

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-core-d3-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("D3 actual write gate rejects unauthorized real targets and permits fully authorized aliases", async () => {
  await withRoot(async (root) => {
    await mkdir(path.join(root, "allowed"));
    await mkdir(path.join(root, "private"));
    await symlink(path.join(root, "private"), path.join(root, "allowed", "link"), "junction");
    await writeFile(path.join(root, "private", "file.txt"), "original");
    const boundary: BoundarySection1 = {
      boundarySource: "d3-fixture", acceptance: { accepted: true, source: "d3-fixture" },
      entries: [{ root: "project", path: "allowed", kind: "directory", purpose: "fixture" }],
    };
    const scope = { writeSet: ["allowed/link/file.txt", "allowed/link/new/file.txt"], conditions: [] };
    const gate: WriteGate = (target) => resolveWrite(target, boundary, scope, { projectRoot: root, skillRoot: root });
    const byName = tools(root, gate);
    assert.equal((await byName.get("write_file")!.handler({ name: "write_file", args: { path: "allowed/link/new/file.txt", content: "changed" } })).ok, false);
    assert.equal(existsSync(path.join(root, "private", "new")), false);
    assert.equal((await byName.get("edit_file")!.handler({ name: "edit_file", args: { path: "allowed/link/file.txt", old_string: "original", new_string: "changed" } })).ok, false);
    assert.equal(await readFile(path.join(root, "private", "file.txt"), "utf8"), "original");
    boundary.entries.push({ root: "project", path: "private", kind: "directory", purpose: "fixture" });
    assert.equal((await byName.get("write_file")!.handler({ name: "write_file", args: { path: "allowed/link/file.txt", content: "changed" } })).ok, false, "real target also needs task writeSet");
    scope.writeSet.push("private/file.txt");
    const result = await byName.get("write_file")!.handler({ name: "write_file", args: { path: "allowed/link/file.txt", content: "changed" } });
    assert.equal(result.ok, true, result.message);
    assert.equal(await readFile(path.join(root, "private", "file.txt"), "utf8"), "changed");
  });
});

for (const behavior of ["deny", "throw", "abort"] as const) {
  test(`D3 final gate ${behavior} prevents commit after parent creation and during edit`, async () => {
    await withRoot(async (root) => {
      await writeFile(path.join(root, "existing.txt"), "original");
      for (const name of ["write_file", "edit_file"] as const) {
        let calls = 0;
        const controller = new AbortController();
        const gate: WriteGate = (target) => {
          calls++;
          if (calls === 2) {
            if (behavior === "throw") throw new Error("final gate failed");
            if (behavior === "deny") return deny(target);
            controller.abort();
          }
          return allow(target);
        };
        let args: Record<string, unknown> = { path: "existing.txt", old_string: "original", new_string: "changed" };
        if (name === "write_file") args = { path: "created/file.txt", content: "changed" };
        const result = await tools(root, gate).get(name)!.handler({ name, args, signal: controller.signal });
        assert.equal(result.ok, false, result.message);
        assert.equal(calls, 2);
        assert.equal(await readFile(path.join(root, "existing.txt"), "utf8"), "original");
        assert.equal(existsSync(path.join(root, "created", "file.txt")), false);
        assert.deepEqual(await readdir(path.join(root, "created")), []);
      }
    });
  });
}

test("D3 parent recheck rejects a changed in-root directory even if gate allows", async () => {
  await withRoot(async (root) => {
    await mkdir(path.join(root, "allowed"));
    await mkdir(path.join(root, "other"));
    let calls = 0;
    const gate: WriteGate = (target) => {
      if (++calls === 2) {
        renameSync(path.join(root, "allowed"), path.join(root, "original-parent"));
        symlinkSync(path.join(root, "other"), path.join(root, "allowed"), "junction");
      }
      return allow(target);
    };
    const result = await tools(root, gate).get("write_file")!.handler({ name: "write_file", args: { path: "allowed/file.txt", content: "changed" } });
    assert.equal(result.ok, false);
    assert.match(result.message, /真实父目录已变化/);
    assert.deepEqual(await readdir(path.join(root, "other")), []);
    assert.deepEqual(await readdir(path.join(root, "original-parent")), []);
  });
});

test("D3 linked workspace root remains usable; linked target itself is not replaced", async () => {
  await withRoot(async (root) => {
    const actual = path.join(root, "actual");
    const linked = path.join(root, "workspace");
    await mkdir(actual);
    await symlink(actual, linked, "junction");
    const byName = tools(linked);
    assert.equal((await byName.get("write_file")!.handler({ name: "write_file", args: { path: "nested/file.txt", content: "original" } })).ok, true);
    await symlink(path.join(actual, "nested", "file.txt"), path.join(actual, "link.txt"), "file");
    const result = await byName.get("write_file")!.handler({ name: "write_file", args: { path: "link.txt", content: "changed" } });
    assert.equal(result.ok, false);
    assert.match(result.message, /符号链接/);
    assert.equal(await readFile(path.join(actual, "nested", "file.txt"), "utf8"), "original");
  });
});

test("D3 lstat ENOTDIR is a status error, never a new-file fallback", async () => {
  await withRoot(async (root) => {
    await writeFile(path.join(root, "file.txt"), "original");
    const result = await tools(root).get("write_file")!.handler({ name: "write_file", args: { path: "file.txt/child.txt", content: "changed" } });
    assert.equal(result.ok, false);
    assert.match(result.message, /无法读取目标状态.*ENOTDIR/);
    assert.deepEqual(await readdir(root), ["file.txt"]);
    assert.equal(await readFile(path.join(root, "file.txt"), "utf8"), "original");
  });
});

test("D3 write and edit preserve existing ordinary modes and strip special bits", { skip: process.platform === "win32" }, async () => {
  await withRoot(async (root) => {
    const target = path.join(root, "script.sh");
    const byName = tools(root);
    for (const mode of [0o755, 0o644, 0o600, 0o4755]) {
      await writeFile(target, "original");
      await chmod(target, mode);
      const write = await byName.get("write_file")!.handler({ name: "write_file", args: { path: "script.sh", content: "written" } });
      assert.equal(write.ok, true, write.message);
      assert.equal((await stat(target)).mode & 0o7777, mode & 0o777);
      const edit = await byName.get("edit_file")!.handler({ name: "edit_file", args: { path: "script.sh", old_string: "written", new_string: "edited" } });
      assert.equal(edit.ok, true, edit.message);
      assert.equal((await stat(target)).mode & 0o7777, mode & 0o777);
      assert.equal(await readFile(target, "utf8"), "edited");
    }
    assert.deepEqual(await readdir(root), ["script.sh"]);
  });
});

test("D3 handler under strict umask retains existing mode and keeps new files private", { skip: process.platform === "win32" }, async () => {
  await withRoot(async (root) => {
    const target = path.join(root, "script.sh");
    await writeFile(target, "original");
    await chmod(target, 0o755);
    const moduleUrl = new URL("../../src/provider/runtime/tools.ts", import.meta.url).href;
    const script = `
      const { buildGovernedTools } = await import(process.argv[1]);
      process.umask(0o077);
      const gate = target => ({allowed: true, matchedEntry: {root:'project',path:target,kind:'file',purpose:'fixture'}});
      const tools = new Map(buildGovernedTools(gate, {writeRoot:process.argv[2]}).map(t=>[t.name,t]));
      for (const [name,args] of [['write_file',{path:'script.sh',content:'written'}],['edit_file',{path:'script.sh',old_string:'written',new_string:'edited'}],['write_file',{path:'new.txt',content:'private'}]]) {
        const result=await tools.get(name).handler({name,args});
        if(!result.ok) throw new Error(result.message);
      }
    `;
    execFileSync(process.execPath, ["--input-type=module", "-e", script, moduleUrl, root], { timeout: 10000 });
    assert.equal((await stat(target)).mode & 0o777, 0o755);
    assert.equal(await readFile(target, "utf8"), "edited");
    assert.equal((await stat(path.join(root, "new.txt"))).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(root)).sort(), ["new.txt", "script.sh"]);
  });
});

for (const operation of ["chmod", "sync"] as const) {
  test(`D3 ${operation} failure reaches the handler without committing file or mode`, { skip: process.platform === "win32" }, async (context) => {
    await withRoot(async (root) => {
      const target = path.join(root, "script.sh");
      await writeFile(target, "original");
      await chmod(target, 0o755);
      const probe = await open(path.join(root, "probe"), "wx");
      const prototype = Object.getPrototypeOf(probe);
      await probe.close();
      await rm(path.join(root, "probe"));
      const fault = context.mock.method(prototype, operation, async () => { throw new Error(`injected ${operation} failure`); });
      try {
        const result = await tools(root).get("edit_file")!.handler({ name: "edit_file", args: { path: "script.sh", old_string: "original", new_string: "changed" } });
        assert.equal(result.ok, false);
        assert.match(result.message, new RegExp(`injected ${operation} failure`));
      } finally { fault.mock.restore(); }
      assert.equal(await readFile(target, "utf8"), "original");
      assert.equal((await stat(target)).mode & 0o777, 0o755);
      assert.deepEqual(await readdir(root), ["script.sh"]);
    });
  });
}
