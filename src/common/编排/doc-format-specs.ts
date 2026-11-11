// src/common/编排/doc-format-specs.ts
// 2026-11-09（document-format-specifications P1/P2，编排 B1 批）：每个文档格式的**权威说明**单一事实来源。
//
// 本文件是**稳定的公开只读入口**（与 workflow-preconditions.ts 同类：纯数据/纯渲染、无 I/O、无判定、
// 不读项目/run、不含角色或项目事实）。跨角色消费方（桌面会话 / 测试）只 import
// `docFormatIndexText`/`docFormatSpecText`/`DOC_FORMAT_SPECS`/`DOC_FORMAT_SPEC_VERSION`/`docFormatKnownIds`
// 与类型，不 import 任何 parser 私有实现。
//
// 内容口径（P1.2 §2.2/§2.3/§2.4）：
//   · A1–A25 角色/客户可写（或可读）文档；B1–B29 应用内部状态/事件；一行一 id，共 54 个。
//   · `enforcement:"validator"` = 真实解析器/校验器会拒绝；`enforcement:"convention"` = 仅写作约定，
//     校验器不强制（不得把约定写成硬校验，反之亦然）。
//   · `schemaLiteral` 单值；公开导出常量直接 import（不手写副本）；内联/无导出常量与跨角色私有常量
//     由本文件持有唯一副本，并由 owner pin 测试钉住（P1.2 §3.3 #3 三层策略）。
//   · modules/roster/topology（render 型）直接复用 `contractSchemaText` 同源原文，不重写字段表；
//     intent-entry 复用 `INTENT_ENTRY_TEMPLATE`/`INTENT_ENTRY_NAMING_RULE`/`INTENT_ENTRY_ID_RULE`。
//
// 纪律：本模块不 import `node:fs`、不 import `app/`/`service/`、不写盘；`docFormatSpecText` 对未知 id
// 返回纯文本（回显 ≤40 字符）；预算由测试实测（索引/详情 ≤8192 B，工具层另有防御性截断）。

import {
  PROJECT_MODULES_SCHEMA,
  PROJECT_MODULES_SCHEMA_EXAMPLE,
  PROJECT_PROPOSAL_SCHEMA,
  PROJECT_ROSTER_SCHEMA,
  PROJECT_ROSTER_SCHEMA_EXAMPLE,
  PROJECT_TOPOLOGY_SCHEMA,
  PROJECT_TOPOLOGY_SCHEMA_EXAMPLE,
  TEAM_PLAN_SCHEMA,
  contractSchemaText,
} from "./workflow-preconditions.ts";
import {
  RUN_ARCHITECTURE_SCHEMA,
  RUN_ASSETS_SCHEMA,
  RUN_CHANGE_SCHEMA,
  RUN_EVIDENCE_SCHEMA,
  RUN_INTENT_SCHEMA,
  RUN_SCHEMA,
} from "./run-manifest.ts";
import { CRITERIA_SCHEMA, EVIDENCE_META_SCHEMA } from "./evidence-check.ts";
import { CUSTOMER_DIRECTIVE_SCHEMA } from "../../model/directive.ts";
import { DOWNLOAD_REQUEST_SCHEMA } from "../../model/download.ts";
import { PROJECT_STATE_SCHEMA, VERSION_DECISION_SCHEMA } from "../../model/project-state.ts";
import {
  COMPLETE_SNAPSHOT_SCHEMA,
  TRUNK_AMENDMENT_SCHEMA,
  TRUNK_APPLY_JOURNAL_SCHEMA,
  TRUNK_MANIFEST_SCHEMA,
} from "../../model/trunk.ts";
import {
  DOC_FREEZE_SCHEMA,
  REFACTOR_REQUEST_SCHEMA,
  STABLE_WRITE_SCHEMA,
  VERSION_CHANGE_SCHEMA,
} from "../../model/version-change.ts";
import {
  INTENT_ENTRY_ID_RULE,
  INTENT_ENTRY_NAMING_RULE,
  INTENT_ENTRY_TEMPLATE,
} from "../shared/intent-entry-contract.ts";

/** 规范模块契约版本（工具输出头部可见；只在本模块结构/语义变化时升级）。 */
export const DOC_FORMAT_SPEC_VERSION = "doc-format-specs/v1" as const;

export type DocFormatAudience = "role-authored" | "convention" | "app-managed";

export interface DocFormatValidatorRef {
  kind: "strict-parser" | "shape-check" | "frontmatter-check" | "filename-only" | "convention";
  /** 仓库相对路径（convention 型可省略）。 */
  file?: string;
  /** 函数/常量名（convention 型可省略；实现以符号名锚定，行号只作参考）。 */
  symbol?: string;
  note?: string;
}

export type DocFormatPresence = "required" | "optional" | "conditional";

export interface DocFormatFieldSpec {
  /** 字段路径（如 "modules[].id"）。 */
  name: string;
  /** "string" | "正整数" | "string[]" | "对象" | "boolean" | "枚举" | "任意"。 */
  type: string;
  presence: DocFormatPresence;
  /** 校验器强制 vs 仅写作约定。 */
  enforcement: "validator" | "convention";
  constraints?: string;
  note?: string;
}

export interface DocFormatTestSeam {
  kind: "exported-pure" | "public-path-fixture" | "text-shape";
  symbol?: string;
  fixture?: string;
  note?: string;
}

export interface DocFormatSpec {
  id: string;
  title: string;
  audience: DocFormatAudience;
  stage: string;
  pathPattern: string;
  schemaLiteral?: string;
  schemaLiteralNote?: string;
  validator: DocFormatValidatorRef;
  fields: readonly DocFormatFieldSpec[];
  loadChecks?: readonly { code: string; rule: string }[];
  commonErrors: readonly { code: string; cause: string; fix: string }[];
  example?: string;
  exampleKind?: "full-document" | "frontmatter" | "block" | "object";
  render?: () => string;
  testSeam?: DocFormatTestSeam;
  specRevision: number;
}

export type DocFormatPart = "all" | "fields" | "example" | "errors";

const HEADER = `doc_format（只读；不构成放行/授权；${DOC_FORMAT_SPEC_VERSION}）`;
const REUSE_NOTE = "以下为 contract_check 同源原文（只读展示；本工具不构成放行/授权）";

const vf = (
  name: string,
  type: string,
  presence: DocFormatPresence,
  constraints?: string,
  note?: string,
): DocFormatFieldSpec => ({
  name,
  type,
  presence,
  enforcement: "validator",
  ...(constraints !== undefined ? { constraints } : {}),
  ...(note !== undefined ? { note } : {}),
});
const cf = (name: string, type: string, note?: string): DocFormatFieldSpec => ({
  name,
  type,
  presence: "optional",
  enforcement: "convention",
  ...(note !== undefined ? { note } : {}),
});
const err = (code: string, cause: string, fix = "按规范修正字段/枚举后重试") => ({ code, cause, fix });
const load = (code: string, rule: string) => ({ code, rule });

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
const HEX_C = "c".repeat(64);

const A1_EXAMPLE = [
  "---",
  "schema: project-intent/v1",
  "flowId: demo",
  "version: 1",
  "intentId: demo-intent",
  "---",
  "# 意图",
  "目标：交付一个可玩的小游戏。",
].join("\n");

const A2_EXAMPLE = [
  "---",
  "schema: project-proposal/v2",
  "flowId: demo",
  "version: 1",
  "intentId: demo-intent",
  "intent: docs/product/demo-intent-v1.md",
  "---",
  "# 提案（demo）",
  "意图：docs/product/demo-intent-v1.md",
].join("\n");

const A6_EXAMPLE = [
  "---",
  "schema: project-architecture/v1",
  "---",
  "# 架构（demo）",
  "proposal: docs/proposals/demo-proposal-v1.md",
].join("\n");

const A7_EXAMPLE = ["---", "schema: project-assets/v1", "---", "# 资产（demo）"].join("\n");

const A8_EXAMPLE = [
  "---",
  "schema: teamPlanSchema:3",
  "flowId: demo",
  "version: 1",
  "modules:",
  "  path: docs/proposals/demo-modules-v1.md",
  `  sha256: ${HEX_A}`,
  "roster:",
  "  path: docs/proposals/demo-roster-v1.md",
  `  sha256: ${HEX_B}`,
  "roleRows:",
  "  - roleId: implementer",
  "    modules: [core]",
  "    writesets: [src/]",
  "    dependsOn: []",
  "---",
  "# 团队计划（demo）",
].join("\n");

const A10_EXAMPLE = [
  "---",
  "schema: trunk-amendment/v1",
  "amendmentId: am-1",
  "flowId: demo",
  "docVersion: 1",
  "baseTrunk: null",
  "bootstrap: true",
  "items:",
  "  - itemId: add-contract",
  "    kind: contract",
  "    change: add",
  "    to: docs/contracts/demo-contract-v1.md",
  "---",
].join("\n");

const A11_EXAMPLE = [
  "```ans-criteria",
  "schema: ans-criteria/v1",
  "flowId: demo",
  "version: 1",
  "status: final",
  "criteria:",
  "  - id: AC-1",
  "    priority: P0",
  "    title: 启动后可完成一局",
  "```",
].join("\n");

const A12_EXAMPLE = JSON.stringify(
  {
    schema: "evidence-meta/v1",
    artifact: "docs/verification/demo-check.txt",
    sha256: HEX_C,
    bytes: 12,
    lines: 1,
    generatedAt: "2026-11-09T00:00:00.000Z",
  },
  null,
  2,
);

const A13_EXAMPLE = [
  "---",
  "intentId: demo-intent",
  "flowId: demo",
  "goal: 交付一个可玩的贪吃蛇小游戏",
  "scope: 单人、键盘控制、计分与重开",
  "acceptance: 启动后完成一局并正确计分",
  "nonGoals: 联机对战",
  "constraints: 仅桌面浏览器",
  "---",
  "# 意图",
  "目标：交付一个可玩的贪吃蛇小游戏。",
].join("\n");

const A15_EXAMPLE = ["# 工作流", "| 步骤 | 角色 | 交接物 | 完成口令 |", "| --- | --- | --- | --- |"].join("\n");

const A17_EXAMPLE = [
  "# 角色卡：实现者",
  "## 组别",
  "项目实施组",
  "## 工作立场",
  "按任务实现。",
  "## 能力描述",
  "TypeScript。",
  "## 职责与功能导航",
  "实现模块。",
  "## 必读资料",
  "模块清单。",
  "## 交接输入输出",
  "输入任务，输出报告。",
  "## 执行原则",
  "小步提交。",
  "## 质量职责",
  "自测。",
  "## 标准工作流",
  "读任务→实现→报告。",
  "## 交付物清单",
  "代码与报告。",
].join("\n");

const A18_EXAMPLE = [
  "# 边界：实现者",
  "## Section 1: 可修改文件与目录",
  "| 类型 | 路径 | 用途 |",
  "| --- | --- | --- |",
  "| directory | `src/` | 实现源码 |",
].join("\n");

const A19_EXAMPLE = [
  "role: impl",
  "entries:",
  "  - kind: directory",
  "    path: src/",
  "    purpose: 实现源码",
].join("\n");

const A20_EXAMPLE = [
  "# 技能安装登记",
  "- 用途：演示技能",
  "- 适用角色：product、rapporteur",
  "- 状态：installed",
  "- 安装日期：2026-11-09",
].join("\n");

const A21_EXAMPLE = [
  "# MCP 声明",
  "- 用途：演示 MCP",
  "- 启动：node",
  "- 参数：server.js | --stdio",
  "- 环境：DEMO=1; TOKEN=env:DEMO_TOKEN",
  "- 适用角色：product、rapporteur",
  "- 状态：installed",
  "- 安装日期：2026-11-09",
].join("\n");

const B1_EXAMPLE = JSON.stringify(
  {
    schema: "ans-run/v1",
    runId: "run-20261109-demo-a1b2c3d4",
    flowId: "demo",
    state: "draft",
    createdAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T00:00:00.000Z",
    schemas: { run: "ans-run/v1" },
    documents: {},
    execution: { teamPlan: null, flow: null },
  },
  null,
  2,
);

const B5_EXAMPLE = JSON.stringify(
  {
    schema: "trunk/v1",
    trunkVersion: 1,
    source: "bootstrap",
    previous: null,
    flowId: "demo",
    runId: null,
    artifacts: { documents: {}, execution: { teamPlan: null, flow: null }, boundaries: {} },
    digest: HEX_A,
    createdAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T00:00:00.000Z",
  },
  null,
  2,
);

const B6_EXAMPLE = JSON.stringify(
  {
    v: 1,
    schema: "trunk-apply-journal/v1",
    journalId: "journal-1",
    flowId: "demo",
    startedAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T00:00:00.000Z",
    phase: "prepared",
    target: {},
    before: {},
  },
  null,
  2,
);

