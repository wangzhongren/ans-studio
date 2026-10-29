// test/编排/workflow-preconditions.test.ts
// 2026-10-29（方案 v2.1 §5）：五步工作流链的机械前置——
//   · project-roster/v1 名单解析/校验（schema/flowId/version/角色 id/目录/重叠）；
//   · 最新名单发现与版本/hash（文件名版本 = frontmatter version）；
//   · 派发矩阵 M1–M8（幕僚按序、运营作用域、拒绝 code 与下一步）；
//   · 任务绑定报告按 task.created.from 路由（M9）。
// 纯逻辑 + 临时文件；不启动应用、不触网、不写仓库。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  evaluateDispatchPreflight,
  loadLatestRoster,
  parseProjectRoster,
  reportTargetForTaskCreator,
  rosterRoleIds,
  selectLatestRosterFile,
  validateAppointmentCardAgainstRoster,
  type DispatchPreflightInput,
  type ProjectRoster,
} from "../../src/common/编排/workflow-preconditions.ts";

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v1",
  "flowId: focus",
  "version: 1",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现前端与服务",
  "    capability: TypeScript / Node",
  "    directories:",
  "      - src/",
  "      - tests/",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 质量核对",
  "    capability: 测试",
  "    directories:",
  "      - test/",
  "---",
  "# 人员名单（人读）",
  "",
  "说明文字。",
].join("\n");

const VALID_ROSTER: ProjectRoster = parseProjectRoster(ROSTER_TEXT).ok
  ? (parseProjectRoster(ROSTER_TEXT) as { roster: ProjectRoster }).roster
  : (() => {
      throw new Error("fixture roster invalid");
    })();

test("名单解析：合法 frontmatter/角色/目录；flowId 可按期望校验", () => {
  const parsed = parseProjectRoster(ROSTER_TEXT, "focus");
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.roster.schema, "project-roster/v1");
    assert.equal(parsed.roster.flowId, "focus");
    assert.equal(parsed.roster.version, 1);
    assert.deepEqual(rosterRoleIds(parsed.roster), ["implementer", "qa"]);
    assert.deepEqual(parsed.roster.roles[0]!.directories, ["src/", "tests/"]);
  }
  const mismatch = parseProjectRoster(ROSTER_TEXT, "other");
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "roster-flow-mismatch");
});

test("名单解析负例：缺 frontmatter/坏 schema/版本/角色 id/内置 id/重复/目录非法/重叠/治理路径", () => {
  const cases: Array<[string, string, string]> = [
    ["missing-frontmatter", "# no frontmatter\n", "roster-frontmatter-missing"],
    ["bad-schema", ROSTER_TEXT.replace("schema: project-roster/v1", "schema: other/v1"), "roster-schema-invalid"],
    ["bad-version", ROSTER_TEXT.replace("version: 1", "version: 0"), "roster-version-invalid"],
    ["builtin-id", ROSTER_TEXT.replace("id: implementer", "id: convener"), "roster-role-builtin"],
    ["bad-id", ROSTER_TEXT.replace("id: implementer", "id: Bad_ID"), "roster-role-id-invalid"],
    ["duplicate-id", ROSTER_TEXT.replace("id: qa", "id: implementer"), "roster-role-duplicate"],
    ["missing-fields", ROSTER_TEXT.replace("    capability: TypeScript / Node\n", ""), "roster-role-fields-missing"],
    ["dir-absolute", ROSTER_TEXT.replace("      - src/", "      - /src/"), "roster-directory-invalid"],
    ["dir-dotdot", ROSTER_TEXT.replace("      - src/", "      - ../src/"), "roster-directory-invalid"],
    ["dir-wildcard", ROSTER_TEXT.replace("      - src/", "      - src/*"), "roster-directory-invalid"],
    ["dir-governance", ROSTER_TEXT.replace("      - src/", "      - 角色卡/"), "roster-directory-governance"],
    ["dir-overlap", ROSTER_TEXT.replace("      - test/", "      - src/sub/"), "roster-directory-overlap"],
  ];
  for (const [name, text, code] of cases) {
    const parsed = parseProjectRoster(text);
    assert.equal(parsed.ok, false, name);
    if (!parsed.ok) assert.equal(parsed.code, code, `${name}: ${parsed.reason}`);
  }
});

