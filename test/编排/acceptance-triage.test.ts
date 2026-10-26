// test/编排/acceptance-triage.test.ts
// 2026-10-25 验收分诊（设计 `2026-10-25_design_acceptance-triage.md` §4 / §5 / §8.1）：
//   · `acceptance-triage/v1` 段严格解析（正负例：缺段/多段/坏 YAML/未知字段/重复 id/矛盾/
//     超限/未知版本/旧 rework 段）；
//   · §5.1 R1–R7 默认建议（含可执行性回调、无法核对、文风/篇幅不影响结论）；
//   · triage items → 既有 `acceptance-rework/v1` 任务项映射。
// 纯离线：全部夹具是内联字符串；解析器不读文件系统。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACCEPTANCE_TRIAGE_MAX_ITEMS,
  ACCEPTANCE_TRIAGE_SCHEMA,
  acceptanceTriageItemHasReworkPointers,
  acceptanceTriageToReworkItems,
  isBlockingAcceptanceTriageSeverity,
  parseAcceptanceTriageReport,
  recommendAcceptanceTriage,
  type AcceptanceTriageItem,
  type AcceptanceTriageParseResult,
  type AcceptanceTriageSection,
  type AcceptanceTriageSeverity,
} from "../../src/common/编排/acceptance-triage.ts";
import {
  ACCEPTANCE_TRIAGE_SCHEMA as ACCEPTANCE_TRIAGE_SCHEMA_VIA_PIPELINE,
  parseAcceptanceTriageReport as parseAcceptanceTriageReportViaPipeline,
  recommendAcceptanceTriage as recommendAcceptanceTriageViaPipeline,
} from "../../src/pipeline/orchestration/flow-state.ts";
import { ACCEPTANCE_TRIAGE_DECISION_SCHEMA as LEDGER_SCHEMA_VIA_PIPELINE } from "../../src/pipeline/orchestration/govern-session.ts";
import { ACCEPTANCE_TRIAGE_DECISION_SCHEMA } from "../../src/common/编排/governance-ledger.ts";

// —————————————————————— 夹具 ——————————————————————

const VALID_SECTION = [
  "schema: acceptance-triage/v1",
  "conclusion: fail",
  "coordinator: convener",
  "items:",
  "  - id: F1",
  "    severity: blocker",
  "    owner: platform-foundation",
  "    reason: 干净安装 npm ci 退出码非 0，安装步骤未完成",
  "    action: 在干净环境执行 npm ci 并保留完整日志，修复依赖锁定问题",
  "    targets: [package-lock.json, docs/verification/x/npm-ci.log]",
  "    criteria: docs/acceptance/x-criteria-v1.md#C3",
  "    evidence: docs/verification/x/npm-ci.log",
  "  - id: F2",
  "    severity: minor",
  "    owner: docs-writer",
  "    reason: README 措辞与术语表不一致",
  "    action: 统一 README 术语",
  "    targets:",
  "      - README.md",
].join("\n");

/** 报告 Markdown：前置说明 + 恰好一个 fenced 块 + 后置说明。 */
function reportWithYaml(content: string, info = "yaml", fence = "```"): string {
  return ["# 验收报告 v1", "", "结论：不通过。", "", `${fence}${info}`, content, fence, "", "以上。"].join("\n");
}

function parseOk(result: AcceptanceTriageParseResult) {
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.errors, null, 2));
  return result as { ok: true; triage: AcceptanceTriageSection; warnings: string[] };
}

function parseFail(result: AcceptanceTriageParseResult, code: "missing" | "invalid" | "unsupported-version" | "ambiguous") {
  assert.equal(result.ok, false, "期望解析失败但通过了");
  const failed = result as { ok: false; code: string; errors: Array<{ path: string; message: string }> };
  assert.equal(failed.code, code);
  assert.ok(failed.errors.length > 0, "失败必须带具体错误");
  return failed;
}

function makeItem(overrides: Partial<AcceptanceTriageItem> = {}): AcceptanceTriageItem {
  return {
    id: "F1",
    severity: "blocker",
    owner: "platform-foundation",
    reason: "原因",
    action: "改进",
    targets: ["src/x.ts"],
    criteria: null,
    evidence: [],
    ...overrides,
  };
}

function makeTriage(overrides: Partial<AcceptanceTriageSection> = {}): AcceptanceTriageSection {
  return {
    schema: ACCEPTANCE_TRIAGE_SCHEMA,
    conclusion: "fail",
    coordinator: "convener",
    coordinatorDeclaration: null,
    items: [makeItem()],
    ...overrides,
  };
}

// —————————————————————— 解析器正例 ——————————————————————

