// src/service/trunk/impl/upgrade-validate.ts
// version-upgrade VCA 前置校验（E2 返工 S7 / AC-5）：
// 在批准前与 apply 前校验 schema / roster / D3 / 契约版本链 / role-card·boundary 完整性。
//
// 纪律：
// · 复用既有解析器：`workflow-preconditions.parseProjectRoster/parseProjectModules`（不复制第二套
//   roster/modules 语义）、`boundary-yaml.parseBoundaryYaml`（门禁引擎单一来源）；
// · 只读，不写盘、不冻结、不改指针；
// · 版本链仅在 **本次变更 roster** 时强校验（roster→proposal→architecture→modules 链）；
//   契约文档单独升级（roster 未变）不因磁盘最新版扫描被误拒（P1 §4.4 targets 允许单目标）；
// · 失败返回 C1 `trunk-item-invalid`（调用方 version-change-runtime 映射为
//   `vca-target-invalid`（批准前）/`vca-apply-failed`（apply 前））。

import { parse as parseYaml } from "yaml";

import { createFsTrunkStore } from "../../../provider/trunk/public/trunk-store.ts";
import {
  parseProjectModules,
  parseProjectRoster,
  type ProjectRoster,
} from "../../../common/编排/workflow-preconditions.ts";
import type { TrunkDocKind } from "../../../model/trunk.ts";
import type {
  TrunkServiceResult,
  UpgradeChainValidation,
  UpgradeChainValidationInput,
} from "../abstract/trunk-service.ts";
import { filePathOfRef } from "./trunk-common.ts";

function fail<T>(message: string): TrunkServiceResult<T> {
  return { ok: false, code: "trunk-item-invalid", message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 文档 frontmatter schema（缺失/非法返回 undefined；只用于 schema 期望比对）。 */
function schemaOf(text: string): string | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null) return undefined;
  try {
    const parsed = parseYaml(match[1]!);
    return isObject(parsed) && typeof parsed.schema === "string" ? parsed.schema : undefined;
  } catch {
    return undefined;
  }
}

const EXPECTED_SCHEMA: Partial<Record<TrunkDocKind, string>> = Object.freeze({
  proposal: "project-proposal/v2",
  modules: "project-modules/v2",
  architecture: "project-architecture/v1",
  assets: "project-assets/v1",
});

async function readProjectBytes(projectRoot: string, rel: string) {
  const read = await createFsTrunkStore(projectRoot).readProjectFile!(rel);
  return read.ok ? read.value : undefined;
}
async function readText(projectRoot: string, rel: string): Promise<string | undefined> {
  const bytes = await readProjectBytes(projectRoot, rel);
  return bytes === undefined ? undefined : Buffer.from(bytes.bytesBase64, "base64").toString("utf8");
}

/**
 * 校验 version-upgrade 的有效文档集（schema/roster/D3/版本链/role-card·boundary）。
 * `documents` = 当前 trunk documents 被 VCA targets 覆盖后的有效集（path + sha256）。
 */
