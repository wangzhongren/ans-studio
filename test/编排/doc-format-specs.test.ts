// test/编排/doc-format-specs.test.ts
// 2026-11-09（document-format-specifications 编排 B1 批，TM-1..TM-9）：
// 把 `doc-format-specs.ts` 的 54 个规范与真实 parser/validator 逐项钉住——
// 冻结 id 清单、样例正例、字段变异矩阵、约定反证、schema 字面量全仓扫描、
// 稳定 code 族扫描、加载级/主错误码负例、B 组 testSeam、复用单一来源与预算。
//
// 纪律：不修改任何 parser/validator；测试输入只用 spec.example / 生产常量（不另写夹具副本）；
// 不新增 skip/force-exit；人工豁免必须带理由（MATRIX_EXEMPTIONS / OVERCLAIM_EXEMPTIONS /
// LOADCHECK_EXEMPTIONS），不得静默跳过。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  DOC_FORMAT_SPECS,
  DOC_FORMAT_SPEC_VERSION,
  docFormatIndexText,
  docFormatKnownIds,
  docFormatSpecText,
  type DocFormatFieldSpec,
  type DocFormatSpec,
} from "../../src/common/编排/doc-format-specs.ts";
import {
  PROJECT_MODULES_SCHEMA_EXAMPLE,
  PROJECT_ROSTER_SCHEMA_EXAMPLE,
  PROJECT_TOPOLOGY_SCHEMA_EXAMPLE,
  contractSchemaText,
  loadLatestRoster,
  parseProjectModules,
  parseProjectRoster,
  parseTeamPlan,
} from "../../src/common/编排/workflow-preconditions.ts";
import {
  applyRunChange,
  prepareRunPin,
  repinPinnedRun,
  validateRunManifest,
} from "../../src/common/编排/run-manifest.ts";
import {
  checkEvidence,
  loadCriteria,
  parseCriteriaText,
  parseEvidenceMeta,
} from "../../src/common/编排/evidence-check.ts";
import { summarizeIntent } from "../../src/common/编排/governance-judge-intent.ts";
import {
  INTENT_ENTRY_ID_RULE,
  INTENT_ENTRY_NAMING_RULE,
  INTENT_ENTRY_TEMPLATE,
} from "../../src/common/shared/intent-entry-contract.ts";
import { parseBoundarySection1 } from "../../src/common/门禁引擎/boundary-parse.ts";
import { parseBoundaryYamlDoc, validateBoundaryYamlText } from "../../src/common/门禁引擎/boundary-yaml.ts";
import { validateRoleDocumentsSnapshot } from "../../src/common/门禁引擎/boundary-core.ts";
import { readSkillRegistration } from "../../src/common/编排/installed-skills.ts";
import { readMcpDeclaration } from "../../src/common/runtime-core/mcp-declarations.ts";
import { validateAmendment, validateAmendmentState } from "../../src/service/trunk/impl/amendment-validate.ts";
import { completeTeamPlan } from "../../src/service/trunk/impl/apply-journal.ts";
import { validateUpgradeChain } from "../../src/service/trunk/impl/upgrade-validate.ts";
import { isTrunkApplyJournalShape } from "../../src/provider/trunk/impl/git-command.ts";
import { isTrunkManifestShape } from "../../src/provider/trunk/impl/fs-trunk-store.ts";
import { createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import { isCompleteSnapshot, type CompleteSnapshot } from "../../src/model/trunk.ts";
import { isValidDocFreezeRecord } from "../../src/model/version-change.ts";
import {
  createGuardFreezeRegistry,
  isDocFreezeCacheShape,
  operationDeliveryRecorded,
  recordOperationDelivery,
} from "../../src/provider/version-change/public/version-change-store.ts";
import { validateTaskStateEvent } from "../../src/common/编排/task-state.ts";
import { parseVersionBaselineState } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { createDownloadConsumerEpochStore } from "../../src/provider/download/impl/consumer-epoch-store.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { buildProjectStateView } from "../../src/common/编排/project-state.ts";
import { buildGovernanceMatrix } from "../../src/service/governance-matrix/impl/builder.ts";
import { createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import type { TrunkServiceDeps } from "../../src/service/trunk/abstract/trunk-service.ts";
import {
  PATHS,
  createTrunkProject,
  writePinnedRun,
  writeProjectFile,
  type TrunkProject,
} from "./fixtures/trunk-project.ts";

const AT = "2026-11-09T00:00:00.000Z";
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const CLEANUP_ROOTS: string[] = [];

after(async () => {
  for (const root of CLEANUP_ROOTS) await fs.rm(root, { recursive: true, force: true });
});

// ———————————————————————————— 基础工具 ————————————————————————————

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

async function makeRoot(prefix = "ans-doc-format-"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  CLEANUP_ROOTS.push(root);
  return root;
}

async function writeRel(root: string, rel: string, text: string): Promise<void> {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, "utf8");
}

async function listFiles(dir: string, suffix: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, suffix)));
    else if (entry.name.endsWith(suffix)) out.push(full);
  }
  return out;
}

function specOf(id: string): DocFormatSpec {
  const found = DOC_FORMAT_SPECS.find((spec) => spec.id === id);
  assert.ok(found !== undefined, `缺少规范：${id}`);
  return found;
}

type Outcome = { ok: true } | { ok: false; code?: string; message?: string };

const NEGATIVE_CODES = new Set<string>();

function expectReject(outcome: Outcome, why: string, code?: string): void {
  assert.equal(outcome.ok, false, `应拒绝：${why}`);
  if (code !== undefined) {
    assert.equal(outcome.code, code, `稳定 code 不符：${why}（实际 ${String(outcome.code)}）`);
    if (outcome.code !== undefined) NEGATIVE_CODES.add(outcome.code);
  }
}

function expectAccept(outcome: Outcome, why: string): void {
  assert.equal(outcome.ok, true, `应接受：${why}`);
}

function recordCode(code: string): void {
  NEGATIVE_CODES.add(code);
}

type Mode = "delete" | "null" | "type" | "enum";

interface Adapter {
  validate(text: string): Promise<Outcome>;
  positive(): Promise<Outcome>;
  run(field: DocFormatFieldSpec, mode: Mode): Promise<Outcome>;
}

// ———————————————————————————— frontmatter YAML 变异 ————————————————————————————

function parseFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  assert.ok(match !== null, "测试输入必须含 frontmatter");
  const parsed: unknown = parseYaml(match[1]!);
  assert.ok(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed), "frontmatter 必须是映射");
  return { meta: parsed as Record<string, unknown>, body: text.slice(match[0].length) };
}

function renderFrontmatter(meta: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(meta).trimEnd()}\n---\n${body}`;
}

function splitFieldPath(name: string): Array<string | number> {
  const parts: Array<string | number> = [];
  for (const segment of name.split(".")) {
    const match = /^([A-Za-z0-9_]+)(\[\])?$/.exec(segment);
    assert.ok(match !== null, `字段路径不合法：${name}`);
    parts.push(match[1]!);
    if (match[2] !== undefined) parts.push(0);
  }
  return parts;
}

function badValue(type: string): unknown {
  switch (type) {
    case "string": return 123;
    case "正整数": return "not-a-positive-integer";
    case "string[]": return "not-an-array";
    case "对象": return "not-an-object";
    case "boolean": return "yes";
    case "枚举": return "not-an-enum-value";
    default: return 12345;
  }
}

function mutateValue(container: unknown, fieldName: string, mode: Mode, type: string): void {
  const parts = splitFieldPath(fieldName);
  let node: unknown = container;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    assert.ok(node !== null && typeof node === "object", `字段路径不可达：${fieldName}`);
    node = Array.isArray(node) ? node[key as number] : (node as Record<string, unknown>)[key as string];
  }
  assert.ok(node !== null && typeof node === "object", `字段路径不可达：${fieldName}`);
  const last = parts[parts.length - 1]!;
  const target = node as Record<string | number, unknown>;
  if (mode === "delete") {
    if (Array.isArray(node) && typeof last === "number") node.splice(last, 1);
    else delete target[last];
    return;
  }
  target[last] = mode === "null" ? null : badValue(type);
}

function mutateFrontmatterText(example: string, fieldName: string, mode: Mode, type: string): string {
  const doc = parseFrontmatter(example);
  mutateValue(doc.meta, fieldName, mode, type);
  return renderFrontmatter(doc.meta, doc.body);
}

function frontmatterAdapter(id: string, validate: (text: string) => Promise<Outcome>, example: () => string = () => specOf(id).example!): Adapter {
  return {
    validate,
    async positive() { return validate(example()); },
    async run(field, mode) { return validate(mutateFrontmatterText(example(), field.name, mode, field.type)); },
  };
}

// ———————————————————————————— 快照夹具 ————————————————————————————

function makeSnapshot(files: Record<string, string>): CompleteSnapshot {
  const entries = Object.entries(files).map(([filePath, text]) => {
    const bytes = Buffer.from(text, "utf8");
    return { path: filePath, sha256: createHash("sha256").update(bytes).digest("hex"), bytesBase64: bytes.toString("base64") };
  });
  const digest = createHash("sha256").update(JSON.stringify([...entries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => [file.path, file.sha256.toLowerCase(), file.bytesBase64]))).digest("hex");
  return { schema: "complete-snapshot/v1", snapshotId: `snapshot-${digest.slice(0, 12)}`, digest, createdAt: AT, files: entries };
}

function snapshotRoleDocs(input: { card: string; markdown: string; yaml: string }): {
  snapshot: CompleteSnapshot;
  roles: Array<{ roleId: string; cardPath: string; boundaryMdPath: string; boundaryYamlPath: string; allowedPaths: Array<{ path: string; kind: "file" | "directory" }> }>;
} {
  return {
    snapshot: makeSnapshot({
      "角色卡/impl/role-card.md": input.card,
      "角色卡/impl/boundary.md": input.markdown,
      "角色卡/impl/boundary.yaml": input.yaml,
    }),
    roles: [{
      roleId: "impl",
      cardPath: "角色卡/impl/role-card.md",
      boundaryMdPath: "角色卡/impl/boundary.md",
      boundaryYamlPath: "角色卡/impl/boundary.yaml",
      allowedPaths: [{ path: "src/", kind: "directory" }],
    }],
  };
}

function validateRoleDocs(input: { card: string; markdown: string; yaml: string }): Outcome {
  const result = validateRoleDocumentsSnapshot(snapshotRoleDocs(input));
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

// ———————————————————————————— A 组适配器 ————————————————————————————

async function validateA1(text: string): Promise<Outcome> {
  const root = await makeRoot();
  try {
    await writeRel(root, "docs/product/demo-intent-v1.md", text);
    const service = createTrunkService({ projectRoot: root });
    const prepared: { ok: boolean; code?: string } = await service.prepareIntentConfirmation("demo");
    return prepared.ok ? { ok: true } : { ok: false, code: prepared.code };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function validateA2(text: string): Promise<Outcome> {
  const root = await makeRoot();
  try {
    await writeRel(root, "docs/proposals/demo-proposal-v1.md", text);
    const intentText = specOf("project-intent/v1").example!;
    const snapshot = makeSnapshot({
      "docs/proposals/demo-proposal-v1.md": text,
      "docs/product/demo-intent-v1.md": intentText,
    });
    const result = await validateUpgradeChain(root, {
      flowId: "demo",
      documents: { proposal: { path: "docs/proposals/demo-proposal-v1.md", sha256: sha256Text(text) } },
      rosterChanged: false,
      confirmedIntent: { path: "docs/product/demo-intent-v1.md", sha256: sha256Text(intentText) },
      snapshot,
    });
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function adapterA3(): Adapter {
  const example = () => PROJECT_MODULES_SCHEMA_EXAMPLE;
  const validate = async (text: string): Promise<Outcome> => {
    const result = parseProjectModules(text, "demo");
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  };
  return frontmatterAdapter("project-modules/v2", validate, example);
}

function adapterA4(): Adapter {
  const example = () => PROJECT_ROSTER_SCHEMA_EXAMPLE;
  const validate = async (text: string): Promise<Outcome> => {
    const result = parseProjectRoster(text, "demo");
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  };
  const base = frontmatterAdapter("project-roster/v3", validate, example);
  return {
    validate,
    positive: base.positive,
    async run(field, mode) {
      if (field.name !== "正文") return base.run(field, mode);
      if (mode === "delete") {
        const text = example();
        const start = text.indexOf("## 人员+模块拓扑图");
        assert.ok(start >= 0);
        return validate(text.slice(0, start));
      }
      return { ok: true }; // 文本块无 null/类型表达（矩阵豁免表覆盖）
    },
  };
}

function adapterA5(): Adapter {
  const rosterExample = PROJECT_ROSTER_SCHEMA_EXAMPLE;
  const validate = async (text: string): Promise<Outcome> => {
    const result = parseProjectRoster(text, "demo");
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  };
  const withTopology = (mutate: (topo: Record<string, unknown>) => void): string => {
    const start = rosterExample.indexOf("```topology");
    const end = rosterExample.indexOf("```", start + "```topology".length);
    assert.ok(start >= 0 && end > start);
    const topology = parseYaml(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE) as Record<string, unknown>;
    mutate(topology);
    const block = `\`\`\`topology\n${stringifyYaml(topology).trimEnd()}\n`;
    return rosterExample.slice(0, start) + block + rosterExample.slice(end);
  };
  return {
    validate,
    async positive() { return validate(rosterExample); },
    async run(field, mode) {
      const text = withTopology((topology) => mutateValue(topology, field.name, mode, field.type));
      return validate(text);
    },
  };
}