test("acceptance-triage：合法段 ⇒ ok；字段规范化（数组/字符串、trim、缺省 null/[]）", () => {
  const result = parseOk(parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION)));
  assert.deepEqual(result.warnings, []);
  assert.equal(result.triage.schema, ACCEPTANCE_TRIAGE_SCHEMA);
  assert.equal(result.triage.conclusion, "fail");
  assert.equal(result.triage.coordinator, "convener");
  assert.equal(result.triage.coordinatorDeclaration, "convener");
  assert.deepEqual(result.triage.items, [
    {
      id: "F1",
      severity: "blocker",
      owner: "platform-foundation",
      reason: "干净安装 npm ci 退出码非 0，安装步骤未完成",
      action: "在干净环境执行 npm ci 并保留完整日志，修复依赖锁定问题",
      targets: ["package-lock.json", "docs/verification/x/npm-ci.log"],
      criteria: "docs/acceptance/x-criteria-v1.md#C3",
      evidence: ["docs/verification/x/npm-ci.log"],
    },
    {
      id: "F2",
      severity: "minor",
      owner: "docs-writer",
      reason: "README 措辞与术语表不一致",
      action: "统一 README 术语",
      targets: ["README.md"],
      criteria: null,
      evidence: [],
    },
  ]);
});

test("acceptance-triage：pass 允许空 items；pass 带 minor/nit 合法；coordinator 缺省/别名/未知 warning", () => {
  const passEmpty = parseOk(
    parseAcceptanceTriageReport(reportWithYaml("schema: acceptance-triage/v1\nconclusion: pass\nitems: []")),
  );
  assert.deepEqual(passEmpty.triage.items, []);
  assert.equal(passEmpty.triage.coordinatorDeclaration, null);

  const passWithNit = parseOk(
    parseAcceptanceTriageReport(
      reportWithYaml(
        [
          "schema: acceptance-triage/v1",
          "conclusion: pass",
          "items:",
          "  - id: N1",
          "    severity: nit",
          "    owner: docs-writer",
          "    reason: 注释措辞可更简洁",
          "    action: 下次顺手调整",
        ].join("\n"),
      ),
    ),
  );
  assert.equal(passWithNit.triage.items[0]!.severity, "nit");

  const steward = parseOk(
    parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION.replace("coordinator: convener", "coordinator: steward"))),
  );
  assert.equal(steward.triage.coordinator, "convener");
  assert.equal(steward.triage.coordinatorDeclaration, "steward");
  assert.deepEqual(steward.warnings, []);

  const unknown = parseOk(
    parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION.replace("coordinator: convener", "coordinator: lead"))),
  );
  assert.equal(unknown.triage.coordinatorDeclaration, "lead");
  assert.equal(unknown.warnings.length, 1);
  assert.match(unknown.warnings[0]!, /coordinator="lead" 不受支持/);
});

test("acceptance-triage：fence 变体（~~~ / 缩进 / 无 info string）与边界数量（64 项）", () => {
  const tilde = parseOk(parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION, "yaml", "~~~")));
  assert.equal(tilde.triage.items.length, 2);

  const indented = parseOk(
    parseAcceptanceTriageReport(
      [
        "# 报告",
        "  ```yaml",
        "  schema: acceptance-triage/v1",
        "  conclusion: fail",
        "  items:",
        "    - id: F2",
        "      severity: major",
        "      owner: qa-verification",
        "      reason: e2e 未跑",
        "      action: 补 e2e",
        "      criteria: docs/acceptance/x-criteria-v1.md#C2",
        "  ```",
      ].join("\n"),
    ),
  );
  assert.deepEqual(indented.triage.items.map((item) => item.id), ["F2"]);

  const noInfo = parseOk(
    parseAcceptanceTriageReport(
      [
        "```",
        "schema: acceptance-triage/v1",
        "conclusion: fail",
        "items:",
        "  - id: F3",
        "    severity: minor",
        "    owner: convener",
        "    reason: 文档措辞",
        "    action: 改措辞",
        "    targets: [docs/x.md]",
        "```",
      ].join("\n"),
    ),
  );
  assert.equal(noInfo.triage.items[0]!.owner, "convener");

  const maxItems = [
    "schema: acceptance-triage/v1",
    "conclusion: fail",
    "items:",
    ...Array.from({ length: ACCEPTANCE_TRIAGE_MAX_ITEMS }, (_, index) => [
      `  - id: F${index}`,
      "    severity: minor",
      "    owner: convener",
      "    reason: 原因",
      "    action: 改进",
      "    targets: [docs/x.md]",
    ]).flat(),
  ].join("\n");
  const maxResult = parseOk(parseAcceptanceTriageReport(reportWithYaml(maxItems)));
  assert.equal(maxResult.triage.items.length, 64);
});