const B7_EXAMPLE = JSON.stringify(
  {
    v: 1,
    schema: "trunk-amendment/v1",
    amendmentId: "am-1",
    flowId: "demo",
    status: "submitted",
    applyState: "idle",
  },
  null,
  2,
);

const B8_EXAMPLE = JSON.stringify(
  {
    schema: "doc-freeze/v1",
    applicationId: "migration",
    reason: "migrated-legacy",
    origin: "application",
    frozenAt: "2026-11-09T00:00:00.000Z",
  },
  null,
  2,
);

const B9_EXAMPLE = JSON.stringify(
  { v: 1, schema: "doc-freezes/v1", state: "ready", builtAt: "2026-11-09T00:00:00.000Z", entries: [] },
  null,
  2,
);

const B10_EXAMPLE = JSON.stringify(
  {
    schema: "complete-snapshot/v1",
    snapshotId: "snapshot-1",
    digest: HEX_A,
    createdAt: "2026-11-09T00:00:00.000Z",
    files: [{ path: "docs/workflow.md", sha256: HEX_B, bytesBase64: "aGk=" }],
  },
  null,
  2,
);

const B11_EXAMPLE = JSON.stringify(
  {
    v: 1,
    at: "2026-11-09T00:00:00.000Z",
    kind: "version.change",
    schema: "version-change/v1",
    applicationId: "vc-1",
    vcKind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: "demo",
    status: "submitted",
    origin: "application",
  },
  null,
  2,
);

const B12_EXAMPLE = JSON.stringify(
  {
    v: 1,
    at: "2026-11-09T00:00:00.000Z",
    kind: "stable.write.requested",
    schema: "stable-write/v1",
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    stableKind: "workflow",
    baseSha256: "",
    targetSha256: HEX_A,
    status: "requested",
    origin: "application",
  },
  null,
  2,
);

const B13_EXAMPLE = JSON.stringify(
  {
    v: 1,
    at: "2026-11-09T00:00:00.000Z",
    kind: "refactor.request",
    schema: "refactor-request/v1",
    requestId: "rf-1",
    flowId: "demo",
    initiatedBy: "convener",
    title: "整理模块",
    reason: "降低耦合",
    scope: { modules: [], paths: [], roles: [] },
    status: "requested",
    managedBy: "application-scheduler",
    enforcement: { writeSet: ["src/"], forbiddenKinds: [] },
  },
  null,
  2,
);

const B16_EXAMPLE = JSON.stringify(
  {
    v: 1,
    at: "2026-11-09T00:00:00.000Z",
    kind: "version.decision",
    schema: "version-decision/v1",
    decisionId: "decision-1",
    requestId: "request-1",
    flowId: "demo",
    reason: "需要新版本",
    attempt: 1,
    action: "version-modify",
    recommendedBy: "chief",
    recommendedAction: "version-modify",
    decidedBy: "customer",
    status: "executing",
  },
  null,
  2,
);

const B19_EXAMPLE = JSON.stringify(
  { v: 1, at: "2026-11-09T00:00:00.000Z", kind: "delegation.changed", roleId: "impl" },
  null,
  2,
);

const B26_EXAMPLE = JSON.stringify({
  v: 1,
  flowId: "demo",
  doc: "intent",
  version: 1,
  path: "docs/product/demo-intent-v1.md",
  sha256: HEX_A,
  recordedAt: "2026-11-09T00:00:00.000Z",
  event: "baseline",
  recordedBy: "app:session",
});

