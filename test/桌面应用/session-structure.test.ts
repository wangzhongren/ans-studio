// test/桌面应用/session-structure.test.ts
// B0（2026-11-13，session.ts 重构结构骨架；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §5 B0 / §6.2 / 附录 B）——**只增测试**：本文件是后续 B1–B7 每批都必须复跑的结构保护层。
//
// 四组保护（与方案 §6.2 对应）：
//  1) 导出面快照：51 个导出符号（附录 B：值 6 + 类型 45）。
//     · 运行时层：`await import(session.ts)` 的键集合与 6 个值导出**精确比对**（类型导出在运行时不存在，
//       `RuntimeKind` 等不得出现在键里）；键集合多一个少一个都失败。
//     · 类型层：45 个类型导出用 `import type { ... }` **全量清单**导入，并由编译期元组钉住数量——
//       typecheck（`tsc --noEmit`，test 在 include 内）即失败。两层缺一不可：运行时层钉“值不多不少”，
//       类型层钉“类型全在且仍是类型”。
//  2) 模块边界/导入图：扫描 `app/desktop/session.ts` 与 `app/desktop/session/**/*.ts`（目录不存在 → 空集），
//     解析静态 import / export-from 关系，断言：无环；feature 模块只导入 L0/白名单下层；
//     只有 `index.ts` / barrel 可导入 feature 模块。规则与白名单在下方注释逐条文档化。
//     **B0 现状**：`session/` 目录尚不存在，图只有 barrel 一个节点 ⇒ 无环/分层规则当前为 vacuous；
//     但“扫描器确有真实输入”（barrel 的静态 import 被解析到）与“规则引擎本身有效”（合成夹具证明
//     能抓环、抓 L0→feature、抓同层越界、抓未分类模块）两层自测保证它不是永远空转。
//  3) 文件体量预算：`session.ts` 上限按**当前实际行数**收紧（B2 起 12,388、B3 起 11,756、B4 起 10,252，
//     B5 起 9,118，`wc -l` 口径；不得增长；只降不升，后续批次继续按当前实际收紧）。未来 `app/desktop/session/**/*.ts`
//     单模块 ≤1,500 行。这是预算而不是目标：B7 才把 `session.ts` 压到 ≤50 行、门面 ≤800 行；B1–B6 只要求
//     “不增长”。
//  4) openRoleSession 工具面快照脚手架（B7 前逐批对比用）：确定性 fixture（**真实 SessionManager** →
//     真实编排 `openRoleSession` → 运行时核心 `buildGovernedTools`；唯一替身是**可脚本化 demo provider
//     工厂**，它捕获 `options.tools` 的真实名字与顺序并返回 `createDemoRuntimeAdapter` 假句柄）——
//     对 7 个角色（6 内置治理 + 1 项目角色）记录工具名集合与顺序。当前断言：
//       · 捕获稳定：每角色两次**独立 fixture/独立 manager** 捕获逐字相同（无随机顺序）；
//       · 无重复：同一会话内工具名集合无重名；
//       · 与冻结清单一致：逐角色 `deepEqual` 到 c234e79 实测基线。
//     脚手架函数 `captureToolSurfaceForRole` 导出，B1–B7 可直接复用（或按批次扩 fixture 后复用）。
//
// 边界与纪律：
//  · 本文件**只读**生产代码/既有测试，不修改任何文件；不发真实模型请求、不启动 Electron、不写项目盘
//    （临时目录在 os.tmpdir()，用例内清理）；不占用 9222/9223/9224。
//  · 不写“当前必失败”的占位：B0 必须全绿；vacuous 规则以“目录不存在 → 空集”显式记录，未来文件出现
//    即自动生效（未分类模块会显式失败，迫使同步更新层次表）。
//  · 源码钉子（14 文件）与 `test/桌面应用/session-source.ts` 属测试角色/B0 另一工作项，本文件不触碰。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { openRoleSession, createRuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RuntimeProviderFactory } from "../../src/model/runtime.ts";

