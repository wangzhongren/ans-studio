// test/测试/governance-trio-verify/fixture.ts
// 测试角色：治理三权分立 V1 独立端到端验收的夹具（2026-10-17）。
//
// 纪律（沿用本角色先例）：
//   · **独立构造**：本目录的夹具/断言均由测试角色自建；只读导入产品公开面
//     （`openGovernanceSession`/`openRoleSession`/`listProject`/`resolveRole`/`resolveBoundarySection`/
//     `resolveWrite`/`evaluateGovernanceGate`/账本/迁移/桌面 Interface 与渲染纯函数），
//     **不 import 任何实施方测试文件**。
//   · 全部在系统临时目录内进行、用后清理；不读 `.env`、不跑真实模型/凭据/网络。
//   · 假适配器驱动会话：脚本 = 工具调用序列，gate/能力/客户通道均由真实产品代码装配后注入。

import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../../src/model/role.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import type {
  CustomerInputFn,
  CustomerInputOutcome,
  CustomerInputRequest,
  RuntimeAdapter,
  ShellGate,
  ToolCall,
  WriteGate,
} from "../../../src/model/runtime.ts";
import type { RoleSession, SessionEvent } from "../../../src/model/runtime.ts";
import { createFakeRuntimeAdapter } from "../../../src/provider/pi/session.ts";
import type { AdapterCapabilities } from "../../../src/pipeline/orchestration/run-role.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import {
  flushGovernanceLedger,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../../src/common/编排/governance-ledger.ts";
import { classifyShell, defaultShellRules } from "../../../src/common/门禁引擎/classify-shell.ts";

export const GOV_REL = "角色卡/governance-boundary.yaml";

/** 旧 single 项目治理边界（条件目录；su 旧行为）。 */
export const SINGLE_GOV_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: conditional-directory",
  "    path: 角色卡/",
  "    condition: role-restructuring",
  "    root: project",
  "    purpose: 角色目录",
  "  - kind: conditional-directory",
  "    path: docs/",
  "    condition: docs-bootstrap",
  "    root: project",
  "    purpose: 项目文档",
  "  - kind: conditional-directory",
  "    path: .ans/",
  "    condition: project-init",
  "    root: project",
  "    purpose: 项目初始化",
  "",
].join("\n");

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 临时项目根 + 统一清理。 */
export function makeRoot(tag: string): { root: string; cleanup(): void } {
  const root = mkdtempSync(path.join(tmpdir(), `ans-trio-verify-${tag}-`));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* 忽略清理失败 */
      }
    },
  };
}

export function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

export function read(root: string, rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

export function exists(root: string, rel: string): boolean {
  return existsSync(path.join(root, rel));
}

/** 项目角色：角色卡 + 边界（可用 `src/owned/<id>/`）。 */
export function writeProjectRole(root: string, roleId: string): void {
  write(root, `角色卡/${roleId}/role-card.md`, `# 角色：${roleId}\n\n独立验收夹具角色。\n`);
  write(
    root,
    `角色卡/${roleId}/boundary.yaml`,
    `role: ${roleId}\nentries:\n  - kind: directory\n    path: src/owned-${roleId}/\n    purpose: 角色代码\n`,
  );
}

/** trio 项目配置：模型显式 trio、注册表边界 + 项目接受证据（`.ans` 记录形态）。 */
export function trioProject(root: string, overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["rapporteur", "nominator", "convener"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:trio-accepted" },
    },
    ...overrides,
  };
}

/** 旧 single 项目配置（su 路径）：条件目录治理边界。 */
export function singleProject(root: string, overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  if (!exists(root, GOV_REL)) write(root, GOV_REL, SINGLE_GOV_YAML);
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "single",
    builtInRoles: ["su"],
    governanceBoundary: {
      path: GOV_REL,
      acceptance: { accepted: true, source: "test:single-accepted" },
    },
    ...overrides,
  };
}

/** 真实枚举（复用产品唯一实现；不手写 listing 判定）。 */
export function listOf(root: string): Promise<ProjectListing> {
  return listProject(root);
}

/** 会话装配后的捕获面：gate 与能力（由真实 openRoleSession 构造）。 */
export interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
  boundRoleId?: string;
}

/** 新建一个捕获容器。 */
export function capture(): Captured {
  return {};
}

/** 捕获 gate/能力的假适配器工厂（脚本驱动；可选落盘根/客户通道/shell）。 */
export function capturingFactory(
  captured: Captured,
  opts: { root?: string; script?: ToolCall[]; shellGate?: ShellGate } = {},
): (gate: WriteGate, caps?: AdapterCapabilities) => RuntimeAdapter {
  return (gate, caps) => {
    captured.gate = gate;
    captured.caps = caps;
    return createFakeRuntimeAdapter({
      gate,
      script: opts.script ?? [],
      ...(opts.root !== undefined ? { writeRoot: opts.root } : {}),
      ...(opts.shellGate !== undefined ? { shellGate: opts.shellGate } : {}),
      // 能力面原样接入假适配器：客户通道/派发/shell 均由真实 run-role 装配后注入。
      ...(caps?.customerInput !== undefined ? { customerInput: caps.customerInput } : {}),
      ...(caps?.dispatchTask !== undefined ? { dispatchTask: caps.dispatchTask } : {}),
      ...(caps?.reportHandback !== undefined ? { reportHandback: caps.reportHandback } : {}),
      ...(caps?.shellGate !== undefined ? { shellGate: caps.shellGate } : {}),
    });
  };
}