test("最新名单：选 N 最大并校验文件名版本=frontmatter version；缺失/不一致如实报错", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-roster-"));
  try {
    await fs.mkdir(path.join(root, "docs", "proposals"), { recursive: true });
    assert.deepEqual(selectLatestRosterFile("focus", ["focus-roster-v1.md", "focus-roster-v2.md", "other-roster-v9.md"]), {
      version: 2,
      file: "focus-roster-v2.md",
      candidates: ["focus-roster-v1.md", "focus-roster-v2.md"],
    });
    const missing = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "roster-missing");

    await fs.writeFile(path.join(root, "docs", "proposals", "focus-roster-v1.md"), ROSTER_TEXT, "utf8");
    const loaded = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.version, 1);
      assert.equal(loaded.path, "docs/proposals/focus-roster-v1.md");
      assert.match(loaded.sha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(rosterRoleIds(loaded.roster), ["implementer", "qa"]);
    }

    // 文件名 v2 但 frontmatter version=1 ⇒ 拒绝（防「同版本改内容」）。
    await fs.writeFile(
      path.join(root, "docs", "proposals", "focus-roster-v2.md"),
      ROSTER_TEXT.replace("version: 1", "version: 1"),
      "utf8",
    );
    const mismatch = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.code, "roster-version-invalid");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("D3 卡形状：多选、选项恰为名单角色（无内置/重复/缺项/多项）", () => {
  const ok = validateAppointmentCardAgainstRoster({
    roster: VALID_ROSTER,
    optionIds: ["qa", "implementer"],
    multiple: true,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.recommendedRoleIds, ["implementer", "qa"], "推荐集由应用按名单生成（顺序=名单）");

  const single = validateAppointmentCardAgainstRoster({ roster: VALID_ROSTER, optionIds: ["implementer", "qa"], multiple: false });
  assert.equal(single.ok, false);
  const missing = validateAppointmentCardAgainstRoster({ roster: VALID_ROSTER, optionIds: ["implementer"], multiple: true });
  assert.equal(missing.ok, false);
  const extra = validateAppointmentCardAgainstRoster({ roster: VALID_ROSTER, optionIds: ["implementer", "qa", "extra"], multiple: true });
  assert.equal(extra.ok, false);
  const builtin = validateAppointmentCardAgainstRoster({ roster: VALID_ROSTER, optionIds: ["implementer", "qa", "chief"], multiple: true });
  assert.equal(builtin.ok, false);
});

function preflight(overrides: Partial<DispatchPreflightInput>): DispatchPreflightInput {
  return {
    fromRoleId: "chief",
    targetRoleId: "product",
    targetBuiltIn: true,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
    flowId: "focus",
    intent: { found: true, candidates: 1 },
    proposalFound: true,
    architectureFound: true,
    roster: { ok: true, roster: VALID_ROSTER, path: "docs/proposals/focus-roster-v1.md", version: 1, sha256: "a".repeat(64) },
    d3Selected: [],
    handoffFound: false,
    targetCardFound: true,
    ...overrides,
  };
}

test("派发矩阵 M1–M8：幕僚按序（意图/名单/交付）、运营作用域、拒绝 code 明确", () => {
  // M1 幕僚→策划：缺意图 → 拒；有意图 → 放。
  const noIntent = evaluateDispatchPreflight(preflight({ targetRoleId: "rapporteur", intent: { found: false, candidates: 0 } }));
  assert.equal(noIntent.ok, false);
  if (!noIntent.ok) assert.equal(noIntent.code, "intent-missing");
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "rapporteur" })).ok, true);

  // M2 幕僚→人事：缺方案 → 拒；缺/非法名单 → 拒；齐备 → 放。
  const noProposal = evaluateDispatchPreflight(preflight({ targetRoleId: "nominator", proposalFound: false }));
  assert.equal(noProposal.ok, false);
  if (!noProposal.ok) assert.equal(noProposal.code, "proposal-missing");
  const noRoster = evaluateDispatchPreflight(preflight({ targetRoleId: "nominator", roster: { ok: false, code: "roster-missing", reason: "无" } }));
  assert.equal(noRoster.ok, false);
  if (!noRoster.ok) assert.equal(noRoster.code, "roster-missing");
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "nominator" })).ok, true);

  // M5 幕僚→运营：无 D3 → 拒；D3 选中缺卡 → 拒；齐备 → 放。
  const noD3 = evaluateDispatchPreflight(preflight({ targetRoleId: "convener" }));
  assert.equal(noD3.ok, false);
  if (!noD3.ok) assert.equal(noD3.code, "d3-missing");
  const noCards = evaluateDispatchPreflight(preflight({ targetRoleId: "convener", d3Selected: ["implementer"], targetCardFound: false }));
  assert.equal(noCards.ok, false);
  if (!noCards.ok) assert.equal(noCards.code, "target-card-missing");
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "convener", d3Selected: ["implementer"] })).ok, true);

  // M8 幕僚→项目 worker：一律拒。
  const chiefToWorker = evaluateDispatchPreflight(preflight({ targetRoleId: "implementer", targetBuiltIn: false }));
  assert.equal(chiefToWorker.ok, false);
  if (!chiefToWorker.ok) assert.equal(chiefToWorker.code, "chief-to-project-forbidden");

  // 运营作用域：未接交付 → 拒；名单外 → 拒；名单内缺卡 → 拒；名单内 + 有卡 → 放；质检（有交付）→ 放。
  const convener = (overrides: Partial<DispatchPreflightInput>) =>
    evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, ...overrides }));
  const noHandoff = convener({ handoffFound: false });
  assert.equal(noHandoff.ok, false);
  if (!noHandoff.ok) assert.equal(noHandoff.code, "handoff-missing");
  const notNominated = convener({ handoffFound: true, d3Selected: [] });
  assert.equal(notNominated.ok, false);
  if (!notNominated.ok) assert.equal(notNominated.code, "target-not-nominated");
  const cardMissing = convener({ handoffFound: true, d3Selected: ["implementer"], targetCardFound: false });
  assert.equal(cardMissing.ok, false);
  if (!cardMissing.ok) assert.equal(cardMissing.code, "target-card-missing");
  assert.equal(convener({ handoffFound: true, d3Selected: ["implementer"], targetCardFound: true }).ok, true);
  assert.equal(
    evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "verifier", handoffFound: true })).ok,
    true,
    "运营可在接交付后派质检做验收核对",
  );
  const forbiddenBuiltIn = evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "product", handoffFound: true }));
  assert.equal(forbiddenBuiltIn.ok, false);
  if (!forbiddenBuiltIn.ok) assert.equal(forbiddenBuiltIn.code, "convener-target-forbidden");
});