export const DOC_FORMAT_SPECS: readonly DocFormatSpec[] = Object.freeze([
  // ———————————————————— A 组：角色/客户可写（或可读）文档 ————————————————————
  {
    id: "project-intent/v1",
    title: "产品意图文档（意图确认门 / run pin / 意图入口链）",
    audience: "role-authored",
    stage: "意图",
    pathPattern: "docs/product/<flowId>-intent-vN.md",
    schemaLiteral: RUN_INTENT_SCHEMA,
    validator: {
      kind: "shape-check",
      file: "src/service/trunk/impl/apply-journal.ts",
      symbol: "prepareIntentConfirmation",
      note: "意图确认门必填 schema；run pin 层 run-manifest.ts schemaMatches 缺失不拒；意图入口链 intent-entry-contract.ts",
    },
    fields: [
      vf("schema", "string", "conditional", "字面量 project-intent/v1", "意图确认门必填；run pin 缺失不拒（分层口径）"),
      vf("flowId", "string", "optional", "给出即必须等于本次 flowId"),
      vf("version", "正整数", "optional", "给出即必须等于文件名 -vN 的 N"),
      cf("intentId", "string", "意图入口契约要求写小写 slug 并三处一致；确认门/pin 不校验（缺省回落 flowId）"),
      cf("正文", "任意", "目标/范围/验收/客户原话等为写作约定，解析器不校验"),
    ],
    loadChecks: [
      load("trunk-item-invalid", "意图确认门：schema/flowId/version 与实际文档不符即拒绝（卡不呈现）"),
      load("run-pin-schema-mismatch", "run pin：frontmatter schema 存在且 ≠ 期望"),
      load("intent-ambiguous", "意图入口链：产品意图/提案/入口文件名三处 intentId 不一致"),
    ],
    commonErrors: [
      err("trunk-item-invalid", "缺 schema 或 schema/flowId/version 与文档不符", "按样例补 schema: project-intent/v1，并核对 flowId/version"),
      err("run-pin-schema-mismatch", "frontmatter schema 写错", "schema 必须恰为 project-intent/v1"),
      err("intent-ambiguous", "intentId 与提案/入口文件名不一致", "三处原样复制同一 intentId"),
      err("intent-missing", "意图入口缺 goal/scope/acceptance", "补必填要素"),
    ],
    example: A1_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "project-proposal/v2",
    title: "产品提案文档（版本链 / 意图引用）",
    audience: "role-authored",
    stage: "提案",
    pathPattern: "docs/proposals/<flowId>-proposal-vN.md",
    schemaLiteral: PROJECT_PROPOSAL_SCHEMA,
    validator: {
      kind: "frontmatter-check",
      file: "src/common/编排/workflow-preconditions.ts",
      symbol: "loadLatestRoster",
      note: "roster 加载为字符串包含判定；upgrade/首建链 upgrade-validate.ts 为 frontmatter 解析；pin 层 schemaMatches",
    },
    fields: [
      vf("schema", "string", "required", "字面量 project-proposal/v2", "roster 加载为子串匹配；upgrade/pin 为 frontmatter 解析（分层口径）"),
      vf("intent", "string", "conditional", "完整版本化意图路径 docs/product/<flowId>-intent-vM.md", "首建/升级链 confirmedIntent 存在时必填且快照哈希匹配"),
      cf("intentId", "string", "意图入口契约要求写小写 slug；解析器缺省回落 flowId"),
      cf("flowId", "string", "写作约定；当前解析器不校验"),
      cf("version", "正整数", "写作约定；当前解析器不校验（文件名决定版本）"),
      vf("正文", "任意", "required", "正文必须出现 roster 声明的 intent 路径（机器链，字符串包含）"),
    ],
    loadChecks: [
      load("roster-reference-invalid", "roster 加载：提案文本不含字面 schema: project-proposal/v2"),
      load("roster-reference-inconsistent", "roster 加载：提案正文未引用名单 intent 路径"),
      load("trunk-item-invalid", "upgrade/首建链 schema 不符或 frontmatter intent 与已确认意图不一致"),
      load("run-pin-schema-mismatch", "run pin：frontmatter schema 存在且 ≠ 期望"),
    ],
    commonErrors: [
      err("roster-reference-invalid", "旧 v1 schema 或缺 schema 子串", "按 v2 重出提案"),
      err("roster-reference-inconsistent", "未引用名单 intent 路径", "在提案中写全 docs/product/<flowId>-intent-vM.md"),
      err("trunk-item-invalid", "首建 frontmatter intent 缺失/错误", "frontmatter intent 指向已确认意图路径"),
      err("run-pin-schema-mismatch", "schema 写错", "schema 必须恰为 project-proposal/v2"),
    ],
    example: A2_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "project-modules/v2",
    title: "模块清单（唯一权威源；roster modules[] 为其派生快照）",
    audience: "role-authored",
    stage: "提案",
    pathPattern: "docs/proposals/<flowId>-modules-vN.md",
    schemaLiteral: PROJECT_MODULES_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/workflow-preconditions.ts",
      symbol: "parseProjectModules",
      note: "加载期 loadLatestRoster 校验最新文件/版本/与 roster 逐项一致；loadPinnedRoster 校验 pinned 字节",
    },
    fields: [
      vf("schema", "string", "required", "字面量 project-modules/v2"),
      vf("flowId", "string", "required", "非空；与派发 flowId 一致"),
      vf("version", "正整数", "required", "= 文件名 -vN 的 N（加载期）"),
      vf("modules", "对象[]", "required", "数组 1–12 项；每项为对象"),
      vf("modules[].id", "string", "required", "2–64 小写 slug；唯一"),
      vf("modules[].name", "string", "required", "非空（trim 后）"),
      vf("modules[].purpose", "string", "required", "非空（trim 后）；别名 responsibility"),
      vf("modules[].category", "string", "required", "1–32 小写 slug（大小写不敏感判定）；env/entry 为保留类别"),
      vf("modules[].path", "string", "optional", "与 paths[0] 同时给出必须一致；路径项目相对、禁绝对/盘符/通配/空段/./.."),
      vf("modules[].paths", "string[]", "optional", "1–20 项；普通模块多路径仅 roster 层拒绝（分层口径）"),
      vf("modules[].publicContract", "string", "required", "非空字符串；不能写 YAML 布尔"),
      vf("modules[].architectureSource", "string", "required", "非空字符串；写作约定为项目相对路径（parser 不校验路径形状）"),
    ],
    loadChecks: [
      load("roster-modules-doc-missing", "roster 加载：最新 modules 文档缺失"),
      load("roster-modules-doc-invalid", "roster 加载：modules 文档不可解析或文件名版本不符"),
      load("roster-modules-drift", "roster 加载：roster modules[] 与 modules 文档逐项不一致"),
    ],
    commonErrors: [
      err("modules-doc-frontmatter", "非文本/缺 frontmatter/未闭合", "文件以 --- 开始并闭合"),
      err("modules-doc-yaml", "YAML 语法错误", "修正 YAML"),
      err("modules-doc-schema", "schema 错或缺 flowId", "schema 必须恰为 project-modules/v2"),
      err("modules-doc-flow", "flowId 与期望不一致", "与派发 flowId 一致"),
      err("modules-doc-version", "version 非正整数", "写正整数并与文件名一致"),
      err("modules-doc-modules", "modules 非 1–12 项数组/项非对象", "按样例"),
      err("modules-doc-id", "模块 id 非法/重复", "2–64 小写 slug 且唯一"),
      err("modules-doc-fields", "name/purpose/category/publicContract/architectureSource 缺失或非法", "全部非空字符串"),
      err("modules-doc-directory", "path/paths 非法或重叠", "项目相对、单路径（普通模块）"),
      err("modules-doc-overlap", "模块路径重叠/嵌套", "拆分目录"),
    ],
    render: () => contractSchemaText("modules"),
    specRevision: 1,
  },
  {
    id: "project-roster/v3",
    title: "项目名单（角色与模块归属；含拓扑图块；v3/v4 双字面量）",
    audience: "role-authored",
    stage: "名单",
    pathPattern: "docs/proposals/<flowId>-roster-vN.md",
    schemaLiteral: PROJECT_ROSTER_SCHEMA,
    schemaLiteralNote: "同时接受 project-roster/v3 与 project-roster/v4（v4 仅追加可选 roles[].review；不新增格式 id）",
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/workflow-preconditions.ts",
      symbol: "parseProjectRoster",
      note: "loadLatestRoster 加载链（版本/引用/拓扑）；loadPinnedRoster 校验 pinned 字节",
    },
    fields: [
      vf("schema", "string", "required", "字面量 project-roster/v3 或 project-roster/v4"),
      vf("flowId", "string", "required", "非空；与派发一致"),
      vf("version", "正整数", "required", "= 文件名 -vN 的 N"),
      vf("intent", "string", "required", "完整版本化意图路径（最新版）"),
      vf("proposal", "string", "required", "完整版本化提案路径（最新版）"),
      vf("architecture", "string", "required", "完整版本化架构路径（最新版）"),
      vf("modulesDoc", "string", "optional", "给出时必须指向最新 modules 文档（否则 roster-reference-stale）"),
      vf("envBootstrap", "对象", "optional", "omitted:boolean；true 时须非空 omissionReason 且不得含 env-bootstrap 角色或 env/entry 模块"),
      vf("modules", "对象[]", "required", "1–12 项；每项规则同 project-modules/v2，且普通模块 paths 恰 1 项（roster 层强制）"),
      vf("roles", "对象[]", "required", "1–12 项；每项为对象"),
      vf("roles[].id", "string", "required", "2–64 小写 slug；唯一；不得为内置 id（含 su/liaison）"),
      vf("roles[].displayName", "string", "required", "非空"),
      vf("roles[].purpose", "string", "required", "非空"),
      vf("roles[].capability", "string", "required", "非空"),
      vf("roles[].modules", "string[]", "required", "非空 string[]；引用已定义模块 id；角色内不重复"),
      vf("roles[].review", "boolean", "optional", "仅 v4；至多一个 true；该项目角色为验收角色（reviewRoleId，A12）；无标记默认内置 verifier；v3 出现即拒"),
      vf("正文", "任意", "required", "必须含「人员+模块拓扑图」章节 + ```topology 块，且与 frontmatter 完全一致"),
    ],
    loadChecks: [
      load("roster-missing", "最新 roster 缺失/不可读"),
      load("roster-version-invalid", "文件名版本与 frontmatter version 不一致"),
      load("roster-modules-doc-missing", "最新 modules 文档缺失/不可读"),
      load("roster-modules-doc-invalid", "modules 文档非法或文件名版本不符"),
      load("roster-modules-drift", "roster modules[] 与 modules 文档逐项不一致"),
      load("roster-reference-missing", "intent/proposal/architecture 缺失或为空"),
      load("roster-reference-stale", "引用非最新版本或 modulesDoc 未指向最新"),
      load("roster-reference-invalid", "proposal 不含 project-proposal/v2"),
      load("roster-reference-inconsistent", "proposal/architecture 正文未引用名单声明的版本路径"),
    ],
    commonErrors: [
      err("roster-frontmatter-missing", "缺 frontmatter/未闭合", "文件以 --- 开始并闭合"),
      err("roster-yaml-invalid", "YAML 非法", "修正 YAML"),
      err("roster-schema-invalid", "schema/flowId 非法或 envBootstrap 形状非法", "schema 必须为 project-roster/v3 或 project-roster/v4"),
      err("roster-flow-mismatch", "flowId 与期望不一致", "与派发 flowId 一致"),
      err("roster-version-invalid", "version 非正整数/与文件名不一致", "写正整数并与 -vN 一致"),
      err("roster-reference-invalid", "引用路径形状非法", "使用完整版本化路径"),
      err("roster-roles-invalid", "roles 非 1–12 项数组", "按样例"),
      err("roster-role-fields-missing", "角色 displayName/purpose/capability 缺失", "全部非空"),
      err("roster-role-id-invalid", "角色 id 非法", "小写 slug 2–64"),
      err("roster-role-modules-invalid", "角色 modules 缺失/重复/非字符串", "非空 string[]，引用已定义模块"),
      err("roster-role-review-invalid", "roles[].review 非法（非 boolean/多个 true/v3 出现）", "仅 v4 允许，至多一个 true"),
      err("roster-role-builtin", "角色 id 为内置治理角色", "项目角色不得占用内置 id"),
      err("roster-role-duplicate", "角色 id 重复", "唯一"),
      err("roster-role-without-module", "角色未绑定模块", "每角色至少一模块"),
      err("roster-module-id-invalid", "模块 id 非法/重复", "小写 slug 且唯一"),
      err("roster-modules-invalid", "modules 非 1–12 项数组", "按样例"),
      err("roster-module-fields-missing", "模块 name/purpose/category/publicContract/architectureSource 缺失", "全部非空字符串"),
      err("roster-module-directory-invalid", "path/paths 非法或普通模块多路径", "普通模块恰 1 路径"),
      err("roster-module-directory-governance", "模块路径落在治理写区", "改用项目源码目录"),
      err("roster-module-directory-overlap", "模块路径重叠/嵌套", "拆分目录"),
      err("roster-module-role-invalid", "角色绑定不存在模块", "先定义模块"),
      err("roster-module-owner-invalid", "env/entry 模块归属错误", "只能归 env-bootstrap"),
      err("roster-module-multi-owner", "模块多属主", "一模块一属主"),
      err("roster-module-unbound", "模块未绑定角色", "分配属主"),
      err("roster-directory-invalid", "目录引用非法", "项目相对路径"),
      err("roster-directory-governance", "目录落在治理区", "改用项目目录"),
      err("roster-directory-overlap", "目录重叠", "拆分"),
      err("roster-env-bootstrap-invalid", "envBootstrap 省略/固定模块不合法", "按 fixed 规则补 env-resources/entry-index"),
      err("roster-topology-missing", "缺拓扑图章节/块", "补「人员+模块拓扑图」"),
      err("roster-topology-invalid", "拓扑 YAML/形状非法", "按 project-topology/v2"),
      err("roster-topology-mismatch", "拓扑与 frontmatter 不一致", "按 frontmatter 重出拓扑"),
    ],
    render: () => contractSchemaText("roster"),
    specRevision: 1,
  },
  {
    id: "project-topology/v2",
    title: "人员+模块拓扑图块（roster 正文内唯一机器可读格式）",
    audience: "role-authored",
    stage: "名单",
    pathPattern: "docs/proposals/<flowId>-roster-vN.md#人员+模块拓扑图（```topology 块）",
    schemaLiteral: PROJECT_TOPOLOGY_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/workflow-preconditions.ts",
      symbol: "validateRosterTopology",
      note: "私有函数；经 parseProjectRoster 调用（同一校验）",
    },
    fields: [
      vf("schema", "string", "required", "字面量 project-topology/v2；旧 v1 不静默归一化"),
      vf("modules", "对象[]", "required", "数组；每项 id/path 或 paths/roleId"),
      vf("modules[].id", "string", "required", "非空"),
      vf("modules[].path", "string", "conditional", "与 paths 至少一项；路径项目相对"),
      vf("modules[].roleId", "string", "required", "非空"),
      vf("roles", "对象[]", "required", "数组；每项 id/modules（非空 string[]）"),
      vf("management", "string[]", "required", "扁平字符串数组；必须含 convener 与全部项目角色 id；不接受 mapping"),
    ],
    commonErrors: [
      err("roster-topology-missing", "无拓扑图章节/块", "在 roster 正文补章节与 ```topology 块"),
      err("roster-topology-invalid", "YAML/形状非法或缺 id/path/roleId", "按样例补全"),
      err("roster-topology-mismatch", "schema v1、缺 convener/角色、路径/属主/数量不一致", "与 frontmatter 完全一致"),
    ],
    example: PROJECT_TOPOLOGY_SCHEMA_EXAMPLE,
    exampleKind: "block",
    render: () => contractSchemaText("topology"),
    specRevision: 1,
  },
  {
    id: "project-architecture/v1",
    title: "架构文档（版本链：architecture→proposal）",
    audience: "role-authored",
    stage: "契约",
    pathPattern: "docs/contracts/<flowId>-architecture-vN.md",
    schemaLiteral: RUN_ARCHITECTURE_SCHEMA,
    validator: {
      kind: "frontmatter-check",
      file: "src/service/trunk/impl/upgrade-validate.ts",
      symbol: "validateUpgradeChain",
      note: "upgrade/版本链 schema 比对；roster 链要求正文含 proposal 路径；run pin schemaMatches 缺失不拒",
    },
    fields: [
      vf("schema", "string", "conditional", "字面量 project-architecture/v1", "upgrade/版本链必填；run pin 缺失不拒"),
      vf("正文", "任意", "required", "必须包含 roster 声明的 proposal 路径（机器链，字符串包含）"),
      cf("其余内容", "任意", "分层/模块/依赖方向/公开契约/数据流/扩展点为写作约定"),
    ],
    loadChecks: [
      load("trunk-item-invalid", "upgrade/版本链：schema 不符或正文未引用 proposal"),
      load("run-pin-schema-mismatch", "run pin：frontmatter schema 存在且 ≠ 期望"),
      load("roster-reference-inconsistent", "roster 加载：架构正文未引用名单 proposal 路径"),
    ],
    commonErrors: [
      err("trunk-item-invalid", "schema 缺失/错误或正文未引用 proposal", "补 schema 与 proposal 路径"),
      err("run-pin-schema-mismatch", "schema 写错", "schema 必须恰为 project-architecture/v1"),
      err("roster-reference-inconsistent", "正文缺 proposal 路径", "写全 docs/proposals/<flowId>-proposal-vM.md"),
    ],
    example: A6_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "project-assets/v1",
    title: "资产清单文档（可选存在）",
    audience: "role-authored",
    stage: "契约",
    pathPattern: "docs/contracts/<flowId>-assets-vN.md",
    schemaLiteral: RUN_ASSETS_SCHEMA,
    validator: {
      kind: "frontmatter-check",
      file: "src/common/编排/run-manifest.ts",
      symbol: "prepareRunPin",
      note: "存在则 schema 必须为字面量且 hash 可算；upgrade 文档集存在时同 schema 比对",
    },
    fields: [
      vf("schema", "string", "conditional", "字面量 project-assets/v1", "文档存在时必须；pin 层仅在给出 frontmatter schema 时校验"),
      cf("其余内容", "任意", "资产说明为写作约定"),
    ],
    loadChecks: [
      load("run-pin-schema-mismatch", "run pin：frontmatter schema 存在且 ≠ 期望"),
      load("run-pin-document-missing", "文档存在但不可读/哈希失败"),
      load("trunk-item-invalid", "upgrade 文档集 schema 不符"),
    ],
    commonErrors: [
      err("run-pin-schema-mismatch", "schema 写错", "schema 必须恰为 project-assets/v1"),
      err("run-pin-document-missing", "文件不可读", "确保文件存在且可读"),
    ],
    example: A7_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "team-plan/v3",
    title: "团队计划（执行计划；roleRows 写集与依赖）",
    audience: "role-authored",
    stage: "规划",
    pathPattern: "docs/scheduling/<flowId>-team-vN.md",
    schemaLiteral: TEAM_PLAN_SCHEMA,
    schemaLiteralNote: "文档字面量为 teamPlanSchema:3（不是斜杠 schema）；run pin 仅识别 -team-v1.md（既有事实）；固定路径 complete_team_plan v4 输入无 runId/baseDigest（出现即 baseline-legacy-field-forbidden），legacy 字段逐字保留",
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/workflow-preconditions.ts",
      symbol: "parseTeamPlan",
      note: "completeTeamPlan apply-journal.ts 复用；执行 prepare 读取",
    },
    fields: [
      vf("schema", "string", "required", "字面量 teamPlanSchema:3"),
      vf("flowId", "string", "required", "= 上下文 flowId"),
      vf("version", "正整数", "required", "= 路径 -vN 的 N"),
      vf("modules", "对象", "required", "{path,sha256} 恰等于当前授权基线（无多余键）"),
      vf("roster", "对象", "required", "{path,sha256} 恰等于当前名单（无多余键）"),
      vf("roleRows", "对象[]", "required", "数组长度 = roster 角色数；每角色恰一次"),
      vf("roleRows[].roleId", "string", "required", "唯一且在 roster 内"),
      vf("roleRows[].modules", "string[]", "required", "非空；与 roster 属主一致"),
      vf("roleRows[].writesets", "string[]", "required", "非空；在属主模块根内、无治理目录、互不重叠；每模块需具体写集"),
      vf("roleRows[].dependsOn", "string[]", "required", "可空数组；引用已定义角色且无环"),
      cf("正文", "任意", "计划说明为写作约定（不解析）"),
    ],
    loadChecks: [
      load("plan-structure-invalid", "结构/属主/写集/依赖/角色覆盖不合法"),
      load("plan-path-invalid", "路径不合法"),
      load("plan-base-conflict", "基线引用不一致"),
      load("plan-owner-invalid", "写集超出属主模块"),
      load("plan-hash-drift", "哈希漂移"),
      load("plan-identity-invalid", "身份/版本不一致"),
      load("run-pin-schema-mismatch", "run pin 时 -team-v1.md 存在但 schema 错"),
    ],
    commonErrors: [
      err("plan-structure-invalid", "结构/属主/写集/依赖非法", "按样例并对照 roster"),
      err("plan-path-invalid", "路径非法", "项目相对、版本与文件名一致"),
      err("plan-base-conflict", "modules/roster 引用不等于基线", "哈希取应用 project_state [versions]（sha256=）或 .ans/state/versions.jsonl，不得用 shell 计算/核验"),
      err("plan-owner-invalid", "writeset 超出属主模块根", "写集限定在属主模块根内"),
      err("plan-hash-drift", "哈希漂移", "按应用记录读取权威哈希（project_state [versions] / .ans/state/versions.jsonl），不得用 shell 计算"),
      err("plan-identity-invalid", "flowId/version 不一致", "与上下文一致"),
    ],
    example: A8_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "flow-yaml/v1",
    title: "流程 YAML（执行期 flow 引用）",
    audience: "role-authored",
    stage: "执行",
    pathPattern: "docs/flows/<flowId>.yaml",
    schemaLiteralNote: "无 schema 字段；仅校验非空 YAML 映射与 version 正整数",
    validator: {
      kind: "shape-check",
      file: "src/common/编排/run-manifest.ts",
      symbol: "prepareRunPin",
      note: "文件存在时必须非空、YAML 映射且 version 为正整数；其余字段不校验",
    },
    fields: [
      vf("version", "正整数", "required", "文件存在时必填且为正整数"),
      cf("其余字段", "任意", "不校验"),
    ],
    loadChecks: [
      load("run-pin-schema-mismatch", "flow 文件为空/YAML 非法/缺合法 version"),
      load("run-pin-document-missing", "flow 文件存在但 hash 计算失败"),
    ],
    commonErrors: [
      err("run-pin-schema-mismatch", "空文件、YAML 非法、缺/非法 version", "写 version: 1 且保持 YAML 映射"),
      err("run-pin-document-missing", "文件不可读", "确保存在且可读"),
    ],
    example: "version: 1\n",
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "trunk-amendment/v1",
    title: "主干修正案文档（frontmatter；状态文件共用 schema）",
    audience: "role-authored",
    stage: "修订",
    pathPattern: "docs/proposals/<flowId>-amendment-vN.md（frontmatter）；.ans/trunk/amendment.json（状态共用 schema）",
    schemaLiteral: TRUNK_AMENDMENT_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/service/trunk/impl/amendment-validate.ts",
      symbol: "validateDocShape",
      note: "validateAmendment/validateAmendmentState 复用；parseAmendmentSnapshot 以 allowNoop=true 校验快照（应用内部例外）",
    },
    fields: [
      vf("schema", "string", "required", "字面量 trunk-amendment/v1"),
      vf("amendmentId", "string", "required", "am-<n>"),
      vf("flowId", "string", "required", "= 提交 flowId"),
      vf("docVersion", "正整数", "required", "= 文件名 -vN 的 N"),
      vf("baseTrunk", "对象", "required", "{trunkVersion,runId,digest} 或 null；null 仅 bootstrap:true"),
      vf("bootstrap", "boolean", "optional", "baseTrunk:null 时必须为 true"),
      vf("summary", "string", "optional", "给出时必须为字符串"),
      vf("items", "对象[]", "required", "非空数组；提交/状态层至少一个 change != none（快照解析例外 allowNoop）"),
      vf("items[].itemId", "string", "required", "非空且唯一"),
      vf("items[].kind", "枚举", "required", "contract/roster/execution；workflow/boundary 明确拒绝"),
      vf("items[].change", "枚举", "required", "add/modify/none"),
      vf("items[].from", "string", "conditional", "modify 必填；路径规范"),
      vf("items[].to", "string", "required", "必填规范路径"),
      cf("items[].roleId", "string", "可选"),
      cf("items[].reason", "string", "可选"),
    ],
    loadChecks: [
      load("trunk-amendment-invalid", "schema/字段/路径/kind/change/版本/空 items 非法"),
      load("trunk-amendment-not-found", "修正案文档不存在"),
      load("trunk-item-invalid", "from/to 文件、基线或哈希不可用"),
    ],
    commonErrors: [
      err("trunk-amendment-invalid", "schema/字段/路径/kind/change/版本/items 非法", "按样例修正"),
      err("trunk-amendment-conflict", "修正案状态/并发冲突", "重新读取当前修正案状态后重试"),
      err("trunk-amendment-not-found", "文档缺失", "按路径写文档"),
      err("trunk-item-invalid", "to 文件不存在或 from 基线不可用", "先写 to 文件并核对基线"),
    ],
    example: A10_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "ans-criteria/v1",
    title: "验收标准块（文件内唯一 ```ans-criteria 块）",
    audience: "role-authored",
    stage: "验收",
    pathPattern: "docs/acceptance/<flowId>-criteria-vN.md（唯一 ```ans-criteria 块）",
    schemaLiteral: CRITERIA_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/evidence-check.ts",
      symbol: "parseCriteriaText",
      note: "loadCriteria 按显式 ref 加载并要求 status=final",
    },
    fields: [
      vf("schema", "string", "required", "字面量 ans-criteria/v1"),
      vf("flowId", "string", "required", "小写 slug"),
      vf("version", "正整数", "required", "= 文件名 -vN 的 N"),
      vf("status", "枚举", "required", "final/draft；加载要求 final"),
      vf("criteria", "string[]", "required", "1–500 项"),
      vf("criteria[].id", "string", "required", "canonical AC-n 或 Pn.m；唯一"),
      vf("criteria[].priority", "枚举", "required", "P0/P1/P2/P3"),
      vf("criteria[].title", "string", "optional", "字符串"),
    ],
    loadChecks: [
      load("criteria-format-missing", "文件没有 ans-criteria block"),
      load("criteria-format-ambiguous", "多个 ans-criteria block"),
      load("criteria-parse-failed", "block 未闭合/YAML 分隔符/锚点/YAML 非法"),
      load("criteria-schema-invalid", "顶层/条目字段或枚举非法"),
      load("criteria-version-mismatch", "version 与文件名/ref 不一致"),
      load("criteria-ref-mismatch", "flowId/ref 不一致"),
      load("criteria-empty", "criteria 为空"),
      load("criteria-too-many", "criteria 超过 500 条"),
      load("criteria-id-invalid", "AC id 非法"),
      load("criteria-priority-invalid", "priority 非法"),
      load("criteria-duplicate-ac", "AC id 重复"),
      load("criteria-status-draft", "加载时 status 仍为 draft"),
      load("criteria-missing", "criteriaRef 文件不可读"),
      load("criteria-version-unresolved", "缺少显式 criteriaRef"),
    ],
    commonErrors: [
      err("criteria-format-missing", "无 ans-criteria block", "在文件内加唯一 ```ans-criteria 块"),
      err("criteria-schema-invalid", "schema/flowId/status/未知字段非法", "按样例并移除未知键"),
      err("criteria-version-mismatch", "version 非正整数或 ≠ 文件名 N", "写正整数并与 -vN 一致"),
      err("criteria-id-invalid", "AC id 非 AC-n/Pn.m", "使用 canonical id"),
      err("criteria-priority-invalid", "priority 非 P0–P3", "使用 P0/P1/P2/P3"),
      err("criteria-status-draft", "加载时 status=draft", "定稿后改 final"),
      err("criteria-mismatch", "被检查 AC 不在 criteria 中/sidecar acIds 未覆盖", "在 criteria 中定义该 AC 并让 sidecar acIds 包含它"),
    ],
    example: A11_EXAMPLE,
    exampleKind: "block",
    specRevision: 1,
  },
  {
    id: "evidence-meta/v1",
    title: "证据 sidecar（<artifact>.meta.json）",
    audience: "role-authored",
    stage: "验收",
    pathPattern: "证据旁 <artifact>.meta.json（单文件或 collection）",
    schemaLiteral: EVIDENCE_META_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/evidence-check.ts",
      symbol: "parseEvidenceMeta",
      note: "check/collection 语义（hash/bytes/lines/mtime/acIds 与实际比对）在同文件 373–529",
    },
    fields: [
      vf("schema", "string", "required", "字面量 evidence-meta/v1"),
      vf("artifact", "string", "required", "单文件形状；项目相对路径"),
      vf("sha256", "string", "required", "单文件形状；与实际一致"),
      vf("bytes", "正整数", "required", "与实际一致"),
      vf("lines", "正整数", "required", "与实际一致"),
      vf("generatedAt", "string", "required", "不得早于文件 mtime（≤1000ms 容差）"),
      cf("collection", "对象[]", "collection 形状：给出数组时每项 artifact/sha256/bytes/lines；非数组值被忽略（parse 层不拒绝）"),
      cf("command", "string", "可选审计信息"),
      cf("exitCode", "正整数", "可选审计信息"),
      cf("metrics", "对象", "可选指标"),
      cf("acIds", "string[]", "parse 层不校验；check/collection 语义层要求包含被检查 AC"),
      cf("owner", "string", "可选"),
    ],
    loadChecks: [
      load("evidence-mismatch", "sidecar 声明与实际 bytes/lines/sha256/mtime 不一致"),
      load("evidence-path-invalid", "绝对路径/../.ans/.env 等非法路径"),
      load("evidence-scope-denied", "不在调用角色模块证据范围"),
    ],
    commonErrors: [
      err("evidence-mismatch", "hash/bytes/lines/generatedAt 不符", "重新生成 sidecar"),
      err("evidence-path-invalid", "路径非法", "使用项目相对、非 .ans/.env 路径"),
      err("evidence-scope-denied", "超出模块证据范围", "放到调用角色模块目录"),
    ],
    example: A12_EXAMPLE,
    exampleKind: "object",
    specRevision: 1,
  },
  {
    id: "intent-entry/v1",
    title: "意图入口文档（docs/intents/<intentId>.md）",
    audience: "role-authored",
    stage: "意图入口",
    pathPattern: "docs/intents/<intentId>.md",
    schemaLiteralNote: "无 schema 字段；frontmatter 键与 intentId 命名规则界定",
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/governance-judge-intent.ts",
      symbol: "summarizeIntent",
      note: "入口解析/一致性在 intent-entry-contract.ts（唯一解析器）",
    },
    fields: [
      vf("intentId", "string", "optional", "小写 slug（GOVERNANCE_SLUG_PATTERN）；给出必须与定位结果一致", "judge 实际只在非空时校验"),
      vf("flowId", "string", "optional", "给出必须与请求 flowId 一致"),
      vf("goal", "string", "required", "非空（行式解析：YAML null 读作文本，缺省/空串为缺失）"),
      vf("scope", "string", "required", "非空（同上：null 读作文本）"),
      vf("acceptance", "string", "required", "非空（同上：null 读作文本）"),
      cf("nonGoals", "string", "可选；别名 non_goals/non-goals/nonGoal/outOfScope 等"),
      cf("constraints", "string", "可选"),
      cf("customerWords", "string", "可选；别名 customer_words/customerQuote 等"),
      cf("正文", "任意", "目标/范围/验收/非目标/客户原话章节为写作约定；judge 按标题关键词摘录"),
    ],
    commonErrors: [
      err("intent-missing", "frontmatter 不可解析或缺 goal/scope/acceptance", "补必填要素"),
      err("intent-ambiguous", "文件 intentId/flowId 与定位不一致", "三处使用同一 intentId 与 flowId"),
      err("intent-unconfirmed", "intentId 非 slug/三处不一致", "按命名规则重写"),
    ],
    example: A13_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "quality-report/v1",
    title: "质量复核报告（分层：git 严格层 git-quality-report/v1 + 展示/摘录层）",
    audience: "role-authored",
    stage: "验收",
    pathPattern: "docs/quality/<flowId>-report-vN.md",
    schemaLiteral: "git-quality-report/v1",
    schemaLiteralNote: "严格层 schema 字面量；展示层无 schema 字段——两层不得互相冒充",
    validator: {
      kind: "strict-parser",
      file: "src/service/trunk/impl/apply-journal.ts",
      symbol: "readTextQualityProof",
      note: "严格层无导出纯校验器（服务级）；展示层 project-state.ts 仅文件名/版本扫描 + governance-judge-evidence.ts 摘录",
    },
    fields: [
      vf("schema", "string", "required", "严格层：字面量 git-quality-report/v1"),
      vf("version", "正整数", "optional", "严格层：给出即必须等于文件名 N"),
      vf("taskId", "string", "required", "严格层：与当前复核任务一致"),
      vf("runId", "string", "required", "严格层：与当前复核任务一致"),
      vf("flowId", "string", "required", "严格层：与当前复核任务一致"),
      vf("candidateOperationId", "string", "required", "严格层：与冻结复核基准一致"),
      vf("candidate", "对象", "required", "严格层：与冻结复核基准 canonical 相等"),
      vf("criteria", "string[]", "required", "严格层：与冻结复核基准相等；须单一 criterion"),
      vf("checks", "string[]", "required", "严格层：恰 1 项 {assertion:nonempty-utf8, artifact:{oid,path,sha256}}"),
      cf("报告首行/章节", "任意", "展示层：首行五项摘录与结论/证据/回归等章节为写作约定（不解析字段）"),
    ],
    loadChecks: [
      load("review-quality-report-missing", "证据集合中没有唯一 canonical quality 报告"),
      load("review-quality-binding-invalid", "schema/键集/绑定字段不符或含 secret"),
      load("review-quality-execution-unproven", "criteria 非单一文本物证"),
      load("review-quality-scope-unproven", "集成不是恰一文件文本变更"),
      load("review-quality-checks-missing", "checks 缺失或非 1 项"),
      load("review-quality-check-invalid", "check 断言/artifact 形状不符"),
      load("review-quality-content-mismatch", "blob/hash/非空 UTF-8 断言失败"),
    ],
    commonErrors: [
      err("review-quality-report-missing", "未命名 canonical docs/quality/<flowId>-report-vN.md", "在证据中写该路径"),
      err("review-quality-binding-invalid", "键集/绑定字段不符", "按严格层键集重写并绑定任务"),
      err("trunk-item-invalid", "严格层所有拒绝统一经 invalid() 返回", "修正后重试"),
    ],
    testSeam: {
      kind: "text-shape",
      note: "严格层无导出纯校验器：源码文本钉住键集/错误码（apply-journal.ts），不宣称纯校验器正例",
    },
    specRevision: 1,
  },
  {
    id: "workflow/v1",
    title: "稳定工作流文档（docs/workflow.md）",
    audience: "convention",
    stage: "执行",
    pathPattern: "docs/workflow.md（稳定文件名，不版本化）",
    schemaLiteralNote: "无 schema 字段；内容不解析，绑定由 trunk/v1 的 artifacts.workflow 表达",
    validator: {
      kind: "convention",
      file: "src/model/trunk.ts",
      symbol: "hasExecutionWorkflow",
      note: "内容无结构解析器；执行 trunk 的 artifacts.workflow 绑定由 trunk/v1（B5）与 prepareExecutionRun 校验",
    },
    fields: [
      cf("步骤表", "任意", "步骤/角色/前置依赖/契约/交接物/完成口令/验收为写作约定"),
      cf("内容", "任意", "稳定文件不版本化；stable 写入需当刻确认"),
    ],
    loadChecks: [
      load("trunk-item-invalid", "执行 trunk：artifacts.workflow 必须为 kind=workflow + docs/workflow.md + sha256"),
    ],
    commonErrors: [
      err("trunk-item-invalid", "执行 trunk 缺 workflow 引用", "stable 发布 docs/workflow.md 并写入 trunk 引用"),
    ],
    example: A15_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "contract-md/v1",
    title: "契约文档（版本化冻结；派发必读）",
    audience: "convention",
    stage: "契约",
    pathPattern: "docs/contracts/<name>-vN.md",
    schemaLiteralNote: "无 schema 字段；版本由文件名 -vN 表达",
    validator: {
      kind: "convention",
      file: "src/common/编排/handback.ts",
      symbol: "handbackRequiredReading",
      note: "无 schema、无结构解析；版本化冻结由 versioned-doc-guard.ts 管",
    },
    fields: [
      cf("内容", "任意", "跨角色冻结契约；按地址引用并附运行期哈希"),
      cf("版本", "任意", "文件名 -vN；旧版只读"),
    ],
    commonErrors: [],
    specRevision: 1,
  },
  {
    id: "role-card/v1",
    title: "项目角色卡（三文件规范路径 + 10 必填章节）",
    audience: "role-authored",
    stage: "角色",
    pathPattern: "角色卡/<roleId>/role-card.md（与 boundary.md/boundary.yaml 同目录）",
    schemaLiteralNote: "无 schema 字段；格式由三文件规范路径与 10 个必填章节标题界定",
    validator: {
      kind: "shape-check",
      file: "src/common/门禁引擎/boundary-core.ts",
      symbol: "validateRoleDocumentsSnapshot",
      note: "parseSnapshotRoleDocuments 校验三文件路径/10 章节/边界恒等；ROLE_CARD_REQUIRED_SECTIONS 在 governance-roles.ts",
    },
    fields: [
      vf("路径", "string", "required", "恰为 角色卡/<roleId>/role-card.md、boundary.md、boundary.yaml"),
      vf("章节", "string", "required", "10 个必填章节：组别/工作立场/能力描述/职责与功能导航/必读资料/交接输入输出/执行原则/质量职责/标准工作流/交付物清单（任一 #{1,6} 空白 行匹配）"),
      vf("boundary 恒等", "boolean", "required", "boundary.md Section 1 条目集合必须与 boundary.yaml 排序后恒等"),
      vf("archived", "boolean", "optional", "boundary.yaml archived:true ⇒ frozen-role-archived 拒绝"),
      cf("title/展示字段", "任意", "首个 H1 为 title、能力描述等展示摘录为展示层（不拒绝）"),
    ],
    commonErrors: [
      err("role-document-path-mismatch", "三文件路径不规范", "使用 角色卡/<roleId>/ 固定路径"),
      err("role-card-section-missing:<label>", "缺少必填章节", "补齐 10 章节标题"),
      err("invalid-project-role-id", "角色 id 非法或为内置保留", "使用合法项目角色 id"),
      err("boundary-role-mismatch", "boundary.yaml role 标签与目录 id 不一致", "role: 写目录 id"),
      err("boundary-md-yaml-mismatch", "boundary.md 与 boundary.yaml 条目不一致", "两份同步"),
      err("invalid-role-boundary-scope", "条目 root≠project 或为条件目录/非法路径", "项目根普通文件/目录"),
      err("boundary-outside-role-modules", "条目超出授模块范围", "限定在模块目录内"),
      err("duplicate-or-unscoped-role", "角色重复或无允许路径", "每角色至少一个 allowedPath"),
      err("module-owner-overlap", "模块范围重叠", "一模块一属主"),
      err("frozen-role-archived", "角色目录已归档", "不启用归档角色"),
    ],
    example: A17_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "boundary-md/v1",
    title: "边界 Markdown（Section 1 表格）",
    audience: "role-authored",
    stage: "角色",
    pathPattern: "角色卡/<roleId>/boundary.md",
    schemaLiteralNote: "无 schema 字段；格式由 Section 1 表格与 boundary.yaml 恒等界定",
    validator: {
      kind: "shape-check",
      file: "src/common/门禁引擎/boundary-core.ts",
      symbol: "parseSnapshotRoleDocuments",
      note: "表格解析在 boundary-parse.ts（宽松跳过）；条目集合与 boundary.yaml 恒等（boundary-md-yaml-mismatch）",
    },
    fields: [
      vf("Section 1 标题", "string", "required", "标题含 Section 1 或 可修改文件与目录"),
      vf("类型列", "枚举", "required", "file/directory/条件目录（中英文关键词）；不可识别行跳过"),
      vf("路径列", "string", "required", "优先反引号；项目相对；条件目录必须给合法 condition slug"),
      cf("用途列", "string", "用途为展示信息；条目恒等比较不含 purpose"),
    ],
    commonErrors: [
      err("boundary-md-yaml-mismatch", "条目集合与 boundary.yaml 不一致", "两份同步（root/kind/path/condition）"),
    ],
    example: A18_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "boundary-yaml/v1",
    title: "边界 YAML（严格键集/枚举）",
    audience: "role-authored",
    stage: "角色",
    pathPattern: "角色卡/<roleId>/boundary.yaml",
    schemaLiteralNote: "无版本字段；顶层 version 是显式错误",
    validator: {
      kind: "strict-parser",
      file: "src/common/门禁引擎/boundary-yaml.ts",
      symbol: "validateBoundaryYamlText",
      note: "写前校验与运行时加载共用 parseBoundaryYamlDoc（单一来源）",
    },
    fields: [
      vf("role", "string", "required", "非空；与目录角色 id 一致"),
      vf("entries", "string[]", "required", "数组；每条只允许 kind/path/purpose/root/condition"),
      vf("entries[].kind", "枚举", "required", "file/directory/conditional-directory"),
      vf("entries[].path", "string", "required", "非空；项目相对"),
      vf("entries[].purpose", "string", "required", "非空"),
      vf("entries[].root", "枚举", "optional", "project/skill；缺省 project"),
      vf("entries[].condition", "string", "conditional", "conditional-directory 必须合法 condition slug"),
      vf("archived", "boolean", "optional", "必须 boolean；true 表示冻结归档"),
    ],
    commonErrors: [
      err("YAML 语法错误", "YAML 不可解析", "修正 YAML"),
      err("顶层必须是映射", "顶层非 mapping", "使用 key: value 映射"),
      err("未知顶层键", "roleId/version/root 等顶层键", "顶层只允许 role/entries/archived"),
      err("entries[i] 未知键/kind/path/purpose/root/condition 非法", "条目字段不合法", "按允许键集与枚举修正"),
      err("archived 必须是布尔值", "archived 写成字符串", "写 true/false"),
    ],
    example: A19_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "skill-install/v1",
    title: "技能安装登记（docs/skills/<name>/install.md）",
    audience: "role-authored",
    stage: "安装",
    pathPattern: "docs/skills/<name>/install.md + SKILL.md",
    schemaLiteralNote: "无 schema/版本字段；四字段登记行界定",
    validator: {
      kind: "shape-check",
      file: "src/common/编排/installed-skills.ts",
      symbol: "readSkillRegistration",
      note: "渲染器 renderInstalledSkillsSection 同源判据；坏件跳过不拒会话",
    },
    fields: [
      vf("用途", "string", "required", "非空"),
      vf("适用角色", "string[]", "required", "以 、/，/, 分隔；非空"),
      vf("状态", "枚举", "required", "installed/uninstalled"),
      vf("安装日期", "string", "required", "首个 YYYY-MM-DD"),
      cf("SKILL.md", "任意", "渲染期存在性/digest 检查；缺失则跳过该条（不拒会话）"),
    ],
    commonErrors: [
      err("registration-missing", "install.md 缺失", "按四字段写登记"),
      err("registration-parse-failed", "四字段缺失/为空或状态值未知", "补全四字段且状态用已知值"),
      err("name-invalid", "目录名空/含控制字符", "使用稳定 slug"),
    ],
    example: A20_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "mcp-declaration/v1",
    title: "MCP 声明（docs/mcp/<name>.md）",
    audience: "role-authored",
    stage: "安装",
    pathPattern: "docs/mcp/<name>.md",
    schemaLiteralNote: "无 schema/版本字段；七键声明行界定",
    validator: {
      kind: "shape-check",
      file: "src/common/runtime-core/mcp-declarations.ts",
      symbol: "readMcpDeclaration",
      note: "listInstalledMcpServers 同源；坏件跳过 + 诊断",
    },
    fields: [
      vf("用途", "string", "required", "非空"),
      vf("启动", "string", "required", "非空；无控制字符"),
      vf("参数", "string[]", "optional", "|/｜ 分隔"),
      vf("环境", "对象", "optional", "; / ； 分隔 NAME=值；值字面量或 env:NAME；! 开头拒"),
      vf("适用角色", "string[]", "required", "、/，/, 分隔；非空"),
      vf("状态", "枚举", "required", "installed/uninstalled"),
      vf("安装日期", "string", "required", "首个 YYYY-MM-DD"),
    ],
    loadChecks: [
      load("name-invalid", "名字符集非 [A-Za-z0-9_-]+"),
      load("reserved-name", "名字为 ans/ans_codex"),
      load("declaration-missing", "声明文件缺失"),
      load("declaration-parse-failed", "必填缺失/非法/env 值非法/状态未知"),
    ],
    commonErrors: [
      err("declaration-missing", "声明文件缺失", "按七键写 docs/mcp/<name>.md"),
      err("declaration-parse-failed", "必填字段/环境项/状态非法", "按七键修正"),
      err("reserved-name", "使用保留名", "改名"),
    ],
    example: A21_EXAMPLE,
    exampleKind: "full-document",
    specRevision: 1,
  },
  {
    id: "change-package/v1",
    title: "历史变更包（legacy；仅摘录）",
    audience: "convention",
    stage: "验收",
    pathPattern: "docs/scheduling/<flowId>-change-v1.md",
    schemaLiteralNote: "无 schema 字段；legacy 摘录（riskTier/candidate/changedPaths）",
    validator: {
      kind: "convention",
      file: "src/common/编排/governance-judge-evidence.ts",
      symbol: "extractEvidenceExcerpts",
      note: "无校验器；判断物证摘录 frontmatter（riskTier/candidate/changedPaths）与关键词章节",
    },
    fields: [
      cf("frontmatter", "对象", "riskTier/candidate/changedPaths 为摘录"),
      cf("章节", "任意", "候选/档位/证据章节为写作约定"),
    ],
    commonErrors: [],
    specRevision: 1,
  },
  {
    id: "role-change-record/v1",
    title: "角色变更/修复记录（应用不读取）",
    audience: "convention",
    stage: "角色",
    pathPattern: "角色卡/<role>/docs/change/、角色卡/<role>/docs/fix/",
    schemaLiteralNote: "无 schema/版本约束；应用不读取",
    validator: { kind: "convention", note: "无解析器；边界授予目录；应用不读取/不校验" },
    fields: [cf("内容", "任意", "变更/修复记录；建议日期前缀")],
    commonErrors: [],
    specRevision: 1,
  },
  {
    id: "bootstrap-manifest/v1",
    title: "创世/重新接受留痕（应用写；角色不可写、不可读）",
    audience: "app-managed",
    stage: "应用",
    pathPattern: "docs/bootstrap-manifest.md",
    schemaLiteralNote: "无 schema/版本字段；仅写不读",
    validator: {
      kind: "convention",
      file: "src/common/编排/finalize.ts",
      symbol: "appendBootstrapManifest",
      note: "仅写不读；无读解析",
    },
    fields: [cf("内容", "任意", "应用写入的留痕；角色不得读写")],
    commonErrors: [],
    specRevision: 1,
  },
  {
    id: "verification-attachment/v1",
    title: "验证附件（任意文件；元数据走 evidence-meta/v1）",
    audience: "convention",
    stage: "验收",
    pathPattern: "docs/verification/**",
    schemaLiteralNote: "无 schema/版本字段；附件任意文件",
    validator: { kind: "convention", note: "无格式解析器；附件旁 sidecar 走 evidence-meta/v1（A12）" },
    fields: [cf("内容", "任意", "证据附件任意文件；元数据用 evidence-meta/v1")],
    commonErrors: [],
    specRevision: 1,
  },

  // ———————————————————— B 组：应用内部状态/事件（角色不写） ————————————————————
  {
    id: "ans-run/v1",
    title: "run manifest（.ans/runs/<runId>/manifest.json）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/runs/<runId>/manifest.json",
    schemaLiteral: RUN_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/run-manifest.ts",
      symbol: "validateRunManifest",
      note: "pin 时文档/schema/hash/roster/D3 复核",
    },
    fields: [
      vf("schema", "string", "required", "字面量 ans-run/v1"),
      vf("runId", "string", "required", "run-<slug> 形状"),
      vf("flowId", "string", "required", "非空"),
      vf("state", "枚举", "required", "draft/pinned/closed/cancelled"),
      vf("createdAt", "string", "required", "ISO 时间"),
      vf("updatedAt", "string", "required", "ISO 时间"),
      vf("schemas", "对象", "required", "对象"),
      vf("documents", "对象", "required", "对象"),
      vf("execution", "对象", "required", "teamPlan/flow 引用或 null"),
    ],
    commonErrors: [
      err("run-manifest-invalid", "schema/runId/flowId/时间/schemas/documents/execution 非法", "按 pin 产物重写"),
      err("run-manifest-missing", "run manifest 缺失", "重新 pin 或核对 runId"),
      err("run-manifest-read-failed", "run manifest 不可读", "检查文件权限/IO"),
      err("run-manifest-write-failed", "run manifest 写入失败", "检查磁盘/权限后重试"),
      err("run-state-invalid", "state 非四个枚举之一", "使用 draft/pinned/closed/cancelled"),
      err("run-pin-document-missing", "pin 所需文档缺失/不可读"),
      err("run-pin-schema-mismatch", "pin 文档 schema 不符"),
      err("run-pin-hash-mismatch", "re-pin 目标 hash 不符"),
      err("run-pin-d3-missing", "pin 缺 D3 裁决"),
      err("run-pin-roster-invalid", "最新 roster 路径/内容不一致"),
      err("run-pin-active-conflict", "已有活动 run 冲突"),
      err("versioned-doc-not-frozen", "pin/re-pin 目标未冻结"),
    ],
    example: B1_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "validateRunManifest" },
    specRevision: 1,
  },
  {
    id: "run-change/v1",
    title: "run 变更记录（manifest.runChange）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/runs/<runId>/manifest.json#runChange",
    schemaLiteral: RUN_CHANGE_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/run-manifest.ts",
      symbol: "applyRunChange",
      note: "mode/decidedBy/directiveId 校验并写 manifest",
    },
    fields: [
      vf("schema", "string", "required", "字面量 run-change/v1"),
      vf("decisionId", "string", "required", "非空"),
      vf("mode", "枚举", "required", "continue-frozen/stop-and-restart/stop"),
      vf("decidedBy", "枚举", "required", "customer/judge/directive"),
      vf("directiveId", "string", "conditional", "decidedBy=directive 时必填 d-<seq>"),
      vf("oldRunId", "string", "required", "非空"),
      vf("oldHashes", "对象", "required", "旧文档 hash 记录"),
    ],
    commonErrors: [
      err("run-change-invalid", "mode/decidedBy/directiveId 非法", "使用枚举值"),
      err("run-state-invalid", "目标 run 状态不允许", "仅 pinned run 可变更"),
    ],
    testSeam: {
      kind: "public-path-fixture",
      fixture: "临时项目根 + writePinnedRun 最小 pinned manifest",
      symbol: "applyRunChange",
    },
    specRevision: 1,
  },
  {
    id: "run-repin/v1",
    title: "run re-pin 记录（manifest.repins[]）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/runs/<runId>/manifest.json#repins[]",
    schemaLiteral: "run-repin/v1",
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/run-manifest.ts",
      symbol: "repinPinnedRun",
      note: "版本化 target 必须已冻结；内容 hash 以磁盘字节重算",
    },
    fields: [
      vf("schema", "string", "required", "字面量 run-repin/v1"),
      vf("at", "string", "required", "ISO 时间"),
      vf("applicationId", "string", "required", "非空"),
      vf("targets", "string[]", "required", "非空；每项 kind/path/sha256"),
    ],
    commonErrors: [
      err("run-manifest-invalid", "targets/applicationId 形状非法"),
      err("run-pin-document-missing", "target 文件缺失"),
      err("run-pin-hash-mismatch", "target hash 不符"),
      err("versioned-doc-not-frozen", "版本化 target 未冻结"),
      err("run-state-invalid", "run 未 pinned"),
    ],
    testSeam: {
      kind: "public-path-fixture",
      fixture: "临时项目根 + 最小 pinned run（flow target）",
      symbol: "repinPinnedRun",
    },
    specRevision: 1,
  },
  {
    id: "team-plan-completion/v1",
    title: "团队计划完成标记（.ans/trunk/plan-completions/）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/trunk/plan-completions/<hash>.json",
    schemaLiteral: "team-plan-completion/v1",
    validator: {
      kind: "shape-check",
      file: "src/service/trunk/impl/apply-journal.ts",
      symbol: "completeTeamPlan",
      note: "内联形状/策略校验；无导出纯校验器",
    },
    fields: [
      vf("schema", "string", "required", "字面量 team-plan-completion/v1"),
      vf("operationId", "string", "required", "非空"),
      vf("actorRoleId", "string", "required", "convener"),
      vf("flowId", "string", "required", "非空"),
      vf("plan", "对象", "required", "计划引用"),
      vf("modules", "对象", "required", "模块引用"),
      vf("roster", "对象", "required", "名单引用"),
    ],
    commonErrors: [
      err("plan-completion-marker-mismatch", "标记与真实计划/基线不一致"),
      err("plan-completion-purpose-mismatch", "用途不匹配"),
      err("plan-completion-basis-changed", "完成基线已变化"),
      err("plan-completion-ref-missing", "引用缺失"),
      err("plan-completion-failed", "完成操作失败"),
    ],
    testSeam: {
      kind: "text-shape",
      note: "无纯校验器：源码文本 + 形状断言（apply-journal.ts），残余风险如实披露",
    },
    specRevision: 1,
  },
  {
    id: "trunk/v1",
    title: "trunk manifest（.ans/trunk/manifest.json）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/trunk/manifest.json",
    schemaLiteral: TRUNK_MANIFEST_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/provider/trunk/impl/fs-trunk-store.ts",
      symbol: "isTrunkManifestShape",
      note: "model/trunk.ts 类型/枚举单一来源",
    },
    fields: [
      vf("schema", "string", "required", "字面量 trunk/v1"),
      vf("trunkVersion", "正整数", "required"),
      vf("source", "枚举", "required", "adopted/post-run-change/amendment/upgrade/bootstrap/recovery/team-plan"),
      vf("previous", "对象", "optional", "{trunkVersion,runId?} 或 null"),
      vf("flowId", "string", "required", "非空"),
      vf("runId", "string", "optional", "string 或 null"),
      vf("artifacts", "对象", "required", "documents/execution/boundaries（workflow/roleCards 可选）"),
      vf("digest", "string", "required", "内容 digest"),
      vf("createdAt", "string", "required", "非空"),
      vf("updatedAt", "string", "required", "非空"),
    ],
    commonErrors: [
      err("trunk-manifest-invalid", "形状/枚举/引用非法"),
    ],
    example: B5_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "isTrunkManifestShape" },
    specRevision: 1,
  },
  {
    id: "trunk-apply-journal/v1",
    title: "trunk 应用日志（.ans/trunk/operations/*.json；legacy apply-journal.json）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/trunk/operations/*.json（legacy .ans/trunk/apply-journal.json）",
    schemaLiteral: TRUNK_APPLY_JOURNAL_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/provider/trunk/impl/git-command.ts",
      symbol: "isTrunkApplyJournalShape",
      note: "legacy 路径由 fs-trunk-store.ts 兼容读取",
    },
    fields: [
      vf("v", "正整数", "required", "= 1"),
      vf("schema", "string", "required", "字面量 trunk-apply-journal/v1"),
      vf("journalId", "string", "required", "非空"),
      vf("flowId", "string", "required", "非空"),
      vf("startedAt", "string", "required", "非空"),
      vf("updatedAt", "string", "required", "非空"),
      vf("phase", "枚举", "required", "prepared/run-manifest-written/committed"),
      vf("target", "对象", "required"),
      vf("before", "对象", "required"),
    ],
    commonErrors: [err("trunk-apply-journal-invalid", "形状/枚举非法")],
    example: B6_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "isTrunkApplyJournalShape" },
    specRevision: 1,
  },
  {
    id: "trunk-amendment-static/v1",
    title: "修正案状态文件（.ans/trunk/amendment.json；与 A10 共用 schema）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/trunk/amendment.json",
    schemaLiteral: TRUNK_AMENDMENT_SCHEMA,
    schemaLiteralNote: "与 A10 文档共用 schema 字面量；state 另含 docPath/docSha256/status/applyState/items/checks",
    validator: {
      kind: "strict-parser",
      file: "src/service/trunk/impl/amendment-validate.ts",
      symbol: "validateAmendmentState",
    },
    fields: [
      vf("v", "正整数", "required", "= 1"),
      vf("schema", "string", "required", "字面量 trunk-amendment/v1"),
      vf("amendmentId", "string", "required", "非空"),
      vf("flowId", "string", "required", "非空"),
      vf("status", "枚举", "required", "draft/submitted/approved/rejected/applied/superseded"),
      vf("applyState", "枚举", "required", "idle/applying/applied/apply-failed/applied-uncertain"),
    ],
    commonErrors: [err("amendment state 形状非法", "state 字段/枚举非法"), err("trunk-amendment-status-invalid", "状态转移非法")],
    example: B7_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "validateAmendmentState" },
    specRevision: 1,
  },
  {
    id: "doc-freeze/v1",
    title: "文档冻结记录（R9 baseline / doc.freeze 事件）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "R9 冻结记录 / doc.freeze 事件",
    schemaLiteral: DOC_FREEZE_SCHEMA,
    validator: {
      kind: "shape-check",
      file: "src/model/version-change.ts",
      symbol: "isValidDocFreezeRecord",
    },
    fields: [
      vf("schema", "string", "required", "字面量 doc-freeze/v1"),
      vf("applicationId", "string", "required", "非空"),
      vf("reason", "枚举", "required", "DOC_FREEZE_REASONS 之一"),
      vf("origin", "枚举", "required", "customer/application 等（随 reason 绑定）"),
      vf("frozenAt", "string", "required", "非空"),
    ],
    commonErrors: [err("doc-freeze-invalid", "reason/origin/绑定字段不一致")],
    example: B8_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "isValidDocFreezeRecord" },
    specRevision: 1,
  },
  {
    id: "doc-freezes/v1",
    title: "冻结快照派生缓存（doc-freezes.json）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "R9 派生快照缓存（doc-freezes.json）",
    schemaLiteral: "doc-freezes/v1",
    validator: {
      kind: "shape-check",
      file: "src/provider/version-change/impl/fs-freeze-cache.ts",
      symbol: "isDocFreezeCacheShape",
      note: "坏件 fail-closed（unusable，不自动重建）",
    },
    fields: [
      vf("v", "正整数", "required", "= 1"),
      vf("schema", "string", "required", "字面量 doc-freezes/v1"),
      vf("state", "枚举", "required", "ready/migration-required/corrupt/unknown"),
      vf("builtAt", "string", "required", "非空"),
      vf("entries", "string[]", "required", "数组；每项 path/version/sha256/frozen"),
    ],
    commonErrors: [err("doc-freezes-invalid", "缓存 JSON/结构损坏 ⇒ unusable")],
    example: B9_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "isDocFreezeCacheShape" },
    specRevision: 1,
  },
  {
    id: "complete-snapshot/v1",
    title: "精确字节快照",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "exact-byte snapshot（snapshotRef/文件快照）",
    schemaLiteral: COMPLETE_SNAPSHOT_SCHEMA,
    validator: { kind: "shape-check", file: "src/model/trunk.ts", symbol: "isCompleteSnapshot" },
    fields: [
      vf("schema", "string", "required", "字面量 complete-snapshot/v1"),
      vf("snapshotId", "string", "required", "非空"),
      vf("digest", "string", "required", "64 位小写 hex；排序后 path/sha256/base64 的 sha256"),
      vf("files", "string[]", "required", "非空；每项 path/sha256/bytesBase64；路径唯一"),
      vf("createdAt", "string", "required", "非空"),
    ],
    commonErrors: [err("snapshot-byte-hash-mismatch", "bytesBase64/hash 不符"), err("snapshot-digest-mismatch", "digest 不符")],
    example: B10_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "isCompleteSnapshot" },
    specRevision: 1,
  },
  {
    id: "version-change/v1",
    title: "版本变更记录（VCA）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/state/version-changes.json 记录 / version.change 事件",
    schemaLiteral: VERSION_CHANGE_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/task-state.ts",
      symbol: "validateTaskStateEvent",
      note: "version.change 事件分支；Model 常量单一来源 model/version-change.ts",
    },
    fields: [
      vf("schema", "string", "required", "字面量 version-change/v1"),
      vf("applicationId", "string", "required", "vc-<n>"),
      vf("vcKind", "枚举", "required", "detail-amendment/version-upgrade；initiatorRoleId 与 kind 绑定"),
      vf("flowId", "string", "required", "小写 slug"),
      vf("status", "枚举", "required", "submitted/applied/superseded 或 approved/rejected（归属分层）"),
      vf("origin", "枚举", "required", "customer/application"),
    ],
    commonErrors: [err("vca-target-invalid", "VCA 目标/来源非法"), err("vca-apply-failed", "VCA 应用失败")],
    example: B11_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "validateTaskStateEvent" },
    specRevision: 1,
  },
  {
    id: "stable-write/v1",
    title: "stable 写入记录/许可/事件",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "stable 写入记录 / stable.write.* 事件",
    schemaLiteral: STABLE_WRITE_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/task-state.ts",
      symbol: "validateTaskStateEvent",
      note: "stable.write.* 分支；permit TTL 30min",
    },
    fields: [
      vf("schema", "string", "required", "字面量 stable-write/v1"),
      vf("requestId", "string", "required", "sw-<n>"),
      vf("roleId", "string", "required", "非空"),
      vf("path", "string", "required", "项目相对"),
      vf("stableKind", "枚举", "required", "workflow/role-card/boundary"),
      vf("baseSha256", "string", "required", "空串=写入前不存在；否则 64 hex"),
      vf("targetSha256", "string", "required", "64 hex"),
      vf("status", "枚举", "required", "requested/approved/rejected/written/failed"),
      vf("origin", "枚举", "required", "customer/application（与 kind 归属绑定）"),
    ],
    commonErrors: [err("stable-write-invalid", "形状/归属/许可非法")],
    example: B12_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "validateTaskStateEvent" },
    specRevision: 1,
  },
  {
    id: "refactor-request/v1",
    title: "重构申请记录（refactor.request 事件）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "重构申请记录 / refactor.request 事件",
    schemaLiteral: REFACTOR_REQUEST_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/task-state.ts",
      symbol: "validateTaskStateEvent",
      note: "refactor.request 分支；refactor-validate.ts 业务校验",
    },
    fields: [
      vf("schema", "string", "required", "字面量 refactor-request/v1"),
      vf("requestId", "string", "required", "rf-<n>"),
      vf("flowId", "string", "required", "小写 slug"),
      vf("initiatedBy", "string", "required", "convener"),
      vf("title", "string", "required", "非空"),
      vf("reason", "string", "required", "非空；≤1000 字符"),
      vf("scope", "对象", "required", "modules/paths/roles 数组"),
      vf("status", "枚举", "required", "requested/accepted/closed/rejected/superseded"),
      vf("managedBy", "string", "required", "application-scheduler"),
      vf("enforcement", "对象", "required", "writeSet/forbiddenKinds"),
    ],
    commonErrors: [err("refactor-invalid", "申请形状非法"), err("refactor-scope-forbidden", "范围命中禁止项")],
    example: B13_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "validateTaskStateEvent" },
    specRevision: 1,
  },
  {
    id: "customer-directive/v1",
    title: "客户指令事件/账本",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "客户指令事件/账本（model/directive.ts）",
    schemaLiteral: CUSTOMER_DIRECTIVE_SCHEMA,
    validator: {
      kind: "convention",
      file: "src/model/directive.ts",
      symbol: "CUSTOMER_DIRECTIVE_ID_PATTERN",
      note: "纯文本解析 + 模型常量；工具/管道层校验",
    },
    fields: [
      vf("schema", "string", "required", "字面量 customer-directive/v1"),
      vf("directiveId", "string", "required", "d-<seq>（正整数）"),
    ],
    commonErrors: [err("directive-invalid", "指令形状/ID 非法")],
    testSeam: {
      kind: "text-shape",
      note: "无纯校验器：CUSTOMER_DIRECTIVE_SCHEMA 与 d-<seq> 规则源码文本钉住",
    },
    specRevision: 1,
  },
  {
    id: "download-request/v1",
    title: "下载申请/结果",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "下载申请/结果（model/download.ts）",
    schemaLiteral: DOWNLOAD_REQUEST_SCHEMA,
    validator: {
      kind: "convention",
      file: "src/model/download.ts",
      symbol: "DOWNLOAD_REQUEST_SCHEMA",
      note: "模型常量 + 工具形状；参数校验在运行时核心",
    },
    fields: [
      vf("schema", "string", "required", "字面量 download-request/v1"),
      vf("requestId", "string", "required", "非空"),
    ],
    commonErrors: [err("download-invalid", "下载申请形状非法")],
    testSeam: { kind: "text-shape", note: "模型常量 + 工具形状断言" },
    specRevision: 1,
  },
  {
    id: "version-decision/v1",
    title: "版本决策事件",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/state/* 决策事件（version.decision）",
    schemaLiteral: VERSION_DECISION_SCHEMA,
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/task-state.ts",
      symbol: "validateTaskStateEvent",
      note: "version.decision 分支",
    },
    fields: [
      vf("schema", "string", "required", "字面量 version-decision/v1"),
      vf("decisionId", "string", "required", "非空"),
      vf("requestId", "string", "required", "非空"),
      vf("flowId", "string", "required", "小写 slug"),
      vf("action", "枚举", "required", "version-modify/new-version-development"),
      vf("decidedBy", "枚举", "required", "customer/judge/directive"),
      vf("status", "枚举", "required", "executing/executed/failed/uncertain"),
    ],
    commonErrors: [err("version-decision-invalid", "决策事件形状/枚举非法")],
    example: B16_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "validateTaskStateEvent" },
    specRevision: 1,
  },
  {
    id: "project-state/v1",
    title: "项目状态只读视图（不持久化）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "派生的只读视图（buildProjectStateView）",
    schemaLiteral: PROJECT_STATE_SCHEMA,
    validator: {
      kind: "shape-check",
      file: "src/common/编排/project-state.ts",
      symbol: "buildProjectStateView",
      note: "纯读、无写、无缓存",
    },
    fields: [
      vf("schema", "string", "required", "字面量 project-state/v1"),
    ],
    commonErrors: [],
    testSeam: { kind: "public-path-fixture", fixture: "临时空项目根（派生视图，无持久化）" },
    specRevision: 1,
  },
  {
    id: "governance-matrix/v1",
    title: "治理矩阵只读视图（上下文段/工具）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "派生的只读矩阵（buildGovernanceMatrix）",
    // D1 修复（2026-11-10）：`governance-matrix` 有架构隔离规则（test/测试/governance-matrix-integration.test.ts
    // 的 allowedConsumers 不允许 src/common/编排/ 消费该模块）——本规范持有**唯一字面量副本**，
    // 不 import src/model/governance-matrix.ts 的公共常量；由本文件测试与全仓 schema 扫描钉住。
    schemaLiteral: "governance-matrix/v1",
    schemaLiteralNote: "内联唯一副本：src/model/governance-matrix.ts 的公共常量不得被 src/common/编排/ 导入（governance-matrix 架构隔离）；由 B18 pin/测试与全仓扫描钉住",
    validator: {
      kind: "shape-check",
      file: "src/service/governance-matrix/impl/builder.ts",
      symbol: "buildGovernanceMatrix",
      note: "纯派生",
    },
    fields: [
      vf("schema", "string", "required", "字面量 governance-matrix/v1"),
      vf("roles", "对象[]", "required", "角色行"),
      vf("sources", "对象", "required", "来源"),
      vf("warnings", "string[]", "required", "警告"),
      vf("render", "对象", "required", "渲染信息"),
    ],
    commonErrors: [],
    testSeam: { kind: "exported-pure", symbol: "buildGovernanceMatrix" },
    specRevision: 1,
  },
  {
    id: "task-state-event/v1",
    title: "任务状态事件账本（tasks.jsonl 等）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/state/tasks.jsonl 等事件账本（逐行 JSON）",
    schemaLiteralNote: "kind 判别事件流；无统一 schema 字段（部分事件自带 schema，由各自格式覆盖）",
    validator: {
      kind: "strict-parser",
      file: "src/common/编排/task-state.ts",
      symbol: "validateTaskStateEvent",
    },
    fields: [
      vf("v", "正整数", "required", "= 1"),
      vf("at", "string", "required", "ISO 时间"),
      vf("kind", "枚举", "required", "task.*/request.*/approval.*/project.*/delegation.changed 等"),
    ],
    commonErrors: [err("task-state-invalid", "事件形状非法")],
    example: B19_EXAMPLE,
    exampleKind: "object",
    testSeam: { kind: "exported-pure", symbol: "validateTaskStateEvent" },
    specRevision: 1,
  },
  {
    id: "repository-work-source/v1",
    title: "派发工作源元数据",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "派发工作源元数据（apply-journal/fs-trunk-store/chief dispatch）",
    schemaLiteral: "repository-work-source/v1",
    validator: {
      kind: "shape-check",
      file: "src/service/trunk/impl/apply-journal.ts",
      symbol: "readTaskProcessSource",
      note: "多文件内联校验；无共享常量",
    },
    fields: [
      vf("schema", "string", "required", "字面量 repository-work-source/v1"),
      vf("purpose", "string", "required", "builtin-preparation"),
      vf("sourceId", "string", "required", "非空"),
      vf("flowId", "string", "required", "非空"),
    ],
    commonErrors: [],
    testSeam: { kind: "text-shape", note: "内联校验：源码文本钉住（apply-journal/fs-trunk-store/chief dispatch）" },
    specRevision: 1,
  },
  {
    id: "role-authorization/v1",
    title: "stable 发布授权元数据",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "stable 发布授权元数据（apply-journal/classify-shell）",
    schemaLiteral: "role-authorization/v1",
    validator: {
      kind: "shape-check",
      file: "src/common/门禁引擎/classify-shell.ts",
      symbol: "classifyShellIntent",
      note: "内联校验；无共享常量",
    },
    fields: [
      vf("schema", "string", "required", "字面量 role-authorization/v1"),
      vf("flowId", "string", "required", "非空"),
      vf("roleId", "string", "required", "非空"),
      vf("plan", "对象", "required", "计划引用"),
      vf("roster", "对象", "required", "名单引用"),
    ],
    commonErrors: [],
    testSeam: { kind: "text-shape", note: "内联校验：源码文本钉住（classify-shell/apply-journal）" },
    specRevision: 1,
  },
  {
    id: "role-activation/v1",
    title: "stable 激活元数据",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "stable 激活元数据（apply-journal/classify-shell）",
    schemaLiteral: "role-activation/v1",
    validator: {
      kind: "shape-check",
      file: "src/common/门禁引擎/classify-shell.ts",
      symbol: "classifyShellIntent",
      note: "内联校验；无共享常量",
    },
    fields: [
      vf("schema", "string", "required", "字面量 role-activation/v1"),
      vf("actorRoleId", "string", "required", "nominator"),
    ],
    commonErrors: [],
    testSeam: { kind: "text-shape", note: "内联校验：源码文本钉住（classify-shell/apply-journal）" },
    specRevision: 1,
  },
  {
    id: "stable-initial-workflow/v1",
    title: "初始 workflow 发布元数据",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "初始 workflow 发布元数据（classify-shell/apply-journal/git-trunk-store）",
    schemaLiteral: "stable-initial-workflow/v1",
    validator: {
      kind: "shape-check",
      file: "src/common/门禁引擎/classify-shell.ts",
      symbol: "classifyShellIntent",
      note: "内联校验；无共享常量",
    },
    fields: [
      vf("schema", "string", "required", "字面量 stable-initial-workflow/v1"),
      vf("path", "string", "required", "workflow 路径"),
      vf("sha256", "string", "required", "64 hex"),
    ],
    commonErrors: [],
    testSeam: { kind: "text-shape", note: "内联校验：源码文本钉住" },
    specRevision: 1,
  },
  {
    id: "stable-initial-workflow-source/v1",
    title: "初始 workflow 来源元数据",
    audience: "app-managed",
    stage: "内部",
    pathPattern: "初始 workflow 来源元数据（classify-shell/trunk-store/stable-snapshot/git-command）",
    schemaLiteral: "stable-initial-workflow-source/v1",
    validator: {
      kind: "shape-check",
      file: "src/common/门禁引擎/classify-shell.ts",
      symbol: "classifyShellIntent",
      note: "内联校验；无共享常量",
    },
    fields: [
      vf("schema", "string", "required", "字面量 stable-initial-workflow-source/v1"),
      vf("kind", "string", "required", "来源种类"),
      vf("operationId", "string", "required", "非空"),
    ],
    commonErrors: [],
    testSeam: { kind: "text-shape", note: "内联校验：源码文本钉住" },
    specRevision: 1,
  },
  {
    id: "project-config/v1",
    title: "项目配置（.ans/project.json；文件本身无 schema 字段）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/project.json",
    schemaLiteralNote: "工具枚举名；文件本身无 schema 字段",
    validator: {
      kind: "shape-check",
      file: "src/common/shared/config-loader.ts",
      symbol: "loadEffectiveConfig",
      note: "roles/governanceBoundary/pins/acceptance/governanceModel；accepted:true 必须 pin-backed",
    },
    fields: [
      vf("roles", "对象", "optional", "card/boundary 均为非空字符串的条目才生效"),
      vf("governanceBoundary", "对象", "optional", "path + acceptance"),
      vf("acceptance", "对象", "optional", "accepted:true 必须 pin-backed（否则降级未接受）"),
      vf("governanceModel", "枚举", "optional", "single/trio"),
    ],
    commonErrors: [err("ans-invalid", ".ans 不可解析 ⇒ fail-closed 未接受")],
    testSeam: {
      kind: "public-path-fixture",
      fixture: "临时项目根 + .ans/project.json",
      symbol: "loadEffectiveConfig",
    },
    specRevision: 1,
  },
  {
    id: "version-baseline/v1",
    title: "R9 版本基线（.ans/state/versions.jsonl）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/state/versions.jsonl（+ versions.initialized marker；versions.lock）",
    schemaLiteralNote: "每行 JSON 的 v=1（行内数值版本），无斜杠 schema 字面量",
    validator: {
      kind: "strict-parser",
      file: "src/common/门禁引擎/versioned-doc-guard.ts",
      symbol: "parseVersionBaselineState",
    },
    fields: [
      vf("v", "正整数", "required", "= 1"),
      vf("flowId", "string", "required", "非空"),
      vf("doc", "枚举", "required", "intent/proposal/roster/modules/topology/architecture/assets/amendment"),
      vf("version", "正整数", "required", "≥1"),
      vf("path", "string", "required", "canonical 或 -vN 实际路径"),
      vf("sha256", "string", "required", "64 hex"),
      vf("recordedAt", "string", "required", "非空"),
      vf("recordedBy", "string", "required", "非空"),
      vf("event", "枚举", "required", "baseline/version-added/frozen/draft-updated/draft-marker"),
      vf("freeze", "对象", "conditional", "event=frozen 必填（doc-freeze/v1 形状）；其他 event 不得携带"),
    ],
    commonErrors: [
      err("baseline-corrupt", "坏行/形状非法"),
      err("baseline-missing", "marker 存在但 baseline 缺失"),
      err("marker-missing", "baseline 存在但 marker 缺失"),
    ],
    example: B26_EXAMPLE,
    exampleKind: "block",
    testSeam: { kind: "exported-pure", symbol: "parseVersionBaselineState" },
    specRevision: 1,
  },
  {
    id: "download-consumer/v1",
    title: "下载消费者 epoch（.ans/state/download-consumer.json）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/state/download-consumer.json",
    schemaLiteralNote: "version=1（数值版本），无斜杠 schema 字面量",
    validator: {
      kind: "strict-parser",
      file: "src/provider/download/impl/consumer-epoch-store.ts",
      symbol: "createDownloadConsumerEpochStore",
      note: "read() 只读：missing/ready/unreadable；坏件不重写",
    },
    fields: [
      vf("version", "正整数", "required", "= 1"),
      vf("enabledAt", "string", "required", "可解析 ISO 时间"),
      vf("appVersion", "string", "required", "非空"),
    ],
    commonErrors: [
      err("invalid-json", "JSON 非法"),
      err("not-an-object", "顶层非对象"),
      err("version-mismatch", "version ≠ 1"),
      err("enabledAt-invalid", "enabledAt 非法"),
      err("appVersion-invalid", "appVersion 为空"),
    ],
    testSeam: {
      kind: "public-path-fixture",
      fixture: "临时项目根 + .ans/state/download-consumer.json",
      symbol: "createDownloadConsumerEpochStore(...).read",
    },
    specRevision: 1,
  },
  {
    id: "operation-delivery/v1",
    title: "操作投递记录（.ans/trunk/deliveries/<sha256(key)>.json）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/trunk/deliveries/<sha256(key)>.json",
    schemaLiteralNote: "无 schema 字段；文件为 {key} 对象",
    validator: {
      kind: "shape-check",
      file: "src/provider/version-change/impl/guard-freeze-registry.ts",
      symbol: "operationDeliveryRecorded",
      note: "坏件抛 delivery-record-corrupt（fail-closed）",
    },
    fields: [vf("key", "string", "required", "与调用方 key 一致")],
    commonErrors: [err("delivery-record-corrupt", "记录 JSON 非法或 key 不匹配")],
    testSeam: {
      kind: "public-path-fixture",
      fixture: "临时项目根",
      symbol: "recordOperationDelivery/operationDeliveryRecorded",
    },
    specRevision: 1,
  },
  {
    id: "git-mode/v1",
    title: "Git 只读存储选择（.ans/trunk/git-mode.json）",
    audience: "app-managed",
    stage: "内部",
    pathPattern: ".ans/trunk/git-mode.json",
    schemaLiteral: "git-ref/v1",
    schemaLiteralNote: "media 字面量 git-ref/v1",
    validator: {
      kind: "shape-check",
      file: "src/provider/trunk/impl/git-trunk-store.ts",
      symbol: "readGitMode",
      note: "JSON 解析失败 ⇒ 按 git 只读存储选择（fail-closed）；存在性使宿主保护要求为 required",
    },
    fields: [
      vf("media", "string", "required", "git-ref/v1"),
      vf("repoId", "string", "required", "非空"),
      vf("ref", "string", "required", "journalId?/migrationOperationId? 二选一形态"),
    ],
    commonErrors: [],
    testSeam: { kind: "text-shape", note: "无纯解析器：读取选择路径复杂；源码文本 + 形状断言" },
    specRevision: 1,
  },
]);