// ─────────────────────────────── 附录 B：45 个类型导出（编译期全量清单） ───────────────────────────────
//
// 会话/事件/运行（13）
import type {
  RuntimeKind,
  SessionEventEnvelope,
  DesktopOrchestrationEvent,
  SessionOpenRequest,
  OpenResult,
  SendResult,
  StopResult,
  WithdrawResult,
  SessionTarget,
  SessionMessageMetadata,
  ActiveRunView,
  RunChangeMode,
  EffectiveConfigInfo,
  // 持久化（9）
  PersistenceScope,
  PersistenceReply,
  PersistenceCapabilities,
  PersistenceValues,
  PersistenceUpdated,
  DeliveryQueuePersistenceOutcome,
  DeliveryQueuePersistenceFacts,
  DeliveryQueueRestoreReport,
  PersistedDeliveryItemV1,
  // 后台任务（6）
  BackgroundTaskView,
  BackgroundTasksListReply,
  BackgroundTaskReadInput,
  BackgroundTaskReadReply,
  BackgroundTaskStopInput,
  BackgroundTaskStopReply,
  // 任务/终止（10）
  TaskListView,
  TaskRestoreReport,
  TerminateRoleRunInput,
  TerminateRoleRunResult,
  RedispatchTaskInput,
  RedispatchTaskResult,
  CloseTaskInput,
  CloseTaskResult,
  RebuildSessionResult,
  RedeliverResult,
  // 治理/安装/库存/登记（7）
  GovernanceClientProjectionV1,
  SessionManagerDeps,
  NativeProjectRegistration,
  InstallationCapabilityTool,
  InstallationEffectRefusalObservation,
  DesktopSessionInventoryFact,
  DesktopProjectExecutionInventory,
} from "../../app/desktop/session.ts";

/** 45 个类型导出的逐字清单（附录 B）。每个名字都必须能被 `import type` 解析（编译期钉住）；
 *  `PersistenceReply` 是唯一泛型导出，此处以 `<unknown>` 实例化只为“使用”该导入，不改变其导出形状。 */
type FrozenTypeExportSurface = [
  RuntimeKind,
  SessionEventEnvelope,
  DesktopOrchestrationEvent,
  SessionOpenRequest,
  OpenResult,
  SendResult,
  StopResult,
  WithdrawResult,
  SessionTarget,
  SessionMessageMetadata,
  ActiveRunView,
  RunChangeMode,
  EffectiveConfigInfo,
  PersistenceScope,
  PersistenceReply<unknown>,
  PersistenceCapabilities,
  PersistenceValues,
  PersistenceUpdated,
  DeliveryQueuePersistenceOutcome,
  DeliveryQueuePersistenceFacts,
  DeliveryQueueRestoreReport,
  PersistedDeliveryItemV1,
  BackgroundTaskView,
  BackgroundTasksListReply,
  BackgroundTaskReadInput,
  BackgroundTaskReadReply,
  BackgroundTaskStopInput,
  BackgroundTaskStopReply,
  TaskListView,
  TaskRestoreReport,
  TerminateRoleRunInput,
  TerminateRoleRunResult,
  RedispatchTaskInput,
  RedispatchTaskResult,
  CloseTaskInput,
  CloseTaskResult,
  RebuildSessionResult,
  RedeliverResult,
  GovernanceClientProjectionV1,
  SessionManagerDeps,
  NativeProjectRegistration,
  InstallationCapabilityTool,
  InstallationEffectRefusalObservation,
  DesktopSessionInventoryFact,
  DesktopProjectExecutionInventory,
];

/** 元组长度 = 45：删/增任何一个类型导入都会让 typecheck 失败（编译期计数钉）。 */
const TYPE_EXPORT_COUNT: FrozenTypeExportSurface["length"] = 45;

/** 6 个值导出（运行时存在；顺序按字典序排列以便 `Object.keys().sort()` 精确比对）。 */
const RUNTIME_VALUE_EXPORTS = [
  "CAPABILITY_INSTALL_SYSTEM_PREFIX",
  "MAX_LIVE_SESSIONS",
  "SessionManager",
  "desktopProjectExecutionInventory",
  "shouldSuppressStarTaskReport",
  "subscribeDesktopExecutionInventory",
] as const;

test("导出面·运行时层：import(session.ts) 的键集合恰为 6 个值导出（类型导出运行时不存在）", async () => {
  const mod = (await import("../../app/desktop/session.ts")) as Record<string, unknown>;
  const keys = Object.keys(mod).sort();
  assert.equal(keys.length, 6, `运行时导出必须恰为 6 个值（附录 B），实际 ${keys.length} 个：${keys.join(", ")}`);
  assert.deepEqual(keys, [...RUNTIME_VALUE_EXPORTS].sort(), "运行时键集合必须与冻结值导出清单逐字一致");
  // 显式记录“类型不是运行时键”：防有人把类型误写成值（键集合会膨胀而失败）或被 Node 类型剥离漏掉。
  for (const typeName of ["RuntimeKind", "RunChangeMode", "SessionEventEnvelope", "SessionManagerDeps"]) {
    assert.equal(typeName in mod, false, `${typeName} 是类型导出，不得出现在运行时键集合`);
  }
  // 值形状抽查（防同名占位符过关）。
  assert.equal(typeof mod.SessionManager, "function", "SessionManager 必须是类（函数）");
  assert.equal(mod.MAX_LIVE_SESSIONS, 3, "MAX_LIVE_SESSIONS 值漂移");
  assert.equal(mod.CAPABILITY_INSTALL_SYSTEM_PREFIX, "[系统·安装]", "CAPABILITY_INSTALL_SYSTEM_PREFIX 值漂移");
  assert.equal(typeof mod.desktopProjectExecutionInventory, "function");
  assert.equal(typeof mod.subscribeDesktopExecutionInventory, "function");
  assert.equal(typeof mod.shouldSuppressStarTaskReport, "function");
});

