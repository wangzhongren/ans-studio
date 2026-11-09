// test/门禁引擎/doc-format-specs-pin.test.ts
// 2026-11-09（document-format-specifications 门禁引擎 B3 批，TM-7/TM-10；AC-3/AC-5/AC-17）：
// 把 `src/common/编排/doc-format-specs.ts` 中门禁引擎 owner 的 A17/A18/A19/A21 规范
// 与本角色私有实现逐项钉住——`ROLE_CARD_REQUIRED_SECTIONS` 10 章节、三文件规范路径、
// boundary.md↔boundary.yaml 恒等、boundary.yaml 严格键集/枚举（私有常量 KINDS/ROOTS/TOP_KEYS）、
// MCP 七键/NAME_PATTERN/RESERVED_NAMES/ENV_NAME_PATTERN（源码文本断言，不新增公共出口）。
//
// 分层（B1 §3.3 AC-3.3 / P1.2 §3.3 #3）：生产模块不跨角色 import 私有实现；本文件作为 owner 侧
// pin 测试 import 自己角色的私有常量（`ROLE_CARD_REQUIRED_SECTIONS`），对未导出的私有常量
// （boundary-yaml 的 KINDS/ROOTS/TOP_KEYS/ENTRY_KEYS、runtime-core mcp-declarations 的名字/保留名/
// env 名常量）按 B1 允许的「源码文本断言」方式交叉钉住，**不新增任何公共出口**。
//
// 纪律：只读产品代码；不修改任何 parser/validator；示例只取 spec.example 与仓库既有片段
// （不改写既有片段）；负例断言到稳定 code；不新增 skip/force-exit；不写盘（临时目录除外）。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
  DOC_FORMAT_SPECS,
  type DocFormatFieldSpec,
  type DocFormatSpec,
} from "../../src/common/编排/doc-format-specs.ts";
import { ROLE_CARD_REQUIRED_SECTIONS } from "../../src/common/门禁引擎/governance-roles.ts";
import {
  parseBoundaryYamlDoc,
  validateBoundaryYamlText,
} from "../../src/common/门禁引擎/boundary-yaml.ts";
import { parseBoundarySection1 } from "../../src/common/门禁引擎/boundary-parse.ts";
import {
  parseSnapshotRoleDocuments,
  validateRoleDocumentsSnapshot,
  type SnapshotRoleDocuments,
} from "../../src/common/门禁引擎/boundary-core.ts";
import { CONDITION_SLUG_PATTERN, isValidConditionSlug } from "../../src/model/boundary.ts";
import type { CompleteSnapshot } from "../../src/model/trunk.ts";
import {
  listInstalledMcpServers,
  readMcpDeclaration,
  type McpDeclarationDiagnostic,
} from "../../src/common/runtime-core/mcp-declarations.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const AT = "2026-11-09T00:00:00.000Z";
const CLEANUP_ROOTS: string[] = [];

after(() => {
  for (const root of CLEANUP_ROOTS) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }
});

// ———————————————————————————— 基础工具 ————————————————————————————