test("acceptance-triage：与旧 acceptance-rework/v1 段并存时以 triage 段为准；rework 段被忽略", () => {
  const text = [
    reportWithYaml(VALID_SECTION),
    "",
    "```yaml",
    "schema: acceptance-rework/v1",
    "items:",
    "  - id: R1",
    "    owner: convener",
    "    action: 旧返工段",
    "```",
  ].join("\n");
  const result = parseOk(parseAcceptanceTriageReport(text));
  assert.deepEqual(result.triage.items.map((item) => item.id), ["F1", "F2"]);
});

test("acceptance-triage：纯函数——同输入两次结果深相等；非候选 YAML/JSON 块被忽略", () => {
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
  assert.deepEqual(parseAcceptanceTriageReport(text), parseAcceptanceTriageReport(text));
  assert.equal(parseAcceptanceTriageReport(text).ok, true);
});

test("acceptance-triage：flow 风格根映射（单行 JSON）同样识别；与块式段并存 ⇒ ambiguous", () => {
  const flowStyle =
    '{"schema":"acceptance-triage/v1","conclusion":"fail","items":[{"id":"F1","severity":"major","owner":"convener","reason":"r","action":"a","targets":["docs/x.md"]}]}';
  const single = parseOk(parseAcceptanceTriageReport(`报告\n\n\`\`\`json\n${flowStyle}\n\`\`\``));
  assert.equal(single.triage.items[0]!.severity, "major");

  const both = parseFail(
    parseAcceptanceTriageReport(`${reportWithYaml(VALID_SECTION)}\n\`\`\`json\n${flowStyle}\n\`\`\``),
    "ambiguous",
  );
  assert.match(both.errors[0]!.message, /多个 acceptance-triage 段/);
});

// —————————————————————— 缺段 / 歧义 / 坏段 ——————————————————————

test("acceptance-triage：无段 ⇒ missing（旧 rework 段 / 自由文本都不满足）", () => {
  parseFail(parseAcceptanceTriageReport(""), "missing");
  parseFail(
    parseAcceptanceTriageReport("```yaml\nschema: acceptance-rework/v1\nitems:\n  - id: F1\n    owner: convener\n    action: 返工\n```"),
    "missing",
  );
  const freeText = [
    "# 验收报告",
    "",
    "## 8 偏差、缺口与处置",
    "",
    "| 编号 | severity | 偏差 | 建议处置 |",
    "| --- | --- | --- | --- |",
    "| F1 | blocker | 干净安装未验证 | 在全环境执行 npm ci |",
  ].join("\n");
  const result = parseFail(parseAcceptanceTriageReport(freeText), "missing");
  assert.match(result.errors[0]!.message, /缺结构不猜/);
});

test("acceptance-triage：HTML 注释里的伪段不算数据（未闭合注释吞到 EOF）", () => {
  const commented = [
    "<!--",
    "```yaml",
    "schema: acceptance-triage/v1",
    "conclusion: fail",
    "items: []",
    "```",
    "-->",
    "",
    "报告正文（无机器可读段）。",
  ].join("\n");
  parseFail(parseAcceptanceTriageReport(commented), "missing");

  const unclosed = ["<!-- 未闭合", "```yaml", "schema: acceptance-triage/v1", "items: []", "```"].join("\n");
  parseFail(parseAcceptanceTriageReport(unclosed), "missing");
});

test("acceptance-triage：多个 triage 段 ⇒ ambiguous（不猜哪份权威）", () => {
  const duplicated = [
    "报告",
    "```yaml",
    "schema: acceptance-triage/v1",
    "conclusion: pass",
    "items: []",
    "```",
    "```yaml",
    "schema: acceptance-triage/v1",
    "conclusion: fail",
    "items:",
    "  - id: F1",
    "    severity: blocker",
    "    owner: convener",
    "    reason: r",
    "    action: a",
    "    targets: [docs/x.md]",
    "```",
  ].join("\n");
  const multi = parseFail(parseAcceptanceTriageReport(duplicated), "ambiguous");
  assert.match(multi.errors[0]!.message, /多个 acceptance-triage 段/);
});

