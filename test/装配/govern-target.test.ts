// test/装配/govern-target.test.ts
// 装配：`ans govern [<目录>]` 的**目标目录 → projectRoot** 接线（设计 §12.3，任务 T34）。
//
// 背景：原 `ans govern` **不取目标目录**，只在装配注入的 project（`resolveProjectRoot()` = ans-cli 自身）
// 上工作——CLI 连「对某个空文件夹做 bootstrap」都办不到。T32（编排）已解析位置参数并给出 §6 安全的出口
// `resolveGovernTargetDir`；本任务（装配）在入口 govern 分支据它把注入的 `project.projectRoot` 设为
// `path.resolve(dir)`（缺省仍 `resolveProjectRoot()`）。
//
// 覆盖：
//  1) 给出目标目录 → 注入的 `project.projectRoot` 即该目录（绝对化；相对路径按 cwd 绝对化）；
//  2) 缺省 → 仍为 ans-cli 自身（`resolveProjectRoot()`，行为不变）；
//  3) 目标目录含 `.ans/project.json` → 角色照常载入，且 projectRoot 仍取目标目录；
//  4) 显式目标目录**优先于** `.ans` 自带的 projectRoot；
//  5) 目录不存在 / 非目录 → 入口明确报错并非 0，**不静默回退到 ans-cli**；
//  6) 目录存在 → 目录校验放行（不报目录错），进入治理链路。
//
// 说明：main 的 govern 分支缺 Pi 凭据时会先失败（构造真实适配器时 `resolvePiProviderConfig` 抛错），
// 故「注入的 projectRoot」经导出的 `loadInjection` 直接断言；入口的目录校验经 `main` 断言其退出码与 stderr。
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { test, after } from "node:test";

import { loadInjection, resolveProjectRoot, main } from "../../src/index.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-govern-target-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
});

function newDir(name: string): string {
  return mkdtempSync(join(ROOT, name));
}

function capture(): { err: string[]; restore: () => void } {
  const err: string[] = [];
  const origErr = process.stderr.write.bind(process.stderr);
  // 只劫持 stderr：**不动** `process.stdout.write`——node:test 的报告器自己也往 stdout 写，
  // 一旦替换它，报告器会丢失若干行（表现为「测试数偏少」）。本文件只断言 stderr，无需动 stdout。
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    err,
    restore: () => {
      process.stderr.write = origErr;
    },
  };
}

// ---- 1) 目标目录 → 注入的 projectRoot 即该目录 ----

test("loadInjection(目标目录) → 注入的 projectRoot 即该目录（绝对化）", async () => {
  const dir = newDir("target-");
  const { project } = await loadInjection(dir);
  assert.equal(project.projectRoot, resolve(dir));
  assert.ok(isAbsolute(project.projectRoot), "projectRoot 应为绝对路径");
});

test("loadInjection(相对路径) → 绝对化（相对 cwd）", async () => {
  const dir = newDir("rel-");
  const rel = relative(process.cwd(), dir);
  const { project } = await loadInjection(rel);
  assert.equal(project.projectRoot, resolve(rel));
  assert.equal(project.projectRoot, resolve(dir), "相对路径应绝对化到同一个目录");
  assert.ok(isAbsolute(project.projectRoot));
});

// ---- 2) 缺省 → 仍为 ans-cli 自身（行为不变） ----

test("loadInjection() 缺省 → projectRoot 仍为 ans-cli 自身（行为不变）", async () => {
  const { project } = await loadInjection();
  assert.equal(project.projectRoot, resolveProjectRoot());
});

// ---- 3) 目标目录含 .ans → 角色载入，projectRoot 仍取目标目录 ----

test("目标目录含 .ans/project.json → 角色载入，projectRoot 仍取目标目录", async () => {
  const dir = newDir("with-ans-");
  mkdirSync(join(dir, ".ans"), { recursive: true });
  writeFileSync(
    join(dir, ".ans", "project.json"),
    JSON.stringify({
      roles: { R: { card: "角色卡/R/role-card.md", boundary: "角色卡/R/boundary.yaml" } },
      governanceBoundary: {
        path: "角色卡/R/boundary.yaml",
        acceptance: { accepted: false, source: "test" },
      },
    }),
    "utf8",
  );
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "ans", "应载入目标目录的 .ans（而非回退内置）");
  assert.equal(project.projectRoot, resolve(dir), "projectRoot 仍取目标目录");
  assert.equal(project.roles.R.boundary, "角色卡/R/boundary.yaml", "目标目录的角色应被载入");
});

// ---- 4) 显式目标目录优先于 .ans 自带的 projectRoot ----

test("显式目标目录优先于 .ans 自带的 projectRoot", async () => {
  const dir = newDir("override-");
  mkdirSync(join(dir, ".ans"), { recursive: true });
  writeFileSync(
    join(dir, ".ans", "project.json"),
    JSON.stringify({ projectRoot: "D:/some/other/place", roles: {} }),
    "utf8",
  );
  const { project } = await loadInjection(dir);
  assert.equal(project.projectRoot, resolve(dir), "用户显式给出的目标目录应优先");
});

// ---- 5) 目录不存在 / 非目录 → 明确报错并非 0，不回退 ans-cli ----

test("ans govern <不存在的目录> → 明确报错、非 0，不静默回退到 ans-cli", async () => {
  const missing = join(ROOT, "does-not-exist-xyz");
  const cap = capture();
  const code = await main(["govern", missing], {});
  cap.restore();
  assert.equal(code, 2);
  const err = cap.err.join("");
  assert.match(err, /目标目录不存在/);
  assert.match(err, /回退到 ans-cli/, "应明确声明不会回退到 ans-cli");
});

test("ans govern <非目录（文件）> → 明确报错、非 0", async () => {
  const file = join(ROOT, "a-file.txt");
  writeFileSync(file, "x", "utf8");
  const cap = capture();
  const code = await main(["govern", file], {});
  cap.restore();
  assert.equal(code, 2);
  assert.match(cap.err.join(""), /不是目录/);
});

// ---- 6) 目录存在 → 目录校验放行，进入治理链路 ----

test("ans govern <存在的目录> → 目录校验放行（不报目录错），缺 Pi 凭据时如实非 0", async () => {
  const dir = newDir("ok-");
  const cap = capture();
  const code = await main(["govern", dir], {}); // env={} 无 ANS_PI_* 凭据
  cap.restore();
  const err = cap.err.join("");
  assert.ok(
    !/目标目录不存在|不是目录/.test(err),
    `存在的目录应被接受，实际 stderr=${JSON.stringify(err)}`,
  );
  // 无凭据 → 治理会话无法建立 → 非 0（绝不静默假装成功）。
  assert.notEqual(code, 0);
});