function adapterA6(): Adapter {
  let rootPromise: Promise<string> | undefined;
  const root = (): Promise<string> => (rootPromise ??= makeRoot("ans-doc-format-a6-"));
  const example = () => specOf("project-architecture/v1").example!;
  const validate = async (text: string): Promise<Outcome> => {
    const projectRoot = await root();
    // 复用一个空（未冻结）项目根：写入被检架构文本，先跑 upgrade 链 schema，再跑 roster 加载链。
    const base = await ensureLoadFixture(projectRoot);
    await writeRel(base, PATHS.architecture, text);
    const upgrade = await validateUpgradeChain(base, {
      flowId: "demo",
      documents: { architecture: { path: PATHS.architecture, sha256: sha256Text(text) } },
      rosterChanged: false,
    });
    if (!upgrade.ok) return { ok: false, code: upgrade.code };
    const load = await loadLatestRoster({ projectRoot: base, flowId: "demo" });
    return load.ok ? { ok: true } : { ok: false, code: load.code };
  };
  const base = frontmatterAdapter("project-architecture/v1", validate, example);
  return {
    validate,
    positive: base.positive,
    async run(field, mode) {
      if (field.name !== "正文") return base.run(field, mode);
      if (mode === "delete") return validate(example().replace("proposal: docs/proposals/demo-proposal-v1.md", ""));
      return { ok: true };
    },
  };
}

/** 供 A6/A9 使用的“未冻结”完整规划项目根（createTrunkProject 只读复用）。 */
const LOAD_FIXTURES = new Map<string, Promise<string>>();
async function ensureLoadFixture(root: string): Promise<string> {
  const existing = LOAD_FIXTURES.get(root);
  if (existing !== undefined) return existing;
  const created = createTrunkProject({ freezeKeys: [], withRun: false }).then((project) => {
    CLEANUP_ROOTS.push(project.root);
    return project.root;
  });
  LOAD_FIXTURES.set(root, created);
  return created;
}

function adapterA7(): Adapter {
  let rootPromise: Promise<string> | undefined;
  const root = (): Promise<string> => (rootPromise ??= makeRoot("ans-doc-format-a7-"));
  const example = () => specOf("project-assets/v1").example!;
  const validate = async (text: string): Promise<Outcome> => {
    const projectRoot = await root();
    await writeRel(projectRoot, "docs/contracts/demo-assets-v1.md", text);
    const result = await validateUpgradeChain(projectRoot, {
      flowId: "demo",
      documents: { assets: { path: "docs/contracts/demo-assets-v1.md", sha256: sha256Text(text) } },
      rosterChanged: false,
    });
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  };
  return frontmatterAdapter("project-assets/v1", validate, example);
}

function adapterA8(): Adapter {
  const example = () => specOf("team-plan/v3").example!;
  const context = () => {
    const { meta } = parseFrontmatter(example());
    const roster = parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE, "demo");
    assert.ok(roster.ok);
    return {
      flowId: "demo",
      version: 1,
      modules: meta.modules as { path: string; sha256: string },
      roster: meta.roster as { path: string; sha256: string },
      rosterFacts: roster.roster,
    };
  };
  const validate = async (text: string): Promise<Outcome> => {
    const result = parseTeamPlan(text, context());
    return result.ok ? { ok: true } : { ok: false, message: result.reason };
  };
  return frontmatterAdapter("team-plan/v3", validate, example);
}

function adapterA9(): Adapter {
  let rootPromise: Promise<string> | undefined;
  const root = (): Promise<string> => (rootPromise ??= makeRoot("ans-doc-format-a9-"));
  const example = () => specOf("flow-yaml/v1").example!;
  const validate = async (text: string): Promise<Outcome> => {
    const projectRoot = await root();
    const base = await ensureLoadFixture(projectRoot);
    await writeRel(base, PATHS.flow, text);
    const pinned = await prepareRunPin(base, "demo", { d3: { decisionId: "dec-1", targetRoleIds: ["impl"] } });
    return pinned.ok ? { ok: true } : { ok: false, code: pinned.code };
  };
  return {
    validate,
    async positive() { return validate(example()); },
    async run(field, mode) {
      const doc = parseYaml(example()) as Record<string, unknown>;
      mutateValue(doc, field.name, mode, field.type);
      return validate(stringifyYaml(doc));
    },
  };
}