test("acceptance-triage：坏 YAML / 多文档 ⇒ invalid；schema 非字符串 ⇒ invalid", () => {
  const badYaml = parseFail(
    parseAcceptanceTriageReport(reportWithYaml("schema: acceptance-triage/v1\nconclusion: [")),
    "invalid",
  );
  assert.match(badYaml.errors[0]!.message, /YAML 语法错误/);

  const multiDoc = parseFail(
    parseAcceptanceTriageReport(
      reportWithYaml("schema: acceptance-triage/v1\n---\nschema: acceptance-triage/v1"),
    ),
    "invalid",
  );
  assert.match(multiDoc.errors[0]!.message, /YAML 语法错误|multiple documents/);

  const nonStringSchema = parseFail(
    parseAcceptanceTriageReport(reportWithYaml("schema: [acceptance-triage/v1]\nconclusion: pass\nitems: []")),
    "invalid",
  );
  assert.ok(nonStringSchema.errors.some((error) => error.path === "schema"));

  const duplicateKey = parseFail(
    parseAcceptanceTriageReport(
      reportWithYaml("schema: acceptance-triage/v1\nschema: acceptance-triage/v1\nconclusion: pass\nitems: []"),
    ),
    "invalid",
  );
  assert.match(duplicateKey.errors[0]!.message, /YAML 语法错误|Map keys must be unique/);
});

test("acceptance-triage：不支持版本（v0/v2/无版本号）⇒ unsupported-version，不按 v1 猜", () => {
  for (const schema of ["acceptance-triage/v0", "acceptance-triage/v2", "acceptance-triage"]) {
    const result = parseFail(
      parseAcceptanceTriageReport(reportWithYaml(`schema: ${schema}\nconclusion: pass\nitems: []`)),
      "unsupported-version",
    );
    assert.match(result.errors[0]!.message, /不支持的 schema/);
  }
});

test("acceptance-triage：未知顶层/分诊项字段 ⇒ invalid（具体 path）", () => {
  const topUnknown = parseFail(
    parseAcceptanceTriageReport(reportWithYaml(`${VALID_SECTION}\nextra: true`)),
    "invalid",
  );
  assert.deepEqual(topUnknown.errors.map((error) => error.path), ["extra"]);

  const itemUnknown = parseFail(
    parseAcceptanceTriageReport(
      reportWithYaml(
        [
          "schema: acceptance-triage/v1",
          "conclusion: fail",
          "items:",
          "  - id: F1",
          "    severity: minor",
          "    owner: convener",
          "    reason: r",
          "    action: a",
          "    priority: high",
        ].join("\n"),
      ),
    ),
    "invalid",
  );
  assert.deepEqual(itemUnknown.errors.map((error) => error.path), ["items[0].priority"]);
});

test("acceptance-triage：conclusion/severity 非法 ⇒ invalid；pass 带 blocker/major ⇒ invalid（R5 矛盾）", () => {
  parseFail(
    parseAcceptanceTriageReport(reportWithYaml("schema: acceptance-triage/v1\nconclusion: ok\nitems: []")),
    "invalid",
  );
  const badSeverity = parseFail(
    parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION.replace("severity: blocker", "severity: critical"))),
    "invalid",
  );
  assert.ok(badSeverity.errors.some((error) => error.path === "items[0].severity"));

  for (const severity of ["blocker", "major"]) {
    const contradiction = parseFail(
      parseAcceptanceTriageReport(
        reportWithYaml(
          [
            "schema: acceptance-triage/v1",
            "conclusion: pass",
            "items:",
            "  - id: F1",
            `    severity: ${severity}`,
            "    owner: convener",
            "    reason: r",
            "    action: a",
            "    targets: [docs/x.md]",
          ].join("\n"),
        ),
      ),
      "invalid",
    );
    assert.ok(
      contradiction.errors.some((error) => error.path === "items[0].severity" && /矛盾/.test(error.message)),
      `pass + ${severity} 应判矛盾`,
    );
  }
});

test("acceptance-triage：fail/conditional 必须非空 items；非法 conclusion 时不叠加非空错误", () => {
  for (const conclusion of ["fail", "conditional"]) {
    const result = parseFail(
      parseAcceptanceTriageReport(reportWithYaml(`schema: acceptance-triage/v1\nconclusion: ${conclusion}\nitems: []`)),
      "invalid",
    );
    assert.ok(result.errors.some((error) => error.path === "items" && /不能为空/.test(error.message)));
  }
  parseFail(
    parseAcceptanceTriageReport(reportWithYaml("schema: acceptance-triage/v1\nitems: []")),
    "invalid",
  );
  parseFail(
    parseAcceptanceTriageReport(reportWithYaml("schema: acceptance-triage/v1\nconclusion: pass\nitems: nope")),
    "invalid",
  );
});