test("导出面·类型层：45 个类型导出经 import type 全量导入（编译期由 typecheck 钉住）", () => {
  // 本用例的可执行部分只是“使用”类型元组；真正的保护在 `tsc --noEmit`：
  // 任一类型改名/删除/变成非类型（如 const）都会使上面的 `import type` 或元组报错。
  const surface: FrozenTypeExportSurface | undefined = undefined;
  assert.equal(surface, undefined);
  assert.equal(TYPE_EXPORT_COUNT, 45, "类型导出清单计数必须为 45（附录 B）");
});

// ─────────────────────────────── 模块边界 / 导入图扫描 ───────────────────────────────
//
// 目标层次（方案 §3.3；B1 起逐步出现）：
//   L0  contracts.ts + shared/**（共享底座；只准互相导入与外部 src 依赖）
//   L1  persistence.ts / evidence.ts / delivery/store.ts / git-ports.ts
//   L2  tasks.ts / run-change.ts / session-env.ts / diagnostics.ts
//   L3  delivery/**（除 store）/ handback.ts / card-gateway.ts
//   L4  dispatch.ts / cards/**
//   L5  fixed-workflow/**
//   L6  lifecycle/**
//   L7  index.ts（SessionManager 门面）
//   barrel  session.ts（公开入口；B7 后为 ~30 行显式再导出）
//
// 规则（本测试逐条断言；均由“静态 import + export ... from”构图，value/type 导入同等计入）：
//   R-a 无环。
//   R-b 只有 index.ts（L7）与 barrel 可以导入 feature 模块（L1+）。L0 共享底座只准导入 L0。
//   R-c feature 模块只允许导入：L0（contracts/shared），或下方白名单中的**显式下层**模块；
//       同一模块目录内部的文件互相导入允许（模块内拆分）；同层不同模块、上行导入一律禁止。
//   R-d 未登记层次表的模块（未知顶层文件/目录）直接失败——新增模块必须同步更新本表与白名单，
//       不允许“悄悄绕过规则”。
//
// 说明：解析器只认行首语句（本仓库 import/export-from 均以 `;` 结束）的静态形式；动态 `import("...")`
// 与类型查询不构成运行时依赖，不计入图。模块内部相对导入必须带 `.ts`（仓库约定，R10）；解析同时兼容
// 省略扩展名与目录 index.ts 两种写法。

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SESSION_BARREL_REL = "app/desktop/session.ts";
const SESSION_DIR_REL = "app/desktop/session";

function toRel(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}

/** 递归列出 `app/desktop/session/` 目录下全部 `.ts`（目录不存在 → 空集；排除 .d.ts）。排序保证扫描确定性。 */
function listSessionDirModuleFiles(): string[] {
  const root = path.join(REPO_ROOT, SESSION_DIR_REL);
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(abs);
    }
  };
  walk(root);
  return files;
}

/**
 * 提取一段 TS 源码里的静态模块说明符。
 * 做法：只从**行首** `import`/`export` 语句起，攒到首个 `;`（本仓库语句均以分号结束），在语句窗口内
 * 要求“模块语法形状”（允许 type 修饰、`*`/`{}`/标识符/`as`/逗号/空白，后接 `from "..."`；或
 * side-effect `import "..."`）——避免把注释、字符串或接口字段里的 `from` 误认成导入。
 */
function extractStaticModuleSpecifiers(text: string): string[] {
  const specs: string[] = [];
  const lines = text.split(/\r?\n/);
  const statementStart = /^[ \t]*(?:import|export)\b/;
  const moduleSyntax = /^[ \t]*(?:import|export)\s+(?:type\s+)?(?:[A-Za-z0-9_$*{},\s]+?\sfrom\s+)?["']([^"']+)["']/;
  let i = 0;
  while (i < lines.length) {
    if (!statementStart.test(lines[i]!)) {
      i += 1;
      continue;
    }
    let chunk = "";
    let j = i;
    for (; j < lines.length; j += 1) {
      const piece = lines[j]!;
      const semi = piece.indexOf(";");
      chunk += j === i ? piece : `\n${piece}`;
      if (semi >= 0) {
        // 语句窗口止于首个分号（本仓库 import/export-from 均以 `;` 结束）；行尾注释不参与解析。
        chunk = chunk.slice(0, chunk.length - piece.length + semi + 1);
        break;
      }
    }
    const match = moduleSyntax.exec(chunk);
    if (match !== null) specs.push(match[1]!);
    i = j + 1;
  }
  return [...new Set(specs)];
}