/** 未知 id 回显上限（字符）。 */
const UNKNOWN_ECHO_MAX = 40;

function clipEcho(value: string): string {
  return value.length <= UNKNOWN_ECHO_MAX ? value : `${value.slice(0, UNKNOWN_ECHO_MAX)}…`;
}

function unknownFormatText(rawId: string): string {
  return `未知格式 ${clipEcho(rawId)}；可用：${docFormatKnownIds().join("、")}`;
}

function fieldLine(field: DocFormatFieldSpec): string {
  const parts = [`- ${field.name}：${field.type}`, field.presence];
  if (field.constraints !== undefined) parts.push(`约束：${field.constraints}`);
  if (field.note !== undefined) parts.push(`说明：${field.note}`);
  return parts.join("；");
}

function headerLines(spec: DocFormatSpec): string[] {
  const lines = [
    HEADER,
    `格式：${spec.id} — ${spec.title}`,
    `audience：${spec.audience}`,
    `stage：${spec.stage}`,
    `路径：${spec.pathPattern}`,
  ];
  lines.push(`schema：${spec.schemaLiteral ?? "（无 schema 字面量；见 schema 说明）"}`);
  if (spec.schemaLiteralNote !== undefined) lines.push(`schema 说明：${spec.schemaLiteralNote}`);
  const validator = spec.validator;
  const anchor = [validator.file, validator.symbol].filter((part) => part !== undefined).join("#");
  lines.push(`校验器：${validator.kind}${anchor !== "" ? `；${anchor}` : ""}${validator.note !== undefined ? `；${validator.note}` : ""}`);
  return lines;
}

