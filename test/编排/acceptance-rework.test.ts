// test/编排/acceptance-rework.test.ts
// 2026-10-23 验收返工路由（方案 v1 / Q2 A）：验收报告 fenced YAML `acceptance-rework/v1` 段的
// 严格解析/校验（团队计划 §3.2 P2 编排面）。
//   · 正例：字符串/数组 evidence、coordinator 缺省/别名/未知 warning；
//   · 负例：缺段、坏 YAML、未知字段、重复 id、空/多 owner、空 action、items 空、>64、>32KB、
//     多个候选块、不支持版本、自由文本（§8 表/§9.1 列表）不得被解析；
//   · 解析器是纯函数：同输入两次结果逐字相等，不读文件系统。
// 纯离线：全部夹具是内联字符串。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseAcceptanceReworkReport,
  ACCEPTANCE_REWORK_MAX_ITEMS,
  ACCEPTANCE_REWORK_SCHEMA,
  type AcceptanceReworkParseResult,
  type AcceptanceReworkSection,
} from "../../src/common/编排/acceptance-rework.ts";

// —————————————————————— 夹具 ——————————————————————

const VALID_SECTION = [
  "schema: acceptance-rework/v1",
  "coordinator: convener",
  "items:",
  "  - id: F1",
  "    owner: platform-foundation",
  "    action: 在干净环境执行 npm ci，保留退出码与原始日志",
  "    evidence: docs/verification/ai-governance-pipeline/npm-ci.log",
  "  - id: F5",
  "    owner: persistence-store",
  "    action: 实现 stage_executions 的 90 天保留/清理策略并补测试",
  "    evidence:",
  "      - docs/verification/ai-governance-pipeline/retention.log",
  "      - docs/verification/ai-governance-pipeline/retention.md",
].join("\n");

/** 报告 Markdown：前置说明 + 恰好一个 ```yaml 块 + 后置说明。 */
function reportWithYaml(content: string, info = "yaml", fence = "```"): string {
  return [
    "# 验收报告 v1",
    "",
    "结论：不通过。",
    "",
    `${fence}${info}`,
    content,
    fence,
    "",
    "以上。",
  ].join("\n");
}

function parseOk(result: AcceptanceReworkParseResult) {
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.errors, null, 2));
  return result as { ok: true; section: AcceptanceReworkSection; warnings: string[] };
}

function parseFail(result: AcceptanceReworkParseResult, reason: "missing" | "invalid" | "unsupported") {
  assert.equal(result.ok, false, "期望解析失败但通过了");
  const failed = result as { ok: false; reason: string; errors: Array<{ path: string; message: string }> };
  assert.equal(failed.reason, reason);
  assert.ok(failed.errors.length > 0, "失败必须带具体错误");
  return failed;
}

// —————————————————————— 正例 ——————————————————————

test("acceptance-rework：合法段（字符串/数组 evidence）⇒ ok；schema 固定 v1、coordinator 规范化 convener", () => {
  const result = parseOk(parseAcceptanceReworkReport(reportWithYaml(VALID_SECTION)));
  assert.deepEqual(result.warnings, []);
  assert.equal(result.section.schema, ACCEPTANCE_REWORK_SCHEMA);
  assert.equal(result.section.coordinator, "convener");
  assert.equal(result.section.coordinatorDeclaration, "convener");
  assert.deepEqual(result.section.items, [
    {
      id: "F1",
      owner: "platform-foundation",
      action: "在干净环境执行 npm ci，保留退出码与原始日志",
      evidence: ["docs/verification/ai-governance-pipeline/npm-ci.log"],
    },
    {
      id: "F5",
      owner: "persistence-store",
      action: "实现 stage_executions 的 90 天保留/清理策略并补测试",
      evidence: [
        "docs/verification/ai-governance-pipeline/retention.log",
        "docs/verification/ai-governance-pipeline/retention.md",
      ],
    },
  ]);
});