/** 把相对说明符解析为**扫描集合内**的模块 rel 路径；外部依赖（src/**、node:*、包名）返回 undefined。 */
function resolveSpecifierToModule(spec: string, fromRel: string, known: ReadonlySet<string>): string | undefined {
  if (!spec.startsWith(".")) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  const candidates = [base, `${base}.ts`, `${base}/index.ts`];
  return candidates.find((candidate) => known.has(candidate));
}

interface ScannedModule {
  /** 仓库相对路径（posix 分隔符）。 */
  rel: string;
  /** 源码文本（自测“扫描器有真实输入”用）。 */
  text: string;
  /** 解析后落在扫描集合内的被导入模块 rel 路径。 */
  imports: string[];
}

function scanModuleFiles(files: Array<{ rel: string; text: string }>): ScannedModule[] {
  const known = new Set(files.map((file) => file.rel));
  return files.map((file) => ({
    rel: file.rel,
    text: file.text,
    imports: extractStaticModuleSpecifiers(file.text)
      .map((spec) => resolveSpecifierToModule(spec, file.rel, known))
      .filter((rel): rel is string => rel !== undefined),
  }));
}

function scanSessionModules(): ScannedModule[] {
  const files = [
    { rel: SESSION_BARREL_REL, text: fs.readFileSync(path.join(REPO_ROOT, SESSION_BARREL_REL), "utf8") },
    ...listSessionDirModuleFiles().map((abs) => ({ rel: toRel(abs), text: fs.readFileSync(abs, "utf8") })),
  ];
  return scanModuleFiles(files);
}

/** 模块身份（与目录拆分对应；“delivery/store” 是 L1 独立模块，其余 delivery/** 属 L3 delivery）。 */
function moduleOf(rel: string): string {
  if (rel === SESSION_BARREL_REL) return "<barrel>";
  if (!rel.startsWith(`${SESSION_DIR_REL}/`)) return `<external:${rel}>`;
  const inner = rel.slice(SESSION_DIR_REL.length + 1);
  const segments = inner.split("/");
  if (segments.length === 1) return segments[0]!.replace(/\.ts$/, "");
  const top = segments[0]!;
  if (top === "shared") return "shared";
  if (top === "contracts") return "contracts";
  if (top === "lifecycle") return "lifecycle";
  if (top === "fixed-workflow") return "fixed-workflow";
  if (top === "cards") return "cards";
  if (top === "delivery") return inner === "delivery/store.ts" ? "delivery/store" : "delivery";
  return `unknown:${top}`;
}

const MODULE_LAYERS: Record<string, number | "barrel"> = {
  "<barrel>": "barrel",
  index: 7,
  contracts: 0,
  shared: 0,
  persistence: 1,
  evidence: 1,
  "delivery/store": 1,
  "git-ports": 1,
  tasks: 2,
  "run-change": 2,
  "session-env": 2,
  diagnostics: 2,
  delivery: 3,
  handback: 3,
  "card-gateway": 3,
  dispatch: 4,
  cards: 4,
  "fixed-workflow": 5,
  lifecycle: 6,
};

/** feature 模块可导入的显式下层白名单（L0 始终允许；同模块内部导入始终允许）。 */
const FEATURE_IMPORT_WHITELIST: Record<string, readonly string[]> = {
  "<barrel>": ["*"],
  index: ["*"],
  contracts: [],
  shared: [],
  lifecycle: ["delivery", "session-env", "tasks", "evidence", "git-ports"],
  "fixed-workflow": ["card-gateway", "evidence", "run-change", "git-ports"],
  dispatch: [],
  cards: ["card-gateway", "evidence"],
  delivery: ["delivery/store", "session-env", "run-change"],
  "delivery/store": [],
  handback: [],
  tasks: [],
  "run-change": [],
  "session-env": [],
  diagnostics: [],
  persistence: [],
  evidence: [],
  "git-ports": [],
};

function findImportCycles(scanned: readonly ScannedModule[]): string[][] {
  const known = new Set(scanned.map((module) => module.rel));
  const adjacency = new Map<string, string[]>();
  for (const module of scanned) adjacency.set(module.rel, module.imports.filter((rel) => known.has(rel)));
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (rel: string): void => {
    color.set(rel, 1);
    stack.push(rel);
    for (const next of adjacency.get(rel) ?? []) {
      const state = color.get(next) ?? 0;
      if (state === 1) {
        const start = stack.indexOf(next);
        if (start >= 0) cycles.push([...stack.slice(start), next]);
      } else if (state === 0) visit(next);
    }
    stack.pop();
    color.set(rel, 2);
  };
  for (const module of scanned) if ((color.get(module.rel) ?? 0) === 0) visit(module.rel);
  return cycles;
}

