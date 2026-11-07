// test/roles/nominator/fixtures/nominator-fixtures.ts
// nominator 模块测试夹具：只被本角色测试使用；不进入生产模块，也不构成生产依赖。
//
// 差分 oracle 侧（旧引擎/私有 common）只在本目录与 *.test.ts 中出现；角色模块本身零 import。

import { createHash } from "node:crypto";

import type { CompleteSnapshot } from "../../../../src/model/trunk.ts";
import type { SnapshotRoleDocuments } from "../../../../src/common/门禁引擎/boundary-core.ts";

/** 测试用 64 hex 哈希（形状合法即可；与真实字节无关）。 */
export const ROSTER_SHA256 = "a".repeat(64);
export const DOCUMENT_SHA256 = "b".repeat(64);

/** 测试名单角色 id（含标准 env-bootstrap，避免 env-bootstrap 前置干扰）。 */
export const ROSTER_ROLE_IDS: readonly string[] = Object.freeze([
  "env-bootstrap",
  "implementer",
  "qa",
]);

export const WORKER_ROLE_ID = "implementer";

/** 测试用完整快照（digest 算法与 `CompleteSnapshot` 契约一致）。 */
export function makeSnapshot(files: Readonly<Record<string, string>>): CompleteSnapshot {
  const sorted = Object.keys(files)
    .sort()
    .map((path) => {
      const bytes = Buffer.from(files[path]!, "utf8");
      return {
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytesBase64: bytes.toString("base64"),
      };
    });
  const digest = createHash("sha256")
    .update(
      JSON.stringify(sorted.map((file) => [file.path, file.sha256, file.bytesBase64])),
    )
    .digest("hex");
  return {
    schema: "complete-snapshot/v1",
    snapshotId: "s-nominator-fixture",
    digest,
    files: sorted,
    createdAt: "2026-11-07T00:00:00.000Z",
  };
}

/** 满足 `ROLE_CARD_REQUIRED_SECTIONS` 的最小人事写卡产物（role-card）。 */
export const VALID_CARD_TEXT = [
  "# 角色：实现（测试桩）",
  "",
  "## 组别",
  "",
  "测试组。",
  "",
  "## 工作立场",
  "",
  "测试。",
  "",
  "## 能力描述",
  "",
  "测试。",
  "",
  "## 系统功能导航",
  "",
  "测试。",
  "",
  "## 必读资料",
  "",
  "测试。",
  "",
  "## 交接输入输出",
  "",
  "测试。",
  "",
  "## 执行原则",
  "",
  "测试。",
  "",
  "## 质量职责",
  "",
  "测试。",
  "",
  "## 标准工作流",
  "",
  "测试。",
  "",
  "## 交付物清单",
  "",
  "测试。",
].join("\n");

/** 与 YAML 同步的 boundary.md（Section 1 表）。 */
export function boundaryMarkdown(path = "src/"): string {
  return [
    "# 测试角色边界",
    "",
    "## Section 1: 可修改文件与目录",
    "",
    "| 类型 | 可操作路径 | 用途 |",
    "| --- | --- | --- |",
    `| 目录 | ${path} | 实现代码 |`,
    "",
  ].join("\n");
}

/** 与 boundary.md 同义的 boundary.yaml。 */
export function boundaryYaml(path = "src/"): string {
  return [
    `role: ${WORKER_ROLE_ID}`,
    "entries:",
    "  - kind: directory",
    `    path: ${path}`,
    "    purpose: 实现代码",
    "",
  ].join("\n");
}

export const WORKER_ALLOWED_PATHS: readonly {
  path: string;
  kind: "file" | "directory";
}[] = Object.freeze([{ path: "src/", kind: "directory" as const }]);

/** 角色文档三件（可按场景覆盖）。 */
export function roleDocumentFiles(overrides: {
  cardPath?: string;
  boundaryMdPath?: string;
  boundaryYamlPath?: string;
  cardText?: string;
  boundaryMdText?: string;
  boundaryYamlText?: string;
} = {}): Record<string, string> {
  const cardPath = overrides.cardPath ?? `角色卡/${WORKER_ROLE_ID}/role-card.md`;
  const boundaryMdPath = overrides.boundaryMdPath ?? `角色卡/${WORKER_ROLE_ID}/boundary.md`;
  const boundaryYamlPath = overrides.boundaryYamlPath ?? `角色卡/${WORKER_ROLE_ID}/boundary.yaml`;
  return {
    [cardPath]: overrides.cardText ?? VALID_CARD_TEXT,
    [boundaryMdPath]: overrides.boundaryMdText ?? boundaryMarkdown(),
    [boundaryYamlPath]: overrides.boundaryYamlText ?? boundaryYaml(),
  };
}