test("acceptance-triage：重复 id / id 形状非法 ⇒ invalid", () => {
  const duplicate = parseFail(
    parseAcceptanceTriageReport(reportWithYaml(`${VALID_SECTION}\n  - id: F1\n    severity: nit\n    owner: a\n    reason: r\n    action: a`)),
    "invalid",
  );
  assert.ok(duplicate.errors.some((error) => error.path === "items[2].id" && /重复/.test(error.message)));

  for (const badId of ["-F1", "F 1", "F1/2", "F".repeat(33), "F1#"]) {
    const content = [
      "schema: acceptance-triage/v1",
      "conclusion: fail",
      "items:",
      `  - id: ${JSON.stringify(badId)}`,
      "    severity: minor",
      "    owner: convener",
      "    reason: r",
      "    action: a",
    ].join("\n");
    const result = parseFail(parseAcceptanceTriageReport(reportWithYaml(content)), "invalid");
    assert.ok(result.errors.some((error) => error.path === "items[0].id"), `id ${badId} 应被拒绝`);
  }
});

test("acceptance-triage：空/多 owner、owner 超长、空 reason/action、长度超限 ⇒ invalid", () => {
  for (const owner of ["", "a + b", "客户/Proof", "a,b", "a、b", "a b", "x".repeat(65)]) {
    const content = [
      "schema: acceptance-triage/v1",
      "conclusion: fail",
      "items:",
      "  - id: F1",
      "    severity: minor",
      `    owner: ${JSON.stringify(owner)}`,
      "    reason: r",
      "    action: a",
    ].join("\n");
    const result = parseFail(parseAcceptanceTriageReport(reportWithYaml(content)), "invalid");
    assert.ok(result.errors.some((error) => error.path === "items[0].owner"), `owner ${JSON.stringify(owner)} 应被拒绝`);
  }

  const emptyReason = parseFail(
    parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION.replace("reason: 干净安装 npm ci 退出码非 0，安装步骤未完成", 'reason: "   "'))),
    "invalid",
  );
  assert.ok(emptyReason.errors.some((error) => error.path === "items[0].reason"));

  const longReason = parseFail(
    parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION.replace("reason: 干净安装 npm ci 退出码非 0，安装步骤未完成", `reason: ${"原".repeat(1001)}`))),
    "invalid",
  );
  assert.ok(longReason.errors.some((error) => error.path === "items[0].reason" && /过长/.test(error.message)));

  const emptyAction = parseFail(
    parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION.replace("action: 统一 README 术语", 'action: ""'))),
    "invalid",
  );
  assert.ok(emptyAction.errors.some((error) => error.path === "items[1].action"));

  const longAction = parseFail(
    parseAcceptanceTriageReport(reportWithYaml(VALID_SECTION.replace("action: 统一 README 术语", `action: ${"动".repeat(2001)}`))),
    "invalid",
  );
  assert.ok(longAction.errors.some((error) => error.path === "items[1].action" && /过长/.test(error.message)));
});

test("acceptance-triage：targets/criteria/evidence 规则（类型、条数、单条长度、空串）⇒ invalid", () => {
  const snippets = [
    "    targets: 42",
    ["    targets:", ...Array.from({ length: 11 }, (_, index) => `      - t${index}`)].join("\n"),
    `    targets: ${"t".repeat(501)}`,
    '    targets: [""]',
    "    criteria: 42",
    '    criteria: "  "',
    `    criteria: ${"c".repeat(501)}`,
    ["    evidence:", ...Array.from({ length: 11 }, (_, index) => `      - e${index}`)].join("\n"),
    `    evidence: ${"e".repeat(501)}`,
    "    evidence:\n      - ok\n      - 42",
  ];
  for (const snippet of snippets) {
    const content = ["schema: acceptance-triage/v1", "conclusion: fail", "items:", "  - id: F1", "    severity: minor", "    owner: convener", "    reason: r", "    action: a", snippet].join("\n");
    const result = parseFail(parseAcceptanceTriageReport(reportWithYaml(content)), "invalid");
    assert.ok(
      result.errors.some((error) => /items\[0\]\.(targets|criteria|evidence)/.test(error.path)),
      `${snippet.slice(0, 40)} 应被拒绝`,
    );
  }

  const emptyLists = parseOk(
    parseAcceptanceTriageReport(
      reportWithYaml(
        [
          "schema: acceptance-triage/v1",
          "conclusion: fail",
          "items:",
          "  - id: F1",
          "    severity: minor",
          "    owner: convener",
          "    reason: r",
          "    action: a",
          "    targets: []",
          "    evidence: []",
        ].join("\n"),
      ),
    ),
  );
  assert.deepEqual(emptyLists.triage.items[0]!.targets, []);
  assert.deepEqual(emptyLists.triage.items[0]!.evidence, []);
  assert.equal(emptyLists.triage.items[0]!.criteria, null);
});

