// test/测试/governance-e2e-auto/fixture.ts
// 测试角色：五角色治理全自动链路的**独立端到端验收夹具**（2026-10-18）。
//
// 纪律（沿用本角色先例）：
//   · **独立构造**：只读导入产品公开面（`openRoleSession`/`listProject`/桌面 `createDesktopInterface`/
//     客户交互通道/判断 driver/账本/运行时核心工具），**不 import 任何实施方测试文件**。
//   · 全部在系统临时目录内进行、用后清理；不读 `.env`、不跑真实模型/凭据/网络。
//   · **桩适配器**：脚本 = 工具调用序列；gate/能力/客户通道均由真实产品代码装配后注入。
//     适配器的事件流跨多轮保持打开（同一会话可连续收多条后台任务），dispose 才关闭。
//   · **判断桩**：`createGovernanceJudge` 走真实 driver，只把判断会话的适配器换成假模型——
//     假模型从 driver 提示词解析卡片/候选路径/必读物证，先真实调用 `judge_read_file` 再交回
//     `report_governance_judgement`。这样「空 preview / 验收门槛 / 超时」等回落仍由产品机械门槛产生。
//   · **桌面面**：`createDesktopInterface` 的真实实现；项目枚举、会话装配、listing 刷新、后台派发、
//     双开关与客户通道全部走产品路径（不注入伪造 listing）。

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import type {
  CustomerInputRequest,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
  PromptOptions,
  RoleSession,
  RuntimeAdapter,
  RuntimeKind,
  SessionEvent,
  ToolCall,
  ToolDefinition,
  WriteGate,
} from "../../../src/model/runtime.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import { buildGovernanceJudgeTools } from "../../../src/common/runtime-core/governance-judge/tools.ts";
import { createGovernanceJudge } from "../../../src/pipeline/orchestration/govern-session.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import {
  appendGovernanceLedger,
  flushGovernanceLedger,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../../src/common/编排/governance-ledger.ts";
import {
  createDesktopInterface,
  createShellJudgeSwitch,
  type DesktopInterface,
  type ShellJudgeSwitch,
} from "../../../app/desktop/interface.ts";
import type { SessionEventEnvelope } from "../../../app/desktop/session.ts";
import {
  createCustomerInputChannel,
  type CustomerInputChannel,
  type DesktopCustomerInputFn,
  type OperatorDecisionPayload,
  type OperatorJudgeResultPayload,
  type OperatorRequestPayload,
} from "../../../app/desktop/customer-input.ts";
import type { GovernanceAdvanceResult } from "../../../app/desktop/governance-advance.ts";

export const FLOW = "flow-a";
export const PROPOSAL_REL = `docs/proposals/${FLOW}-v1.md`;
export const NOMINATION_REL = `docs/nominations/${FLOW}-v1.md`;
// 2026-10-22 治理分工第 1/3 项：团队计划（Convener 写）、验收标准/报告、变更包、readiness。
export const TEAM_PLAN_REL = `docs/scheduling/${FLOW}-team-v1.md`;
export const READINESS_REL = `docs/scheduling/${FLOW}-readiness-v1.md`;
export const CHANGE_PACKAGE_REL = `docs/scheduling/${FLOW}-change-v1.md`;
export const CRITERIA_REL = `docs/acceptance/${FLOW}-criteria-v1.md`;
export const REPORT_REL = `docs/acceptance/${FLOW}-report-v1.md`;
// 2026-10-19 Flow YAML 契约（客户「这些全部改成yaml」）：`docs/flows/<flowId>.yaml` 是唯一机器状态；
// 同名 `.md` 仅人读视图，产品门禁不再解析它做判定。
export const FLOW_REL = `docs/flows/${FLOW}.yaml`;
export const GOV_REL = "角色卡/governance-boundary.yaml";
export const ANS_REL = ".ans/project.json";
/** 意图记录路径（decision 组判断的唯一意图基准；`docs/intents/<intentId>.md`）。 */
export const INTENT_REL = "docs/intents/intent-a.md";