test("acceptance-rework：coordinator 缺省 ⇒ convener/declaration null；steward 别名；未知值 warning（实际接收方由应用决定）", () => {
  const withoutCoordinator = VALID_SECTION.split("\n")
    .filter((line) => !line.startsWith("coordinator:"))
    .join("\n");
  const defaulted = parseOk(parseAcceptanceReworkReport(reportWithYaml(withoutCoordinator)));
  assert.equal(defaulted.section.coordinator, "convener");
  assert.equal(defaulted.section.coordinatorDeclaration, null);
  assert.deepEqual(defaulted.warnings, []);

  const steward = parseOk(
    parseAcceptanceReworkReport(reportWithYaml(VALID_SECTION.replace("coordinator: convener", "coordinator: steward"))),
  );
  assert.equal(steward.section.coordinator, "convener", "别名 steward 规范化 convener（报告建议值）");
  assert.equal(steward.section.coordinatorDeclaration, "steward");
  assert.deepEqual(steward.warnings, []);

  const unknown = parseOk(
    parseAcceptanceReworkReport(reportWithYaml(VALID_SECTION.replace("coordinator: convener", "coordinator: lead"))),
  );
  assert.equal(unknown.section.coordinator, "convener", "报告不能指定协调者（实际接收方由应用按模型决定）");
  assert.equal(unknown.section.coordinatorDeclaration, "lead");
  assert.equal(unknown.warnings.length, 1);
  assert.match(unknown.warnings[0]!, /coordinator="lead" 不受支持/);
});

test("acceptance-rework：~~~ fence 与缩进 fence 均可解析；无 info string 的 fence 也按 YAML 处理", () => {
  const tilde = parseOk(parseAcceptanceReworkReport(reportWithYaml(VALID_SECTION, "yaml", "~~~")));
  assert.equal(tilde.section.items.length, 2);

  const indentedFence = [
    "# 报告",
    "  ```yaml",
    "  schema: acceptance-rework/v1",
    "  items:",
    "    - id: F2",
    "      owner: qa-verification",
    "      action: 补 e2e",
    "  ```",
  ].join("\n");
  const indented = parseOk(parseAcceptanceReworkReport(indentedFence));
  assert.deepEqual(indented.section.items.map((item) => item.id), ["F2"]);

  const noInfo = parseOk(
    parseAcceptanceReworkReport(["```", "schema: acceptance-rework/v1", "items:", "  - id: F3", "    owner: convener", "    action: 更新变更包", "```"].join("\n")),
  );
  assert.equal(noInfo.section.items[0]!.owner, "convener");
});

test("acceptance-rework：id/action/evidence 边界值（32/64/2000/500/10）通过且 trim；空 evidence 数组合法", () => {
  const id32 = `F${"a".repeat(31)}`; // 32 字符，合法
  const action2000 = "动".repeat(2000);
  const evidence500 = "e".repeat(500);
  const content = [
    "schema: acceptance-rework/v1",
    "items:",
    `  - id: ${id32}`,
    "    owner: convener",
    `    action: ${action2000}`,
    `    evidence: ${evidence500}`,
    "  - id: F-empty-evidence",
    "    owner: convener",
    "    action:  补文档  ",
    "    evidence: []",
  ].join("\n");
  const result = parseOk(parseAcceptanceReworkReport(reportWithYaml(content)));
  assert.equal(result.section.items[0]!.id, id32);
  assert.equal(result.section.items[0]!.action.length, 2000);
  assert.deepEqual(result.section.items[0]!.evidence, [evidence500]);
  assert.equal(result.section.items[1]!.action, "补文档", "action 规范化 trim");
  assert.deepEqual(result.section.items[1]!.evidence, []);

  const maxItems = [
    "schema: acceptance-rework/v1",
    "items:",
    ...Array.from({ length: ACCEPTANCE_REWORK_MAX_ITEMS }, (_, index) => [
      `  - id: F${index}`,
      "    owner: convener",
      "    action: 返工",
    ]).flat(),
  ].join("\n");
  const maxResult = parseOk(parseAcceptanceReworkReport(reportWithYaml(maxItems)));
  assert.equal(maxResult.section.items.length, 64);
});