function checkModuleBoundaries(scanned: readonly ScannedModule[]): string[] {
  const problems: string[] = [];
  const byRel = new Map(scanned.map((module) => [module.rel, module]));
  for (const module of scanned) {
    const sourceModule = moduleOf(module.rel);
    const sourceLayer = MODULE_LAYERS[sourceModule];
    if (sourceLayer === undefined) {
      problems.push(`${module.rel}: 未登记的模块身份 ${sourceModule}（新增模块必须同步更新 MODULE_LAYERS/白名单）`);
      continue;
    }
    for (const targetRel of module.imports) {
      const target = byRel.get(targetRel)!;
      const targetModule = moduleOf(target.rel);
      const targetLayer = MODULE_LAYERS[targetModule];
      if (targetLayer === undefined) {
        problems.push(`${target.rel}: 未登记的模块身份 ${targetModule}（新增模块必须同步更新 MODULE_LAYERS/白名单）`);
        continue;
      }
      if (sourceModule === targetModule) continue; // 模块内部文件拆分允许（无环由 R-a 另行保证）
      if (sourceModule === "contracts") {
        problems.push(`${module.rel}(contracts/L0) → ${targetRel}：contracts 只可依赖 src/model 与基础类型，不得导入 shared/feature（方案 §3.2）`);
        continue;
      }
      if (sourceLayer === "barrel" || sourceLayer === 7) continue; // 入口（index/barrel）可导入任意下层
      if (targetLayer === 0) continue; // L0（contracts/shared）对全部模块始终允许
      if (sourceLayer === 0) {
        if (targetLayer !== 0) {
          problems.push(`${module.rel}(${sourceModule}/L0) → ${targetRel}(${targetModule}/L${targetLayer})：L0 共享底座只可导入 L0；feature 模块只允许 index/barrel 导入`);
        }
        continue;
      }
      const whitelist = FEATURE_IMPORT_WHITELIST[sourceModule] ?? [];
      const whitelisted = whitelist.includes("*")
        || whitelist.some((entry) => targetModule === entry || targetRel.startsWith(`${SESSION_DIR_REL}/${entry}/`));
      const lower = typeof targetLayer === "number" && typeof sourceLayer === "number" && targetLayer < sourceLayer;
      if (!whitelisted || !lower) {
        problems.push(`${module.rel}(${sourceModule}/L${sourceLayer}) → ${targetRel}(${targetModule}/L${targetLayer})：不在显式白名单或其非严格下层（同层/上行只走 contracts 端口）`);
      }
    }
  }
  return problems;
}

test("模块边界·真实扫描：导入图无环 + 分层/白名单（B0 单文件 vacuous，但扫描器有真实输入）", () => {
  const scanned = scanSessionModules();
  const barrel = scanned.find((module) => module.rel === SESSION_BARREL_REL);
  assert.ok(barrel, "必须扫描到 barrel app/desktop/session.ts");
  assert.ok(extractStaticModuleSpecifiers(barrel!.text).length > 0, "扫描器必须解析到 barrel 的静态 import（防空跑）");
  assert.equal(scanned.length, 1 + listSessionDirModuleFiles().length, "扫描集合 = barrel + session/**/*.ts 全量");
  assert.deepEqual(findImportCycles(scanned), [], "导入图不得有环");
  assert.deepEqual(checkModuleBoundaries(scanned), [], "模块分层/白名单不得被违反");
  // vacuous 边界显式记录：当前无 session/ 目录时，内部边为 0；B1 起文件出现即自动参与上述断言。
  if (!fs.existsSync(path.join(REPO_ROOT, SESSION_DIR_REL))) {
    assert.equal(scanned.reduce((count, module) => count + module.imports.length, 0), 0, "session/ 不存在时不得解析出内部导入边");
  }
});