function readRepo(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function specOf(id: string): DocFormatSpec {
  const spec = DOC_FORMAT_SPECS.find((candidate) => candidate.id === id);
  assert.ok(spec, `缺少规范：${id}`);
  return spec;
}

function exampleOf(id: string): string {
  const example = specOf(id).example;
  assert.ok(example, `${id} 缺少 example`);
  return example;
}

function fieldOf(spec: DocFormatSpec, name: string): DocFormatFieldSpec {
  const field = spec.fields.find((candidate) => candidate.name === name);
  assert.ok(field, `${spec.id} 缺少字段：${name}`);
  return field;
}

function errorCodes(spec: DocFormatSpec): string[] {
  return spec.commonErrors.map((entry) => entry.code);
}

function assertThrowsMessage(fn: () => unknown, expected: string): void {
  assert.throws(fn, (error: unknown) => error instanceof Error && error.message === expected);
}

function makeSnapshot(files: Record<string, string>): CompleteSnapshot {
  const entries = Object.entries(files).map(([filePath, text]) => {
    const bytes = Buffer.from(text, "utf8");
    return {
      path: filePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytesBase64: bytes.toString("base64"),
    };
  });
  const digest = createHash("sha256")
    .update(
      JSON.stringify(
        [...entries]
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
          .map((file) => [file.path, file.sha256.toLowerCase(), file.bytesBase64]),
      ),
    )
    .digest("hex");
  return { schema: "complete-snapshot/v1", snapshotId: `snapshot-${digest.slice(0, 12)}`, digest, createdAt: AT, files: entries };
}

interface RoleDocsInput {
  card: string;
  markdown: string;
  yaml: string;
  roleId?: string;
  allowedPaths?: Array<{ path: string; kind: "file" | "directory" }>;
}

function snapshotRoleDocs(input: RoleDocsInput): {
  snapshot: CompleteSnapshot;
  roles: SnapshotRoleDocuments[];
} {
  const roleId = input.roleId ?? "impl";
  const prefix = `角色卡/${roleId}/`;
  return {
    snapshot: makeSnapshot({
      [`${prefix}role-card.md`]: input.card,
      [`${prefix}boundary.md`]: input.markdown,
      [`${prefix}boundary.yaml`]: input.yaml,
    }),
    roles: [{
      roleId,
      cardPath: `${prefix}role-card.md`,
      boundaryMdPath: `${prefix}boundary.md`,
      boundaryYamlPath: `${prefix}boundary.yaml`,
      allowedPaths: input.allowedPaths ?? [{ path: "src/", kind: "directory" }],
    }],
  };
}

/** 用 A17/A18/A19 的 spec 样例组装三文件快照（样例即唯一输入，不另写夹具副本）。 */
function exampleRoleDocs(overrides: Partial<RoleDocsInput> = {}): RoleDocsInput {
  return {
    card: exampleOf("role-card/v1"),
    markdown: exampleOf("boundary-md/v1"),
    yaml: exampleOf("boundary-yaml/v1"),
    ...overrides,
  };
}

function rejectedRoleDocs(input: RoleDocsInput): string {
  const result = validateRoleDocumentsSnapshot(snapshotRoleDocs(input));
  assert.equal(result.ok, false, "预期三文件校验拒绝");
  return result.ok ? "" : result.message;
}

// ———————————————————————————— 1. validator 锚点 ————————————————————————————

test("规范锚点：A17/A18/A19/A21 的 validator 指向真实实现文件与导出符号", () => {
  const anchors: Array<{ id: string; file: string; symbol: string }> = [
    { id: "role-card/v1", file: "src/common/门禁引擎/boundary-core.ts", symbol: "validateRoleDocumentsSnapshot" },
    { id: "boundary-md/v1", file: "src/common/门禁引擎/boundary-core.ts", symbol: "parseSnapshotRoleDocuments" },
    { id: "boundary-yaml/v1", file: "src/common/门禁引擎/boundary-yaml.ts", symbol: "validateBoundaryYamlText" },
    { id: "mcp-declaration/v1", file: "src/common/runtime-core/mcp-declarations.ts", symbol: "readMcpDeclaration" },
  ];
  for (const anchor of anchors) {
    const spec = specOf(anchor.id);
    assert.equal(spec.validator.kind !== "convention", true, `${anchor.id} 必须是真实校验器`);
    assert.equal(spec.validator.file, anchor.file, `${anchor.id} validator.file 漂移`);
    assert.equal(spec.validator.symbol, anchor.symbol, `${anchor.id} validator.symbol 漂移`);
    const source = readRepo(anchor.file);
    assert.ok(
      source.includes(`export function ${anchor.symbol}(`),
      `${anchor.id} validator 符号未在 ${anchor.file} 导出`,
    );
  }
  // A17 的 note 明确指向章节常量来源；A19 声明写前校验与加载共用同一 parser。
  assert.ok(specOf("role-card/v1").validator.note?.includes("ROLE_CARD_REQUIRED_SECTIONS") === true);
  assert.ok(specOf("boundary-yaml/v1").validator.note?.includes("parseBoundaryYamlDoc") === true);
});

// ———————————————————————————— 2. A17 角色卡 10 章节 ————————————————————————————

const REQUIRED_LABELS = [
  "组别",
  "工作立场",
  "能力描述",
  "职责与功能导航",
  "必读资料",
  "交接输入输出",
  "执行原则",
  "质量职责",
  "标准工作流",
  "交付物清单",
] as const;

test("A17：ROLE_CARD_REQUIRED_SECTIONS 冻结 10 章节，与任务/B1 口径逐项相等", () => {
  assert.equal(ROLE_CARD_REQUIRED_SECTIONS.length, 10, "必填章节数必须是 10");
  assert.deepEqual(
    ROLE_CARD_REQUIRED_SECTIONS.map((section) => section.label),
    [...REQUIRED_LABELS],
    "章节 label 集合/顺序漂移",
  );
  for (const section of ROLE_CARD_REQUIRED_SECTIONS) {
    assert.ok(section.test instanceof RegExp, `${section.label} 缺少匹配规则`);
  }
});

test("A17：spec 章节字段逐项/按序包含 10 章节，并披露 #{1,6} 空白匹配口径", () => {
  const spec = specOf("role-card/v1");
  const chapter = fieldOf(spec, "章节");
  assert.equal(chapter.enforcement, "validator");
  assert.equal(chapter.presence, "required");
  const constraints = chapter.constraints ?? "";
  let cursor = -1;
  for (const label of REQUIRED_LABELS) {
    const at = constraints.indexOf(label, cursor + 1);
    assert.ok(at > cursor, `章节字段未按序包含：${label}（constraints=${constraints}）`);
    cursor = at;
  }
  assert.ok(constraints.includes("#{1,6}"), "章节字段必须披露「任一 #{1,6} 空白 行」匹配口径");
  assert.ok(errorCodes(spec).includes("role-card-section-missing:<label>"), "A17 必须登记 role-card-section-missing:<label>");
  assert.ok(errorCodes(spec).includes("boundary-md-yaml-mismatch"), "A17 必须登记 boundary-md-yaml-mismatch");
});

test("A17：三文件规范路径与 boundary-core 校验一致（正例 + role-document-path-mismatch 负例）", () => {
  const spec = specOf("role-card/v1");
  const pathField = fieldOf(spec, "路径");
  assert.ok(pathField.constraints?.includes("角色卡/<roleId>/role-card.md") === true);
  assert.ok(pathField.constraints?.includes("boundary.md") === true);
  assert.ok(pathField.constraints?.includes("boundary.yaml") === true);

  // boundary-core 的规范模板与三个文件名后缀（源码文本钉住：路径口径只有这一处实现）。
  const source = readRepo("src/common/门禁引擎/boundary-core.ts");
  assert.ok(source.includes("const canonical = `角色卡/${role.roleId}/`;"), "boundary-core 规范目录模板漂移");
  for (const suffix of ["role-card.md", "boundary.md", "boundary.yaml"]) {
    assert.ok(source.includes(`\${canonical}${suffix}`), `boundary-core 未使用规范路径 ${suffix}`);
  }

  // 正例：A17/A18/A19 样例以规范路径通过。
  const docs = exampleRoleDocs();
  const snapshotBundle = snapshotRoleDocs(docs);
  const parsed = parseSnapshotRoleDocuments(snapshotBundle.snapshot, snapshotBundle.roles[0]!);
  assert.equal(parsed.check.ok, true);
  assert.equal(parsed.check.roleId, "impl");
  assert.equal(parsed.cardText, docs.card);

  // 负例：三文件任一偏离规范路径 ⇒ role-document-path-mismatch。
  for (const key of ["cardPath", "boundaryMdPath", "boundaryYamlPath"] as const) {
    const role = { ...snapshotBundle.roles[0]!, [key]: `角色卡/impl/card-${key}.md` };
    assertThrowsMessage(
      () => parseSnapshotRoleDocuments(snapshotBundle.snapshot, role),
      "role-document-path-mismatch",
    );
  }

  // 负例：内置保留 id / 含路径分隔符的 roleId ⇒ invalid-project-role-id（先于路径检查）。
  assertThrowsMessage(
    () => parseSnapshotRoleDocuments(snapshotBundle.snapshot, { ...snapshotBundle.roles[0]!, roleId: "su" }),
    "invalid-project-role-id",
  );
  assertThrowsMessage(
    () => parseSnapshotRoleDocuments(snapshotBundle.snapshot, { ...snapshotBundle.roles[0]!, roleId: "a/b" }),
    "invalid-project-role-id",
  );
});

/** 从角色卡文本中删去一个必填章节（标题行与其正文，直到下一个标题）。 */
function cardWithoutSection(card: string, sectionTest: RegExp): string {
  const lines = card.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) skipping = sectionTest.test(line);
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

test("A17：10 章节逐章节缺失 ⇒ role-card-section-missing:<label>；完整模板正例 ok", () => {
  const card = exampleOf("role-card/v1");
  // 正例：A17 样例即 10 章节最小模板，经真实 validateRoleDocumentsSnapshot 为 ok。
  const positive = validateRoleDocumentsSnapshot(snapshotRoleDocs(exampleRoleDocs()));
  assert.equal(positive.ok, true, positive.ok ? "" : positive.message);

  // 负例：逐章节删除 ⇒ 稳定 code 逐一命中（不是笼统的「缺章节」）。
  for (const section of ROLE_CARD_REQUIRED_SECTIONS) {
    const mutated = cardWithoutSection(card, section.test);
    assert.notEqual(mutated, card, `章节 ${section.label} 未被删除（测试夹具失效）`);
    const message = rejectedRoleDocs(exampleRoleDocs({ card: mutated }));
    assert.equal(message, `role-card-section-missing:${section.label}`, `章节 ${section.label} 缺失的错误码漂移`);
  }
});

// ———————————————————————————— 3. A18/A19 边界私有常量 ————————————————————————————

interface BoundaryYamlPrivateConstants {
  kinds: string[];
  roots: string[];
  topKeys: string[];
  entryKeys: string[];
}

function boundaryYamlPrivateConstants(): BoundaryYamlPrivateConstants {
  const source = readRepo("src/common/门禁引擎/boundary-yaml.ts");
  const setLiteral = (name: string): string[] => {
    const match = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`).exec(source);
    assert.ok(match, `boundary-yaml.ts 未找到常量 ${name}`);
    return [...match[1]!.matchAll(/"([^"]+)"/g)].map((token) => token[1]!);
  };
  return { kinds: setLiteral("KINDS"), roots: setLiteral("ROOTS"), topKeys: setLiteral("TOP_KEYS"), entryKeys: setLiteral("ENTRY_KEYS") };
}

test("A18/A19：boundary-yaml 私有常量 KINDS/ROOTS/TOP_KEYS/ENTRY_KEYS 源码字面量冻结", () => {
  const constants = boundaryYamlPrivateConstants();
  assert.deepEqual(constants.kinds, ["file", "directory", "conditional-directory"]);
  assert.deepEqual(constants.roots, ["project", "skill"]);
  assert.deepEqual(constants.topKeys, ["role", "entries", "archived"]);
  assert.deepEqual(constants.entryKeys, ["kind", "path", "purpose", "root", "condition"]);
});

test("A18/A19：spec 字段逐项包含 kind/root/entry 键/顶层键与条件目录 slug 口径", () => {
  const constants = boundaryYamlPrivateConstants();

  const md = specOf("boundary-md/v1");
  const typeCell = fieldOf(md, "类型列").constraints ?? "";
  for (const kind of ["file", "directory", "条件目录"]) {
    assert.ok(typeCell.includes(kind), `A18 类型列未包含 ${kind}`);
  }
  assert.ok((fieldOf(md, "路径列").constraints ?? "").includes("condition slug"), "A18 路径列必须披露条件目录 slug");

  const yamlSpec = specOf("boundary-yaml/v1");
  const kindConstraints = fieldOf(yamlSpec, "entries[].kind").constraints ?? "";
  for (const kind of constants.kinds) assert.ok(kindConstraints.includes(kind), `A19 kind 字段未包含 ${kind}`);
  const rootConstraints = fieldOf(yamlSpec, "entries[].root").constraints ?? "";
  for (const root of constants.roots) assert.ok(rootConstraints.includes(root), `A19 root 字段未包含 ${root}`);
  const entriesConstraints = fieldOf(yamlSpec, "entries").constraints ?? "";
  for (const key of constants.entryKeys) assert.ok(entriesConstraints.includes(key), `A19 entries 字段未包含条目键 ${key}`);
  const topKeyError = yamlSpec.commonErrors.find((entry) => entry.code === "未知顶层键");
  assert.ok(topKeyError, "A19 必须登记未知顶层键错误");
  const topKeyText = `${topKeyError.cause} ${topKeyError.fix}`;
  for (const key of constants.topKeys) assert.ok(topKeyText.includes(key), `A19 未知顶层键错误未包含 ${key}`);
  assert.ok(errorCodes(yamlSpec).includes("archived 必须是布尔值"), "A19 必须登记 archived 非布尔错误");
});

test("A19：validateBoundaryYamlText 正例（spec example 与归档布尔），及条件目录 slug 正例", () => {
  const valid = validateBoundaryYamlText(exampleOf("boundary-yaml/v1"));
  assert.equal(valid.ok, true, valid.ok ? "" : valid.message);
  assert.ok(valid.ok && valid.entries.length > 0);

  const withCondition = validateBoundaryYamlText([
    "role: impl",
    "entries:",
    "  - kind: conditional-directory",
    "    path: 角色卡/impl/docs/design/",
    "    condition: role-restructuring",
    "    purpose: 设计记录",
  ].join("\n"));
  assert.equal(withCondition.ok, true);
  assert.equal(withCondition.ok && withCondition.entries[0]!.condition, "role-restructuring");

  // 归档标记：合法布尔 true 解析成功并如实回传（拒绝/跳过语义在 boundary-core）。
  const archived = parseBoundaryYamlDoc(`${exampleOf("boundary-yaml/v1")}\narchived: true\n`);
  assert.equal(archived.archived, true);
  assert.equal(parseBoundaryYamlDoc(exampleOf("boundary-yaml/v1")).archived, undefined);
});

test("A19：严格 YAML 负例 —— 未知顶层键/entry 键/kind/root/condition/archived 非布尔", () => {
  const cases: Array<{ label: string; text: string; pattern: RegExp }> = [
    { label: "未知顶层键 version", text: "role: impl\nentries: []\nversion: 1\n", pattern: /未知顶层键：version/ },
    { label: "未知顶层键 roleId", text: "role: impl\nentries: []\nroleId: impl\n", pattern: /未知顶层键：roleId/ },
    { label: "未知顶层键 root", text: "role: impl\nentries: []\nroot: x\n", pattern: /未知顶层键：root/ },
    { label: "条目未知键", text: "entries:\n  - kind: file\n    path: x\n    purpose: y\n    owner: z\n", pattern: /entries\[0\] 含未知键：owner/ },
    { label: "kind 非法", text: "entries:\n  - kind: banana\n    path: x\n    purpose: y\n", pattern: /entries\[0\] 的 kind 非法：banana/ },
    { label: "root 非法", text: "entries:\n  - kind: file\n    path: x\n    purpose: y\n    root: project-root\n", pattern: /entries\[0\] 的 root 非法：project-root/ },
    { label: "condition 缺失", text: "entries:\n  - kind: conditional-directory\n    path: x\n    purpose: y\n", pattern: /conditional-directory 缺少或非法 condition/ },
    { label: "condition 非法", text: "entries:\n  - kind: conditional-directory\n    path: x\n    purpose: y\n    condition: Bad_Slug\n", pattern: /conditional-directory 缺少或非法 condition/ },
    { label: "archived 非布尔", text: "role: impl\nentries: []\narchived: \"true\"\n", pattern: /archived 必须是布尔值/ },
    { label: "entries 缺失", text: "role: impl\n", pattern: /缺少必填键：entries/ },
    { label: "顶层非映射", text: "- a\n", pattern: /顶层必须是映射/ },
    { label: "YAML 语法错误", text: "entries:\n  - kind: file\n  bad: [1, 2\n", pattern: /YAML 语法错误/ },
    { label: "path 为空", text: "entries:\n  - kind: file\n    path: \"\"\n    purpose: y\n", pattern: /entries\[0\] 缺少必填 path/ },
    { label: "purpose 为空", text: "entries:\n  - kind: file\n    path: x\n    purpose: \"\"\n", pattern: /entries\[0\] 缺少必填 purpose/ },
  ];
  for (const testCase of cases) {
    const result = validateBoundaryYamlText(testCase.text);
    assert.equal(result.ok, false, `${testCase.label} 应被拒绝`);
    if (!result.ok) assert.match(result.message, testCase.pattern, `${testCase.label} 错误信息漂移：${result.message}`);
  }
});

test("A19：条件目录 slug 走 model CONDITION_SLUG_PATTERN（正例/负例一致）", () => {
  assert.equal(CONDITION_SLUG_PATTERN.source, "^[a-z][a-z0-9-]*$");
  assert.equal(isValidConditionSlug("role-restructuring"), true);
  assert.equal(isValidConditionSlug("role-restructuring-2"), true);
  assert.equal(isValidConditionSlug("Role_Restructuring"), false);
  assert.equal(isValidConditionSlug("1bad"), false);
  assert.equal(isValidConditionSlug("bad_slug"), false);

  const spec = specOf("boundary-yaml/v1");
  const condition = fieldOf(spec, "entries[].condition");
  assert.equal(condition.presence, "conditional");
  assert.ok((condition.constraints ?? "").includes("condition slug"));
});

// ———————————————————————————— 4. boundary.md↔boundary.yaml 恒等 ————————————————————————————

test("A17/A18/A19：spec 三文件样例经 parseSnapshotRoleDocuments/validateRoleDocumentsSnapshot 为 ok", () => {
  const docs = exampleRoleDocs();
  const bundle = snapshotRoleDocs(docs);
  const parsed = parseSnapshotRoleDocuments(bundle.snapshot, bundle.roles[0]!);
  assert.equal(parsed.check.ok, true);
  // 条目以严格 YAML 为准；md 恒等比较通过后才返回。
  assert.deepEqual(parsed.entries, parseBoundaryYamlDoc(docs.yaml).entries);
  const validated = validateRoleDocumentsSnapshot(bundle);
  assert.equal(validated.ok, true);
  assert.ok(validated.ok && validated.roleDocumentChecks.length === 1);
  assert.equal(validated.ok && validated.roleDocumentChecks[0]!.roleId, "impl");
});

test("A17/A18/A19：boundary.md↔yaml 不一致 ⇒ boundary-md-yaml-mismatch（条目多/少/重复/空集）", () => {
  const baseYaml = exampleOf("boundary-yaml/v1");
  const cases: Array<{ label: string; input: RoleDocsInput }> = [
    {
      label: "yaml 多一条",
      input: exampleRoleDocs({ yaml: `${baseYaml}\n  - kind: file\n    path: README.md\n    purpose: x\n` }),
    },
    {
      label: "yaml 重复条目",
      input: exampleRoleDocs({ yaml: `${baseYaml}\n  - kind: directory\n    path: src/\n    purpose: 重复\n` }),
    },
    {
      label: "yaml 空集",
      input: exampleRoleDocs({ yaml: "role: impl\nentries: []\n" }),
    },
    {
      label: "md 多一条",
      input: exampleRoleDocs({
        markdown: `${exampleOf("boundary-md/v1")}\n| file | \`README.md\` | x |`,
      }),
    },
  ];
  for (const testCase of cases) {
    assert.equal(rejectedRoleDocs(testCase.input), "boundary-md-yaml-mismatch", `${testCase.label} 应恒等失败`);
  }
});