export async function validateUpgradeChain(
  projectRoot: string,
  input: UpgradeChainValidationInput,
): Promise<TrunkServiceResult<UpgradeChainValidation>> {
  const checks: string[] = [];
  const frozen = input.snapshot === undefined ? undefined : new Map(input.snapshot.files.map(file => [file.path, file]));
  const readBoundText = async (rel: string): Promise<string | undefined> => frozen === undefined
    ? readText(projectRoot, rel) : frozen.get(rel) === undefined ? undefined
      : Buffer.from(frozen.get(rel)!.bytesBase64, "base64").toString("utf8");

  // 1) 内容存在 + hash 匹配（内容匹配为主；不信任调用方自报）。
  const texts = new Map<TrunkDocKind, string>();
  for (const kind of Object.keys(input.documents) as TrunkDocKind[]) {
    const ref = input.documents[kind];
    if (ref === undefined) continue;
    // 文档引用允许 `path#fragment`（run documents 约定）；哈希/读取取文件部分。
    const fileRel = filePathOfRef(ref.path);
    const actual = frozen === undefined ? (await readProjectBytes(projectRoot, fileRel))?.sha256 : frozen.get(fileRel)?.sha256;
    if (actual === undefined) return fail(`documents.${kind} 文件缺失：${ref.path}`);
    if (actual.toLowerCase() !== ref.sha256.toLowerCase()) {
      return fail(`documents.${kind} 哈希不符：${ref.path}`);
    }
    const text = await readBoundText(fileRel);
    if (text === undefined) return fail(`documents.${kind} 不可读：${ref.path}`);
    texts.set(kind, text);
  }
  checks.push("content");

  // 2) schema（proposal/modules/architecture/assets）；roster 由 parseProjectRoster 校验 v3。
  for (const [kind, expected] of Object.entries(EXPECTED_SCHEMA) as Array<[TrunkDocKind, string]>) {
    const text = texts.get(kind);
    if (text === undefined) continue;
    const actual = schemaOf(text);
    if (actual !== expected) {
      return fail(`documents.${kind} schema 必须为 ${expected}（实际 ${actual ?? "缺失"}）：${input.documents[kind]?.path ?? ""}`);
    }
  }
  if (input.confirmedIntent !== undefined) {
    const proposal = texts.get("proposal");
    const frontmatter = proposal && /^---\r?\n([\s\S]*?)\r?\n---/.exec(proposal);
    let metadata: unknown;
    try { metadata = frontmatter ? parseYaml(frontmatter[1]!) : undefined; } catch { metadata = undefined; }
    if (!isObject(metadata) || metadata.intent !== input.confirmedIntent.path
      || frozen?.get(input.confirmedIntent.path)?.sha256 !== input.confirmedIntent.sha256)
      return fail("首建规划必须引用真实已确认意图及其冻结字节");
    checks.push("confirmed-intent");
  }
  checks.push("schema");

  // 3) roster（有效集/目标中的 roster；无 roster 且非本次变更 ⇒ 跳过 roster 依赖检查）
  const rosterRef = input.documents.roster;
  let roster: ProjectRoster | undefined;
  if (rosterRef !== undefined) {
    const text = texts.get("roster");
    if (text === undefined) return fail(`documents.roster 不可读：${rosterRef.path}`);
    const parsed = parseProjectRoster(text, input.flowId);
    if (!parsed.ok) return fail(`roster 非法：${parsed.reason}`);
    roster = parsed.roster;
    checks.push("roster");
  } else if (input.rosterChanged) {
    return fail("roster 变更缺少 roster 目标文档");
  }

  // 4) D3：targetRoleIds 必须 ⊆ roster roles（有 roster 时）。
  if (input.d3 !== undefined && input.d3.targetRoleIds.length > 0) {
    if (roster === undefined) {
      return fail("存在 D3 但缺少 roster：无法校验 targetRoleIds（fail-closed）");
    }
    const roleIds = new Set(roster.roles.map((role) => role.id));
    for (const targetRoleId of input.d3.targetRoleIds) {
      if (!roleIds.has(targetRoleId)) return fail(`D3 targetRoleId 不在 roster：${targetRoleId}`);
    }
    checks.push("d3");
  }

  // 5) 版本链（本次变更 roster 时强校验）：roster→proposal→architecture→modules。
  if (input.rosterChanged && roster !== undefined) {
    const proposalRef = input.documents.proposal;
    if (proposalRef === undefined) return fail("roster 变更必须同时提供 proposal 目标文档（版本链）");
    if (roster.proposal !== proposalRef.path) {
      return fail(`契约版本链不匹配：roster.proposal=${roster.proposal} ≠ 有效 proposal=${proposalRef.path}`);
    }
    const proposalText = texts.get("proposal") ?? (await readBoundText(filePathOfRef(proposalRef.path)));
    if (proposalText === undefined) return fail(`proposal 不可读：${proposalRef.path}`);
    if (!proposalText.includes(roster.intent)) {
      return fail(`契约版本链不匹配：proposal 未引用 roster.intent=${roster.intent}`);
    }
    const architectureRef = input.documents.architecture;
    if (architectureRef === undefined) return fail("roster 变更必须同时提供 architecture 目标文档（版本链）");
    const architectureText = texts.get("architecture") ?? (await readBoundText(filePathOfRef(architectureRef.path)));
    if (architectureText === undefined) return fail(`architecture 不可读：${architectureRef.path}`);
    if (!architectureText.includes(roster.proposal)) {
      return fail(`契约版本链不匹配：architecture 未引用 roster.proposal=${roster.proposal}`);
    }
    const modulesRef = input.documents.modules;
    if (modulesRef === undefined) return fail("roster 变更必须同时提供 modules 目标文档（版本链）");
    const modulesText = texts.get("modules") ?? (await readBoundText(filePathOfRef(modulesRef.path)));
    if (modulesText === undefined) return fail(`modules 不可读：${modulesRef.path}`);
    const modulesParsed = parseProjectModules(modulesText, input.flowId);
    if (!modulesParsed.ok) return fail(`modules 非法：${modulesParsed.reason}`);
    if (JSON.stringify(modulesParsed.doc.modules) !== JSON.stringify(roster.modules)) {
      return fail(`契约版本链不匹配：roster.modules 与 modules 文档不一致：${modulesRef.path}`);
    }
    if (input.rosterVersionFloor !== undefined && roster.version <= input.rosterVersionFloor) {
      return fail(`roster 版本必须递增：${roster.version} ≤ 当前 ${input.rosterVersionFloor}`);
    }
    checks.push("chain");
  }

  // 6) role-card / boundary 完整性（roster 中每个角色；缺失/边界不可解析 ⇒ fail-closed）。
  const roleIds: string[] = roster?.roles.map((role) => role.id) ?? [];
  for (const roleId of input.planningOnly ? [] : roleIds) {
    const card = await readBoundText(`角色卡/${roleId}/role-card.md`);
    if (card === undefined || card.trim() === "") return fail(`role-card 缺失：角色卡/${roleId}/role-card.md`);
    const boundary = await readBoundText(`角色卡/${roleId}/boundary.yaml`);
    if (boundary === undefined) return fail(`boundary 缺失：角色卡/${roleId}/boundary.yaml`);
    if (frozen !== undefined) {
      const result = input.roleDocumentChecks?.find(check => check.roleId === roleId && check.ok === true);
      if (!result || result.snapshotDigest !== input.snapshot!.digest
        || result.cardSha256 !== frozen.get(`角色卡/${roleId}/role-card.md`)?.sha256
        || result.boundaryMdSha256 !== frozen.get(`角色卡/${roleId}/boundary.md`)?.sha256
        || result.boundaryYamlSha256 !== frozen.get(`角色卡/${roleId}/boundary.yaml`)?.sha256)
        return fail(`缺少同快照角色三文档校验结果：${roleId}`);
      continue;
    }
    const legacy = input.legacyApproval;
    const check = legacy?.roles.find(check => check.roleId === roleId);
    const cardBytes = await readProjectBytes(projectRoot, `角色卡/${roleId}/role-card.md`);
    const boundaryBytes = await readProjectBytes(projectRoot, `角色卡/${roleId}/boundary.yaml`);
    if (!legacy?.applicationId || !legacy.decisionId || !check || check.cardSha256 !== cardBytes?.sha256 || check.boundaryYamlSha256 !== boundaryBytes?.sha256)
      return fail(`缺少不可变快照与角色三文档校验结果：${roleId}`);
    // The Pipeline already used G's public parser on these exact original two-file bytes.
    // This compatibility result cannot create a run or role activation.
  }
  if (roleIds.length > 0 && !input.planningOnly) checks.push("role-cards");

  return {
    ok: true,
    value: {
      ...(roster !== undefined ? { rosterVersion: roster.version } : {}),
      roleIds,
      checks,
    },
  };
}