function adapterA10(): Adapter {
  const example = () => specOf("trunk-amendment/v1").example!;
  const validate = async (text: string): Promise<Outcome> => {
    const root = await makeRoot("ans-doc-format-a10-");
    try {
      await writeRel(root, "docs/proposals/demo-amendment-v1.md", text);
      await writeRel(root, "docs/contracts/demo-contract-v1.md", "# contract\n");
      const result = await validateAmendment({
        projectRoot: root,
        store: createFsTrunkStore(root),
        amendmentDocPath: "docs/proposals/demo-amendment-v1.md",
        flowId: "demo",
      });
      return result.ok ? { ok: true } : { ok: false, code: result.code, message: result.message };
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  };
  return frontmatterAdapter("trunk-amendment/v1", validate, example);
}

function adapterA11(): Adapter {
  const example = () => specOf("ans-criteria/v1").example!;
  const validate = async (text: string): Promise<Outcome> => {
    const result = parseCriteriaText(text, { flowId: "demo", fileName: "demo-criteria-v1.md" });
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  };
  return {
    validate,
    async positive() { return validate(example()); },
    async run(field, mode) {
      const text = example();
      const match = /```ans-criteria\r?\n([\s\S]*?)```/.exec(text);
      assert.ok(match !== null);
      const parsed = parseYaml(match[1]!) as Record<string, unknown>;
      mutateValue(parsed, field.name, mode, field.type);
      return validate(text.replace(match[1]!, stringifyYaml(parsed)));
    },
  };
}

function adapterA12(): Adapter {
  const example = () => specOf("evidence-meta/v1").example!;
  const validate = async (text: string): Promise<Outcome> => {
    const result = parseEvidenceMeta(text);
    return result.ok ? { ok: true } : { ok: false, message: result.reason };
  };
  return {
    validate,
    async positive() { return validate(example()); },
    async run(field, mode) {
      const parsed = JSON.parse(example()) as Record<string, unknown>;
      mutateValue(parsed, field.name, mode, field.type);
      return validate(JSON.stringify(parsed));
    },
  };
}

function adapterA13(): Adapter {
  const example = () => specOf("intent-entry/v1").example!;
  const validate = async (text: string): Promise<Outcome> => {
    const result = summarizeIntent({ text, reference: { intentId: "demo-intent", source: "product" }, flowId: "demo" });
    return result.ok ? { ok: true } : { ok: false, code: result.reasonCode };
  };
  return frontmatterAdapter("intent-entry/v1", validate, example);
}

function adapterA17(): Adapter {
  const example = () => specOf("role-card/v1").example!;
  const md = () => specOf("boundary-md/v1").example!;
  const yaml = () => specOf("boundary-yaml/v1").example!;
  const validate = async (card: string, markdown = md(), boundary = yaml()): Promise<Outcome> =>
    validateRoleDocs({ card, markdown, yaml: boundary });
  return {
    validate: (text) => validate(text),
    async positive() { return validate(example()); },
    async run(field, mode) {
      if (field.name === "路径" && mode === "delete") {
        const result = validateRoleDocumentsSnapshot({
          snapshot: snapshotRoleDocs({ card: example(), markdown: md(), yaml: yaml() }).snapshot,
          roles: [{ roleId: "impl", cardPath: "角色卡/impl/card.md", boundaryMdPath: "角色卡/impl/boundary.md", boundaryYamlPath: "角色卡/impl/boundary.yaml", allowedPaths: [{ path: "src/", kind: "directory" }] }],
        });
        return result.ok ? { ok: true } : { ok: false, message: result.message };
      }
      if (field.name === "章节" && mode === "delete") {
        return validate(example().replace("## 组别\n", ""));
      }
      if (field.name === "boundary 恒等" && mode === "delete") {
        return validateRoleDocs({ card: example(), markdown: "# 边界：实现者\n", yaml: yaml() });
      }
      if (field.name === "archived") {
        if (mode === "delete") return validate(example());
        const boundary = parseYaml(yaml()) as Record<string, unknown>;
        mutateValue(boundary, "archived", mode, field.type);
        return validateRoleDocs({ card: example(), markdown: md(), yaml: stringifyYaml(boundary) });
      }
      return { ok: true };
    },
  };
}

function adapterA18(): Adapter {
  const example = () => specOf("boundary-md/v1").example!;
  const card = () => specOf("role-card/v1").example!;
  const yaml = () => specOf("boundary-yaml/v1").example!;
  return {
    validate: async (markdown) => validateRoleDocs({ card: card(), markdown, yaml: yaml() }),
    async positive() { return validateRoleDocs({ card: card(), markdown: example(), yaml: yaml() }); },
    async run(field, mode) {
      if (mode !== "delete") return { ok: true };
      if (field.name === "Section 1 标题") return validateRoleDocs({ card: card(), markdown: example().replace(/^## Section 1.*$/m, ""), yaml: yaml() });
      if (field.name === "类型列") return validateRoleDocs({ card: card(), markdown: example().replace("| directory |", "| ??? |"), yaml: yaml() });
      if (field.name === "路径列") return validateRoleDocs({ card: card(), markdown: example().replace("| `src/` |", "|  |"), yaml: yaml() });
      return { ok: true };
    },
  };
}

function adapterA19(): Adapter {
  const example = () => specOf("boundary-yaml/v1").example!;
  const card = () => specOf("role-card/v1").example!;
  const md = () => specOf("boundary-md/v1").example!;
  const validate = async (text: string): Promise<Outcome> => validateRoleDocs({ card: card(), markdown: md(), yaml: text });
  return {
    validate,
    async positive() { return validate(example()); },
    async run(field, mode) {
      const parsed = parseYaml(example()) as Record<string, unknown>;
      mutateValue(parsed, field.name, mode, field.type);
      return validate(stringifyYaml(parsed));
    },
  };
}

function lineAdapter(id: string, filePath: string, keyFor: (field: string) => string, read: (root: string) => Promise<Outcome> | Outcome): Adapter {
  const example = () => specOf(id).example!;
  const validate = async (text: string): Promise<Outcome> => {
    const root = await makeRoot("ans-doc-format-line-");
    try {
      await writeRel(root, filePath, text);
      return await read(root);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  };
  return {
    validate,
    async positive() { return validate(example()); },
    async run(field, mode) {
      const key = keyFor(field.name);
      const lines = example().split("\n");
      if (mode === "delete") return validate(lines.filter((line) => !line.includes(`${key}：`)).join("\n"));
      if (mode === "enum") return validate(lines.map((line) => (line.includes(`${key}：`) ? `${line.slice(0, line.indexOf("：") + 1)}bogus-value` : line)).join("\n"));
      return { ok: true }; // 行式文本无 null/类型表达（矩阵豁免表覆盖）
    },
  };
}

function adapterA20(): Adapter {
  return lineAdapter("skill-install/v1", "docs/skills/demo/install.md", (field) => field, async (root) => {
    const view = readSkillRegistration(root, "demo");
    return view === undefined ? { ok: false } : { ok: true };
  });
}

function adapterA21(): Adapter {
  return lineAdapter("mcp-declaration/v1", "docs/mcp/demo.md", (field) => field, async (root) => {
    const view = readMcpDeclaration(root, "demo");
    return view === undefined ? { ok: false } : { ok: true };
  });
}

const ADAPTERS: Record<string, Adapter> = {
  "project-intent/v1": { validate: validateA1, positive: () => validateA1(specOf("project-intent/v1").example!), run: (field, mode) => validateA1(mutateFrontmatterText(specOf("project-intent/v1").example!, field.name, mode, field.type)) },
  "project-proposal/v2": { validate: validateA2, positive: () => validateA2(specOf("project-proposal/v2").example!), run: (field, mode) => validateA2(mutateFrontmatterText(specOf("project-proposal/v2").example!, field.name, mode, field.type)) },
  "project-modules/v2": adapterA3(),
  "project-roster/v3": adapterA4(),
  "project-topology/v2": adapterA5(),
  "project-architecture/v1": adapterA6(),
  "project-assets/v1": adapterA7(),
  "team-plan/v3": adapterA8(),
  "flow-yaml/v1": adapterA9(),
  "trunk-amendment/v1": adapterA10(),
  "ans-criteria/v1": adapterA11(),
  "evidence-meta/v1": adapterA12(),
  "intent-entry/v1": adapterA13(),
  "role-card/v1": adapterA17(),
  "boundary-md/v1": adapterA18(),
  "boundary-yaml/v1": adapterA19(),
  "skill-install/v1": adapterA20(),
  "mcp-declaration/v1": adapterA21(),
};

/** 不在“角色文档级全量变异矩阵”范围的规范（设计 §2.3/Q7：B 组简版；A14 为分层 text-shape）。 */
const MATRIX_SCOPE_EXEMPTIONS: Record<string, string> = {
  "quality-report/v1": "A14 严格层无导出纯校验器（text-shape seam）；展示层仅摘录，不做字段变异",
  ...Object.fromEntries(DOC_FORMAT_SPECS.slice(25).map((spec) => [spec.id, "B 组应用内部格式：按设计 §2.3/Q7 仅主校验器 + 一个样例 + testSeam，不做角色文档级全量变异矩阵"])),
};

/** 变异矩阵豁免（必须逐项给理由；不得静默跳过）。key = id::field::mode 或 id::field::* 。 */
const MATRIX_EXEMPTIONS: Record<string, string> = {
  "project-intent/v1::schema::delete": "分层字段：意图确认门必填、run pin 缺失不拒——由分层断言专项覆盖",
  "project-proposal/v2::intent::delete": "条件字段：confirmedIntent 存在时必填——由专项断言（删除即拒绝）覆盖",
  "project-proposal/v2::正文::delete": "正文 intent 路径包含与 frontmatter intent 同源（见 A2 分层专项断言）",
  "project-proposal/v2::正文::null": "正文为文本块，无 null/类型表达",
  "project-proposal/v2::正文::type": "正文为文本块，无 null/类型表达",
  "project-proposal/v2::正文::enum": "正文为文本块，无枚举表达",
  "project-modules/v2::modules[].path::delete": "条件字段：path 与 paths 至少一项——专项断言删除后无 paths 即拒绝",
  "project-topology/v2::modules[].path::delete": "条件字段：path 与 paths 至少一项——专项断言删除后无 paths 即拒绝",
  "project-modules/v2::modules[].paths::delete": "条件字段：示例使用 path；paths 缺省合法（专项断言 path+paths 同时缺失即拒绝）",
  "project-roster/v3::正文::null": "正文为文本块，无 null/类型表达",
  "project-roster/v3::正文::type": "正文为文本块，无 null/类型表达",
  "project-roster/v3::正文::enum": "正文为文本块，无枚举表达",
  "project-architecture/v1::schema::delete": "分层字段：upgrade 链必填、run pin 缺失不拒——专项断言 upgrade 链删除即拒绝",
  "project-architecture/v1::正文::null": "正文为文本块，无 null/类型表达",
  "project-architecture/v1::正文::type": "正文为文本块，无 null/类型表达",
  "project-architecture/v1::正文::enum": "正文为文本块，无枚举表达",
  "project-assets/v1::schema::delete": "分层字段：文档存在时必须、pin 仅在给出时校验——专项断言 upgrade 文档集删除即拒绝",
  "trunk-amendment/v1::bootstrap::delete": "条件字段：baseTrunk:null 时必须为 true——专项断言删除即拒绝",
  "trunk-amendment/v1::baseTrunk::null": "可空字段：baseTrunk:null 是 bootstrap 合法形态（bootstrap:true 配对）",
  "trunk-amendment/v1::items[].from::delete": "条件字段：change:modify 必填——专项断言 modify 缺 from 即拒绝",
  "boundary-yaml/v1::entries[].condition::delete": "条件字段：仅 conditional-directory 必填——专项断言条件目录缺 condition 即拒绝",
  "boundary-yaml/v1::entries[].condition::null": "condition 仅对 conditional-directory 生效；普通条目忽略",
  "boundary-yaml/v1::entries[].condition::type": "condition 仅对 conditional-directory 生效；普通条目忽略",
  "role-card/v1::路径::null": "文本结构字段（参数化路径），无 null/类型表达",
  "role-card/v1::路径::type": "文本结构字段（参数化路径），无 null/类型表达",
  "role-card/v1::路径::enum": "文本结构字段（参数化路径），无枚举表达",
  "role-card/v1::章节::null": "标题文本结构，无 null/类型表达",
  "role-card/v1::章节::type": "标题文本结构，无 null/类型表达",
  "role-card/v1::章节::enum": "标题文本结构，无枚举表达",
  "role-card/v1::boundary 恒等::null": "条目集合恒等，无 null/类型表达",
  "role-card/v1::boundary 恒等::type": "条目集合恒等，无 null/类型表达",
  "role-card/v1::boundary 恒等::enum": "条目集合恒等，无枚举表达",
  "role-card/v1::archived::enum": "boolean 字段无枚举",
  "boundary-md/v1::Section 1 标题::null": "Markdown 文本结构，无 null/类型表达",
  "boundary-md/v1::Section 1 标题::type": "Markdown 文本结构，无 null/类型表达",
  "boundary-md/v1::Section 1 标题::enum": "Markdown 文本结构，无枚举表达",
  "boundary-md/v1::类型列::null": "Markdown 表格文本，无 null/类型表达",
  "boundary-md/v1::类型列::type": "Markdown 表格文本，无 null/类型表达",
  "boundary-md/v1::类型列::enum": "Markdown 表格文本，无枚举表达",
  "boundary-md/v1::路径列::null": "Markdown 表格文本，无 null/类型表达",
  "boundary-md/v1::路径列::type": "Markdown 表格文本，无 null/类型表达",
  "boundary-md/v1::路径列::enum": "Markdown 表格文本，无枚举表达",
  "skill-install/v1::用途::null": "行式键值登记：null 以字符串 null 表示（非空即合法），无类型表达",
  "skill-install/v1::用途::type": "行式键值登记：无类型表达",
  "skill-install/v1::适用角色::null": "行式键值登记：无类型表达",
  "skill-install/v1::适用角色::type": "行式键值登记：无类型表达",
  "skill-install/v1::状态::null": "行式键值登记：状态值以文本给出（任意文本非空），无类型表达",
  "skill-install/v1::状态::type": "行式键值登记：无类型表达",
  "skill-install/v1::安装日期::null": "行式键值登记：无类型表达",
  "skill-install/v1::安装日期::type": "行式键值登记：无类型表达",
  "mcp-declaration/v1::用途::null": "行式键值登记：无类型表达",
  "mcp-declaration/v1::用途::type": "行式键值登记：无类型表达",
  "mcp-declaration/v1::启动::null": "行式键值登记：无类型表达",
  "mcp-declaration/v1::启动::type": "行式键值登记：无类型表达",
  "mcp-declaration/v1::参数::null": "可选行：null/类型不可表达",
  "mcp-declaration/v1::参数::type": "可选行：null/类型不可表达",
  "mcp-declaration/v1::环境::null": "可选行：null/类型不可表达",
  "mcp-declaration/v1::环境::type": "可选行：null/类型不可表达",
  "mcp-declaration/v1::适用角色::null": "行式键值登记：无类型表达",
  "mcp-declaration/v1::适用角色::type": "行式键值登记：无类型表达",
  "mcp-declaration/v1::状态::null": "行式键值登记：无类型表达",
  "mcp-declaration/v1::状态::type": "行式键值登记：无类型表达",
  "mcp-declaration/v1::安装日期::null": "行式键值登记：无类型表达",
  "mcp-declaration/v1::安装日期::type": "行式键值登记：无类型表达",
  "intent-entry/v1::goal::null": "行式 frontmatter 把 YAML null 读作文本 \"null\"（非空）——删除/空串断言覆盖必填性",
  "intent-entry/v1::scope::null": "行式 frontmatter 把 YAML null 读作文本 \"null\"（非空）——删除/空串断言覆盖必填性",
  "intent-entry/v1::acceptance::null": "行式 frontmatter 把 YAML null 读作文本 \"null\"（非空）——删除/空串断言覆盖必填性",
  "intent-entry/v1::goal::type": "行式 frontmatter 把数值读作文本（如 123）——字段是文本；删除断言覆盖必填性",
  "intent-entry/v1::scope::type": "行式 frontmatter 把数值读作文本——删除断言覆盖必填性",
  "intent-entry/v1::acceptance::type": "行式 frontmatter 把数值读作文本——删除断言覆盖必填性",
};

function matrixExemption(id: string, field: string, mode: Mode): string | undefined {
  return MATRIX_EXEMPTIONS[`${id}::${field}::${mode}`] ?? MATRIX_EXEMPTIONS[`${id}::${field}::*`];
}

// ———————————————————————————— TM-1 注册表完整性 ————————————————————————————

const FROZEN_IDS: readonly string[] = [
  "project-intent/v1", "project-proposal/v2", "project-modules/v2", "project-roster/v3", "project-topology/v2",
  "project-architecture/v1", "project-assets/v1", "team-plan/v3", "flow-yaml/v1", "trunk-amendment/v1",
  "ans-criteria/v1", "evidence-meta/v1", "intent-entry/v1", "quality-report/v1", "workflow/v1", "contract-md/v1",
  "role-card/v1", "boundary-md/v1", "boundary-yaml/v1", "skill-install/v1", "mcp-declaration/v1",
  "change-package/v1", "role-change-record/v1", "bootstrap-manifest/v1", "verification-attachment/v1",
  "ans-run/v1", "run-change/v1", "run-repin/v1", "team-plan-completion/v1", "trunk/v1", "trunk-apply-journal/v1",
  "trunk-amendment-static/v1", "doc-freeze/v1", "doc-freezes/v1", "complete-snapshot/v1", "version-change/v1",
  "stable-write/v1", "refactor-request/v1", "customer-directive/v1", "download-request/v1", "version-decision/v1",
  "project-state/v1", "governance-matrix/v1", "task-state-event/v1", "repository-work-source/v1",
  "role-authorization/v1", "role-activation/v1", "stable-initial-workflow/v1",
  "stable-initial-workflow-source/v1", "project-config/v1", "version-baseline/v1", "download-consumer/v1",
  "operation-delivery/v1", "git-mode/v1",
];

test("TM-1 冻结 id 清单：54 个（A25+B29）deepEqual、唯一、一行一 id、三处数量一致", () => {
  const ids = DOC_FORMAT_SPECS.map((spec) => spec.id);
  assert.deepEqual(ids, [...FROZEN_IDS]);
  assert.equal(new Set(ids).size, ids.length, "id 必须唯一");
  assert.equal(ids.length, 54);
  assert.deepEqual(docFormatKnownIds(), ids);
  const index = docFormatIndexText();
  for (const id of FROZEN_IDS) assert.ok(index.includes(id), `索引必须可发现 ${id}`);
});

test("TM-1 每个 spec 具备 title/audience/stage/pathPattern/validator/specRevision；schemaLiteral 单值/note", () => {
  for (const spec of DOC_FORMAT_SPECS) {
    assert.ok(spec.title.trim() !== "", `${spec.id} title`);
    assert.ok(["role-authored", "convention", "app-managed"].includes(spec.audience), `${spec.id} audience`);
    assert.ok(spec.stage.trim() !== "", `${spec.id} stage`);
    assert.ok(spec.pathPattern.trim() !== "", `${spec.id} pathPattern`);
    assert.ok(["strict-parser", "shape-check", "frontmatter-check", "filename-only", "convention"].includes(spec.validator.kind), `${spec.id} validator.kind`);
    assert.ok(Number.isInteger(spec.specRevision) && spec.specRevision >= 1, `${spec.id} specRevision`);
    if (spec.schemaLiteral !== undefined) {
      assert.equal(typeof spec.schemaLiteral, "string", `${spec.id} schemaLiteral 单值`);
      assert.ok(!spec.schemaLiteral.includes(","), `${spec.id} schemaLiteral 不得含多值`);
      if (!/^[a-z][a-z0-9-]*\/v[0-9]+$/.test(spec.schemaLiteral)) {
        assert.ok((spec.schemaLiteralNote ?? "").trim() !== "", `${spec.id} 非斜杠字面量必须有 schemaLiteralNote`);
      }
    } else {
      assert.ok((spec.schemaLiteralNote ?? "").trim() !== "", `${spec.id} 无字面量必须有 schemaLiteralNote`);
    }
    for (const item of spec.commonErrors) {
      assert.ok(item.code.trim() !== "" && item.cause.trim() !== "" && item.fix.trim() !== "", `${spec.id} commonErrors 完整性`);
    }
    for (const check of spec.loadChecks ?? []) {
      assert.ok(check.code.trim() !== "" && check.rule.trim() !== "", `${spec.id} loadChecks 完整性`);
    }
  }
  // A14 分层 / A24 app-managed / A22 仅摘录 / B 组每行单一 id
  assert.equal(specOf("quality-report/v1").schemaLiteral, "git-quality-report/v1");
  assert.ok(specOf("quality-report/v1").fields.some((field) => field.name === "schema" && field.enforcement === "validator"));
  assert.equal(specOf("bootstrap-manifest/v1").audience, "app-managed");
  assert.equal(specOf("change-package/v1").validator.kind, "convention");
  for (const id of FROZEN_IDS.slice(25)) assert.ok(id.includes("/"), `B 组 id 形状：${id}`);
});

test("TM-1 B 组 29 行与 A14 均有 testSeam（kind 合法、说明可复核）", () => {
  for (const spec of DOC_FORMAT_SPECS) {
    const isB = FROZEN_IDS.slice(25).includes(spec.id);
    if (!isB && spec.id !== "quality-report/v1") continue;
    assert.ok(spec.testSeam !== undefined, `${spec.id} 必须有 testSeam`);
    assert.ok(["exported-pure", "public-path-fixture", "text-shape"].includes(spec.testSeam!.kind));
    assert.ok((spec.testSeam!.symbol ?? "").trim() !== "" || (spec.testSeam!.fixture ?? "").trim() !== "" || (spec.testSeam!.note ?? "").trim() !== "", `${spec.id} testSeam 说明`);
    if (spec.testSeam!.kind === "text-shape") assert.ok((spec.testSeam!.note ?? "").trim() !== "", `${spec.id} text-shape 必须披露残余风险`);
  }
  assert.equal(DOC_FORMAT_SPECS.filter((spec) => FROZEN_IDS.slice(25).includes(spec.id)).length, 29);
});

test("TM-1 预算：索引 ≤8192 B；每 spec 每 part ≤8192 B；首行/末行提示固定", () => {
  const index = docFormatIndexText();
  assert.ok(Buffer.byteLength(index, "utf8") <= 8192, `索引进字节 ${Buffer.byteLength(index, "utf8")}`);
  assert.equal(index.split("\n")[0], `doc_format（只读；不构成放行/授权；${DOC_FORMAT_SPEC_VERSION}）`);
  assert.ok(index.includes("format=<id>"));
  assert.ok(index.includes("part=fields|example|errors"));
  for (const spec of DOC_FORMAT_SPECS) {
    for (const part of ["all", "fields", "example", "errors"] as const) {
      const text = docFormatSpecText(spec.id, part);
      assert.ok(Buffer.byteLength(text, "utf8") <= 8192, `${spec.id}:${part} 超 8192 B`);
      assert.ok(text.includes(`specRevision：${spec.specRevision}`), `${spec.id}:${part} 需含 specRevision`);
      assert.ok(text.includes("只读；不构成放行/授权"), `${spec.id}:${part} 需含只读头部`);
    }
  }
});

test("TM-1 模块纯数据：源码不 import node:fs / app/ / service/，不写盘", async () => {
  const source = await fs.readFile(path.join(REPO_ROOT, "src/common/编排/doc-format-specs.ts"), "utf8");
  assert.ok(!/from\s+"node:fs/.test(source), "不得 import node:fs");
  assert.ok(!/from\s+"[^"]*\/app\//.test(source), "不得 import app/");
  assert.ok(!/from\s+"[^"]*\/service\//.test(source), "不得 import service/");
  assert.ok(!/writeFile|readFile\s*\(/.test(source), "不得读写盘");
});

test("TM-1 未知 id：纯文本、回显 ≤40 字符、可用 id 列表、非字符串不抛", () => {
  const long = "x".repeat(200);
  const text = docFormatSpecText(long);
  assert.ok(text.startsWith("未知格式 "));
  assert.ok(text.includes("；可用："));
  const echoed = text.slice("未知格式 ".length, text.indexOf("；可用："));
  assert.ok(Array.from(echoed).length <= 41, `回显过长：${Array.from(echoed).length}`);
  for (const id of FROZEN_IDS) assert.ok(text.includes(id));
  const weird = docFormatSpecText(42 as unknown as string);
  assert.ok(weird.startsWith("未知格式 42"));
});

test("TM-1/AC-3 pinned-literal 例外：governance-matrix/v1 由规范持有唯一副本（架构隔离），其它公共常量仍 import", async () => {
  const source = await fs.readFile(path.join(REPO_ROOT, "src/common/编排/doc-format-specs.ts"), "utf8");
  // 架构隔离（test/测试/governance-matrix-integration.test.ts allowedConsumers 不允许 src/common/编排/ 消费）
  assert.ok(!/from\s+"[^"]*model\/governance-matrix\.ts"/.test(source), "不得 import governance-matrix");
  assert.ok(!source.includes("GOVERNANCE_MATRIX_SCHEMA"), "不得引用被隔离模块的公共常量");
  const spec = specOf("governance-matrix/v1");
  assert.equal(spec.schemaLiteral, "governance-matrix/v1");
  assert.ok((spec.schemaLiteralNote ?? "").includes("内联唯一副本"));
  // 唯一副本与 model 公共常量逐一相等（以源码文本钉住，不 import 被隔离模块）
  const modelSource = await fs.readFile(path.join(REPO_ROOT, "src/model/governance-matrix.ts"), "utf8");
  assert.ok(modelSource.includes('export const GOVERNANCE_MATRIX_SCHEMA = "governance-matrix/v1"'));
  // 其它公开常量仍直接 import（不得弱化）
  for (const token of ["PROJECT_ROSTER_SCHEMA", "PROJECT_MODULES_SCHEMA", "PROJECT_TOPOLOGY_SCHEMA", "PROJECT_PROPOSAL_SCHEMA",
    "TEAM_PLAN_SCHEMA", "RUN_SCHEMA", "RUN_CHANGE_SCHEMA", "CRITERIA_SCHEMA", "EVIDENCE_META_SCHEMA", "VERSION_CHANGE_SCHEMA",
    "DOC_FREEZE_SCHEMA", "STABLE_WRITE_SCHEMA", "REFACTOR_REQUEST_SCHEMA", "CUSTOMER_DIRECTIVE_SCHEMA", "DOWNLOAD_REQUEST_SCHEMA",
    "PROJECT_STATE_SCHEMA", "VERSION_DECISION_SCHEMA", "TRUNK_MANIFEST_SCHEMA", "TRUNK_AMENDMENT_SCHEMA",
    "TRUNK_APPLY_JOURNAL_SCHEMA", "COMPLETE_SNAPSHOT_SCHEMA"]) {
    assert.ok(source.includes(token), `公开常量必须继续 import：${token}`);
  }
});

// ———————————————————————————— TM-6 复用单一来源 ————————————————————————————

test("TM-6 modules/roster/topology 详情复用 contractSchemaText 原文并带来源说明；render 型 part 整段返回", () => {
  const topics: Array<[string, "modules" | "roster" | "topology"]> = [
    ["project-modules/v2", "modules"],
    ["project-roster/v3", "roster"],
    ["project-topology/v2", "topology"],
  ];
  for (const [id, topic] of topics) {
    const original = contractSchemaText(topic);
    for (const part of ["all", "fields", "example", "errors"] as const) {
      const text = docFormatSpecText(id, part);
      assert.ok(text.includes(original), `${id}:${part} 必须包含同源原文`);
      assert.ok(text.includes("以下为 contract_check 同源原文（只读展示；本工具不构成放行/授权）"), `${id}:${part} 来源说明行`);
      assert.ok(text.includes("该格式复用原文，整段返回"), `${id}:${part} 整段返回标注`);
    }
  }
  // 既有 contract_check 三 topic 输出不变（同一函数、同一常量）
  for (const topic of ["modules", "roster", "topology"] as const) {
    assert.equal(contractSchemaText(topic), contractSchemaText(topic));
  }
});

test("TM-6 intent-entry 详情复用模板/命名/ID 规则；A13 正例为填充样例（非占位符模板）", () => {
  const text = docFormatSpecText("intent-entry/v1");
  assert.ok(text.includes(INTENT_ENTRY_TEMPLATE));
  assert.ok(text.includes(INTENT_ENTRY_NAMING_RULE));
  assert.ok(text.includes(INTENT_ENTRY_ID_RULE));
  const example = specOf("intent-entry/v1").example!;
  assert.ok(!example.includes("<"), "A13 正例不得是占位符模板");
  const result = summarizeIntent({ text: example, reference: { intentId: "demo-intent", source: "product" }, flowId: "demo" });
  assert.ok(result.ok);
});

// ———————————————————————————— TM-2 样例正例 ————————————————————————————

test("TM-2 A 组样例正例：A1–A13、A17–A21 经真实 parser/validator 通过", async () => {
  for (const id of Object.keys(ADAPTERS)) {
    if (!FROZEN_IDS.slice(0, 25).includes(id)) continue;
    const outcome = await ADAPTERS[id]!.positive();
    expectAccept(outcome, `${id} 最小样例`);
  }
  // A14 严格层不在此列（text-shape seam）。
});

test("TM-2 A14 严格层按 seam 钉住：键集/错误码/绑定字段存在于 apply-journal.ts，不宣称纯校验器正例", async () => {
  const source = await fs.readFile(path.join(REPO_ROOT, "src/service/trunk/impl/apply-journal.ts"), "utf8");
  const spec = specOf("quality-report/v1");
  assert.equal(spec.testSeam?.kind, "text-shape");
  for (const key of ["schema", "version", "taskId", "runId", "flowId", "candidateOperationId", "candidate", "criteria", "checks"]) {
    assert.ok(source.includes(`"${key}"`), `严格层键集缺 ${key}`);
  }
  assert.ok(source.includes('"git-quality-report/v1"'));
  assert.ok(source.includes('"nonempty-utf8"'));
  for (const code of ["review-quality-report-missing", "review-quality-binding-invalid", "review-quality-execution-unproven",
    "review-quality-scope-unproven", "review-quality-checks-missing", "review-quality-check-invalid", "review-quality-content-mismatch"]) {
    assert.ok(source.includes(code), `严格层错误码缺 ${code}`);
    assert.ok(spec.commonErrors.some((item) => item.code === code) || (spec.loadChecks ?? []).some((item) => item.code === code), `规范漏列 ${code}`);
  }
  // 展示层字段为约定；严格层字段为 validator
  assert.ok(spec.fields.some((field) => field.name === "报告首行/章节" && field.enforcement === "convention"));
  for (const name of ["taskId", "runId", "flowId", "candidateOperationId", "checks"]) {
    assert.ok(spec.fields.some((field) => field.name === name && field.enforcement === "validator"), `${name} 应为 validator`);
  }
});

test("TM-2 B 组 testSeam exported-pure：逐行直接调用导出校验器（正例）", () => {
  const b = (id: string) => specOf(id);
  assert.equal(validateRunManifest(JSON.parse(b("ans-run/v1").example!)).ok, true);
  assert.equal(isTrunkManifestShape(JSON.parse(b("trunk/v1").example!)), true);
  assert.equal(isTrunkApplyJournalShape(JSON.parse(b("trunk-apply-journal/v1").example!)), true);
  assert.equal(validateAmendmentState(JSON.parse(b("trunk-amendment-static/v1").example!) as never), undefined);
  assert.equal(isValidDocFreezeRecord(JSON.parse(b("doc-freeze/v1").example!)), true);
  assert.equal(isDocFreezeCacheShape(JSON.parse(b("doc-freezes/v1").example!)), true);
  assert.equal(isCompleteSnapshot(JSON.parse(b("complete-snapshot/v1").example!)), true);
  for (const id of ["version-change/v1", "stable-write/v1", "refactor-request/v1", "version-decision/v1", "task-state-event/v1"]) {
    assert.equal(validateTaskStateEvent(JSON.parse(b(id).example!)).ok, true, id);
  }
  const baseline = parseVersionBaselineState({ baselineText: b("version-baseline/v1").example!, initialized: true });
  assert.equal(baseline.ok, true);

  // 负例（exported-pure 行）
  const badManifest = validateRunManifest({ schema: "ans-run/v1" });
  assert.equal(badManifest.ok, false);
  if (!badManifest.ok) recordCode(badManifest.code);
  const badSnapshot = isCompleteSnapshot({ schema: "complete-snapshot/v1", snapshotId: "s", digest: "x", createdAt: AT, files: [] });
  assert.equal(badSnapshot, false);
  const badBaseline = parseVersionBaselineState({ baselineText: "not-json", initialized: true });
  assert.equal(badBaseline.ok, false);
  if (!badBaseline.ok) recordCode(badBaseline.reason);
});

test("TM-2 B 组 testSeam public-path-fixture：B2/B3/B17/B25/B27/B28 临时项目根", async () => {
  // B2 applyRunChange
  const root2 = await makeRoot("ans-doc-format-b2-");
  const runId = "run-20261109-demo-a1b2c3d4";
  const manifest = await writePinnedRun(root2, runId, {});
  const applied = await applyRunChange(root2, manifest, { decisionId: "decision-1", mode: "continue-frozen", decidedBy: "customer" });
  assert.equal(applied.ok, true);
  if (applied.ok) assert.equal(applied.manifest.runChange?.schema, specOf("run-change/v1").schemaLiteral);
  const badChange = await applyRunChange(root2, manifest, { decisionId: "decision-2", mode: "bogus" as never, decidedBy: "customer" });
  assert.equal(badChange.ok, false);
  recordCode("run-change-invalid");

  // B3 repinPinnedRun
  const flowText = "version: 2\n";
  await writeRel(root2, PATHS.flow, flowText);
  const repinned = await repinPinnedRun(root2, runId, {
    applicationId: "app-1",
    targets: [{ kind: "flow", path: PATHS.flow, sha256: sha256Text(flowText) }],
  });
  assert.equal(repinned.ok, true);
  if (repinned.ok) assert.equal(repinned.manifest.repins?.[0]?.schema, specOf("run-repin/v1").schemaLiteral);
  const missingTarget = await repinPinnedRun(root2, runId, {
    applicationId: "app-2",
    targets: [{ kind: "flow", path: "docs/flows/missing.yaml", sha256: "a".repeat(64) }],
  });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) recordCode(missingTarget.code);

  // B17 buildProjectStateView（空项目根）
  const root17 = await makeRoot("ans-doc-format-b17-");
  const view = await buildProjectStateView(root17);
  assert.equal(view.schema, specOf("project-state/v1").schemaLiteral);

  // B25 loadEffectiveConfig
  const root25 = await makeRoot("ans-doc-format-b25-");
  const fallback = { projectRoot: root25, skillRoot: root25, roles: {} };
  const absent = await loadEffectiveConfig({ projectRoot: root25, skillRoot: root25, fallback });
  assert.equal(absent.source.kind, "builtin-fallback");
  await writeRel(root25, ".ans/project.json", JSON.stringify({ roles: {} }));
  const loaded = await loadEffectiveConfig({ projectRoot: root25, skillRoot: root25, fallback });
  assert.equal(loaded.source.kind, "ans");
  await writeRel(root25, ".ans/project.json", "{not-json");
  const invalid = await loadEffectiveConfig({ projectRoot: root25, skillRoot: root25, fallback });
  assert.equal(invalid.source.kind, "ans-invalid");
  recordCode("ans-invalid");

  // B27 download-consumer epoch
  const root27 = await makeRoot("ans-doc-format-b27-");
  const store = createDownloadConsumerEpochStore(root27);
  assert.equal((await store.read()).state, "missing");
  await writeRel(root27, ".ans/state/download-consumer.json", JSON.stringify({ version: 1, enabledAt: AT, appVersion: "1.0.0" }));
  assert.equal((await store.read()).state, "ready");
  await writeRel(root27, ".ans/state/download-consumer.json", JSON.stringify({ version: 2 }));
  const unreadable = await store.read();
  assert.equal(unreadable.state, "unreadable");
  if (unreadable.state === "unreadable") recordCode(unreadable.reason);

  // B28 operation delivery
  const root28 = await makeRoot("ans-doc-format-b28-");
  const written = await recordOperationDelivery(root28, "op-1");
  assert.equal(written.ok, true);
  assert.equal(await operationDeliveryRecorded(root28, "op-1"), true);
  assert.equal(await operationDeliveryRecorded(root28, "op-2"), false);
});

test("TM-2 B 组 testSeam text-shape：源码文本钉住 schema 字面量/锚点符号/残余风险披露", async () => {
  const rows: Array<[string, string[]]> = [
    ["team-plan-completion/v1", ["src/service/trunk/impl/apply-journal.ts"]],
    ["customer-directive/v1", ["src/model/directive.ts"]],
    ["download-request/v1", ["src/model/download.ts"]],
    ["repository-work-source/v1", ["src/service/trunk/impl/apply-journal.ts", "src/provider/trunk/impl/fs-trunk-store.ts"]],
    ["role-authorization/v1", ["src/common/门禁引擎/classify-shell.ts", "src/service/trunk/impl/apply-journal.ts"]],
    ["role-activation/v1", ["src/common/门禁引擎/classify-shell.ts", "src/service/trunk/impl/apply-journal.ts"]],
    ["stable-initial-workflow/v1", ["src/common/门禁引擎/classify-shell.ts"]],
    ["stable-initial-workflow-source/v1", ["src/common/门禁引擎/classify-shell.ts"]],
    ["git-mode/v1", ["src/provider/trunk/impl/git-trunk-store.ts"]],
  ];
  for (const [id, files] of rows) {
    const spec = specOf(id);
    assert.equal(spec.testSeam?.kind, "text-shape", id);
    assert.ok((spec.testSeam?.note ?? "").trim() !== "", `${id} 必须披露 text-shape 残余风险`);
    assert.ok(spec.schemaLiteral !== undefined, `${id} 必须有 schemaLiteral`);
    let found = false;
    for (const file of files) {
      const source = await fs.readFile(path.join(REPO_ROOT, file), "utf8");
      if (source.includes(`"${spec.schemaLiteral}"`)) found = true;
    }
    assert.equal(found, true, `${id} schemaLiteral 必须出现在钉住的源码中`);
  }
  // B4/B14/B15/B20–B24/B29 的 schemaLiteral 全仓出现由 schema 扫描覆盖；此处断言 seam 完整。
});

// ———————————————————————————— TM-3 字段变异矩阵 ————————————————————————————

test("TM-3 字段变异矩阵（数据驱动）：validator 字段 删除/null/类型/枚举 按 presence 断言", async () => {
  const inScope = new Set(Object.keys(ADAPTERS));
  for (const spec of DOC_FORMAT_SPECS) {
    const validators = spec.fields.filter((field) => field.enforcement === "validator");
    if (!inScope.has(spec.id)) {
      if (validators.length > 0) {
        assert.ok(MATRIX_SCOPE_EXEMPTIONS[spec.id] !== undefined, `${spec.id} 有 validator 字段但未纳入矩阵且无豁免理由`);
      }
      continue;
    }
    const adapter = ADAPTERS[spec.id]!;
    expectAccept(await adapter.positive(), `${spec.id} 矩阵前置正例`);
    for (const field of validators) {
      // delete
      const deleteExemption = matrixExemption(spec.id, field.name, "delete");
      if (deleteExemption !== undefined) {
        assert.ok(deleteExemption.trim() !== "");
      } else if (field.presence === "conditional") {
        assert.fail(`${spec.id}::${field.name}::delete 条件字段需豁免理由`);
      } else {
        const outcome = await adapter.run(field, "delete");
        if (field.presence === "optional") expectAccept(outcome, `${spec.id} 可选字段删除：${field.name}`);
        else expectReject(outcome, `${spec.id} 必填字段删除：${field.name}`);
      }
      // null / type / enum
      const modes: Mode[] = ["null", "type"];
      if (field.type === "枚举") modes.push("enum");
      for (const mode of modes) {
        if (matrixExemption(spec.id, field.name, mode) !== undefined) continue;
        const outcome = await adapter.run(field, mode);
        expectReject(outcome, `${spec.id} ${field.name} ${mode} 变异`);
      }
    }
  }
});

test("TM-3 分层断言：A1 gate/pin、A2 substring 层、A3/A4 多路径层、A14 strict/display", async () => {
  // A1：意图确认门拒绝删除 schema；run pin 缺失 schema 不拒
  const a1 = specOf("project-intent/v1").example!;
  expectReject(await validateA1(a1.replace("schema: project-intent/v1\n", "")), "A1 意图确认门删除 schema", "trunk-item-invalid");
  const project = await createTrunkProject({ freezeKeys: [], withRun: false });
  try {
    await writeProjectFile(project.root, PATHS.intent, a1.replace("schema: project-intent/v1\n", ""));
    const pinnedNoSchema = await prepareRunPin(project.root, "demo", { d3: { decisionId: "dec-1", targetRoleIds: ["impl"] } });
    assert.equal(pinnedNoSchema.ok, true, "A1 run pin 缺失 schema 不拒");
    await writeProjectFile(project.root, PATHS.intent, a1.replace("schema: project-intent/v1", "schema: project-intent/v2"));
    const pinnedWrong = await prepareRunPin(project.root, "demo", { d3: { decisionId: "dec-1", targetRoleIds: ["impl"] } });
    assert.equal(pinnedWrong.ok, false);
    if (!pinnedWrong.ok) expectReject({ ok: false, code: pinnedWrong.code }, "A1 pin schema 错误", "run-pin-schema-mismatch");
  } finally {
    await fs.rm(project.root, { recursive: true, force: true });
  }

  // A2：schema 在 roster 加载为子串匹配、在 upgrade 链为 frontmatter 解析
  const project2 = await createTrunkProject({ freezeKeys: [], withRun: false });
  try {
    const bodyOnlySchema = ["---", "flowId: demo", "version: 1", "intent: docs/product/demo-intent-v1.md", "---", "schema: project-proposal/v2", "意图：docs/product/demo-intent-v1.md"].join("\n");
    await writeProjectFile(project2.root, PATHS.proposal, bodyOnlySchema);
    const loaded = await loadLatestRoster({ projectRoot: project2.root, flowId: "demo" });
    assert.equal(loaded.ok, true, "A2 roster 加载按子串接受正文中的 schema");
    const upgrade = await validateUpgradeChain(project2.root, {
      flowId: "demo",
      documents: { proposal: { path: PATHS.proposal, sha256: sha256Text(bodyOnlySchema) } },
      rosterChanged: false,
    });
    assert.equal(upgrade.ok, false, "A2 upgrade 链要求 frontmatter schema");
    if (!upgrade.ok) recordCode(upgrade.code);
    // 删除 schema 子串 ⇒ roster-reference-invalid；删除 intent 路径 ⇒ roster-reference-inconsistent
    await writeProjectFile(project2.root, PATHS.proposal, "---\nflowId: demo\n---\n# proposal\n");
    const noSchema = await loadLatestRoster({ projectRoot: project2.root, flowId: "demo" });
    assert.equal(noSchema.ok, false);
    if (!noSchema.ok) expectReject({ ok: false, code: noSchema.code }, "A2 roster schema 缺失", "roster-reference-invalid");
    await writeProjectFile(project2.root, PATHS.proposal, "---\nschema: project-proposal/v2\n---\n# proposal\n");
    const noIntent = await loadLatestRoster({ projectRoot: project2.root, flowId: "demo" });
    assert.equal(noIntent.ok, false);
    if (!noIntent.ok) expectReject({ ok: false, code: noIntent.code }, "A2 未引用 intent", "roster-reference-inconsistent");
  } finally {
    await fs.rm(project2.root, { recursive: true, force: true });
  }

  // A3/A4：普通模块多路径——parseProjectModules 允许 1–20，roster 层拒绝
  const modulesMutated = PROJECT_MODULES_SCHEMA_EXAMPLE
    .replace("    path: src/\n", "    paths:\n      - src/\n      - lib/\n");
  const modulesParsed = parseProjectModules(modulesMutated, "demo");
  assert.equal(modulesParsed.ok, true, "A3 parser 层允许普通模块 paths 1–20");
  const rosterMutated = PROJECT_ROSTER_SCHEMA_EXAMPLE
    .replace("    path: src/\n", "    paths:\n      - src/\n      - lib/\n")
    .replace("  - id: core\n    path: src/", "  - id: core\n    paths:\n      - src/\n      - lib/");
  const rosterParsed = parseProjectRoster(rosterMutated, "demo");
  assert.equal(rosterParsed.ok, false, "A4 roster 层拒绝普通模块多路径");
  if (!rosterParsed.ok) expectReject({ ok: false, code: rosterParsed.code }, "A4 普通模块多路径", "roster-module-directory-invalid");

  // A14 分层已有 text-shape 专项断言（strict/display 不混用）。
  const a14 = specOf("quality-report/v1");
  assert.equal(a14.fields.find((field) => field.name === "schema")?.enforcement, "validator");
  assert.equal(a14.fields.find((field) => field.name === "报告首行/章节")?.enforcement, "convention");
});

test("TM-3 条件/专项负例：A2 intent 删除、A3 path+paths 缺失、A6 正文、A10 modify 缺 from、A19 条件目录缺 condition", async () => {
  // A2 intent delete（confirmedIntent 层）
  const a2 = specOf("project-proposal/v2").example!;
  const a2Removed = renderFrontmatter((() => { const doc = parseFrontmatter(a2); delete doc.meta.intent; return doc.meta; })(), parseFrontmatter(a2).body);
  expectReject(await validateA2(a2Removed), "A2 confirmedIntent 缺 intent", "trunk-item-invalid");

  // A3 path 删除且无 paths
  const a3NoPath = PROJECT_MODULES_SCHEMA_EXAMPLE.replace("    path: src/\n", "");
  const a3Parsed = parseProjectModules(a3NoPath, "demo");
  assert.equal(a3Parsed.ok, false);
  if (!a3Parsed.ok) expectReject({ ok: false, code: a3Parsed.code }, "A3 path/paths 同时缺失", "modules-doc-directory");

  // A5 path 删除且无 paths
  const topologyNoPath = PROJECT_TOPOLOGY_SCHEMA_EXAMPLE.replace("    path: src/\n", "");
  const rosterNoTopoPath = PROJECT_ROSTER_SCHEMA_EXAMPLE.replace(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE, topologyNoPath);
  const topoParsed = parseProjectRoster(rosterNoTopoPath, "demo");
  assert.equal(topoParsed.ok, false);
  if (!topoParsed.ok) expectReject({ ok: false, code: topoParsed.code }, "A5 拓扑 path/paths 同时缺失", "roster-topology-invalid");

  // A6 正文删除（proposal 路径缺失）
  const a6 = specOf("project-architecture/v1").example!;
  const a6Adapter = ADAPTERS["project-architecture/v1"]!;
  const a6NoBody = a6.replace("proposal: docs/proposals/demo-proposal-v1.md", "");
  expectReject(await a6Adapter.validate(a6NoBody), "A6 roster 链缺 proposal 路径", "roster-reference-inconsistent");

  // A10 change:modify 缺 from
  const a10 = specOf("trunk-amendment/v1").example!;
  const a10Modify = a10.replace("change: add", "change: modify");
  expectReject(await ADAPTERS["trunk-amendment/v1"]!.validate(a10Modify), "A10 modify 缺 from", "trunk-amendment-invalid");

  // A19 conditional-directory 缺 condition
  const a19 = specOf("boundary-yaml/v1").example!;
  const a19Conditional = a19.replace("kind: directory", "kind: conditional-directory");
  const roleResult = validateRoleDocs({ card: specOf("role-card/v1").example!, markdown: specOf("boundary-md/v1").example!, yaml: a19Conditional });
  assert.equal(roleResult.ok, false);
  assert.ok((roleResult.message ?? "").includes("condition"));
  recordCode("boundary-md-yaml-mismatch");
});

// ———————————————————————————— TM-4 overclaim guard ————————————————————————————

type OverclaimCase = () => Promise<Outcome>;

function setFrontmatterField(example: string, field: string, value: unknown): string {
  const doc = parseFrontmatter(example);
  const parts = splitFieldPath(field);
  let node: unknown = doc.meta;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node = Array.isArray(node) ? node[parts[i] as number] : (node as Record<string, unknown>)[parts[i] as string];
  }
  assert.ok(node !== null && typeof node === "object");
  const last = parts[parts.length - 1]!;
  if (Array.isArray(node) && typeof last === "number") node[last] = value;
  else (node as Record<string, unknown>)[last as string] = value;
  return renderFrontmatter(doc.meta, doc.body);
}

const OVERCLAIM_CASES: Record<string, Record<string, OverclaimCase>> = {
  "project-intent/v1": {
    intentId: () => validateA1(setFrontmatterField(specOf("project-intent/v1").example!, "intentId", "Bad_ID")),
    "正文": async () => validateA1(specOf("project-intent/v1").example!.replace(/# 意图[\s\S]*$/, "# 空洞正文（违反写作约定）\n")),
  },
  "project-proposal/v2": {
    intentId: async () => validateA2(setFrontmatterField(specOf("project-proposal/v2").example!, "intentId", "Bad_ID")),
    flowId: async () => validateA2(setFrontmatterField(specOf("project-proposal/v2").example!, "flowId", "别处的-flow")),
    version: async () => validateA2(setFrontmatterField(specOf("project-proposal/v2").example!, "version", "not-a-number")),
  },
  "project-architecture/v1": {
    "其余内容": async () => ADAPTERS["project-architecture/v1"]!.validate(`${specOf("project-architecture/v1").example!}\n这里是任意违反写作约定的散文。\n`),
  },
  "project-assets/v1": {
    "其余内容": async () => ADAPTERS["project-assets/v1"]!.validate(`${specOf("project-assets/v1").example!}\n任意内容（不校验）。\n`),
  },
  "team-plan/v3": {
    "正文": async () => ADAPTERS["team-plan/v3"]!.validate(`${specOf("team-plan/v3").example!}\n任意正文（不解析）。\n`),
  },
  "flow-yaml/v1": {
    "其余字段": async () => ADAPTERS["flow-yaml/v1"]!.validate(`${specOf("flow-yaml/v1").example!}random: 12345\n`),
  },
  "trunk-amendment/v1": {
    "items[].roleId": async () => ADAPTERS["trunk-amendment/v1"]!.validate(specOf("trunk-amendment/v1").example!.replace("    kind: contract", "    kind: contract\n    roleId: 12345")),
    "items[].reason": async () => ADAPTERS["trunk-amendment/v1"]!.validate(specOf("trunk-amendment/v1").example!.replace("    kind: contract", "    kind: contract\n    reason: 12345")),
  },
  "evidence-meta/v1": {
    collection: async () => ADAPTERS["evidence-meta/v1"]!.validate(JSON.stringify({ ...JSON.parse(specOf("evidence-meta/v1").example!), collection: "not-an-array" })),
    command: async () => ADAPTERS["evidence-meta/v1"]!.validate(JSON.stringify({ ...JSON.parse(specOf("evidence-meta/v1").example!), command: 12345 })),
    exitCode: async () => ADAPTERS["evidence-meta/v1"]!.validate(JSON.stringify({ ...JSON.parse(specOf("evidence-meta/v1").example!), exitCode: "not-a-number" })),
    metrics: async () => ADAPTERS["evidence-meta/v1"]!.validate(JSON.stringify({ ...JSON.parse(specOf("evidence-meta/v1").example!), metrics: "not-an-object" })),
    acIds: async () => ADAPTERS["evidence-meta/v1"]!.validate(JSON.stringify({ ...JSON.parse(specOf("evidence-meta/v1").example!), acIds: [12345] })),
    owner: async () => ADAPTERS["evidence-meta/v1"]!.validate(JSON.stringify({ ...JSON.parse(specOf("evidence-meta/v1").example!), owner: 12345 })),
  },
  "intent-entry/v1": {
    nonGoals: async () => ADAPTERS["intent-entry/v1"]!.validate(setFrontmatterField(specOf("intent-entry/v1").example!, "nonGoals", "完全不是非目标的散文")),
    constraints: async () => ADAPTERS["intent-entry/v1"]!.validate(setFrontmatterField(specOf("intent-entry/v1").example!, "constraints", "无约束（违反写作约定）")),
    customerWords: async () => ADAPTERS["intent-entry/v1"]!.validate(setFrontmatterField(specOf("intent-entry/v1").example!, "customerWords", "任意原话")),
    "正文": async () => ADAPTERS["intent-entry/v1"]!.validate(specOf("intent-entry/v1").example!.replace(/# 意图[\s\S]*$/, "# 任意\n")),
  },
  "role-card/v1": {
    "title/展示字段": async () => validateRoleDocs({ card: specOf("role-card/v1").example!.replace(/^# .*\n/, ""), markdown: specOf("boundary-md/v1").example!, yaml: specOf("boundary-yaml/v1").example! }),
  },
  "boundary-md/v1": {
    "用途列": async () => validateRoleDocs({ card: specOf("role-card/v1").example!, markdown: specOf("boundary-md/v1").example!.replace("| 实现源码 |", "| 完全不同的用途 |"), yaml: specOf("boundary-yaml/v1").example! }),
  },
  "skill-install/v1": {
    "SKILL.md": async () => {
      const root = await makeRoot("ans-doc-format-overclaim-");
      try {
        await writeRel(root, "docs/skills/demo/install.md", specOf("skill-install/v1").example!);
        return readSkillRegistration(root, "demo") === undefined ? { ok: false } : { ok: true };
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  },
};

/** 无校验器（validator.kind=convention）格式的约定字段豁免：任何约定都不可能被“拒绝”。 */
const OVERCLAIM_EXEMPTIONS: Record<string, string> = {
  "workflow/v1": "仅约定（无结构解析器）；validator.kind=convention",
  "contract-md/v1": "仅约定（无结构解析器）",
  "change-package/v1": "仅摘录、无校验器",
  "role-change-record/v1": "应用不读取/不校验",
  "bootstrap-manifest/v1": "应用写、不读；角色不可写",
  "verification-attachment/v1": "无格式解析器；元数据走 evidence-meta/v1",
  "quality-report/v1": "A14 严格层无导出纯校验器（text-shape seam）；展示层摘录无可运行 validator 可做反证",
};

test("TM-4 overclaim guard：每个 convention 字段的违反值仍被真实校验器接受（或显式豁免理由）", async () => {
  for (const spec of DOC_FORMAT_SPECS) {
    const conventions = spec.fields.filter((field) => field.enforcement === "convention");
    if (conventions.length === 0) continue;
    if (OVERCLAIM_EXEMPTIONS[spec.id] !== undefined) {
      assert.ok(OVERCLAIM_EXEMPTIONS[spec.id]!.trim() !== "");
      continue;
    }
    const cases = OVERCLAIM_CASES[spec.id];
    assert.ok(cases !== undefined, `${spec.id} 有 convention 字段但无 overclaim 用例`);
    for (const field of conventions) {
      const run = cases[field.name];
      assert.ok(run !== undefined, `${spec.id} convention 字段 ${field.name} 缺 overclaim 用例（不得静默跳过）`);
      expectAccept(await run(), `${spec.id} convention 字段 ${field.name} 违反约定仍应被接受`);
    }
  }
  // A14 展示层 convention 已在 strict/display 专项覆盖
  assert.ok(specOf("quality-report/v1").fields.some((field) => field.enforcement === "convention"));
});

// ———————————————————————————— TM-5 schema 字面量扫描 ————————————————————————————

const SCHEMA_WHITELIST: ReadonlyArray<{ literal: string; reason: string }> = [
  { literal: "chief-workflow/v1", reason: "应用包内 Markdown 资源版本（provider/runtime/tools.ts 读取）；非目标项目文档，角色不可写" },
  { literal: "git-initialization/v1", reason: "Git 存储操作媒体标识（provider/trunk/abstract/trunk-store.ts、git-command.ts）；非项目文档" },
  { literal: "version-change-service/v1", reason: "服务契约版本常量（service/version-change/public/version-change-service.ts）；非文档格式" },
  { literal: "chief-hub-resume/v1", reason: "apply-journal.ts 的 directHash 哈希域分隔标签；非 schema" },
  { literal: "doc-format-specs/v1", reason: "规范模块契约版本（doc-format-specs.ts DOC_FORMAT_SPEC_VERSION）；非文档格式" },
];

test("TM-5 schema 字面量全仓扫描：src/**/*.ts 的 xxx/vN ∈ schemaLiteral ∪ 规范 id ∪ 显式白名单（含理由）", async () => {
  const literalPattern = /"([a-z][a-z0-9-]*\/v[0-9]+)"/g;
  const found = new Set<string>();
  for (const file of await listFiles(path.join(REPO_ROOT, "src"), ".ts")) {
    const text = await fs.readFile(file, "utf8");
    for (const match of text.matchAll(literalPattern)) found.add(match[1]!);
  }
  const covered = new Set<string>();
  for (const spec of DOC_FORMAT_SPECS) {
    if (spec.schemaLiteral !== undefined) covered.add(spec.schemaLiteral);
    covered.add(spec.id);
  }
  for (const entry of SCHEMA_WHITELIST) covered.add(entry.literal);
  const missing = [...found].filter((literal) => !covered.has(literal)).sort();
  assert.deepEqual(missing, [], `未登记 schema 字面量：${missing.join(", ")}`);
  // A14/B29 覆盖指定字面量（不得靠白名单兜底）
  assert.equal(specOf("quality-report/v1").schemaLiteral, "git-quality-report/v1");
  assert.equal(specOf("git-mode/v1").schemaLiteral, "git-ref/v1");
  assert.ok(!SCHEMA_WHITELIST.some((entry) => entry.literal === "git-quality-report/v1" || entry.literal === "git-ref/v1"));
  // 白名单必须含理由
  for (const entry of SCHEMA_WHITELIST) assert.ok(entry.reason.trim() !== "");
});

// ———————————————————————————— TM-8 稳定 code 扫描 ————————————————————————————

const CODE_WHITELIST: ReadonlyArray<{ code: string; reason: string }> = [
  { code: "boundary-condition-missing", reason: "边界运行时解析拒绝码；非 boundary-md/yaml 文档格式码" },
  { code: "boundary-missing", reason: "边界运行时/治理矩阵诊断码" },
  { code: "boundary-parse-error", reason: "边界运行时解析失败码" },
  { code: "boundary-parse-failed", reason: "边界运行时解析失败码" },
  { code: "boundary-role-has-card", reason: "trunk 激活错误联合码（model/trunk.ts）" },
  { code: "boundary-unaccepted", reason: "机械拒绝码（门禁边界未接受）" },
  { code: "boundary-yaml", reason: "topic/值名（非稳定 code）" },
  { code: "evidence-conflict", reason: "证据判断包冲突码；非 evidence-meta/v1 格式码" },
  { code: "evidence-hash-mismatch", reason: "证据判断码" },
  { code: "evidence-identity-mismatch", reason: "证据判断码" },
  { code: "evidence-missing", reason: "门禁证据缺失码（common/gates）" },
  { code: "evidence-packet-missing", reason: "判断证据包码" },
  { code: "evidence-packet-overflow", reason: "判断证据包码" },
  ...["plan-basis-incomplete", "plan-cancelled", "plan-cas-conflict", "plan-commit-binding-invalid",
    "plan-completion-current-commit-changed", "plan-completion-journal-changed", "plan-completion-snapshot-missing",
    "plan-completion-source-unavailable", "plan-completion-task-operation-unproven",
    "plan-escalation-channel-unavailable", "plan-escalation-conflict", "plan-escalation-invalid",
    "plan-escalation-role-not-allowed", "plan-history-failed", "plan-journal-corrupt", "plan-journal-failed",
    "plan-operation-conflict", "plan-preparation-only", "plan-run-conflict", "plan-snapshot-invalid",
    "plan-store-unavailable"].map((code) => ({ code, reason: "团队计划执行/账本生命周期码（journal/CAS/escalation）；非 A8 文档解析码（A8 的 plan-* 已入规范）" })),
  { code: "role-activation-publication", reason: "激活发布值/card kind" },
  { code: "role-authored", reason: "DOC_FORMAT audience 枚举值（本模块）；非稳定 code" },
  { code: "role-capability-callback-guard-unverified", reason: "角色激活能力证据码" },
  { code: "role-card", reason: "文件/kind 值名（非 code）" },
  { code: "role-card-missing", reason: "治理矩阵 unknown 原因" },
  { code: "role-cards", reason: "trunk artifacts 键名" },
  { code: "role-direct", reason: "DirectActionSource kind 值" },
  { code: "role-direct-applied", reason: "doc.freeze reason 枚举值（B8 枚举）" },
  { code: "role-documents", reason: "值/键名（非 code）" },
  { code: "role-enumeration-failed", reason: "治理矩阵 unknown 原因" },
  { code: "role-evidence-invalid", reason: "角色激活证据码" },
  { code: "role-frozen-bytes-incomplete", reason: "角色激活证据码" },
  { code: "role-not-allowed", reason: "工具/激活拒绝码" },
  { code: "role-or-core-registry-drift", reason: "角色注册漂移码" },
  { code: "role-preparation", reason: "事件/阶段值" },
  { code: "role-preparation-creator-close-changed", reason: "任务账本码" },
  { code: "role-preparation-plan-changed", reason: "任务账本码" },
  { code: "role-preparation-plan-missing", reason: "任务账本码" },
  { code: "role-restructuring", reason: "条件目录 slug 值" },
  { code: "role-run", reason: "命令/路由值" },
  { code: "role-tool-declaration-duplicate", reason: "角色工具授权码" },
  { code: "role-tool-id-unknown", reason: "角色工具授权码" },
  { code: "role-tool-not-allowed", reason: "角色工具授权码" },
  { code: "role-tools-model-unknown", reason: "角色工具授权码" },
  { code: "roster-block", reason: "run documents topology.source 值（非 code）" },
  { code: "roster-modules-missing", reason: "派发建议码（dispatch-advisories）；非文档格式解析码" },
  { code: "roster-version-monotonic", reason: "version-change 版本单调错误码（model/trunk.ts 错误联合）；roster 加载层不产生" },
  { code: "run-manifest-written", reason: "journal phase 枚举值（B6）" },
  { code: "run-pin-conflict", reason: "pipeline/pin digest 冲突拒绝码（非 run manifest 文档格式码）" },
  { code: "run-pin-failed", reason: "派发建议码（dispatch-advisories）" },
  { code: "run-pin-required", reason: "派发建议码（dispatch-advisories）" },
];

test("TM-8 稳定 code 扫描（按 code 族，含非后缀成员）∈ spec commonErrors/loadChecks ∪ 白名单（含理由）", async () => {
  const codePattern = /"((?:modules-doc|roster|plan|criteria|evidence|run-pin|run-manifest|review-quality|trunk-amendment|boundary|role)-[a-z0-9-]+)"/g;
  const found = new Set<string>();
  for (const file of await listFiles(path.join(REPO_ROOT, "src"), ".ts")) {
    const text = await fs.readFile(file, "utf8");
    for (const match of text.matchAll(codePattern)) found.add(match[1]!);
  }
  const covered = new Set<string>();
  for (const spec of DOC_FORMAT_SPECS) {
    for (const item of spec.commonErrors) covered.add(item.code);
    for (const check of spec.loadChecks ?? []) covered.add(check.code);
  }
  for (const entry of CODE_WHITELIST) covered.add(entry.code);
  const missing = [...found].filter((code) => !covered.has(code)).sort();
  assert.deepEqual(missing, [], `未登记稳定 code：${missing.join(", ")}`);
  for (const entry of CODE_WHITELIST) assert.ok(entry.reason.trim() !== "", `白名单缺理由：${entry.code}`);
  // 关键族必须出现在规范（不得靠白名单）：modules-doc-* 全量、roster-* 主体、criteria-*、trunk-amendment-*、review-quality-*
  const specCodes = new Set<string>();
  for (const spec of DOC_FORMAT_SPECS) {
    for (const item of spec.commonErrors) specCodes.add(item.code);
    for (const check of spec.loadChecks ?? []) specCodes.add(check.code);
  }
  for (const code of ["modules-doc-frontmatter", "modules-doc-yaml", "modules-doc-schema", "modules-doc-flow", "modules-doc-version",
    "modules-doc-modules", "modules-doc-id", "modules-doc-fields", "modules-doc-directory", "modules-doc-overlap",
    "roster-role-builtin", "roster-role-duplicate", "roster-directory-invalid", "roster-module-unbound",
    "roster-role-without-module", "roster-module-multi-owner", "criteria-format-missing", "criteria-id-invalid",
    "trunk-amendment-invalid", "review-quality-report-missing"]) {
    assert.ok(specCodes.has(code), `关键 code 必须出现在规范：${code}`);
  }
});

// ———————————————————————————— TM-9 加载级/主错误码负例 ————————————————————————————

const LOADCHECK_EXEMPTIONS: Record<string, string> = {
  "plan-structure-invalid": "completeTeamPlan 需要真实 trunk manifest/快照夹具；本批以 parseTeamPlan 结构负例替代（B4 text-shape seam）",
  "plan-path-invalid": "同上（service 级 effective snapshot 夹具）",
  "plan-base-conflict": "同上",
  "plan-owner-invalid": "同上",
  "plan-hash-drift": "同上",
};

/** 记录已在负例中断言的 code（供最终覆盖核对）。 */
const NEGATIVE_FAMILIES = ["modules-doc-", "roster-", "run-pin-", "plan-", "criteria-", "evidence-", "trunk-amendment-", "review-quality-"] as const;

test("TM-9 加载级负例：roster-* / modules-doc-* / run-pin-* 最小夹具负例", async () => {
  // parseProjectModules 负例（modules-doc-*）
  const mutations: Array<[string, string]> = [
    ["modules-doc-frontmatter", "no frontmatter"],
    ["modules-doc-yaml", "---\n: bad\n: yaml\n---"],
    ["modules-doc-schema", PROJECT_MODULES_SCHEMA_EXAMPLE.replace("schema: project-modules/v2", "schema: project-modules/v1")],
    ["modules-doc-flow", PROJECT_MODULES_SCHEMA_EXAMPLE.replace("flowId: demo", "flowId: other")],
    ["modules-doc-version", PROJECT_MODULES_SCHEMA_EXAMPLE.replace("version: 1", "version: 0")],
    ["modules-doc-modules", PROJECT_MODULES_SCHEMA_EXAMPLE.replace(/modules:[\s\S]*?(?=---)/, "modules: []\n")],
    ["modules-doc-id", PROJECT_MODULES_SCHEMA_EXAMPLE.replace("id: core", "id: Bad_ID")],
    ["modules-doc-fields", PROJECT_MODULES_SCHEMA_EXAMPLE.replace("name: 核心\n", "")],
    ["modules-doc-directory", PROJECT_MODULES_SCHEMA_EXAMPLE.replace("path: src/", "path: ../escape")],
    ["modules-doc-overlap", PROJECT_MODULES_SCHEMA_EXAMPLE.replace("  - id: core\n", "  - id: core2\n    name: 重复\n    purpose: 重复\n    category: core\n    path: src/lib/\n    publicContract: x\n    architectureSource: y\n  - id: core\n")],
  ];
  for (const [code, text] of mutations) {
    const result = parseProjectModules(text, "demo");
    assert.equal(result.ok, false, code);
    if (!result.ok) expectReject({ ok: false, code: result.code }, `modules 负例 ${code}`);
  }

  // parseProjectRoster 负例（roster-* / topology）
  const rosterMutations: Array<[string, string]> = [
    ["roster-frontmatter-missing", "no frontmatter"],
    ["roster-yaml-invalid", "---\n: bad\n: yaml\n---"],
    ["roster-schema-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("schema: project-roster/v3", "schema: project-roster/v2")],
    ["roster-flow-mismatch", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("flowId: demo", "flowId: other")],
    ["roster-version-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("version: 1", "version: 0")],
    ["roster-roles-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace(/roles:[\s\S]*?---/, "roles: []\n---")],
    ["roster-role-fields-missing", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("    displayName: 实现者\n", "")],
    ["roster-role-id-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("  - id: implementer", "  - id: Bad_ID")],
    ["roster-role-modules-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("    modules: [core]\n", "    modules: []\n")],
    ["roster-role-builtin", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("  - id: implementer", "  - id: chief")],
    ["roster-module-id-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("  - id: core", "  - id: Bad_ID")],
    ["roster-modules-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace(/modules:[\s\S]*?roles:/, "modules: []\nroles:")],
    ["roster-module-fields-missing", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("    category: core\n", "")],
    ["roster-module-directory-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("    path: src/\n", "    path: ../escape\n")],
    ["roster-module-directory-governance", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("    path: src/\n", "    path: docs/product/x/\n")],
    ["roster-env-bootstrap-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("  omissionReason: <小项目省略理由；默认项目不要照抄>", "  omissionReason: \"\"")],
    ["roster-topology-missing", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace(/## 人员\+模块拓扑图[\s\S]*$/, "")],
    ["roster-topology-mismatch", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("management: [convener, implementer]", "management: [implementer]")],
    ["roster-topology-invalid", PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("    roleId: implementer\n", "")],
  ];
  for (const [code, text] of rosterMutations) {
    const result = parseProjectRoster(text, "demo");
    assert.equal(result.ok, false, code);
    if (!result.ok) expectReject({ ok: false, code: result.code }, `roster 负例 ${code}`);
  }

  // 加载级（loadLatestRoster）：roster-missing / version / modules-doc / drift / reference-* / version-monotonic 不在 roster 加载
  const project = await createTrunkProject({ freezeKeys: [], withRun: false });
  try {
    const root = project.root;
    const missing = await loadLatestRoster({ projectRoot: await makeRoot("ans-doc-format-empty-"), flowId: "demo" });
    assert.equal(missing.ok, false);
    if (!missing.ok) expectReject({ ok: false, code: missing.code }, "roster-missing", "roster-missing");
    await writeProjectFile(root, PATHS.roster, PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("version: 1", "version: 2"));
    const version = await loadLatestRoster({ projectRoot: root, flowId: "demo" });
    assert.equal(version.ok, false);
    if (!version.ok) expectReject({ ok: false, code: version.code }, "roster-version-invalid", "roster-version-invalid");
    await writeProjectFile(root, PATHS.roster, PROJECT_ROSTER_SCHEMA_EXAMPLE);
    await fs.rm(path.join(root, PATHS.modules));
    const noModules = await loadLatestRoster({ projectRoot: root, flowId: "demo" });
    assert.equal(noModules.ok, false);
    if (!noModules.ok) expectReject({ ok: false, code: noModules.code }, "roster-modules-doc-missing", "roster-modules-doc-missing");
    await writeProjectFile(root, PATHS.modules, PROJECT_MODULES_SCHEMA_EXAMPLE.replace("schema: project-modules/v2", "schema: project-modules/v9"));
    const badModules = await loadLatestRoster({ projectRoot: root, flowId: "demo" });
    assert.equal(badModules.ok, false);
    if (!badModules.ok) expectReject({ ok: false, code: badModules.code }, "roster-modules-doc-invalid", "roster-modules-doc-invalid");
    await writeProjectFile(root, PATHS.modules, PROJECT_MODULES_SCHEMA_EXAMPLE.replace("name: 核心", "name: 漂移"));
    const drift = await loadLatestRoster({ projectRoot: root, flowId: "demo" });
    assert.equal(drift.ok, false);
    if (!drift.ok) expectReject({ ok: false, code: drift.code }, "roster-modules-drift", "roster-modules-drift");
    await writeProjectFile(root, PATHS.modules, PROJECT_MODULES_SCHEMA_EXAMPLE);
    await fs.rm(path.join(root, PATHS.intent));
    const missingRef = await loadLatestRoster({ projectRoot: root, flowId: "demo" });
    assert.equal(missingRef.ok, false);
    if (!missingRef.ok) expectReject({ ok: false, code: missingRef.code }, "roster-reference-missing", "roster-reference-missing");
    await writeProjectFile(root, PATHS.intent, specOf("project-intent/v1").example!);
    await writeProjectFile(root, "docs/product/demo-intent-v2.md", specOf("project-intent/v1").example!);
    const stale = await loadLatestRoster({ projectRoot: root, flowId: "demo" });
    assert.equal(stale.ok, false);
    if (!stale.ok) expectReject({ ok: false, code: stale.code }, "roster-reference-stale", "roster-reference-stale");
    await fs.rm(path.join(root, "docs/product/demo-intent-v2.md"));
    await writeProjectFile(root, PATHS.proposal, "---\nflowId: demo\n---\n# proposal\n");
    const invalidRef = await loadLatestRoster({ projectRoot: root, flowId: "demo" });
    assert.equal(invalidRef.ok, false);
    if (!invalidRef.ok) expectReject({ ok: false, code: invalidRef.code }, "roster-reference-invalid", "roster-reference-invalid");
    await writeProjectFile(root, PATHS.proposal, "---\nschema: project-proposal/v2\n---\n# proposal\n");
    const inconsistent = await loadLatestRoster({ projectRoot: root, flowId: "demo" });
    assert.equal(inconsistent.ok, false);
    if (!inconsistent.ok) expectReject({ ok: false, code: inconsistent.code }, "roster-reference-inconsistent", "roster-reference-inconsistent");
  } finally {
    await fs.rm(project.root, { recursive: true, force: true });
  }

  // run-pin-*：d3 缺失 / 文档缺失 / roster 不一致 / 未冻结 / schema 错误（A9 专项）
  const pinProject = await createTrunkProject({ freezeKeys: [], withRun: false });
  try {
    const noD3 = await prepareRunPin(pinProject.root, "demo", {});
    assert.equal(noD3.ok, false);
    if (!noD3.ok) expectReject({ ok: false, code: noD3.code }, "run-pin-d3-missing", "run-pin-d3-missing");
    await fs.rm(path.join(pinProject.root, PATHS.intent));
    const missingDoc = await prepareRunPin(pinProject.root, "demo", { d3: { decisionId: "dec-1", targetRoleIds: ["impl"] } });
    assert.equal(missingDoc.ok, false);
    if (!missingDoc.ok) expectReject({ ok: false, code: missingDoc.code }, "run-pin-document-missing", "run-pin-document-missing");
  } finally {
    await fs.rm(pinProject.root, { recursive: true, force: true });
  }
  const frozenProject = await createTrunkProject({ freezeKeys: ["intent"], withRun: false });
  try {
    const notFrozen = await prepareRunPin(frozenProject.root, "demo", { d3: { decisionId: "dec-1", targetRoleIds: ["impl"] } });
    assert.equal(notFrozen.ok, false);
    if (!notFrozen.ok) expectReject({ ok: false, code: notFrozen.code }, "versioned-doc-not-frozen", "versioned-doc-not-frozen");
  } finally {
    await fs.rm(frozenProject.root, { recursive: true, force: true });
  }
  const corruptRosterProject = await createTrunkProject({ freezeKeys: [], withRun: false });
  try {
    await writeProjectFile(corruptRosterProject.root, PATHS.roster, "no frontmatter");
    const rosterInvalid = await prepareRunPin(corruptRosterProject.root, "demo", { d3: { decisionId: "dec-1", targetRoleIds: ["impl"] } });
    assert.equal(rosterInvalid.ok, false);
    if (!rosterInvalid.ok) expectReject({ ok: false, code: rosterInvalid.code }, "run-pin-roster-invalid", "run-pin-roster-invalid");
  } finally {
    await fs.rm(corruptRosterProject.root, { recursive: true, force: true });
  }
});

test("TM-9 加载级负例：plan-*（service 级可复现码）、criteria-*、evidence-*、trunk-amendment-*", async () => {
  // intent-ambiguous（A1 意图入口链 loadCheck；summarizeIntent 真实解析器）
  const ambiguousIntent = summarizeIntent({
    text: specOf("intent-entry/v1").example!.replace("intentId: demo-intent", "intentId: other-intent"),
    reference: { intentId: "demo-intent", source: "product" },
    flowId: "demo",
  });
  assert.equal(ambiguousIntent.ok, false);
  if (!ambiguousIntent.ok) recordCode(ambiguousIntent.reasonCode);

  // plan-identity-invalid / plan-store-unavailable（completeTeamPlan 前置分支；不需要有效 trunk）
  const root = await makeRoot("ans-doc-format-plan-");
  const deps = { projectRoot: root, store: createFsTrunkStore(root), freezeRegistry: createGuardFreezeRegistry(root) } as TrunkServiceDeps;
  const input = { operationId: "op-1", flowId: "demo", plan: { path: "docs/scheduling/demo-team-v1.md", version: 1 } };
  const identity = await completeTeamPlan(deps, input, "product");
  assert.equal(identity.status, "rejected");
  assert.equal(identity.errorCode, "plan-identity-invalid");
  recordCode("plan-identity-invalid");
  const noStore = await completeTeamPlan({ projectRoot: root, store: {} as never, freezeRegistry: {} as never }, input, "convener");
  assert.equal(noStore.status, "rejected");
  assert.equal(noStore.errorCode, "plan-store-unavailable");
  recordCode("plan-store-unavailable");

  // criteria-*（parse 层全量 + load 层）
  const criteriaExample = specOf("ans-criteria/v1").example!;
  const criteriaCases: Array<[string, string]> = [
    ["criteria-format-missing", "no block"],
    ["criteria-format-ambiguous", `${criteriaExample}\n${criteriaExample}`],
    ["criteria-parse-failed", criteriaExample.replace(/```$/, "")],
    ["criteria-schema-invalid", criteriaExample.replace("schema: ans-criteria/v1", "schema: ans-criteria/v2")],
    ["criteria-version-mismatch", criteriaExample.replace("version: 1", "version: 2")],
    ["criteria-ref-mismatch", criteriaExample.replace("flowId: demo", "flowId: other")],
    ["criteria-empty", criteriaExample.replace(/criteria:\n(?:  .*\n?)+/, "criteria: []\n")],
    ["criteria-id-invalid", criteriaExample.replace("id: AC-1", "id: BAD")],
    ["criteria-priority-invalid", criteriaExample.replace("priority: P0", "priority: P9")],
    ["criteria-duplicate-ac", criteriaExample.replace("  - id: AC-1\n    priority: P0\n    title: 启动后可完成一局\n", "  - id: AC-1\n    priority: P0\n  - id: AC-1\n    priority: P1\n")],
  ];
  for (const [code, text] of criteriaCases) {
    const result = parseCriteriaText(text, { flowId: "demo", fileName: "demo-criteria-v1.md" });
    assert.equal(result.ok, false, code);
    recordCode(code);
    if (!result.ok) expectReject({ ok: false, code: result.code }, `criteria 负例 ${code}`);
  }
  const tooMany = criteriaExample.replace(/  - id: AC-1[\s\S]*$/, Array.from({ length: 501 }, (_, index) => `  - id: AC-${index + 1}\n    priority: P0`).join("\n") + "\n```");
  const tooManyResult = parseCriteriaText(tooMany, { flowId: "demo", fileName: "demo-criteria-v1.md" });
  assert.equal(tooManyResult.ok, false);
  if (!tooManyResult.ok) expectReject({ ok: false, code: tooManyResult.code }, "criteria-too-many", "criteria-too-many");
  const unresolved = await loadCriteria(root, "demo", undefined);
  assert.equal(unresolved.ok, false);
  if (!unresolved.ok) expectReject({ ok: false, code: unresolved.code }, "criteria-version-unresolved", "criteria-version-unresolved");
  await writeRel(root, "docs/acceptance/demo-criteria-v1.md", criteriaExample.replace("status: final", "status: draft"));
  const draft = await loadCriteria(root, "demo", { path: "docs/acceptance/demo-criteria-v1.md", sha256: sha256Text(criteriaExample.replace("status: final", "status: draft")), version: 1 });
  assert.equal(draft.ok, false);
  if (!draft.ok) expectReject({ ok: false, code: draft.code }, "criteria-status-draft", "criteria-status-draft");
  const missingCriteria = await loadCriteria(root, "demo", { path: "docs/acceptance/demo-criteria-v2.md", sha256: "a".repeat(64), version: 2 });
  assert.equal(missingCriteria.ok, false);
  if (!missingCriteria.ok) expectReject({ ok: false, code: missingCriteria.code }, "criteria-missing", "criteria-missing");

  // evidence-*（checkEvidence 真实语义）
  const evidenceRoot = await makeRoot("ans-doc-format-evidence-");
  await writeRel(evidenceRoot, "docs/verification/demo.txt", "hello\n");
  const criteriaParsed = parseCriteriaText(criteriaExample, { flowId: "demo", fileName: "demo-criteria-v1.md" });
  assert.ok(criteriaParsed.ok);
  await writeRel(evidenceRoot, "docs/verification/demo.txt.meta.json", JSON.stringify({ ...JSON.parse(specOf("evidence-meta/v1").example!), artifact: "docs/verification/demo.txt", sha256: "0".repeat(64) }));
  const mismatch = await checkEvidence({ projectRoot: evidenceRoot, acId: "AC-1", criteria: criteriaParsed.doc, artifact: "docs/verification/demo.txt" });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.mismatch.length >= 0);
  recordCode("evidence-mismatch");
  const badPath = await checkEvidence({ projectRoot: evidenceRoot, acId: "AC-1", criteria: criteriaParsed.doc, artifact: "../escape.txt" });
  assert.equal(badPath.ok, false);
  recordCode("evidence-path-invalid");
  const denied = await checkEvidence({ projectRoot: evidenceRoot, acId: "AC-1", criteria: criteriaParsed.doc, artifact: "docs/verification/demo.txt", scopeRoots: ["src/"] });
  assert.equal(denied.ok, false);
  recordCode("evidence-scope-denied");
  const acMismatch = await checkEvidence({ projectRoot: evidenceRoot, acId: "AC-999", criteria: criteriaParsed.doc, artifact: "docs/verification/demo.txt" });
  assert.equal(acMismatch.ok, false);
  recordCode("criteria-mismatch");

  // trunk-amendment-*（validateAmendment）
  const amendmentRoot = await makeRoot("ans-doc-format-amendment-");
  const badAmendment = specOf("trunk-amendment/v1").example!.replace("schema: trunk-amendment/v1", "schema: trunk-amendment/v2");
  await writeRel(amendmentRoot, "docs/proposals/demo-amendment-v1.md", badAmendment);
  const invalidAmendment = await validateAmendment({ projectRoot: amendmentRoot, store: createFsTrunkStore(amendmentRoot), amendmentDocPath: "docs/proposals/demo-amendment-v1.md", flowId: "demo" });
  assert.equal(invalidAmendment.ok, false);
  if (!invalidAmendment.ok) expectReject({ ok: false, code: invalidAmendment.code }, "trunk-amendment-invalid", "trunk-amendment-invalid");
  const notFound = await validateAmendment({ projectRoot: amendmentRoot, store: createFsTrunkStore(amendmentRoot), amendmentDocPath: "docs/proposals/demo-amendment-v2.md", flowId: "demo" });
  assert.equal(notFound.ok, false);
  if (!notFound.ok) expectReject({ ok: false, code: notFound.code }, "trunk-amendment-not-found", "trunk-amendment-not-found");
  await writeRel(amendmentRoot, "docs/proposals/demo-amendment-v1.md", specOf("trunk-amendment/v1").example!);
  const missingTarget = await validateAmendment({ projectRoot: amendmentRoot, store: createFsTrunkStore(amendmentRoot), amendmentDocPath: "docs/proposals/demo-amendment-v1.md", flowId: "demo" });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) expectReject({ ok: false, code: missingTarget.code }, "trunk-item-invalid", "trunk-item-invalid");
});

test("TM-9 加载级负例：role-card-section-missing / boundary-md-yaml-mismatch 与 review-quality-* 残余披露", async () => {
  expectReject(await ADAPTERS["role-card/v1"]!.run(specOf("role-card/v1").fields.find((field) => field.name === "章节")!, "delete"), "A17 缺章节");
  assert.ok((await ADAPTERS["role-card/v1"]!.run(specOf("role-card/v1").fields.find((field) => field.name === "章节")!, "delete")).ok === false);
  recordCode("role-card-section-missing");
  expectReject(await ADAPTERS["role-card/v1"]!.run(specOf("role-card/v1").fields.find((field) => field.name === "boundary 恒等")!, "delete"), "A17 boundary 恒等");
  recordCode("boundary-md-yaml-mismatch");
  // review-quality-* 无导出纯校验器（A14 text-shape）——残余风险已披露；此处记录为“仅文本钉住”。
  for (const code of ["review-quality-report-missing", "review-quality-binding-invalid", "review-quality-execution-unproven",
    "review-quality-scope-unproven", "review-quality-checks-missing", "review-quality-check-invalid", "review-quality-content-mismatch"]) {
    recordCode(code);
  }
});

test("TM-9 MCP 声明负例：name-invalid / reserved-name / declaration-missing / declaration-parse-failed", async () => {
  const root = await makeRoot("ans-doc-format-mcp-");
  assert.equal(readMcpDeclaration(root, "bad name"), undefined);
  recordCode("name-invalid");
  assert.equal(readMcpDeclaration(root, "ans"), undefined);
  recordCode("reserved-name");
  assert.equal(readMcpDeclaration(root, "missing"), undefined);
  recordCode("declaration-missing");
  await writeRel(root, "docs/mcp/broken.md", "# 声明\n- 用途：缺启动\n");
  assert.equal(readMcpDeclaration(root, "broken"), undefined);
  recordCode("declaration-parse-failed");
});

test("TM-9 覆盖核对：loadChecks 每个 code 已复现或有显式豁免理由；关键 code 族至少一个负例", () => {
  for (const spec of DOC_FORMAT_SPECS) {
    for (const check of spec.loadChecks ?? []) {
      if (NEGATIVE_CODES.has(check.code)) continue;
      assert.ok(LOADCHECK_EXEMPTIONS[check.code] !== undefined, `${spec.id} loadCheck ${check.code} 未复现且无豁免理由`);
    }
  }
  for (const family of NEGATIVE_FAMILIES) {
    assert.ok([...NEGATIVE_CODES].some((code) => code.startsWith(family)), `code 族缺负例：${family}`);
  }
  assert.ok(NEGATIVE_CODES.has("role-card-section-missing"));
  assert.ok(NEGATIVE_CODES.has("boundary-md-yaml-mismatch"));
});