function fieldsSection(spec: DocFormatSpec): string {
  const lines = ["【字段】"];
  const enforced = spec.fields.filter((field) => field.enforcement === "validator");
  const conventions = spec.fields.filter((field) => field.enforcement === "convention");
  lines.push("强制（校验器会拒绝缺省/非法值）：");
  if (enforced.length === 0) lines.push("- （无）");
  for (const field of enforced) lines.push(fieldLine(field));
  lines.push("约定（仅写作约定；校验器不强制）：");
  if (conventions.length === 0) lines.push("- （无）");
  for (const field of conventions) lines.push(fieldLine(field));
  return lines.join("\n");
}

function loadChecksSection(spec: DocFormatSpec): string {
  const checks = spec.loadChecks ?? [];
  if (checks.length === 0) return "";
  return ["【加载级约束与错误码】", ...checks.map((check) => `- ${check.code}：${check.rule}`)].join("\n");
}

function exampleSection(spec: DocFormatSpec): string {
  if (spec.example === undefined) return "";
  const kind = spec.exampleKind ?? "full-document";
  return [`【最小合法样例】（${kind}）`, "```text", spec.example, "```"].join("\n");
}

function errorsSection(spec: DocFormatSpec): string {
  if (spec.commonErrors.length === 0) return "";
  return [
    "【常见错误与修复】",
    ...spec.commonErrors.map((item) => `- ${item.code}：${item.cause} → ${item.fix}`),
  ].join("\n");
}