test("A17/A18/A19：archived:true ⇒ frozen-role-archived；role 标签不一致 ⇒ boundary-role-mismatch", () => {
  const yamlWithArchive = `${exampleOf("boundary-yaml/v1")}\narchived: true\n`;
  assert.equal(rejectedRoleDocs(exampleRoleDocs({ yaml: yamlWithArchive })), "frozen-role-archived");

  const yamlWrongRole = exampleOf("boundary-yaml/v1").replace("role: impl", "role: other");
  assert.equal(rejectedRoleDocs(exampleRoleDocs({ yaml: yamlWrongRole })), "boundary-role-mismatch");
});

test("A17/A18/A19：项目角色范围负例 ⇒ invalid-role-boundary-scope（条件目录/路径逃逸）", () => {
  // 条件目录：md 与 yaml 恒等（含合法 slug），但项目角色 Section 1 不允许条件目录。
  const conditionalMd = [
    "# 边界：实现者",
    "## Section 1: 可修改文件与目录",
    "| 类型 | 路径 | 用途 |",
    "| --- | --- | --- |",
    "| 条件目录 `role-restructuring` | `docs/design/` | 设计记录 |",
  ].join("\n");
  const conditionalYaml = [
    "role: impl",
    "entries:",
    "  - kind: conditional-directory",
    "    path: docs/design/",
    "    condition: role-restructuring",
    "    purpose: 设计记录",
  ].join("\n");
  assert.equal(
    rejectedRoleDocs(exampleRoleDocs({ markdown: conditionalMd, yaml: conditionalYaml })),
    "invalid-role-boundary-scope",
  );

  // 路径逃逸：两份一致但路径不安全。
  const escapeMd = [
    "# 边界：实现者",
    "## Section 1: 可修改文件与目录",
    "| 类型 | 路径 | 用途 |",
    "| --- | --- | --- |",
    "| directory | `../escape/` | x |",
  ].join("\n");
  const escapeYaml = "role: impl\nentries:\n  - kind: directory\n    path: ../escape/\n    purpose: x\n";
  assert.equal(
    rejectedRoleDocs(exampleRoleDocs({ markdown: escapeMd, yaml: escapeYaml })),
    "invalid-role-boundary-scope",
  );
});