test("acceptance-triage：items 超过 64 项 ⇒ invalid；段超过 32KB ⇒ invalid", () => {
  const tooMany = [
    "schema: acceptance-triage/v1",
    "conclusion: fail",
    "items:",
    ...Array.from({ length: 65 }, (_, index) => [
      `  - id: F${index}`,
      "    severity: nit",
      "    owner: convener",
      "    reason: r",
      "    action: a",
    ]).flat(),
  ].join("\n");
  const result = parseFail(parseAcceptanceTriageReport(reportWithYaml(tooMany)), "invalid");
  assert.ok(result.errors.some((error) => error.path === "items" && /最多 64 项/.test(error.message)));

  const padding = Array.from({ length: 170 }, (_, index) => `# ${String(index).padStart(3, "0")} ${"x".repeat(200)}`).join("\n");
  const huge = parseFail(parseAcceptanceTriageReport(reportWithYaml(`${VALID_SECTION}\n${padding}`)), "invalid");
  assert.match(huge.errors[0]!.message, /过大/);
});

test("acceptance-triage：非字符串输入 ⇒ invalid（防御）", () => {
  parseFail(parseAcceptanceTriageReport(undefined as unknown as string), "invalid");
  parseFail(parseAcceptanceTriageReport(42 as unknown as string), "invalid");
});

// —————————————————————— 默认建议 R1–R7 ——————————————————————

test("R1：pass（空 items / 仅 minor-nint）⇒ no-triage，走既有验收卡路径", () => {
  for (const triage of [
    makeTriage({ conclusion: "pass", items: [] }),
    makeTriage({ conclusion: "pass", items: [makeItem({ severity: "nit" })] }),
  ]) {
    const recommendation = recommendAcceptanceTriage(triage);
    assert.equal(recommendation.disposition, "no-triage");
    assert.equal(recommendation.basis, "pass");
    assert.equal(recommendation.authoritative, true);
    assert.equal(recommendation.requiresCustomerDecision, false);
    assert.equal(recommendation.blockingCount, 0);
    assert.match(recommendation.reasons[0]!, /^R1:/);
  }
});

test("R2/R6：blocker+major 全部可执行 ⇒ rework；文风/篇幅不改变建议", () => {
  const items = [
    makeItem({ id: "F1", severity: "blocker" }),
    makeItem({ id: "F2", severity: "major", targets: [], criteria: "docs/acceptance/x-criteria-v1.md#C2" }),
    makeItem({ id: "F3", severity: "minor" }),
  ];
  const calls: Array<{ id: string; index: number }> = [];
  const recommendation = recommendAcceptanceTriage(makeTriage({ conclusion: "conditional", items }), {
    checkExecutability: (item, index) => {
      calls.push({ id: item.id, index });
      return true;
    },
  });
  assert.equal(recommendation.disposition, "rework");
  assert.equal(recommendation.basis, "blocker-major-feasible");
  assert.equal(recommendation.authoritative, true);
  assert.equal(recommendation.requiresCustomerDecision, false);
  assert.equal(recommendation.blockingCount, 2);
  assert.equal(recommendation.minorCount, 1);
  assert.deepEqual(recommendation.severityCounts, { blocker: 1, major: 1, minor: 1, nit: 0 });
  assert.deepEqual(calls.map((call) => call.id), ["F1", "F2"], "只对 blocker/major 调可执行性检查");
  assert.match(recommendation.reasons[0]!, /^R2:/);
  assert.ok(recommendation.reasons.some((reason) => reason.startsWith("R6:")));

  // R6：同样的结构，换成「措辞严厉 + 篇幅很长」的文本 ⇒ 建议逐字不变（文风不参与判定）。
  const harshItems = items.map((item) => ({
    ...item,
    reason: "严重问题！！！".repeat(80),
    action: "必须立刻修复！".repeat(120),
  }));
  const harsh = recommendAcceptanceTriage(makeTriage({ conclusion: "conditional", items: harshItems }), {
    checkExecutability: () => true,
  });
  assert.equal(harsh.disposition, recommendation.disposition);
  assert.equal(harsh.basis, recommendation.basis);
  assert.equal(harsh.blockingCount, recommendation.blockingCount);
  assert.deepEqual(harsh.severityCounts, recommendation.severityCounts);
});