test("模块边界·规则引擎自测：合成夹具能抓环、L0→feature、同层越界与未分类模块（防永远空转）", () => {
  const cyclic = scanModuleFiles([
    { rel: `${SESSION_DIR_REL}/index.ts`, text: `import { open } from "./lifecycle/open.ts";` },
    { rel: `${SESSION_DIR_REL}/lifecycle/open.ts`, text: `import { send } from "./send.ts";` },
    { rel: `${SESSION_DIR_REL}/lifecycle/send.ts`, text: `import { open } from "./open.ts";` },
  ]);
  assert.equal(findImportCycles(cyclic).length > 0, true, "互为导入的合成模块必须被判定为有环");

  const clean = scanModuleFiles([
    { rel: `${SESSION_DIR_REL}/index.ts`, text: `import { open } from "./lifecycle/open.ts";\nimport type { Port } from "./contracts.ts";` },
    { rel: `${SESSION_DIR_REL}/contracts.ts`, text: `import type { RuntimeKind } from "../../../src/model/runtime.ts";` },
    { rel: `${SESSION_DIR_REL}/lifecycle/open.ts`, text: `import { enqueue } from "../delivery/queue.ts";\nimport { refresh } from "../session-env.ts";\nimport { read } from "../shared/keys.ts";\nimport { send } from "./send.ts";\nimport type { Port } from "../contracts.ts";` },
    { rel: `${SESSION_DIR_REL}/lifecycle/send.ts`, text: `import type { Port } from "../contracts.ts";` },
    { rel: `${SESSION_DIR_REL}/delivery/queue.ts`, text: `import { persist } from "./store.ts";\nimport { now } from "../shared/clock.ts";` },
    { rel: `${SESSION_DIR_REL}/delivery/store.ts`, text: `import type { Values } from "../contracts.ts";` },
    { rel: `${SESSION_DIR_REL}/session-env.ts`, text: `import { roleName } from "./shared/roles.ts";` },
    { rel: `${SESSION_DIR_REL}/shared/keys.ts`, text: `import type { Key } from "../contracts.ts";` },
    { rel: `${SESSION_DIR_REL}/fixed-workflow/route.ts`, text: `import { evidence } from "../evidence.ts";\nimport { gate } from "../card-gateway.ts";` },
    { rel: `${SESSION_DIR_REL}/cards/cards.ts`, text: `import { evidence } from "../evidence.ts";` },
    { rel: `${SESSION_DIR_REL}/evidence.ts`, text: `import { shorten } from "./shared/text.ts";` },
  ]);
  assert.deepEqual(findImportCycles(clean), [], "白名单内的下层导入链不得误报有环");
  assert.deepEqual(checkModuleBoundaries(clean), [], "白名单内的下层导入链不得误报越界");

  const violated = scanModuleFiles([
    { rel: `${SESSION_DIR_REL}/shared/keys.ts`, text: `import { open } from "../lifecycle/open.ts";` },
    { rel: `${SESSION_DIR_REL}/contracts.ts`, text: `import { keys } from "./shared/keys.ts";` },
    { rel: `${SESSION_DIR_REL}/dispatch.ts`, text: `import { cards } from "./cards/cards.ts";` },
    { rel: `${SESSION_DIR_REL}/lifecycle/open.ts`, text: `import { route } from "../dispatch.ts";` },
    { rel: `${SESSION_DIR_REL}/rogue/new.ts`, text: `import { keys } from "../shared/keys.ts";` },
    { rel: `${SESSION_DIR_REL}/lifecycle/send.ts`, text: `import { open } from "./open.ts";` },
  ]);
  const problems = checkModuleBoundaries(violated);
  for (const expected of [
    "shared/keys.ts",       // L0 → feature
    "contracts.ts",         // contracts 只可依赖 src/model 与基础类型
    "dispatch.ts",          // 同层不同模块（dispatch → cards）
    "lifecycle/open.ts",    // 非白名单上层/同层（lifecycle → dispatch 不在白名单）
    "rogue/new.ts",         // 未分类模块
  ]) {
    assert.equal(problems.some((problem) => problem.includes(expected)), true, `规则引擎必须报出 ${expected} 的违规：\n${problems.join("\n")}`);
  }
});

// ─────────────────────────────── 文件体量预算 ───────────────────────────────

/** `app/desktop/session.ts` 的**当前实际行数**上限（`wc -l` 口径），只降不升。
 *  B0（c234e79）冻结值 13,491；B1 结束实测 12,388，B2 起按该实际值收紧（12,388）；
 *  B3 结束实测 11,756，B3 起按该实际值收紧（11,756）；B4 起点实测 10,252，B4 起按该实际值收紧（10,252）；
 *  B5 起点（9970c3d，含 B0–B4）实测 9,118，B5 起按该实际值收紧（9,118）。
 *  后续批次完成搬出后继续按当前实测收紧。
 *  `countLogicalLines` 与之同口径（去掉结尾换行后按 `\n` 计数）。
 *  这是 B0–B6 的“不回涨”预算；B7 的目标（session.ts ≤50 行、index.ts ≤800 行）另行验收。 */
const SESSION_TS_FROZEN_BASELINE_LINES = 9118;
/** 未来 `app/desktop/session/` 目录下模块的单文件预算（方案 §6.2/§6.3 R11）。 */
const SESSION_MODULE_MAX_LINES = 1500;

function countLogicalLines(text: string): number {
  const normalized = text.endsWith("\n") ? text.slice(0, -1) : text;
  return normalized.length === 0 ? 0 : normalized.split("\n").length;
}

