// test/装配/governance-model-injection.test.ts
// 装配：`ans govern <目录>` 的**治理模型注入**（PM 评审 2026-10-17 §5.4「CLI 同步」）。
//
// 缺陷（测试角色独立验收，2026-10-17 阻塞项）：`loadInjection` 未把治理模型写进注入的
// `ProjectConfig`。对新空目录，编排经 `listProject` 已选到 rapporteur，`resolveRole` 却按缺省
// `single` 解析 → 报「三权角色在 single 治理模型下不可用」/「治理边界解析失败」。
//
// 修复口径（评审 §5.4，与 `listProject` 同判别顺序）：
//  - 对外来目标目录调用共享 `readGovernanceModel(projectRoot)`（PM 属主，只读导入，不复制实现）；
//  - explicit → 显式值；unreadable → `single`（保留既有 invalid / fail-closed 语义）；
//  - absent + 无 `.ans/project.json` 且无项目角色目录 → `trio`（新空项目）；
//  - absent + 其余（有 `.ans` 记录或有项目角色目录）→ `single`（旧项目，行为逐字不变）；
//  - ans-cli 自身（缺省 / 显式自身根）仍用载入配置，不因目标推断改判。
//
// 全程离线：只读/写系统临时目录，不启动模型、不读 `.env`、不发起网络请求。
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { loadInjection, resolveProjectRoot } from "../../src/index.ts";
import { readGovernanceModel } from "../../src/common/shared/config-loader.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-govern-model-"));
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

/** 造一个「旧项目」：有真实角色目录（role-card + boundary），无 `.ans`。 */
function makeLegacyProject(dir: string): void {
  const roleDir = join(dir, "角色卡", "R");
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(join(roleDir, "role-card.md"), "# 角色：R\n", "utf8");
  writeFileSync(
    join(roleDir, "boundary.yaml"),
    "role: R\nentries:\n  - kind: directory\n    path: src/\n    purpose: 代码\n",
    "utf8",
  );
}

function writeAns(dir: string, content: string): void {
  mkdirSync(join(dir, ".ans"), { recursive: true });
  writeFileSync(join(dir, ".ans", "project.json"), content, "utf8");
}

// ---- 1) 新空项目 → trio ----

test("loadInjection(空目录) → governanceModel = trio（新空项目默认三权）", async () => {
  const dir = newDir("empty-");
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "builtin-fallback", "无 .ans → 内置回退");
  assert.equal(project.governanceModel, "trio");
  assert.equal(project.projectRoot, resolve(dir));
});

test("loadInjection(仅空 角色卡/ 目录，无子目录) → trio（与 listProject 的 totalRoleDirs 同口径）", async () => {
  const dir = newDir("empty-roledir-");
  mkdirSync(join(dir, "角色卡"), { recursive: true });
  const { project } = await loadInjection(dir);
  assert.equal(project.governanceModel, "trio", "空角色目录不算有项目角色");
});

// ---- 2) 旧项目（有角色、无 .ans）→ single ----

test("loadInjection(旧项目：有项目角色、无 .ans) → governanceModel = single（旧行为不变）", async () => {
  const dir = newDir("legacy-");
  makeLegacyProject(dir);
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "builtin-fallback");
  assert.equal(project.governanceModel, "single");
  assert.equal(project.roles["R"], undefined, "外来目标目录不注入 ans-cli 的角色表（既有行为不变）");
});

test("loadInjection(英文 role-cards/ 目录) → single（中英文角色目录都认）", async () => {
  const dir = newDir("legacy-en-");
  mkdirSync(join(dir, "role-cards", "R"), { recursive: true });
  const { project } = await loadInjection(dir);
  assert.equal(project.governanceModel, "single");
});

// ---- 3) 显式 `.ans` → 显式值 ----

test("loadInjection(.ans 显式 trio) → governanceModel = trio", async () => {
  const dir = newDir("explicit-trio-");
  writeAns(dir, JSON.stringify({ roles: {}, governanceModel: "trio" }));
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "ans");
  assert.equal(project.governanceModel, "trio");
});

test("loadInjection(.ans 显式 single) → governanceModel = single", async () => {
  const dir = newDir("explicit-single-");
  writeAns(dir, JSON.stringify({ roles: {}, governanceModel: "single" }));
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "ans");
  assert.equal(project.governanceModel, "single");
});

// ---- 4) 无显式值 / 不可读 → 保守 single ----

test("loadInjection(.ans 存在但无 governanceModel，且无项目角色) → single（与 listProject 一致）", async () => {
  const dir = newDir("ans-no-model-");
  writeAns(dir, JSON.stringify({ roles: {} }));
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "ans");
  assert.equal(project.governanceModel, "single", "已有 .ans 记录的项目不按新空项目推断 trio");
});

test("loadInjection(.ans 不可解析) → single（保留既有 ans-invalid / fail-closed 语义）", async () => {
  const dir = newDir("ans-invalid-");
  writeAns(dir, "{ not valid json");
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "ans-invalid", "既有 invalid 来源判定不变");
  assert.equal(project.governanceModel, "single", "不可读 → single，不猜测 trio");
});

// ---- 5) ans-cli 自身 → 仍用载入配置，不误判 ----

test("loadInjection(ans-cli 自身，缺省/显式) → 不按目标推断改写模型", async () => {
  const self = resolveProjectRoot();
  // 「仍用载入配置」：只有仓库 `.ans` 显式声明模型时才带出，否则保持缺省（不按角色目录推断）。
  const disk = await readGovernanceModel(self);
  const expected = disk.state === "explicit" ? disk.model : undefined;
  for (const label of ["缺省", "显式自身根"] as const) {
    const { project } = label === "缺省" ? await loadInjection() : await loadInjection(self);
    assert.equal(project.projectRoot, resolve(self), label);
    assert.equal(project.governanceModel, expected, `${label}：模型应沿用 .ans 载入结果，不做目标目录推断`);
  }
});