test("R3/R7：只有 minor/nit ⇒ report-only（不调用可执行性检查）；文风/篇幅不改变建议", () => {
  let calls = 0;
  const items = [
    makeItem({ id: "F1", severity: "minor", targets: [], criteria: null }),
    makeItem({ id: "F2", severity: "nit", targets: [], criteria: null }),
  ];
  const recommendation = recommendAcceptanceTriage(makeTriage({ conclusion: "fail", items }), {
    checkExecutability: () => {
      calls += 1;
      return false;
    },
  });
  assert.equal(recommendation.disposition, "report-only");
  assert.equal(recommendation.basis, "minor-only");
  assert.equal(recommendation.authoritative, true);
  assert.equal(recommendation.requiresCustomerDecision, false);
  assert.equal(recommendation.blockingCount, 0);
  assert.equal(recommendation.minorCount, 2);
  assert.equal(calls, 0, "R3 仅汇报不依赖 owner 可执行性");
  assert.match(recommendation.reasons[0]!, /^R3:/);
  assert.ok(recommendation.reasons.some((reason) => reason.startsWith("R7:")));

  const harsh = recommendAcceptanceTriage(
    makeTriage({
      conclusion: "fail",
      items: items.map((item) => ({ ...item, reason: "非常严重！".repeat(100), action: "必须返工！".repeat(100) })),
    }),
  );
  assert.equal(harsh.disposition, "report-only");
  assert.equal(harsh.basis, "minor-only");
});

test("R4：存在 blocker/major 但任一不可执行 ⇒ return-to-verifier（不猜 owner）", () => {
  const items = [makeItem({ id: "F1", severity: "blocker" }), makeItem({ id: "F2", severity: "major" })];
  const notExecutable = recommendAcceptanceTriage(makeTriage({ items }), {
    checkExecutability: (item) =>
      item.id === "F1" ? true : { status: "not-executable", reasons: ["owner 不可派发：unknown-role"] },
  });
  assert.equal(notExecutable.disposition, "return-to-verifier");
  assert.equal(notExecutable.basis, "blocker-major-infeasible");
  assert.equal(notExecutable.authoritative, true);
  assert.equal(notExecutable.requiresCustomerDecision, false);
  assert.match(notExecutable.reasons[0]!, /^R4:/);
  assert.match(notExecutable.reasons[0]!, /F2/);
  assert.match(notExecutable.reasons[0]!, /unknown-role/);

  // 回调声明可执行，但没有 targets/criteria 指针（只有 evidence）⇒ 引擎按 §5.2 自行判不可执行。
  const evidenceOnly = recommendAcceptanceTriage(
    makeTriage({ items: [makeItem({ severity: "blocker", targets: [], criteria: null, evidence: ["docs/x.log"] })] }),
    { checkExecutability: () => true },
  );
  assert.equal(evidenceOnly.disposition, "return-to-verifier");
  assert.match(evidenceOnly.reasons[0]!, /缺少 targets\/criteria 指针/);

  // boolean 回调 false ⇒ 不可执行。
  const booleanFalse = recommendAcceptanceTriage(makeTriage({ items }), {
    checkExecutability: () => false,
  });
  assert.equal(booleanFalse.disposition, "return-to-verifier");
});

test("R5（防御）：pass 带 blocker / fail 空 items ⇒ return-to-verifier，不自动建议", () => {
  const passBlocker = recommendAcceptanceTriage(
    makeTriage({ conclusion: "pass", items: [makeItem({ severity: "blocker" })] }),
  );
  assert.equal(passBlocker.disposition, "return-to-verifier");
  assert.equal(passBlocker.basis, "invalid-structure");
  assert.match(passBlocker.reasons[0]!, /^R5:/);

  const failEmpty = recommendAcceptanceTriage(makeTriage({ conclusion: "fail", items: [] }));
  assert.equal(failEmpty.disposition, "return-to-verifier");
  assert.equal(failEmpty.basis, "invalid-structure");
});

test("§5.4：可执行性无法核对（回调缺省/unavailable/抛错）⇒ 非权威建议 + 必须客户决定", () => {
  const items = [makeItem({ severity: "blocker" })];

  const noCallback = recommendAcceptanceTriage(makeTriage({ items }));
  assert.equal(noCallback.disposition, "rework", "参考建议（存在 blocker）");
  assert.equal(noCallback.authoritative, false);
  assert.equal(noCallback.requiresCustomerDecision, true);
  assert.equal(noCallback.basis, "feasibility-unavailable");

  const unavailable = recommendAcceptanceTriage(makeTriage({ items }), {
    checkExecutability: () => ({ status: "unavailable", reasons: ["listing 不可用"] }),
  });
  assert.equal(unavailable.authoritative, false);
  assert.equal(unavailable.requiresCustomerDecision, true);
  assert.match(unavailable.reasons[0]!, /listing 不可用/);

  const thrown = recommendAcceptanceTriage(makeTriage({ items }), {
    checkExecutability: () => {
      throw new Error("账本不可读");
    },
  });
  assert.equal(thrown.authoritative, false);
  assert.equal(thrown.requiresCustomerDecision, true);
  assert.match(thrown.reasons[0]!, /账本不可读/);
});