test("acceptance-rework：纯函数——同输入两次结果深相等；非候选 YAML/JSON 块被忽略", () => {
  const text = [
    reportWithYaml(VALID_SECTION),
    "",
    "```yaml",
    "schema: something-else/v1",
    "items: []",
    "```",
    "",
    "```json",
    '{"schema": "something-else/v1"}',
    "```",
  ].join("\n");
  const first = parseAcceptanceReworkReport(text);
  const second = parseAcceptanceReworkReport(text);
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal((first as { ok: true; section: { items: unknown[] } }).section.items.length, 2);
});

test("acceptance-rework：flow 风格根映射（单行 JSON/YAML）同样识别；与块式段并存 ⇒ 多个候选 invalid", () => {
  const flowStyle = '{"schema":"acceptance-rework/v1","items":[{"id":"F1","owner":"convener","action":"返工"}]}';
  const single = parseOk(parseAcceptanceReworkReport(`报告\n\n\`\`\`json\n${flowStyle}\n\`\`\``));
  assert.deepEqual(single.section.items, [{ id: "F1", owner: "convener", action: "返工", evidence: [] }]);

  const both = parseFail(
    parseAcceptanceReworkReport(`${reportWithYaml(VALID_SECTION)}\n\`\`\`json\n${flowStyle}\n\`\`\``),
    "invalid",
  );
  assert.match(both.errors[0]!.message, /多个 acceptance-rework 段/);
});

// —————————————————————— 缺段 / 自由文本 ——————————————————————

test("acceptance-rework：无 fenced 段 ⇒ missing（不解析 §8 表格 / §9.1 编号列表）", () => {
  const freeText = [
    "# 验收报告",
    "",
    "## 8 偏差、缺口与处置",
    "",
    "| 编号 | 偏差 | 建议处置（owner） |",
    "| --- | --- | --- |",
    "| F1 | 干净安装未验证 | 在干净环境执行 npm ci（platform-foundation） |",
    "| F6a | 活跃 run 无队列语义 | 落实 409 行为（pipeline-runtime） |",
    "",
    "## 9.1 退回项与建议归属",
    "",
    "1. F5 保留/清理策略（persistence-store）。",
    "2. F6b 唯一约束/迁移（persistence-store）。",
  ].join("\n");
  const result = parseFail(parseAcceptanceReworkReport(freeText), "missing");
  assert.match(result.errors[0]!.message, /不解析 §8 表格/);

  parseFail(parseAcceptanceReworkReport(""), "missing");
  parseFail(parseAcceptanceReworkReport("```yaml\nschema: something-else/v1\nitems: []\n```"), "missing");
});

test("acceptance-rework：HTML 注释里的伪段不算数据（未闭合注释吞到 EOF）", () => {
  const commented = [
    "<!--",
    "```yaml",
    "schema: acceptance-rework/v1",
    "items:",
    "  - id: F1",
    "    owner: convener",
    "    action: 注释里的伪数据",
    "```",
    "-->",
    "",
    "报告正文（无机器可读段）。",
  ].join("\n");
  parseFail(parseAcceptanceReworkReport(commented), "missing");

  const unclosed = ["<!-- 未闭合", "```yaml", "schema: acceptance-rework/v1", "items: []", "```"].join("\n");
  parseFail(parseAcceptanceReworkReport(unclosed), "missing");
});

// —————————————————————— 坏段负例 ——————————————————————

test("acceptance-rework：坏 YAML / 根不是对象 / 多文档 ⇒ invalid", () => {
  const badYaml = parseFail(parseAcceptanceReworkReport(reportWithYaml("schema: acceptance-rework/v1\nitems: [")), "invalid");
  assert.match(badYaml.errors[0]!.message, /YAML 语法错误/);

  parseFail(parseAcceptanceReworkReport(reportWithYaml("schema: acceptance-rework/v1\nitems: []")), "invalid");

  const multiDoc = parseFail(
    parseAcceptanceReworkReport(reportWithYaml("schema: acceptance-rework/v1\n---\nschema: acceptance-rework/v1")),
    "invalid",
  );
  assert.match(multiDoc.errors[0]!.message, /YAML 语法错误|multiple documents/);
});