/** intent-entry 直接复用意图入口契约原文（模板/命名/ID 规则；不复制第二份）。 */
function intentEntrySection(spec: DocFormatSpec): string {
  if (spec.id !== "intent-entry/v1") return "";
  return [
    "【意图入口契约（同源原文）】",
    INTENT_ENTRY_NAMING_RULE,
    INTENT_ENTRY_ID_RULE,
    "模板（占位符必须替换；下方最小合法样例为填充后的具体样例）：",
    "```text",
    INTENT_ENTRY_TEMPLATE,
    "```",
  ].join("\n");
}

/**
 * 索引模式：按 stage 分组列出全部 54 个 id（一行一 id）。纯静态文本，无 I/O。
 * 预算 ≤8192 B（测试以 Buffer.byteLength 实测）。
 */
export function docFormatIndexText(): string {
  const lines = [HEADER];
  const stages: string[] = [];
  for (const spec of DOC_FORMAT_SPECS) if (!stages.includes(spec.stage)) stages.push(spec.stage);
  for (const stage of stages) {
    lines.push(`【${stage}】`);
    for (const spec of DOC_FORMAT_SPECS) {
      if (spec.stage !== stage) continue;
      lines.push(`- ${spec.id} — ${spec.title}（${spec.audience}）`);
    }
  }
  lines.push("", "用 format=<id> 查看详情；part=fields|example|errors 可缩小范围。");
  return lines.join("\n");
}