// ———————————————————————————— 5. A21 MCP 声明 ————————————————————————————

const MCP_SOURCE_REL = "src/common/runtime-core/mcp-declarations.ts";

interface McpPrivateConstants {
  namePatternSource: string;
  envNamePatternSource: string;
  reservedNames: string[];
  declarationKeys: string[];
}

function mcpPrivateConstants(): McpPrivateConstants {
  const source = readRepo(MCP_SOURCE_REL);
  const regexLiteral = (name: string): string => {
    const match = new RegExp(`const ${name} = /(.+)/;`).exec(source);
    assert.ok(match, `${MCP_SOURCE_REL} 未找到常量 ${name}`);
    const literal = match[1]!;
    // 常量本身是正则字面量：重建 RegExp 以证明源文本可用于同判（不 import 私有实现）。
    assert.doesNotThrow(() => new RegExp(literal), `${name} 不是合法正则字面量`);
    return literal;
  };
  const reservedMatch = new RegExp("const RESERVED_NAMES: readonly string\\[\\] = (\\[[^\\]]*\\]);").exec(source);
  assert.ok(reservedMatch, `${MCP_SOURCE_REL} 未找到 RESERVED_NAMES`);
  const keyMatch = /\((用途\|启动\|参数\|环境\|适用角色\|状态\|安装日期)\)/.exec(source);
  assert.ok(keyMatch, `${MCP_SOURCE_REL} 未找到声明键解析正则`);
  return {
    namePatternSource: regexLiteral("NAME_PATTERN"),
    envNamePatternSource: regexLiteral("ENV_NAME_PATTERN"),
    reservedNames: JSON.parse(reservedMatch[1]!) as string[],
    declarationKeys: keyMatch[1]!.split("|"),
  };
}