/** 治理边界文档（应用记录；内容只用于 pin 接受证据）。 */
export const GOV_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: directory",
  "    path: 角色卡/",
  "    root: project",
  "    purpose: 角色目录",
  "  - kind: directory",
  "    path: docs/",
  "    root: project",
  "    purpose: 项目文档",
  "  - kind: directory",
  "    path: .ans/",
  "    root: project",
  "    purpose: 配置与 pin",
  "",
].join("\n");

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function makeRoot(tag: string): { root: string; cleanup(): void } {
  const root = mkdtempSync(path.join(tmpdir(), `ans-governance-e2e-${tag}-`));
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

export function writeProjectRole(root: string, roleId: string): void {
  write(root, `角色卡/${roleId}/role-card.md`, `# 角色：${roleId}\n\n端到端验收夹具角色。\n`);
  write(
    root,
    `角色卡/${roleId}/boundary.yaml`,
    `role: ${roleId}\nentries:\n  - kind: directory\n    path: src/owned-${roleId}/\n    purpose: 角色代码\n`,
  );
}

/**
 * trio 项目种子：真实 `.ans/project.json`（pin-backed 接受证据）+ 治理边界文档。
 * `listProject` 会枚举内置五角色；项目角色由 `角色卡/<id>/` 目录决定。
 */
export function seedTrioProject(root: string, roles: string[] = []): void {
  write(root, GOV_REL, GOV_YAML);
  const pin = [{ path: GOV_REL, sha256: sha256(GOV_YAML) }];
  write(
    root,
    ANS_REL,
    JSON.stringify(
      {
        projectRoot: root.split(path.sep).join("/"),
        skillRoot: root.split(path.sep).join("/"),
        governanceModel: "trio",
        roles: {},
        governanceBoundary: { path: GOV_REL, acceptance: { accepted: true, source: "test:governance-e2e", pin } },
      },
      null,
      2,
    ) + "\n",
  );
  for (const roleId of roles) writeProjectRole(root, roleId);
}

export function proposalDoc(flowId = FLOW, version = 1, intentId?: string): string {
  return [
    "---",
    `flowId: ${flowId}`,
    `version: ${version}`,
    "author: rapporteur",
    "status: draft",
    // 2026-10-19 意图漂移契约：提案可携带 intentId（`governance-judge-intent.ts` 的兼容定位来源）。
    ...(intentId !== undefined ? [`intentId: ${intentId}`] : []),
    "---",
    "",
    `# 提案 ${flowId} v${version}`,
    "",
    "goal: 离线验收全自动治理链路。",
    "scope: 临时目录内、假模型驱动。",
    "acceptance: 四角色闭环全部落盘且账本可还原。",
    "",
  ].join("\n");
}

export function nominationDoc(flowId = FLOW, recommended = ["executor"]): string {
  return [
    "---",
    `flowId: ${flowId}`,
    `recommended: [${recommended.join(", ")}]`,
    "---",
    "",
    `# 提名 ${flowId}`,
    "",
    `候选：${recommended.join("、")}。`,
    "",
  ].join("\n");
}

export interface FlowDocStep {
  id: string;
  status?: string;
  /** 默认按保留验收 id（verification/acceptance）推断 acceptance，其余 dispatch。 */
  kind?: string;
  owner?: string;
  title?: string;
  /** done 步骤的证据；缺省时 dispatch→{kind:"dispatch",ref:id}、acceptance→{kind:"acceptance",ref:"acceptance"}。 */
  evidence?: { kind: string; ref: string };
  /** 2026-10-22 MapReduce 方案 A：可选并行组（map-<slug> | reduce）；旧 flow 不填。 */
  parallelGroup?: string;
  /** 2026-10-22 MapReduce 方案 A：可选前置步骤 id 列表；旧 flow 不填。 */
  dependsOn?: readonly string[];
}

/**
 * 生成合法 Flow YAML（`docs/flows/<flowId>.yaml` 唯一机器状态；契约见 `src/common/编排/flow-state.ts`）。
 * 顶层 flowId/version/qualityTier/steps；每步 id/title/owner/kind/status；done 必须带同 kind 的 evidence
 * （dispatch 的 ref=账本 stepId；acceptance 的 ref 固定 "acceptance"）。pending 等状态不要求 evidence。
 */
export function flowDoc(flowId = FLOW, steps: FlowDocStep[] = [{ id: "impl", status: "pending" }]): string {
  const lines = [`flowId: ${flowId}`, "version: 1", "qualityTier: production", "steps:"];
  for (const step of steps) {
    const status = step.status ?? "pending";
    const kind = step.kind ?? (step.id === "verification" || step.id === "acceptance" ? "acceptance" : "dispatch");
    const owner = step.owner ?? (kind === "acceptance" ? "verifier" : "executor");
    const title = step.title ?? step.id;
    lines.push(
      `  - id: ${step.id}`,
      `    title: ${title}`,
      `    owner: ${owner}`,
      `    kind: ${kind}`,
      `    status: ${status}`,
    );
    if (step.parallelGroup !== undefined) lines.push(`    parallelGroup: ${step.parallelGroup}`);
    if (step.dependsOn !== undefined) lines.push(`    dependsOn: [${step.dependsOn.join(", ")}]`);
    if (status === "done") {
      const evidence =
        step.evidence ??
        (kind === "acceptance"
          ? { kind: "acceptance", ref: "acceptance" }
          : kind === "dispatch"
            ? { kind: "dispatch", ref: step.id }
            : undefined);
      if (evidence === undefined) throw new Error(`flowDoc：${step.id} 为 done，kind=${kind} 必须显式给 evidence`);
      lines.push("    evidence:", `      kind: ${evidence.kind}`, `      ref: ${evidence.ref}`);
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * 团队计划（2026-10-22 第 1 项；Convener 唯一作者）：frontmatter flowId/version/riskTier +
 * 内联 `recommended` 数组 + 角色表（roleId / 类型 / 职责目标 / 能力要求 / 唯一写集 / 依赖 / 组别 / apiSpec）。
 * 卡前守卫与桌面写卡校验都按此确定性形状解析。
 */
export function teamPlanDoc(
  flowId = FLOW,
  recommended: readonly string[] = ["executor"],
  options: {
    version?: number;
    riskTier?: string;
    frontmatterFlowId?: string;
    /** 省略 recommended（空推荐集负例）。 */
    omitRecommended?: boolean;
    /** 覆盖某个推荐角色的「职责目标」等单元格（缺项负例）。 */
    rowOverrides?: Record<string, Partial<Record<"type" | "duty" | "ability" | "writes" | "deps", string>>>;
    /** 额外角色行（如内置角色负例）。 */
    extraRows?: Array<{ roleId: string; type?: string; duty?: string; ability?: string; writes?: string; deps?: string }>;
  } = {},
): string {
  const version = options.version ?? 1;
  const riskTier = options.riskTier ?? "T1";
  const lines = [
    "---",
    `flowId: ${options.frontmatterFlowId ?? flowId}`,
    `version: ${version}`,
    `riskTier: ${riskTier}`,
    ...(options.omitRecommended === true ? [] : [`recommended: [${recommended.join(", ")}]`]),
    "---",
    "",
    `# 团队计划 ${flowId} v${version}`,
    "",
    "| roleId | 类型 | 职责目标 | 能力要求 | 唯一写集 | 依赖 | 组别 | apiSpec |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const roleId of recommended) {
    const over = options.rowOverrides?.[roleId] ?? {};
    lines.push(
      `| ${roleId} | ${over.type ?? "new"} | ${over.duty ?? "实现本角色的系统功能"} | ${over.ability ?? "能读写代码并交付测试"} | ${over.writes ?? `src/owned-${roleId}/`} | ${over.deps ?? "无"} | 开发 | not-applicable |`,
    );
  }
  for (const row of options.extraRows ?? []) {
    lines.push(
      `| ${row.roleId} | ${row.type ?? "new"} | ${row.duty ?? "实现"} | ${row.ability ?? "能力"} | ${row.writes ?? "src/"} | ${row.deps ?? "无"} | 开发 | not-applicable |`,
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * 团队计划 v2 角色行（2026-10-22 角色粒度/MapReduce；策划方案 §5.3 的 14 列）。
 * 只用于生成夹具文本；校验由产品 `src/common/编排/team-plan.ts` 执行。
 */
export interface TeamPlanV2RoleInput {
  roleId: string;
  type?: string;
  module: string;
  duty?: string;
  ability?: string;
  writes?: string;
  contract?: string;
  testSurface?: string;
  deps?: string;
  dependsOn?: string;
  parallelGroup?: string;
  group?: string;
  apiSpec?: string;
  rationale?: string;
}

export interface TeamPlanV2ModuleInput {
  module: string;
  responsibility?: string;
  contract?: string;
  architectureSource?: string;
}

export interface TeamPlanV2Options {
  version?: number;
  riskTier?: string;
  /** frontmatter flowId 覆盖（flowId 不一致负例）。 */
  frontmatterFlowId?: string;
  /** frontmatter `modules` 覆盖（重复/未声明/块数组等负例）。 */
  modules?: readonly string[];
  /** 角色行；必填，便于正/负例精确控制。 */
  rows: readonly TeamPlanV2RoleInput[];
  /** frontmatter `recommended` 覆盖；缺省 = rows 中非 reduce 角色。 */
  recommended?: readonly string[];
  /** 省略 frontmatter modules（缺模块清单负例）。 */
  omitModulesFrontmatter?: boolean;
  /** 用 YAML 块数组写 modules（解析负例）。 */
  blockModules?: boolean;
  /** 省略正文「模块清单」表。 */
  omitModuleSection?: boolean;
  /** 模块清单行覆盖（字符串原样使用，或结构化生成）。 */
  moduleRows?: readonly (TeamPlanV2ModuleInput | string)[];
  /** 省略「五维判断/协调成本」章节。 */
  omitCoordinationSection?: boolean;
}

/**
 * 生成团队计划 v2（frontmatter `teamPlanSchema: 2`/`modules` + 模块清单 + 14 列角色表 + 五维章节）。
 * **不替换 v1 `teamPlanDoc`**：旧流程/legacy 覆盖继续使用 v1 夹具（不得批量迁移）。
 */
export function teamPlanV2Doc(flowId = FLOW, options: TeamPlanV2Options): string {
  const rows = options.rows;
  const modules =
    options.modules ??
    [...new Set(rows.map((row) => row.module).filter((module) => module !== "" && !module.split(/[+＋]/).includes("reduce")))];
  const recommended = options.recommended ?? rows.filter((row) => !row.module.split(/[+＋]/).includes("reduce")).map((row) => row.roleId);
  const version = options.version ?? 1;
  const riskTier = options.riskTier ?? "T3";
  const moduleRows =
    options.moduleRows ??
    modules.map((module) => ({
      module,
      responsibility: `${module} 模块交付`,
      contract: `docs/contracts/${module}-v1.md`,
      architectureSource: `docs/planning/${flowId}-v1.md §4`,
    }));
  const moduleRowText = moduleRows.map((row) =>
    typeof row === "string"
      ? row
      : `| ${row.module} | ${row.responsibility ?? "模块交付"} | ${row.contract ?? `docs/contracts/${row.module}-v1.md`} | ${row.architectureSource ?? `docs/planning/${flowId}-v1.md §4`} |`,
  );
  const lines = [
    "---",
    `flowId: ${options.frontmatterFlowId ?? flowId}`,
    `version: ${version}`,
    "teamPlanSchema: 2",
    `riskTier: ${riskTier}`,
    `recommended: [${recommended.join(", ")}]`,
    ...(options.omitModulesFrontmatter === true
      ? []
      : options.blockModules === true
        ? ["modules:", ...modules.map((module) => `  - ${module}`)]
        : [`modules: [${modules.join(", ")}]`]),
    "---",
    "",
    `# 团队计划 ${flowId} v${version}`,
    "",
    ...(options.omitModuleSection === true
      ? []
      : [
          "## 模块清单",
          "",
          "| module | 职责 | 公开契约 | 架构来源 |",
          "| --- | --- | --- | --- |",
          ...moduleRowText,
          "",
        ]),
    "## 参与角色与职责",
    "",
    "| roleId | 类型 | module | 职责目标 | 能力要求 | 唯一写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.roleId} | ${row.type ?? "new"} | ${row.module} | ${row.duty ?? "实现本模块的交付"} | ${row.ability ?? "能读写代码并交付测试"} | ${row.writes ?? `src/owned-${row.roleId}/; test/owned-${row.roleId}/`} | ${row.contract ?? "internal（夹具模块无跨角色公开契约）"} | ${row.testSurface ?? `test/owned-${row.roleId}/`} | ${row.deps ?? "无"} | ${row.dependsOn ?? "无"} | ${row.parallelGroup ?? "map-a"} | ${row.group ?? "交付"} | ${row.apiSpec ?? "required"} | ${row.rationale ?? "—"} |`,
    ),
    "",
    ...(options.omitCoordinationSection === true
      ? []
      : [
          "## 五维判断与协调成本",
          "",
          "- 责任独立性：各模块有独立变化原因；Reduce 角色独立承担证据合并。",
          "- 范围归属：Map 角色写集互不相交；Reduce 只写测试与证据根。",
          "- 契约影响：公开契约由对应 Map 角色唯一主属，消费方只读。",
          "- 证据独立性：每个 Map 角色有独立测试面；Reduce 独立合并 manifest。",
          "- 协调成本：按模块并行收益高于交接成本，未拆到函数级。",
          "",
        ]),
  ];
  return lines.join("\n") + "\n";
}
export function roleCardDoc(roleId = "executor"): string {
  return [
    `# 角色：${roleId}`,
    "",
    "## 组别",
    "开发。",
    "",
    "## 能力描述",
    "按团队计划实现并验证本角色负责的功能。",
    "",
    "## 工作立场",
    "对本角色交付长期负责。",
    "",
    "## 系统功能导航",
    "见 feature-map.md。",
    "",
    "## 必读资料",
    "团队计划、提案与边界。",
    "",
    "## 交接输入输出",
    "输入：团队计划与任命名单；输出：实现与测试证据。",
    "",
    "## 执行原则",
    "只写计划内写集。",
    "",
    "## 质量职责",
    "交付需可复现验证。",
    "",
    "## 标准工作流",
    "读计划 → 实现 → 测试 → 报告。",
    "",
    "## 交付物清单",
    "代码、测试与报告。",
    "",
  ].join("\n");
}

/** 新流程 boundary.yaml：角色根工作文档条目 + 实际写集（与团队计划一致；可传额外写集目录）。 */
export function roleBoundaryDoc(
  roleId = "executor",
  options: { writes?: readonly string[]; files?: readonly string[] } = {},
): string {
  const files = options.files ?? ["feature-map.md", "functional-description.md", "memo.md", "api-spec.md"];
  const writes = options.writes ?? [`src/owned-${roleId}/`];
  return [
    `role: ${roleId}`,
    "entries:",
    ...files.flatMap((file) => [
      "  - kind: file",
      `    path: 角色卡/${roleId}/${file}`,
      "    purpose: 角色根工作文档",
    ]),
    ...writes.flatMap((path) => [
      "  - kind: directory",
      `    path: ${path}`,
      "    purpose: 角色代码/测试写集",
    ]),
    "",
  ].join("\n");
}

/** 角色根工作文档（feature-map/functional-description/memo/api-spec）。 */
export function roleWorkDocs(roleId = "executor"): Record<string, string> {
  return {
    "feature-map.md": `# 功能导航\n\n| 功能 | 入口 |\n| --- | --- |\n| 实现 | src/owned-${roleId}/ |\n`,
    "functional-description.md": `# 功能说明\n\n职责：实现与测试。交接：向 Lead 报告。代码位置：src/owned-${roleId}/。\n`,
    "memo.md": "# 备忘\n\n- 2026-10-22 由 Crew 按团队计划写卡。\n",
    "api-spec.md": "# API 说明\n\nnot-applicable：本角色无导出/共享/装配接口。\n",
  };
}

/** 一次性写出新流程要求的全部角色产物（role-card/boundary/工作文档）。 */
export function writeRoleArtifacts(
  root: string,
  roleId = "executor",
  options: { writes?: readonly string[] } = {},
): void {
  write(root, `角色卡/${roleId}/role-card.md`, roleCardDoc(roleId));
  write(root, `角色卡/${roleId}/boundary.yaml`, roleBoundaryDoc(roleId, options));
  for (const [file, content] of Object.entries(roleWorkDocs(roleId))) {
    write(root, `角色卡/${roleId}/${file}`, content);
  }
}

/** 实施前验收标准（结构门槛：flowId、验收表 ID 列、T0–T3、判定规则、证据计划、版本/冻结）。 */
export function acceptanceCriteriaDoc(flowId = FLOW): string {
  return [
    "---",
    `flowId: ${flowId}`,
    "version: 1",
    "---",
    "",
    `# 验收完成标准 ${flowId}`,
    "",
    "## 范围与非目标",
    "范围：本流程交付；非目标：无关治理差异。",
    "",
    "## 验收表",
    "| ID | 标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "| P1 | 交付满足提案 | 测试输出 | 待提交 | 候选哈希 | 测试 | 待判定 | 待判定 |",
    "",
    "## 风险档位与判定依据",
    "风险档位：T1（实现变更）。",
    "",
    "## 判定规则",
    "pass：证据齐全且满足标准；fail：有证据表明不满足；insufficient evidence：证据缺失或候选不符。",
    "",
    "## 证据计划",
    "需要的证据：测试命令输出、候选哈希、diff/status。",
    "",
    "## 版本与冻结",
    "标准写盘后冻结；变更需递增版本并记录理由。",
    "",
  ].join("\n");
}

/** 验收报告：首行五项 + 档位；报告档位不得低于变更包。 */
export function acceptanceReportDoc(flowId = FLOW, riskTier = "T1"): string {
  return [
    `风险档位：${riskTier}｜判定依据：实现变更按测试证据判定｜选定检查：受影响测试与全量回归｜复用证据：无｜全量回归：已执行`,
    "",
    `# 验收报告 ${flowId}`,
    "",
    "## 结论",
    "通过。",
    "",
    "## 逐行判定",
    "| ID | 结果 |",
    "| --- | --- |",
    "| P1 | pass |",
    "",
  ].join("\n");
}

/** 变更包（frontmatter riskTier/candidate/changedPaths + 正文档位依据）。 */
export function changePackageDoc(flowId = FLOW, riskTier = "T1"): string {
  return [
    "---",
    `flowId: ${flowId}`,
    "version: 1",
    `riskTier: ${riskTier}`,
    "candidate: fixture-candidate",
    "changedPaths:",
    "  - src/owned-executor/",
    "evidence:",
    `  - ${REPORT_REL}`,
    "---",
    "",
    `# 变更包 ${flowId}`,
    "",
    "## 候选与范围",
    "候选：fixture；范围：本流程授权写集。",
    "",
    "## 档位依据",
    `风险档位 ${riskTier}：实现变更，按受影响测试与全量回归验证。`,
    "",
    "## 复用证据与失效说明",
    "无。",
    "",
  ].join("\n");
}

/** 写入验收/变更包三件套（验收判定门槛）。 */
export function seedAcceptanceArtifacts(root: string, flowId = FLOW, riskTier = "T1"): void {
  write(root, `docs/acceptance/${flowId}-criteria-v1.md`, acceptanceCriteriaDoc(flowId));
  write(root, `docs/acceptance/${flowId}-report-v1.md`, acceptanceReportDoc(flowId, riskTier));
  write(root, `docs/scheduling/${flowId}-change-v1.md`, changePackageDoc(flowId, riskTier));
}

export function intentDoc(intentId = "intent-a", flowId = FLOW): string {
  return [
    "---",
    `intentId: ${intentId}`,
    "handoffKind: initial",
    "goal: 离线验收全自动治理链路",
    "scope: 临时目录、假模型",
    "acceptance: 四角色闭环",
    `flowId: ${flowId}`,
    "---",
    "",
    `# 意图 ${intentId}`,
    "",
    "客户原话摘录：「把四角色全自动链路跑绿。」",
    "",
  ].join("\n");
}

export function intentHandoffArgs(intentId = "intent-a"): Record<string, unknown> {
  return {
    intentId,
    handoffKind: "initial",
    goal: "离线验收全自动治理链路",
    scope: "临时目录、假模型",
    acceptance: "四角色闭环",
    summary: "为客户形成离线验收提案",
    flowId: FLOW,
  };
}

/**
 * 决策组判断的**前置意图种子**（2026-10-19 决策判断定位修正）：
 * 写 `docs/intents/<intentId>.md`（goal/scope/acceptance 齐全）并向账本追加
 * `customer.decision{decisionKind:"intent-confirm", accepted}` 与 `intent.handed-off`。
 *
 * 用于**从中段开始**的场景（提案/任命/验收卡直接出现，之前没有 Liaison 交接）。
 * 完整链路（i-full-chain）不调用本函数——那里由真实 `hand_off_intent` 产生交接账本。
 */
export async function seedConfirmedIntent(
  root: string,
  options: { intentId?: string; flowId?: string } = {},
): Promise<{ intentId: string; path: string }> {
  const intentId = options.intentId ?? "intent-a";
  const flowId = options.flowId ?? FLOW;
  const rel = `docs/intents/${intentId}.md`;
  write(root, rel, intentDoc(intentId, flowId));
  const at = new Date().toISOString();
  const confirmed = await appendGovernanceLedger(root, {
    at,
    kind: "customer.decision",
    flowId,
    actorRoleId: "liaison",
    power: "liaison",
    decisionKind: "intent-confirm",
    customerDecision: "accepted",
    decisionEvidence: { kind: "customer-input" },
    messageSummary: `需求确认 ${intentId}`,
  });
  if (!confirmed.ok) throw new Error(`意图确认账本种子失败：${confirmed.message}`);
  const handedOff = await appendGovernanceLedger(root, {
    at,
    kind: "intent.handed-off",
    flowId,
    actorRoleId: "liaison",
    power: "liaison",
    intentId,
    handoffKind: "initial",
    targetRoleId: "rapporteur",
  });
  if (!handedOff.ok) throw new Error(`意图交接账本种子失败：${handedOff.message}`);
  return { intentId, path: rel };
}

// —————————————————————— 脚本化角色适配器（跨多轮事件流） ——————————————————————

export interface ScriptContext {
  roleId: string;
  prompt: string;
  /** 本会话内的第几轮（1 起）。会话被 LRU 回收后重开会从 1 重新计——脚本应按 prompt 文本分支。 */
  turn: number;
}

export interface ToolResultRecord {
  roleId: string;
  turn: number;
  name: string;
  ok: boolean;
  message: string;
}

export interface AdapterOptions {
  root: string;
  scriptForRole?: (ctx: ScriptContext) => ToolCall[];
  onPrompt?: (ctx: ScriptContext) => void | Promise<void>;
  onResult?: (record: ToolResultRecord) => void;
}

function createEventQueue<T>(): { push(value: T): void; close(): void; stream: AsyncIterable<T> } {
  const buffer: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;
  return {
    push(value: T): void {
      const waiter = waiters.shift();
      if (waiter !== undefined) waiter({ value, done: false });
      else buffer.push(value);
    },
    close(): void {
      closed = true;
      for (const waiter of waiters.splice(0)) waiter({ value: undefined as unknown as T, done: true });
    },
    stream: {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next(): Promise<IteratorResult<T>> {
            if (buffer.length > 0) return Promise.resolve({ value: buffer.shift()!, done: false });
            if (closed) return Promise.resolve({ value: undefined as unknown as T, done: true });
            return new Promise((resolve) => waiters.push(resolve));
          },
        };
      },
    },
  };
}

/**
 * 自建假适配器：脚本 → 真实受治理工具 → 事件。与产品假适配器同语义，但把
 * `AdapterCapabilities` 的每个能力位原样透传给 `buildGovernedTools`（含 W6-A 两能力）。
 */
export function scriptedAdapterFactory(options: AdapterOptions): (gate: WriteGate, caps?: AdapterCapabilities) => RuntimeAdapter {
  return (gate, caps) => {
    let roleId = "";
    let turn = 0;
    let currentTurnId: string | undefined;
    return {
      async composeContext(): Promise<{ systemPrompt: string }> {
        return { systemPrompt: "" };
      },
      async bindRole(role): Promise<RoleSession> {
        roleId = role.id;
        const tools: ToolDefinition[] = buildGovernedTools(gate, {
          readRoot: options.root,
          writeRoot: options.root,
          currentTurnId: () => currentTurnId,
          roleId,
          runtime: caps?.runtime,
          ...(caps?.customerInput !== undefined ? { customerInput: caps.customerInput } : {}),
          ...(caps?.dispatchTask !== undefined ? { dispatchTask: caps.dispatchTask } : {}),
          ...(caps?.handOffIntent !== undefined ? { handOffIntent: caps.handOffIntent } : {}),
          ...(caps?.requestClarification !== undefined ? { requestClarification: caps.requestClarification } : {}),
          ...(caps?.reportHandback !== undefined ? { reportHandback: caps.reportHandback } : {}),
          ...(caps?.roleStatus !== undefined ? { roleStatus: caps.roleStatus } : {}),
          ...(caps?.sessionTail !== undefined ? { sessionTail: caps.sessionTail } : {}),
          ...(caps?.proposeRecovery !== undefined ? { proposeRecovery: caps.proposeRecovery } : {}),
          ...(caps?.installSkill !== undefined ? { installSkill: caps.installSkill } : {}),
          ...(caps?.uninstallSkill !== undefined ? { uninstallSkill: caps.uninstallSkill } : {}),
          ...(caps?.installMcp !== undefined ? { installMcp: caps.installMcp } : {}),
          ...(caps?.uninstallMcp !== undefined ? { uninstallMcp: caps.uninstallMcp } : {}),
          ...(caps?.shellGate !== undefined ? { shellGate: caps.shellGate } : {}),
          // 2026-10-20：Flow YAML 方法化后，内置治理角色经能力面获得 flow_get / flow_step_update /
          // flow_step_supersede；脚本适配器必须原样透传，否则工具不注册（测试假阴性）。
          ...(caps?.flowGet !== undefined ? { flowGet: caps.flowGet } : {}),
          ...(caps?.flowStepUpdate !== undefined ? { flowStepUpdate: caps.flowStepUpdate } : {}),
          ...(caps?.flowStepSupersede !== undefined ? { flowStepSupersede: caps.flowStepSupersede } : {}),
        });
        const byName = new Map(tools.map((tool) => [tool.name, tool]));
        const queue = createEventQueue<SessionEvent>();
        return {
          async prompt(text: string, _opts?: PromptOptions): Promise<void> {
            turn += 1;
            currentTurnId = `${roleId}-turn-${turn}`;
            const context: ScriptContext = { roleId, prompt: text, turn };
            await options.onPrompt?.(context);
            queue.push({ kind: "message", summary: `用户指令：${text}` });
            const script = options.scriptForRole?.(context) ?? [];
            for (const call of script) {
              queue.push({ kind: "tool_call", summary: `模型请求调用 ${call.name}`, detail: call });
              const tool = byName.get(call.name);
              if (tool === undefined) {
                queue.push({ kind: "denied", summary: `未知工具，拒绝执行：${call.name}`, detail: call });
                options.onResult?.({ roleId, turn, name: call.name, ok: false, message: "工具未注册" });
                continue;
              }
              const result = await tool.handler(call);
              options.onResult?.({ roleId, turn, name: call.name, ok: result.ok, message: result.message });
              queue.push({ kind: result.ok ? "accepted" : "denied", summary: result.message, detail: { call, result } });
            }
            queue.push({ kind: "settled", summary: "会话结束" });
          },
          events(): AsyncIterable<SessionEvent> {
            return queue.stream;
          },
          async dispose(): Promise<void> {
            queue.close();
          },
        };
      },
    };
  };
}

// —————————————————————— 判断桩（真实 driver + 假判断会话） ——————————————————————

interface ParsedJudgePrompt {
  group: string;
  cardKind: string;
  paths: string[];
  recommendedRoleIds?: string[];
  requiredReadPaths: string[];
}

function extractJsonAt(text: string, start: number): unknown {
  const opener = text[start];
  if (opener !== "[" && opener !== "{") return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[" || ch === "{") depth += 1;
    else if (ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function jsonAfterMarker<T>(text: string, marker: string): T | undefined {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const rest = text.slice(markerIndex + marker.length);
  const start = rest.search(/[[{]/);
  if (start < 0) return undefined;
  return extractJsonAt(rest, start) as T | undefined;
}

function parseJudgePrompt(prompt: string): ParsedJudgePrompt {
  const group = /^分组：(.*)$/m.exec(prompt)?.[1]?.trim() ?? "approval";
  const cardKind = /^卡种：(.*)$/m.exec(prompt)?.[1]?.trim() ?? "write";
  const paths = jsonAfterMarker<string[]>(prompt, "候选路径（应用从卡片预览中提取") ?? [];
  const recommendedRoleIds = jsonAfterMarker<string[]>(prompt, "应用解析的推荐集（selected 必须恰等于它）");
  const required: string[] = [];
  const header = "approve 前必须实际读取以下路径（judge_read_file；缺一即 manual；只含已存在物证）：";
  const headerIndex = prompt.indexOf(header);
  if (headerIndex >= 0) {
    const rest = prompt.slice(headerIndex + header.length).split("\n");
    for (const line of rest) {
      if (line.startsWith("- ")) required.push(line.slice(2).trim());
      else if (line.trim() !== "") break;
    }
  }
  return { group, cardKind, paths, ...(recommendedRoleIds !== undefined ? { recommendedRoleIds } : {}), requiredReadPaths: required };
}

export interface JudgeBehavior {
  /** 覆盖最终交回的原始参数；返回 undefined = 不交回（沉默，等超时）。 */
  reportFor?: (parsed: ParsedJudgePrompt) => unknown | undefined;
  /** 永不交回结论（超时路径）。 */
  silent?: boolean;
}

/** 默认 approve 参数：按卡种给出 selected/confirmed/pathDecisions + 可核对 evidence。 */
export function approveReport(parsed: ParsedJudgePrompt): Record<string, unknown> {
  const evidence = parsed.requiredReadPaths.length > 0 ? [parsed.requiredReadPaths[0]!] : ["应用事实：离线判断夹具"];
  if (parsed.cardKind === "appointment") {
    return {
      verdict: "approve",
      group: parsed.group,
      cardKind: parsed.cardKind,
      reason: "离线判断夹具：提名与推荐集一致，可正向代批。",
      evidence,
      selected: [...(parsed.recommendedRoleIds ?? [])],
    };
  }
  if (parsed.cardKind === "proposal" || parsed.cardKind === "acceptance") {
    return {
      verdict: "approve",
      group: parsed.group,
      cardKind: parsed.cardKind,
      reason: "离线判断夹具：物证已读、应用事实齐全，可正向代批。",
      evidence,
      selected: ["accept"],
    };
  }
  if (parsed.cardKind === "intent-confirm") {
    // 2026-10-20 客户「勾了替我决策就不用我管」：需求确认卡纳入 decision 组；
    // 判断只代批 confirm（revise 交回客户/发起角色）。
    return {
      verdict: "approve",
      group: parsed.group,
      cardKind: parsed.cardKind,
      reason: "离线判断夹具：需求确认卡可代批 confirm。",
      evidence,
      selected: ["confirm"],
    };
  }
  return {
    verdict: "approve",
    group: parsed.group,
    cardKind: parsed.cardKind,
    reason: "离线判断夹具：候选路径全部可核对，可正向代批。",
    evidence,
    confirmed: true,
    pathDecisions: parsed.paths.map((entry) => ({ path: entry, ok: true })),
  };
}

export function fakeJudgeFactory(behavior: JudgeBehavior = {}): RuntimeAdapterFactory {
  return (_gate, caps) => {
    let release: (() => void) | undefined;
    return {
      async composeContext(): Promise<{ systemPrompt: string }> {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return {
          async prompt(text: string): Promise<void> {
            const options = caps?.governanceJudge;
            if (options === undefined) throw new Error("治理判断能力未注入");
            if (behavior.silent === true) return;
            const parsed = parseJudgePrompt(text);
            const tools = new Map(buildGovernanceJudgeTools(options).map((tool) => [tool.name, tool]));
            for (const rel of parsed.requiredReadPaths) {
              await tools.get("judge_read_file")!.handler({ name: "judge_read_file", args: { path: rel } });
            }
            const raw = behavior.reportFor !== undefined ? behavior.reportFor(parsed) : approveReport(parsed);
            if (raw !== undefined) options.report(raw);
          },
          async *events(): AsyncIterable<{ kind: "settled"; summary: string }> {
            if (behavior.silent === true) {
              await new Promise<void>((resolve) => {
                release = resolve;
              });
              return;
            }
            yield { kind: "settled", summary: "判断会话结束" };
          },
          async abort(): Promise<void> {
            release?.();
          },
          async dispose(): Promise<void> {
            release?.();
          },
        };
      },
    };
  };
}

/** 真实 `createGovernanceJudge` + 假判断会话；可强制小超时（测试等待有界）。 */
export function judgeFactory(behavior: JudgeBehavior = {}, timeoutMs?: number): typeof createGovernanceJudge {
  return (opts) =>
    createGovernanceJudge({
      ...opts,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      createAdapter: fakeJudgeFactory(behavior),
    });
}

// —————————————————————— 桌面 Interface 测试台 ——————————————————————

export interface Harness {
  root: string;
  iface: DesktopInterface;
  channel: CustomerInputChannel;
  approvalSwitch: ShellJudgeSwitch;
  decisionSwitch: ShellJudgeSwitch;
  presented: OperatorRequestPayload[];
  judgeRows: OperatorJudgeResultPayload[];
  /**
   * 到达**原始客户通道**（编排 `guardedInput` 的 `raw`：桌面 session 包装后 → `channel.customerInput`）
   * 的请求记录（2026-10-22 无效治理卡守卫验证用；只读观测，不改任何行为）。
   * 守卫在调用 `raw` 之前拒绝时，本数组保持为空。
   */
  rawCustomerInputs: Array<{ roleId: string; kind: CustomerInputRequest["kind"] }>;
  /** 判断驱动函数被调用的次数（通道 `runJudge` 记录 `governance-judge.started` 后立即调用）。 */
  readonly judgeInvocations: number;
  /** 通道 request id 生成器的累计调用次数（守卫拒绝发生在通道之前 ⇒ 0）。 */
  readonly nextIdCalls: number;
  events: SessionEventEnvelope[];
  openRoles: string[];
  userOpened: string[];
  prompts: Map<string, string[]>;
  sends: Map<string, string[]>;
  results: ToolResultRecord[];
  promptContexts: Array<ScriptContext & { at: string }>;
  advanceResults: Array<Promise<GovernanceAdvanceResult>>;
  projectChanged: number;
  capsByRole: Map<string, Pick<AdapterCapabilities, "customerInput" | "dispatchTask" | "roleStatus" | "sessionTail">>;
  open(roleId: string): Promise<void>;
  send(roleId: string, text: string): Promise<{ ok: boolean; queued?: boolean; error?: string }>;
  answer(id: string, decision: OperatorDecisionPayload): void;
  waitFor(predicate: () => boolean, timeoutMs?: number): Promise<void>;
  waitForLedger(predicate: (entries: GovernanceLedgerEntry[], errors: string[]) => boolean, timeoutMs?: number): Promise<{ entries: GovernanceLedgerEntry[]; errors: string[] }>;
  stop(): Promise<void>;
  cleanup(): void;
}

export interface HarnessOptions {
  tag: string;
  approval?: boolean;
  decision?: boolean;
  runtime?: RuntimeKind;
  scriptForRole?: (ctx: ScriptContext) => ToolCall[];
  onPrompt?: (ctx: ScriptContext) => void | Promise<void>;
  judge?: JudgeBehavior;
  judgeTimeoutMs?: number;
  /** 已有的项目目录（省去新建）；缺省新建并 seed trio。 */
  root?: string;
  seedRoles?: string[];
  /**
   * 链式治理推进的目标事实轮询（2026-10-20 桌面 `governanceChainOptions` 的测试注入）。
   * 缺省短轮询（10ms / 3s / 10ms）：离线夹具的脚本轮次在毫秒级完成，短时限足够；
   * 若沿用产品默认（500ms / 15min）会在用例结束后仍持有轮询、把测试文件挂住。
   * 特殊场景可按需覆盖（如等待较慢的脚本轮次）。
   */
  governanceChain?: { pollIntervalMs?: number; timeoutMs?: number; settledGraceMs?: number };
}

export async function makeHarness(options: HarnessOptions): Promise<Harness> {
  const owned = options.root === undefined;
  const temp = owned ? makeRoot(options.tag) : { root: options.root!, cleanup: () => {} };
  const root = temp.root;
  if (owned) seedTrioProject(root, options.seedRoles ?? []);

  const approvalSwitch = createShellJudgeSwitch();
  const decisionSwitch = createShellJudgeSwitch();
  approvalSwitch.set({ enabled: options.approval === true });
  decisionSwitch.set({ enabled: options.decision === true });

  const presented: OperatorRequestPayload[] = [];
  const judgeRows: OperatorJudgeResultPayload[] = [];
  const events: SessionEventEnvelope[] = [];
  const openRoles: string[] = [];
  const userOpened: string[] = [];
  const prompts = new Map<string, string[]>();
  const sends = new Map<string, string[]>();
  const results: ToolResultRecord[] = [];
  const promptContexts: Array<ScriptContext & { at: string }> = [];
  const advanceResults: Array<Promise<GovernanceAdvanceResult>> = [];
  const capsByRole = new Map<string, Pick<AdapterCapabilities, "customerInput" | "dispatchTask" | "roleStatus" | "sessionTail">>();
  let projectChanged = 0;
  let iface: DesktopInterface | undefined;

  const recordPrompt = (ctx: ScriptContext): void => {
    const list = prompts.get(ctx.roleId) ?? [];
    list.push(ctx.prompt);
    prompts.set(ctx.roleId, list);
    promptContexts.push({ ...ctx, at: new Date().toISOString() });
  };

  let opSeq = 0;
  let nextIdCalls = 0;
  let judgeInvocations = 0;
  const rawCustomerInputs: Array<{ roleId: string; kind: CustomerInputRequest["kind"] }> = [];
  const channel = createCustomerInputChannel({
    operatorId: "test:客户",
    presenter: (payload) => {
      presented.push(payload);
    },
    nextId: () => {
      nextIdCalls += 1;
      return `op-${++opSeq}`;
    },
    onNextStep: (payload, context) => {
      const advancing = iface!.advanceGovernanceFlow({ payload, context });
      advanceResults.push(advancing);
    },
    judge: {
      isGroupEnabled: (group) => (group === "approval" ? approvalSwitch.isEnabled() : decisionSwitch.isEnabled()),
    },
    emitJudgeResult: (payload) => {
      judgeRows.push(payload);
      try {
        iface?.emitJudgeProgress(payload);
      } catch {
        /* 结果行进度只是展示面：失败不影响已完成的代批 */
      }
    },
  });

  const adapterFactory = scriptedAdapterFactory({
    root,
    onPrompt: (ctx) => {
      recordPrompt(ctx);
      return options.onPrompt?.(ctx);
    },
    onResult: (record) => results.push(record),
    ...(options.scriptForRole !== undefined ? { scriptForRole: options.scriptForRole } : {}),
  });

  // 观测「编排 guardedInput → 原始客户通道」的调用（2026-10-22 守卫验证）：
  // 守卫拒绝的卡不会到达这里；桌面 session 的镜像包装在本函数之上，因此计数与 presenter 无关。
  const observedCustomerInput: DesktopCustomerInputFn = (req, ctx, metadata) => {
    rawCustomerInputs.push({ roleId: ctx?.roleId ?? "", kind: req.kind });
    return channel.customerInput(req, ctx, metadata);
  };

  iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: (envelope) => events.push(envelope),
    emitProjectChanged: () => {
      projectChanged += 1;
    },
    listProjectFn: listProject,
    openRoleSessionFn: async (input, deps) => {
      openRoles.push(input.roleId);
      capsByRole.set(input.roleId, {
        ...(input.customerInput !== undefined ? { customerInput: input.customerInput } : {}),
        ...(input.dispatchTask !== undefined ? { dispatchTask: input.dispatchTask } : {}),
        ...(input.roleStatus !== undefined ? { roleStatus: input.roleStatus } : {}),
        ...(input.sessionTail !== undefined ? { sessionTail: input.sessionTail } : {}),
      });
      return openRoleSession(input, deps);
    },
    createRuntimeAdapterFactoryFn: () => adapterFactory,
    createPiAdapterFactoryFn: () => {
      throw new Error("端到端验收不得构造真实 Pi 适配器");
    },
    createDemoAdapterFn: () => {
      throw new Error("端到端验收不得构造 demo 适配器");
    },
    runtimeOptions: { modelId: "fixture-model" },
    customerInput: observedCustomerInput,
    createGovernanceJudgeFn: (judgeOptions) => {
      const invoke = judgeFactory(options.judge ?? {}, options.judgeTimeoutMs)(judgeOptions);
      return (request, signal) => {
        judgeInvocations += 1;
        return invoke(request, signal);
      };
    },
    // 2026-10-20：链式推进改为有界轮询目标事实；测试注入短轮询，避免 15min 默认定时器拖住测试文件。
    governanceChainOptions: options.governanceChain ?? { pollIntervalMs: 10, timeoutMs: 3000, settledGraceMs: 10 },
  });

  const runtime = options.runtime ?? "claude";
  await iface.listProject({ projectRoot: root });

  const harness: Harness = {
    root,
    iface,
    channel,
    approvalSwitch,
    decisionSwitch,
    presented,
    judgeRows,
    rawCustomerInputs,
    events,
    openRoles,
    userOpened,
    prompts,
    sends,
    results,
    promptContexts,
    advanceResults,
    capsByRole,
    projectChanged: 0,
    nextIdCalls: 0,
    judgeInvocations: 0,
    async open(roleId: string): Promise<void> {
      userOpened.push(roleId);
      const opened = await iface!.openSession({ projectRoot: root, roleId, runtime });
      if (opened.ok !== true) throw new Error(`打开会话失败：${roleId}（${opened.error ?? "未知原因"}）`);
    },
    async send(roleId: string, text: string) {
      const list = sends.get(roleId) ?? [];
      list.push(text);
      sends.set(roleId, list);
      return iface!.sendSession({ text, target: { projectRoot: root, roleId, runtime } });
    },
    answer(id, decision) {
      const result = channel.respond({ id, decision });
      if (result.ok !== true) throw new Error(`作答失败：${result.error ?? "未知原因"}`);
    },
    async waitFor(predicate, timeoutMs = 5000) {
      const started = Date.now();
      while (!predicate()) {
        if (Date.now() - started > timeoutMs) throw new Error("等待测试条件超时");
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    async waitForLedger(predicate, timeoutMs = 5000) {
      const started = Date.now();
      for (;;) {
        await flushGovernanceLedger(root);
        const snapshot = await readGovernanceLedger(root);
        if (predicate(snapshot.entries, snapshot.errors)) return { entries: [...snapshot.entries], errors: [...snapshot.errors] };
        if (Date.now() - started > timeoutMs) return { entries: [...snapshot.entries], errors: [...snapshot.errors] };
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    async stop() {
      await iface!.stopSession();
    },
    cleanup() {
      temp.cleanup();
    },
  };
  // projectChanged 以 getter 形式暴露实时值（对象字面量不便；改用 defineProperty）。
  Object.defineProperty(harness, "projectChanged", { get: () => projectChanged });
  Object.defineProperty(harness, "nextIdCalls", { get: () => nextIdCalls });
  Object.defineProperty(harness, "judgeInvocations", { get: () => judgeInvocations });
  return harness;
}

export async function seedLedger(root: string, entries: Array<Partial<GovernanceLedgerEntry>>): Promise<void> {
  for (const partial of entries) {
    const entry: GovernanceLedgerEntry = {
      at: new Date().toISOString(),
      kind: "customer.decision",
      actorRoleId: "rapporteur",
      power: "proposal",
      flowId: FLOW,
      ...partial,
    };
    const result = await appendGovernanceLedger(root, entry);
    if (!result.ok) throw new Error(`账本种子失败：${result.message}`);
  }
}

/** 账本快照（读一次）。 */
export function ledgerOf(root: string): ReturnType<typeof readGovernanceLedger> {
  return readGovernanceLedger(root);
}

/** 目录树快照（零写入证明用）。 */
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

/** 审批/决策卡请求的默认形态（channel 级矩阵测试用）。 */
export function cardFor(kind: "write" | "appointment-write" | "schedule-write" | "proposal" | "appointment" | "acceptance"): CustomerInputRequest {
  const flowId = FLOW;
  if (kind === "proposal") {
    return {
      kind: "choice",
      title: `提案 ${FLOW}`,
      cardKind: "proposal",
      flowId,
      options: [
        { id: "accept", label: "接受" },
        { id: "accept-quick", label: "快捷接受" },
        { id: "revise", label: "要求修改" },
        { id: "reject", label: "拒绝" },
      ],
    };
  }
  if (kind === "appointment") {
    return {
      kind: "choice",
      title: `任命 ${FLOW}`,
      cardKind: "appointment",
      flowId,
      multiple: true,
      options: [{ id: "executor", label: "Executor" }],
    };
  }
  if (kind === "acceptance") {
    return {
      kind: "choice",
      title: `验收 ${FLOW}`,
      cardKind: "acceptance",
      flowId,
      options: [
        { id: "accept", label: "通过" },
        { id: "reject", label: "不通过" },
      ],
    };
  }
  const paths = kind === "appointment-write" ? ["角色卡/executor/role-card.md", "角色卡/executor/boundary.yaml"] : kind === "schedule-write" ? [FLOW_REL] : [PROPOSAL_REL];
  return {
    kind: "confirm",
    title: `写盘确认 ${FLOW}`,
    cardKind: kind,
    flowId,
    // 2026-10-19 证据包/呈现前完整性闸契约：每条声明路径都要有可核对正文
    // （`## <路径>` 锚点 + 非空正文），不能多路径共用一段 `# 正文`。
    preview: [
      "将写入以下文件（逐路径正文）：",
      "",
      ...paths.flatMap((entry) => [`## ${entry}`, "", "正文：夹具声明的完整内容。", ""]),
    ].join("\n"),
  };
}

/** 构造一次判断所需的桌面上下文（与应用侧 `judgeContext` 同形；channel 级测试用）。 */
export function judgeContextFor(
  request: CustomerInputRequest,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const cardKind = request.cardKind ?? "write";
  const paths =
    request.kind === "confirm"
      ? Array.from(request.preview?.matchAll(/(?:docs|角色卡)\/[A-Za-z0-9_./-]+\.(?:md|yaml)/g) ?? []).map((match) => match[0])
      : [];
  const base: Record<string, unknown> = {
    flowId: FLOW,
    toolCallId: "tc-1",
    turnId: "turn-1",
    facts: {
      governanceModel: "trio",
      flowId: FLOW,
      ledgerErrors: 0,
      unresolvedClarificationCount: 0,
      latestDecisionKinds: [],
      ...(cardKind === "appointment-write" ? { appointmentTargetRoleIds: ["executor"] } : {}),
      ...(cardKind === "acceptance" ? { proposalDecision: "accepted", dispatchedStepIds: ["impl"] } : {}),
    },
    ...(request.kind === "confirm"
      ? {
          paths,
          pathProbes: paths.map((entry) => ({ path: entry, allowed: true })),
          allowedPathRoots: ["docs/proposals/", "docs/contracts/", "docs/flows/", "角色卡/"],
          forbiddenPaths: [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"],
        }
      : {}),
    ...(cardKind === "proposal" ? { artifacts: { proposalPath: PROPOSAL_REL } } : {}),
    ...(cardKind === "appointment" ? { artifacts: { nominationPath: NOMINATION_REL }, recommendedRoleIds: ["executor"] } : {}),
    ...(cardKind === "acceptance" ? { artifacts: { proposalPath: PROPOSAL_REL, flowPath: FLOW_REL } } : {}),
    ...(cardKind === "appointment-write" ? { artifacts: { nominationPath: NOMINATION_REL, flowPath: FLOW_REL } } : {}),
    ...(cardKind === "schedule-write" ? { artifacts: { flowPath: FLOW_REL } } : {}),
    ...overrides,
  };
  return base;
}

/** 判断结果对象（channel 级桩 fn 用）。 */
export function approveOutcome(request: GovernanceJudgeRequest): GovernanceJudgeOutcome {
  const confirm = request.card.kind === "confirm";
  return {
    verdict: "approve",
    group: request.group,
    cardKind: request.cardKind,
    reasonCode: "sufficient",
    reason: "离线桩判断：应用事实齐全。",
    engine: request.runtime,
    evidence: ["应用事实：离线桩"],
    ...(confirm
      ? {
          value: { confirmed: true },
          paths: request.paths,
          pathDecisions: (request.paths ?? []).map((entry) => ({ path: entry, ok: true })),
        }
      : { value: { selected: request.cardKind === "appointment" ? [...(request.recommendedRoleIds ?? [])] : ["accept"] } }),
    durationMs: 1,
    readCalls: 1,
    readBytes: 64,
  };
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