/**
 * 详情模式（`part` 裁剪；render 型整段返回并标注）。纯静态文本，无 I/O；未知 id 返回纯文本。
 */
export function docFormatSpecText(id: string, part: DocFormatPart = "all"): string {
  const rawId = typeof id === "string" ? id : String(id);
  const spec = DOC_FORMAT_SPECS.find((candidate) => candidate.id === rawId);
  if (spec === undefined) return unknownFormatText(rawId);
  if (spec.render !== undefined) {
    return [
      HEADER,
      `格式：${spec.id} — ${spec.title}`,
      "（该格式复用原文，整段返回；part 不细分）",
      REUSE_NOTE,
      spec.render(),
      `specRevision：${spec.specRevision}`,
    ].join("\n");
  }
  const sections: string[] = [...headerLines(spec)];
  if (part === "all" || part === "fields") {
    sections.push(fieldsSection(spec));
    const intentEntry = intentEntrySection(spec);
    if (intentEntry !== "") sections.push(intentEntry);
    const loadChecks = loadChecksSection(spec);
    if (loadChecks !== "") sections.push(loadChecks);
  }
  if (part === "all" || part === "example") {
    const example = exampleSection(spec);
    if (example !== "") sections.push(example);
  }
  if (part === "all" || part === "errors") {
    const errors = errorsSection(spec);
    if (errors !== "") sections.push(errors);
  }
  sections.push(`specRevision：${spec.specRevision}`);
  return sections.join("\n");
}

/** 已知格式 id（注册表顺序；供工具描述与未知 id 提示）。 */
export function docFormatKnownIds(): readonly string[] {
  return DOC_FORMAT_SPECS.map((spec) => spec.id);
}