/** 消费事件流直到 settled（runRole 的事件流在 settled 后关闭）。
 *  给出 `text` 时先发一轮（空脚本夹具用；否则事件流不会产生 settled）。 */
export async function consume(
  handle: { send(text: string): Promise<void>; events(): AsyncIterable<{ kind?: string } | SessionEvent> },
  text?: string,
): Promise<Array<{ kind?: string; summary?: string }>> {
  if (text !== undefined) await handle.send(text);
  const events: Array<{ kind?: string; summary?: string }> = [];
  for await (const ev of handle.events()) events.push(ev as { kind?: string; summary?: string });
  return events;
}

/** 等待账本出现满足谓词的内容（含在飞 append 落盘；失败返回当刻快照）。 */
export async function waitForLedger(
  root: string,
  predicate: (entries: GovernanceLedgerEntry[], errors: string[]) => boolean,
  timeoutMs = 1500,
): Promise<{ entries: GovernanceLedgerEntry[]; errors: string[] }> {
  const start = Date.now();
  for (;;) {
    await flushGovernanceLedger(root);
    const snapshot = await readGovernanceLedger(root);
    if (predicate(snapshot.entries, snapshot.errors)) return snapshot;
    if (Date.now() - start > timeoutMs) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** 客户通道：choice 返回给定选项；confirm 返回给定布尔值；并记录被问到的请求。 */
export function customerChannel(opts: {
  selected?: string[];
  confirmed?: boolean;
  record?: CustomerInputRequest[];
}): CustomerInputFn {
  return (req) => {
    opts.record?.push(req);
    if (req.kind === "choice") {
      return { outcome: "answered", value: { selected: opts.selected ?? [] }, operatorId: "test:客户" } satisfies CustomerInputOutcome;
    }
    return { outcome: "answered", value: { confirmed: opts.confirmed ?? false }, operatorId: "test:客户" } satisfies CustomerInputOutcome;
  };
}

/** 拒绝/不可用通道。 */
export function decliningChannel(outcome: "declined" | "unavailable" = "declined"): CustomerInputFn {
  return () =>
    outcome === "declined"
      ? { outcome: "declined", operatorId: "test:客户", reason: "测试拒绝" }
      : { outcome: "unavailable", reason: "测试通道不可用" };
}

/** 提案文件（frontmatter 形状与协作协议一致）。 */
export function proposalDoc(flowId: string, version = 1): string {
  return [
    "---",
    `flowId: ${flowId}`,
    `version: ${version}`,
    "author: rapporteur",
    "status: draft",
    "---",
    "",
    `# 提案 ${flowId} v${version}`,
    "",
    "独立验收夹具提案。",
    "",
  ].join("\n");
}

/** 流程单（Markdown 表格；首格为步骤 id——派发门禁的解析口径）。 */
export function flowDoc(flowId: string, steps: string[]): string {
  return [
    `# 流程 ${flowId}`,
    "",
    "| 步骤 | 角色 | 状态 |",
    "| --- | --- | --- |",
    ...steps.map((step) => `| ${step} | A | pending |`),
    "",
  ].join("\n");
}

/** 账本条目助手。 */
export function ledgerEntry(over: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    at: new Date().toISOString(),
    kind: "customer.decision",
    actorRoleId: "rapporteur",
    power: "proposal",
    flowId: "flow-a",
    ...over,
  };
}

/** 默认 shell 规则/分类器（生产同一来源）。 */
export const shellRules = { classifyShell, rules: defaultShellRules() };

/** 会话句柄的最小驱动（send + 消费）。 */
export async function runOnce(handle: { send(text: string): Promise<void>; events(): AsyncIterable<unknown> }, text: string) {
  await handle.send(text);
  for await (const _ev of handle.events()) {
    /* 消费到 settled */
  }
}

/** 目录树快照（零写入证明；相对路径 + 类型 + 内容哈希/大小）。 */
export function snapshotTree(root: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string): void => {
    let dirents;
    try {
      dirents = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
      const childAbs = path.join(abs, d.name);
      const childRel = rel === "" ? d.name : `${rel}/${d.name}`;
      if (d.isDirectory()) {
        out.push(`dir:${childRel}`);
        walk(childAbs, childRel);
      } else if (d.isFile()) {
        out.push(`file:${childRel}:${sha256(readFileSync(childAbs))}`);
      }
    }
  };
  walk(root, "");
  return out;
}