test("体量预算·barrel：session.ts 行数 <= B5 收紧基线 9,118（不得增长）", () => {
  const actual = countLogicalLines(fs.readFileSync(path.join(REPO_ROOT, SESSION_BARREL_REL), "utf8"));
  assert.ok(actual > 0, "session.ts 不得为空");
  assert.ok(actual <= SESSION_TS_FROZEN_BASELINE_LINES,
    `session.ts 现有 ${actual} 行 > 冻结基线 ${SESSION_TS_FROZEN_BASELINE_LINES}（c234e79；B0–B6 不得增长；搬出代码应使行数下降）`);
});

test("体量预算·session/**/*.ts：单模块 <= 1,500 行（目录尚不存在 → 当前 vacuous）", () => {
  for (const abs of listSessionDirModuleFiles()) {
    const rel = toRel(abs);
    const lines = countLogicalLines(fs.readFileSync(abs, "utf8"));
    assert.ok(lines <= SESSION_MODULE_MAX_LINES, `${rel} 现有 ${lines} 行 > 单模块预算 ${SESSION_MODULE_MAX_LINES}（方案 §6.3 R11）`);
  }
});

// ─────────────────────────────── openRoleSession 工具面快照脚手架 ───────────────────────────────
//
// 装配方式（参考 ans-wiring / session.test / p0-halt 的既有夹具）：
//   · **真实 SessionManager**：`open()` 走 `openInternalUnsafe` → `deps.openRoleSession` 全链；
//   · **真实编排**：`openRoleSession`（run-role）+ `createRuntimeAdapterFactory`；
//   · **真实工具构建**：runtime "demo" 的 provider 工厂收到运行时核心 `buildGovernedTools` 产出的
//     `options.tools`（ToolDefinition[]，序即注册序）；工厂把它们记录后返回 `createDemoRuntimeAdapter`
//     ——这就是**可脚本化假句柄/假 deps**：不发模型请求、不触网、不落盘，但注入面是生产代码算出来的。
// 确定性 fixture：临时项目根 + `.ans/project.json`（`workflowSchema: "legacy/v1"`、`governanceModel: "trio"`）
//   + 6 内置治理角色 + 1 项目角色 implementer（含 role-card/boundary 最小文件）。选择 legacy 是刻意的：
//   B7.1 起空 trio 项目聊天默认 fixed，本脚手架先冻结 **legacy 注入面**（B7 前每批的主战场）；
//   fixed 注入面可作为后续批次在同一 helper 上扩 fixture（workflowSchema/fixed 任务）另行冻结。
// 冻结基线来源：2026-11-13 于 c234e79 实测（两轮独立 fixture 捕获逐字相同、无重名）；
//   B1–B7 每批复跑本文件即得“迁移前后逐项相同”的差分。

const TOOL_SURFACE_ROLES = ["chief", "product", "rapporteur", "nominator", "convener", "verifier", "implementer"] as const;
type ToolSurfaceRole = (typeof TOOL_SURFACE_ROLES)[number];

const FROZEN_TOOL_SURFACE: Record<ToolSurfaceRole, readonly string[]> = {
  chief: [
    "write_file", "edit_file", "read_file", "list_dir", "view_image",
    "dispatch_task", "role_status", "contract_check", "doc_format", "evidence_check", "session_tail",
    "role_activity_log", "terminate_role_run", "redispatch_task",
    "project_state", "governance_matrix", "project_note", "request_version_decision", "close_created_task",
    "git_query", "git_candidate", "git_publish",
  ],
  product: [
    "write_file", "edit_file", "read_file", "list_dir", "view_image",
    "submit_report", "contract_check", "doc_format", "evidence_check",
    "project_state", "governance_matrix",
    "git_query", "git_candidate", "git_publish",
  ],
  rapporteur: [
    "write_file", "edit_file", "read_file", "list_dir", "view_image",
    "submit_report", "contract_check", "doc_format", "evidence_check",
    "project_state", "governance_matrix", "select_run_change",
    "git_query", "git_candidate", "git_publish",
  ],
  nominator: [
    "write_file", "edit_file", "read_file", "list_dir", "view_image",
    "submit_report", "contract_check", "doc_format", "evidence_check",
    "install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp",
    "project_state", "governance_matrix", "activate_role_documents",
    "git_query", "git_candidate", "git_publish",
  ],
  convener: [
    "write_file", "edit_file", "read_file", "list_dir", "view_image",
    "submit_report", "dispatch_task", "contract_check", "doc_format", "evidence_check",
    "project_state", "governance_matrix", "complete_team_plan", "close_created_task",
    "git_query", "git_candidate", "git_publish",
  ],
  verifier: [
    "write_file", "edit_file", "read_file", "list_dir", "view_image",
    "submit_report", "contract_check", "doc_format", "evidence_check",
    "project_state", "governance_matrix",
    "git_query", "git_candidate", "git_publish",
  ],
  implementer: [
    "write_file", "edit_file", "read_file", "list_dir", "view_image",
    "submit_report", "contract_check", "doc_format", "evidence_check",
    "git_query", "git_candidate", "git_publish",
  ],
};