/** 旧 `validateRoleDocumentsSnapshot` 的 role 参数。 */
export function snapshotRole(
  overrides: Partial<SnapshotRoleDocuments> = {},
): SnapshotRoleDocuments {
  return {
    roleId: WORKER_ROLE_ID,
    cardPath: `角色卡/${WORKER_ROLE_ID}/role-card.md`,
    boundaryMdPath: `角色卡/${WORKER_ROLE_ID}/boundary.md`,
    boundaryYamlPath: `角色卡/${WORKER_ROLE_ID}/boundary.yaml`,
    allowedPaths: WORKER_ALLOWED_PATHS,
    ...overrides,
  };
}

/** 三文档在当前快照中的 sha256。 */
export function documentHashes(
  snapshot: CompleteSnapshot,
  role: SnapshotRoleDocuments,
): { cardSha256: string; boundaryMdSha256: string; boundaryYamlSha256: string } {
  const byPath = new Map(snapshot.files.map((file) => [file.path, file.sha256]));
  return {
    cardSha256: byPath.get(role.cardPath)!,
    boundaryMdSha256: byPath.get(role.boundaryMdPath)!,
    boundaryYamlSha256: byPath.get(role.boundaryYamlPath)!,
  };
}

type Facts = Record<string, unknown>;

/**
 * D3 决定卡阶段的最小合法事实包（模块 preflight 输入）。
 *
 * E2 D-1：`intentEntryConsistent` 是可选诊断事实，默认不提供——缺失必须 allow（与旧路径等价）；
 * 需要时由用例显式传入 `true`/`false`。
 */
export function d3CardFacts(overrides: Facts = {}): Facts {
  return {
    stage: "d3-card",
    flowId: "focus",
    rosterFound: true,
    rosterVersion: 3,
    rosterSha256: ROSTER_SHA256,
    rosterRoleIds: [...ROSTER_ROLE_IDS],
    rosterEnvBootstrapOmitted: false,
    rosterContainsBuiltInRoleIds: false,
    d3CardMultiple: true,
    d3CardOptionRoleIds: [...ROSTER_ROLE_IDS],
    d3CardRecommendedRoleIds: [...ROSTER_ROLE_IDS],
    ...overrides,
  };
}

/**
 * 三文档写卡/激活阶段的最小合法事实包（模块 preflight 输入）。
 *
 * E2 D-1：`intentEntryConsistent` 默认不提供（可选诊断；缺失必须 allow）。
 */
export function roleDocumentsFacts(overrides: Facts = {}): Facts {
  return {
    stage: "role-documents",
    flowId: "focus",
    rosterFound: true,
    rosterVersion: 3,
    rosterSha256: ROSTER_SHA256,
    rosterRoleIds: [...ROSTER_ROLE_IDS],
    rosterEnvBootstrapOmitted: false,
    rosterContainsBuiltInRoleIds: false,
    targetRoleId: WORKER_ROLE_ID,
    targetIsBuiltIn: false,
    d3Present: true,
    d3By: "customer",
    d3TargetRoleIds: ["env-bootstrap", WORKER_ROLE_ID],
    d3RosterVersion: 3,
    d3RosterSha256: ROSTER_SHA256,
    d3DecisionId: "decision-1",
    operationId: "op-1",
    planCompleted: true,
    planRoleIds: [...ROSTER_ROLE_IDS],
    cardPath: `角色卡/${WORKER_ROLE_ID}/role-card.md`,
    cardSha256: DOCUMENT_SHA256,
    boundaryMdPath: `角色卡/${WORKER_ROLE_ID}/boundary.md`,
    boundaryMdSha256: DOCUMENT_SHA256,
    boundaryYamlPath: `角色卡/${WORKER_ROLE_ID}/boundary.yaml`,
    boundaryYamlSha256: DOCUMENT_SHA256,
    boundaryWithinRoleModules: true,
    boundaryMdYamlSynchronized: true,
    roleCardRequiredSections: true,
    ...overrides,
  };
}