test("A21：七键与源码解析键集逐项相等；NAME_PATTERN/RESERVED_NAMES/ENV_NAME_PATTERN 源码字面量冻结", () => {
  const constants = mcpPrivateConstants();
  const spec = specOf("mcp-declaration/v1");

  // 七键：spec 字段名与 runtime-core 解析正则的键集逐项相等（顺序一致）。
  assert.deepEqual(spec.fields.map((field) => field.name), constants.declarationKeys);
  assert.deepEqual(constants.declarationKeys, ["用途", "启动", "参数", "环境", "适用角色", "状态", "安装日期"]);

  // 名字符集 / 保留名 / env 名：源码字面量冻结（私有常量，按 B1 源码文本断言，不新增公共出口）。
  assert.equal(constants.namePatternSource, "^[A-Za-z0-9_-]+$");
  assert.equal(constants.envNamePatternSource, "^[A-Za-z_][A-Za-z0-9_]*$");
  assert.deepEqual(constants.reservedNames, ["ans", "ans_codex"]);
});

test("A21：spec 文本包含名字符集/保留名/env 形态，pathPattern 与状态口径冻结", () => {
  const spec = specOf("mcp-declaration/v1");
  const constants = mcpPrivateConstants();

  assert.equal(spec.pathPattern, "docs/mcp/<name>.md");
  assert.ok(readRepo(MCP_SOURCE_REL).includes('const MCP_REL = "docs/mcp";'));
  assert.ok(readRepo(MCP_SOURCE_REL).includes('const DECLARATION_EXT = ".md";'));

  // 名字符集：NAME_PATTERN 去掉锚点即 spec loadChecks 的字符类口径。
  const charClass = constants.namePatternSource.replace(/^\^/, "").replace(/\$$/, "");
  const nameInvalid = spec.loadChecks?.find((check) => check.code === "name-invalid");
  assert.ok(nameInvalid, "A21 必须登记 name-invalid 加载检查");
  assert.ok(nameInvalid.rule.includes(charClass), `A21 name-invalid 规则未包含 ${charClass}`);

  // 保留名：RESERVED_NAMES 每个成员都必须在 spec 文本中可见（loadChecks 或 commonErrors）。
  const reservedText = [
    ...(spec.loadChecks ?? []).map((check) => `${check.code} ${check.rule}`),
    ...spec.commonErrors.map((entry) => `${entry.code} ${entry.cause}`),
  ].join("\n");
  assert.ok(reservedText.includes("reserved-name"));
  for (const reserved of constants.reservedNames) {
    assert.ok(reservedText.includes(reserved), `A21 未披露保留名 ${reserved}`);
  }

  // env 形态：spec 声明「值字面量或 env:NAME」；ENV_NAME_PATTERN 是 NAME 的唯一权威。
  const envField = fieldOf(spec, "环境");
  assert.ok((envField.constraints ?? "").includes("env:NAME"), "A21 环境字段必须披露 env:NAME 形态");
  assert.ok((envField.constraints ?? "").includes("!"), "A21 环境字段必须披露 ! 前缀拒绝");

  // 状态口径：installed/uninstalled；未知值＝坏件。
  const statusField = fieldOf(spec, "状态");
  assert.ok((statusField.constraints ?? "").includes("installed/uninstalled"));
  assert.ok((spec.loadChecks ?? []).some((check) => check.code === "declaration-parse-failed"));
});