test("派发矩阵：幕僚可派产品/质检（无链式前置）；自派/未知来源拒绝", () => {
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "product" })).ok, true);
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "verifier" })).ok, true);
  const self = evaluateDispatchPreflight(preflight({ fromRoleId: "chief", targetRoleId: "chief" }));
  assert.equal(self.ok, false);
  if (!self.ok) assert.equal(self.code, "self-dispatch");
  const unknown = evaluateDispatchPreflight(preflight({ fromRoleId: "rapporteur", targetRoleId: "product" }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "unknown-source");
});

test("报告路由（M9）：任务绑定报告按 task.created.from 回创建者；无创建者不猜", () => {
  assert.equal(reportTargetForTaskCreator({ creator: "chief", chiefRoleId: "chief", convenerRoleId: "convener" }), "chief");
  assert.equal(reportTargetForTaskCreator({ creator: "convener", chiefRoleId: "chief", convenerRoleId: "convener" }), "convener");
  assert.equal(reportTargetForTaskCreator({ creator: undefined, chiefRoleId: "chief", convenerRoleId: "convener" }), null);
  assert.equal(reportTargetForTaskCreator({ creator: "convener", chiefRoleId: "chief", convenerRoleId: null }), null);
});

test("链式派发必须带 flowId（Q9）：交付运营/运营派实现或验收缺 flowId ⇒ flow-required", () => {
  const chiefNoFlow = evaluateDispatchPreflight(
    preflight({ targetRoleId: "convener", d3Selected: ["implementer"], flowId: undefined as never }),
  );
  assert.equal(chiefNoFlow.ok, false);
  if (!chiefNoFlow.ok) assert.equal(chiefNoFlow.code, "flow-required");
  const convenerNoFlow = evaluateDispatchPreflight(
    preflight({
      fromRoleId: "convener",
      targetRoleId: "implementer",
      targetBuiltIn: false,
      handoffFound: true,
      d3Selected: ["implementer"],
      flowId: undefined as never,
    }),
  );
  assert.equal(convenerNoFlow.ok, false);
  if (!convenerNoFlow.ok) assert.equal(convenerNoFlow.code, "flow-required");
});