test("acceptance-rework：未知顶层/返工项字段 ⇒ invalid（具体 path）", () => {
  const topUnknown = parseFail(
    parseAcceptanceReworkReport(reportWithYaml(`${VALID_SECTION}\nextra: true`)),
    "invalid",
  );
  assert.deepEqual(topUnknown.errors.map((error) => error.path), ["extra"]);

  const itemUnknown = parseFail(
    parseAcceptanceReworkReport(
      reportWithYaml(
        [
          "schema: acceptance-rework/v1",
          "items:",
          "  - id: F1",
          "    owner: convener",
          "    action: 返工",
          "    priority: high",
        ].join("\n"),
      ),
    ),
    "invalid",
  );
  assert.deepEqual(itemUnknown.errors.map((error) => error.path), ["items[0].priority"]);
});

test("acceptance-rework：重复 id / id 形状非法 ⇒ invalid", () => {
  const duplicate = parseFail(
    parseAcceptanceReworkReport(
      reportWithYaml(
        [
          "schema: acceptance-rework/v1",
          "items:",
          "  - id: F1",
          "    owner: a",
          "    action: 一",
          "  - id: F1",
          "    owner: b",
          "    action: 二",
        ].join("\n"),
      ),
    ),
    "invalid",
  );
  assert.ok(duplicate.errors.some((error) => error.path === "items[1].id" && /重复/.test(error.message)));

  for (const badId of ["-F1", "F 1", "F1/2", "F".repeat(33), "F1#"]) {
    const content = [
      "schema: acceptance-rework/v1",
      "items:",
      `  - id: ${JSON.stringify(badId)}`,
      "    owner: convener",
      "    action: 返工",
    ].join("\n");
    const result = parseFail(parseAcceptanceReworkReport(reportWithYaml(content)), "invalid");
    assert.ok(result.errors.some((error) => error.path === "items[0].id"), `id ${badId} 应被拒绝`);
  }
});

test("acceptance-rework：空 owner / 多 owner（a + b、客户/Proof、a,b、a、b）/ owner 超长 ⇒ invalid", () => {
  const cases = ["", "a + b", "客户/Proof", "a,b", "a、b", "a b", "x".repeat(65)];
  for (const owner of cases) {
    const content = [
      "schema: acceptance-rework/v1",
      "items:",
      "  - id: F1",
      `    owner: ${JSON.stringify(owner)}`,
      "    action: 返工",
    ].join("\n");
    const result = parseFail(parseAcceptanceReworkReport(reportWithYaml(content)), "invalid");
    assert.ok(result.errors.some((error) => error.path === "items[0].owner"), `owner ${JSON.stringify(owner)} 应被拒绝`);
  }
});

test("acceptance-rework：空 action / action 超 2000 ⇒ invalid；evidence 空串/超 500/非字符串/超 10 条 ⇒ invalid", () => {
  const emptyAction = parseFail(
    parseAcceptanceReworkReport(
      reportWithYaml(["schema: acceptance-rework/v1", "items:", "  - id: F1", "    owner: convener", '    action: "   "'].join("\n")),
    ),
    "invalid",
  );
  assert.ok(emptyAction.errors.some((error) => error.path === "items[0].action"));

  const longAction = parseFail(
    parseAcceptanceReworkReport(
      reportWithYaml(
        ["schema: acceptance-rework/v1", "items:", "  - id: F1", "    owner: convener", `    action: ${"动".repeat(2001)}`].join("\n"),
      ),
    ),
    "invalid",
  );
  assert.ok(longAction.errors.some((error) => error.path === "items[0].action" && /过长/.test(error.message)));

  const evidenceSnippets = [
    '    evidence: ""',
    `    evidence: ${"e".repeat(501)}`,
    "    evidence:\n      - ok\n      - 42",
  ];
  for (const snippet of evidenceSnippets) {
    const content = ["schema: acceptance-rework/v1", "items:", "  - id: F1", "    owner: convener", "    action: 返工", snippet].join("\n");
    const result = parseFail(parseAcceptanceReworkReport(reportWithYaml(content)), "invalid");
    assert.ok(result.errors.some((error) => error.path.startsWith("items[0].evidence")), `${snippet} 应被拒绝`);
  }
  const tooMany = [
    "schema: acceptance-rework/v1",
    "items:",
    "  - id: F1",
    "    owner: convener",
    "    action: 返工",
    "    evidence:",
    ...Array.from({ length: 11 }, (_, index) => `      - e${index}`),
  ].join("\n");
  const tooManyResult = parseFail(parseAcceptanceReworkReport(reportWithYaml(tooMany)), "invalid");
  assert.ok(tooManyResult.errors.some((error) => error.path === "items[0].evidence" && /最多 10 条/.test(error.message)));
});