test("可执行性规则常量：blocker/major 为阻断；指针 = targets 或 criteria（evidence 不算）", () => {
  assert.equal(isBlockingAcceptanceTriageSeverity("blocker"), true);
  assert.equal(isBlockingAcceptanceTriageSeverity("major"), true);
  assert.equal(isBlockingAcceptanceTriageSeverity("minor"), false);
  assert.equal(isBlockingAcceptanceTriageSeverity("nit"), false);

  assert.equal(acceptanceTriageItemHasReworkPointers(makeItem({ targets: ["a"], criteria: null })), true);
  assert.equal(acceptanceTriageItemHasReworkPointers(makeItem({ targets: [], criteria: "c" })), true);
  assert.equal(acceptanceTriageItemHasReworkPointers(makeItem({ targets: [], criteria: null })), false);
  assert.equal(
    acceptanceTriageItemHasReworkPointers(makeItem({ targets: [], criteria: null, evidence: ["e"] })),
    false,
    "evidence 不是改进方案指针",
  );
});

// —————————————————————— triage → rework 映射 ——————————————————————

test("映射：id/owner/action 原样；evidence = evidence ∪ targets（去重）；severity/reason 作为上下文", () => {
  const triage = makeTriage({
    items: [
      makeItem({
        id: "F1",
        severity: "blocker",
        owner: "platform-foundation",
        reason: "npm ci 失败",
        action: "修复依赖锁定",
        targets: ["package-lock.json", "docs/verification/x/npm-ci.log"],
        criteria: "docs/acceptance/x-criteria-v1.md#C3",
        evidence: ["docs/verification/x/npm-ci.log", "docs/verification/y.log"],
      }),
      makeItem({
        id: "F2",
        severity: "nit",
        owner: "docs-writer",
        reason: "措辞",
        action: "统一术语",
        targets: [],
        criteria: null,
        evidence: [],
      }),
    ],
  });
  const snapshot = JSON.parse(JSON.stringify(triage));
  const mapped = acceptanceTriageToReworkItems(triage);
  assert.deepEqual(mapped, [
    {
      id: "F1",
      owner: "platform-foundation",
      action: "修复依赖锁定",
      evidence: ["docs/verification/x/npm-ci.log", "docs/verification/y.log", "package-lock.json"],
      severity: "blocker",
      reason: "npm ci 失败",
      criteria: "docs/acceptance/x-criteria-v1.md#C3",
      targets: ["package-lock.json", "docs/verification/x/npm-ci.log"],
      blocking: true,
    },
    {
      id: "F2",
      owner: "docs-writer",
      action: "统一术语",
      evidence: [],
      severity: "nit",
      reason: "措辞",
      criteria: null,
      targets: [],
      blocking: false,
    },
  ]);
  assert.deepEqual(triage, snapshot, "不修改入参");
});

test("映射：同报告内 severity 不改变 id/owner/action；空 items ⇒ 空数组", () => {
  assert.deepEqual(acceptanceTriageToReworkItems(makeTriage({ conclusion: "pass", items: [] })), []);
  const severities: AcceptanceTriageSeverity[] = ["blocker", "major", "minor", "nit"];
  const mapped = acceptanceTriageToReworkItems(
    makeTriage({ items: severities.map((severity, index) => makeItem({ id: `F${index}`, severity })) }),
  );
  assert.deepEqual(mapped.map((item) => item.id), ["F0", "F1", "F2", "F3"]);
  assert.deepEqual(mapped.map((item) => item.blocking), [true, true, false, false]);
});

// —————————————————————— Pipeline 公共出口（桌面消费面） ——————————————————————

test("公共出口：分诊解析/建议/记录经 `src/pipeline/orchestration/**` 薄再导出（同一实现）", () => {
  assert.equal(ACCEPTANCE_TRIAGE_SCHEMA_VIA_PIPELINE, ACCEPTANCE_TRIAGE_SCHEMA);
  assert.equal(parseAcceptanceTriageReportViaPipeline, parseAcceptanceTriageReport);
  assert.equal(recommendAcceptanceTriageViaPipeline, recommendAcceptanceTriage);
  assert.equal(LEDGER_SCHEMA_VIA_PIPELINE, ACCEPTANCE_TRIAGE_DECISION_SCHEMA);
});