// MCP 临时夹具：每个测试独立根，绝不影响仓库。
function mcpRoot(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "doc-format-pin-mcp-"));
  CLEANUP_ROOTS.push(root);
  mkdirSync(path.join(root, "docs", "mcp"), { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(root, "docs", "mcp", `${name}.md`), text, "utf8");
  }
  return root;
}

test("A21：spec example 经真实 readMcpDeclaration/listInstalledMcpServers 为 ok（七键视图/env 原文）", () => {
  const example = exampleOf("mcp-declaration/v1");
  const root = mcpRoot({ demo: example });

  assert.deepEqual(readMcpDeclaration(root, "demo"), {
    name: "demo",
    command: "node",
    args: ["server.js", "--stdio"],
    env: { DEMO: "1", TOKEN: "env:DEMO_TOKEN" },
    purpose: "演示 MCP",
    roles: ["product", "rapporteur"],
    status: "installed",
    date: "2026-11-09",
    path: "docs/mcp/demo.md",
  });

  assert.deepEqual(listInstalledMcpServers(root, "product"), [{
    name: "demo",
    command: "node",
    args: ["server.js", "--stdio"],
    env: { DEMO: "1", TOKEN: "env:DEMO_TOKEN" },
  }]);
});

test("A21：负例 —— name-invalid/reserved-name/env 名非法/! 前缀/状态未知/必填缺失（readMcpDeclaration 不抛错）", () => {
  // spec example 的 env 名/引用名都必须满足 ENV_NAME_PATTERN（交叉钉住：示例与常量同口径）。
  const constants = mcpPrivateConstants();
  const envPattern = new RegExp(constants.envNamePatternSource);
  const exampleEnv = readMcpDeclaration(mcpRoot({ demo: exampleOf("mcp-declaration/v1") }), "demo")?.env ?? {};
  for (const [name, value] of Object.entries(exampleEnv)) {
    assert.match(name, envPattern, `示例 env 名不符合 ENV_NAME_PATTERN：${name}`);
    if (value.startsWith("env:")) assert.match(value.slice(4), envPattern, `示例 env 引用名不符合 ENV_NAME_PATTERN：${value}`);
  }

  const valid = exampleOf("mcp-declaration/v1");
  const root = mcpRoot({
    "bad.name": valid,
    ans: valid,
    "env-bad-name": valid.replace("DEMO=1", "1BAD=1"),
    "env-bad-ref": valid.replace("env:DEMO_TOKEN", "env:DEMO-TOKEN"),
    "env-bang": valid.replace("DEMO=1", "DEMO=!run"),
    "bad-status": valid.replace("状态：installed", "状态：paused"),
    "missing-command": valid
      .split("\n")
      .filter((line) => !line.startsWith("- 启动："))
      .join("\n"),
  });
  for (const name of ["bad.name", "ans", "env-bad-name", "env-bad-ref", "env-bang", "bad-status", "missing-command"]) {
    assert.equal(readMcpDeclaration(root, name), undefined, `${name} 应判坏件（undefined，不抛错）`);
  }

  const diagnostics: McpDeclarationDiagnostic[] = [];
  listInstalledMcpServers(root, "product", (diagnostic) => diagnostics.push(diagnostic));
  assert.deepEqual(
    diagnostics.map((diagnostic) => [diagnostic.path, diagnostic.reason]).sort(),
    [
      ["docs/mcp/ans.md", "reserved-name"],
      ["docs/mcp/bad.name.md", "name-invalid"],
      ["docs/mcp/bad-status.md", "declaration-parse-failed"],
      ["docs/mcp/env-bad-name.md", "declaration-parse-failed"],
      ["docs/mcp/env-bad-ref.md", "declaration-parse-failed"],
      ["docs/mcp/env-bang.md", "declaration-parse-failed"],
      ["docs/mcp/missing-command.md", "declaration-parse-failed"],
    ].sort(),
  );
});