test("acceptance-rework：items 缺失/非数组/空/超过 64 项 ⇒ invalid", () => {
  parseFail(parseAcceptanceReworkReport(reportWithYaml("schema: acceptance-rework/v1")), "invalid");
  parseFail(parseAcceptanceReworkReport(reportWithYaml("schema: acceptance-rework/v1\nitems: nope")), "invalid");
  parseFail(parseAcceptanceReworkReport(reportWithYaml("schema: acceptance-rework/v1\nitems: []")), "invalid");

  const tooMany = [
    "schema: acceptance-rework/v1",
    "items:",
    ...Array.from({ length: 65 }, (_, index) => [`  - id: F${index}`, "    owner: convener", "    action: 返工"]).flat(),
  ].join("\n");
  const result = parseFail(parseAcceptanceReworkReport(reportWithYaml(tooMany)), "invalid");
  assert.ok(result.errors.some((error) => error.path === "items" && /最多 64 项/.test(error.message)));
});

test("acceptance-rework：段超过 32KB ⇒ invalid；多个 acceptance-rework 段 ⇒ invalid", () => {
  const padding = Array.from({ length: 170 }, (_, index) => `# ${String(index).padStart(3, "0")} ${"x".repeat(200)}`).join("\n");
  const huge = parseFail(parseAcceptanceReworkReport(reportWithYaml(`${VALID_SECTION}\n${padding}`)), "invalid");
  assert.match(huge.errors[0]!.message, /过大/);

  const duplicated = [
    "报告",
    "```yaml",
    "schema: acceptance-rework/v1",
    "items:",
    "  - id: F1",
    "    owner: convener",
    "    action: 返工",
    "```",
    "```yaml",
    "schema: acceptance-rework/v1",
    "items:",
    "  - id: F2",
    "    owner: convener",
    "    action: 返工",
    "```",
  ].join("\n");
  const multi = parseFail(parseAcceptanceReworkReport(duplicated), "invalid");
  assert.match(multi.errors[0]!.message, /多个 acceptance-rework 段/);
});

test("acceptance-rework：不支持版本（v0/v2/无版本号）⇒ unsupported，不按 v1 猜", () => {
  for (const schema of ["acceptance-rework/v0", "acceptance-rework/v2", "acceptance-rework"]) {
    const result = parseFail(
      parseAcceptanceReworkReport(reportWithYaml(`schema: ${schema}\nitems: []`)),
      "unsupported",
    );
    assert.match(result.errors[0]!.message, /不支持的 schema/);
  }
});

test("acceptance-rework：schema 非字符串（如数组）⇒ invalid", () => {
  const result = parseFail(
    parseAcceptanceReworkReport(reportWithYaml("schema: [acceptance-rework/v1]\nitems: []")),
    "invalid",
  );
  assert.ok(result.errors.some((error) => error.path === "schema"));
});

test("acceptance-rework：顶层 schema 键重复（uniqueKeys）⇒ invalid", () => {
  const result = parseFail(
    parseAcceptanceReworkReport(
      reportWithYaml("schema: acceptance-rework/v1\nschema: acceptance-rework/v1\nitems: []"),
    ),
    "invalid",
  );
  assert.match(result.errors[0]!.message, /YAML 语法错误|Map keys must be unique/);
});

test("acceptance-rework：非字符串输入 ⇒ invalid（防御）", () => {
  parseFail(parseAcceptanceReworkReport(undefined as unknown as string), "invalid");
  parseFail(parseAcceptanceReworkReport(42 as unknown as string), "invalid");
});