const TOOL_SURFACE_PROJECT_ROLE = "implementer";

function toolSurfaceListing(root: string): ProjectListing {
  const builtIn = (
    roleId: string,
    governanceFunction: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>,
  ): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction,
  });
  const worker = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "工具面快照测试" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("product", "product"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
      worker(TOOL_SURFACE_PROJECT_ROLE),
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface ToolSurfaceFixture {
  root: string;
  cleanup: () => void;
}

/** 确定性临时项目：legacy/v1 + trio 治理模型 + 6 内置角色 + 1 项目角色。 */
function createToolSurfaceFixture(): ToolSurfaceFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-session-structure-"));
  const write = (rel: string, text: string): void => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, "utf8");
  };
  write(".ans/project.json", JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
  write(`角色卡/${TOOL_SURFACE_PROJECT_ROLE}/role-card.md`, `# ${TOOL_SURFACE_PROJECT_ROLE}\n组别：运行时接入组\n组内职责：实现\n`);
  write(`角色卡/${TOOL_SURFACE_PROJECT_ROLE}/boundary.yaml`,
    `role: ${TOOL_SURFACE_PROJECT_ROLE}\nentries:\n  - kind: file\n    path: src/${TOOL_SURFACE_PROJECT_ROLE}.ts\n    purpose: 工具面快照测试\n`);
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/**
 * 脚手架（导出供 B1–B7 复用）：对给定角色跑一次**真实** SessionManager.open →
 * 编排 openRoleSession → 运行时核心工具构建，返回注册工具名（含顺序）。
 * 每次调用都新建临时 fixture 与独立 SessionManager；结束后 stop + 清理，无跨调用状态。
 */
export async function captureToolSurfaceForRole(roleId: string): Promise<string[]> {
  const fixture = createToolSurfaceFixture();
  const capturedRuns: string[][] = [];
  const manager = new SessionManager({
    openRoleSession: (input, deps) => openRoleSession({ ...input, autoRepin: false }, deps),
    createRuntimeAdapterFactory,
    buildProjectConfig,
    getListing: (root) => (root === fixture.root ? toolSurfaceListing(root) : undefined),
    emitEvent() {},
    createPiAdapterFactory() {
      throw new Error("session-structure fixture: 本脚手架只用 demo runtime，pi 适配器不应被构造");
    },
    createDemoAdapter() {
      throw new Error("session-structure fixture: 本脚手架走 providerFactories.demo，旧 demo 适配器不应被构造");
    },
    runtimeOptions: {
      providerFactories: {
        demo: (async (options) => {
          capturedRuns.push(options.tools.map((tool) => tool.name));
          return createDemoRuntimeAdapter(options, []);
        }) satisfies RuntimeProviderFactory,
      },
    },
  });
  try {
    const opened = await manager.open({ projectRoot: fixture.root, roleId, runtime: "demo" });
    assert.equal(opened.ok, true, `${roleId} 会话应开启成功：${opened.ok ? "" : opened.error}`);
    assert.equal(capturedRuns.length, 1, `${roleId}：一次真实 open 必须恰好构造一次工具集（实际 ${capturedRuns.length} 次）`);
    return capturedRuns[0]!;
  } finally {
    await manager.stop();
    fixture.cleanup();
  }
}

test("工具面快照·与冻结清单一致：7 角色经真实 SessionManager/openRoleSession 注入的工具名与顺序不变", async () => {
  for (const roleId of TOOL_SURFACE_ROLES) {
    const names = await captureToolSurfaceForRole(roleId);
    assert.equal(names.length > 0, true, `${roleId}：工具面不得为空`);
    assert.equal(new Set(names).size, names.length, `${roleId}：同一会话内工具名不得重复（实际：${names.join(", ")}）`);
    assert.deepEqual(names, FROZEN_TOOL_SURFACE[roleId],
      `${roleId}：工具名集合/顺序必须与 c234e79 冻结清单逐字一致（B7 前每批对比）`);
  }
});

test("工具面快照·捕获稳定：每角色两次独立 fixture/manager 捕获逐字相同（无随机顺序）", async () => {
  for (const roleId of TOOL_SURFACE_ROLES) {
    const first = await captureToolSurfaceForRole(roleId);
    const second = await captureToolSurfaceForRole(roleId);
    assert.deepEqual(second, first, `${roleId}：两次独立捕获必须逐字一致（含顺序）`);
  }
});