// ———————————————————————————— 6. 既有片段 ————————————————————————————

test("既有片段：角色卡/编排/boundary.md、角色卡/产品/boundary.yaml 与本角色边界经真实 parser 为 ok", () => {
  // A18：真实 Markdown Section 1 片段 ⇒ 宽松解析产出非空条目，且全部为已知 kind/root。
  const planMd = parseBoundarySection1(readRepo("角色卡/编排/boundary.md"), "project");
  assert.ok(planMd.length > 0, "角色卡/编排/boundary.md 应解析出条目");
  const constants = boundaryYamlPrivateConstants();
  for (const entry of planMd) {
    assert.ok(constants.kinds.includes(entry.kind), `md 片段出现未知 kind：${entry.kind}`);
    assert.equal(entry.root, "project");
  }

  // A19：真实严格 YAML 片段 ⇒ validateBoundaryYamlText ok 且非空。
  for (const rel of ["角色卡/产品/boundary.yaml", "角色卡/编排/boundary.yaml", "角色卡/门禁引擎/boundary.yaml"]) {
    const result = validateBoundaryYamlText(readRepo(rel));
    assert.equal(result.ok, true, `${rel} 应为合法边界 YAML：${result.ok ? "" : result.message}`);
    assert.ok(result.ok && result.entries.length > 0, `${rel} 应解析出条目`);
  }

  // 本角色边界 md 片段同样可被真实标记解析器读出（与 yaml 同源片段，不改写既有片段）。
  const gateMd = parseBoundarySection1(readRepo("角色卡/门禁引擎/boundary.md"), "project");
  assert.ok(gateMd.length > 0, "角色卡/门禁引擎/boundary.md 应解析出条目");
});
