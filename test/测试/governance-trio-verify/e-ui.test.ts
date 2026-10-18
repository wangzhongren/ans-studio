// test/测试/governance-trio-verify/e-ui.test.ts
// 独立端到端验收（测试角色，2026-10-17）：桌面 UI（三权左树/副标题/空态/状态行/旧模型提示/
// 迁移按钮与预览确认）与 Interface 契约。
//
// 手段：① `ui-labels.js` 纯函数行为断言；② renderer 源码结构钉（分组顺序/数据驱动/不硬编码）；
// ③ 假 IPC（`createDesktopInterface` 注入 listProject/预览/迁移实现）验证界面契约。不启动 Electron。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDesktopInterface } from "../../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { loadEffectiveConfig } from "../../../src/common/shared/config-loader.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import type {
  GovernanceMigrationPreviewResult,
  GovernanceMigrationResult,
  GovernancePreview,
  GovernancePreviewResult,
} from "../../../src/pipeline/orchestration/govern-session.ts";
import { makeRoot } from "./fixture.ts";

// 装载渲染纯函数（与 index.html 同序：ui-labels 先于 renderer）。
await import(new URL("../../../app/renderer/ui-labels.js", import.meta.url).href);
const Labels = (globalThis as unknown as {
  ANSUiLabels: Record<string, (...args: never[]) => unknown> & {
    governanceRoleView: (fn: unknown) => { function: string; cn: string; en: string; name: string; power: string; builtinNote: string; emptyHint: string; primaryEntrance: boolean } | null;
    governanceRoleEmptyState: (fn: unknown) => { kind: string; title: string; sub: string } | null;
    governanceStatusText: (model: unknown, flowId: unknown, status: unknown) => string;
    governanceMigrationButtonView: (wired: unknown) => { label: string; disabled: boolean; title: string };
    governanceMigrationPreviewView: (preview: unknown) => {
      title: string;
      modelLine: string;
      writeLines: string[];
      modelFieldLine: string;
      manifestLine: string;
      pinLines: string[];
      retainedLines: string[];
      digestLine: string;
      warning: string;
      canConfirm: boolean;
      digest: string;
    };
    governanceMigrationFailureView: (phase: unknown, status: unknown, message: unknown) => { lines: string[]; noRetry: boolean };
    governanceMigrationSuccessText: () => string;
    GOVERNANCE_MIGRATION_TEXT: string;
    GOVERNANCE_DECISION_BADGE: string;
    GOVERNANCE_QUEUE_NOTE: string;
    GOVERNANCE_GROUP_LABEL: string;
  };
}).ANSUiLabels;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const renderer = fs.readFileSync(path.join(REPO, "app/renderer/renderer.js"), "utf8");

// —————————————————————— 1) 权力副标题 / 空态 ——————————————————————

test("UI：四角色副标题——联络官客户沟通 / 报告员提案权 / 提名官提名权 / 召集人编排权，且都写明「不拥有最终批准权」", () => {
  const expected = [
    ["liaison", "联络官", "Liaison", "客户沟通"],
    ["proposal", "报告员", "Rapporteur", "提案权"],
    ["nomination", "提名官", "Nominator", "提名权"],
    ["schedule", "召集人", "Convener", "编排权"],
  ] as const;
  for (const [fn, cn, en, power] of expected) {
    const v = Labels.governanceRoleView(fn);
    assert.ok(v, `${fn} 应有视图`);
    assert.equal(v!.cn, cn);
    assert.equal(v!.en, en);
    assert.equal(v!.name, `${cn} ${en}`);
    assert.match(v!.power, new RegExp(power), `副标题应含 ${power}`);
    assert.match(v!.power, /不拥有最终批准权/, "副标题必须声明不拥有最终批准权");
    assert.match(v!.builtinNote, /内置角色：随应用发布，无角色目录/);
  }
  assert.equal(
    Labels.governanceRoleView("liaison")!.primaryEntrance,
    true,
    "Liaison 是客户默认入口（primaryEntrance）",
  );
  assert.match(
    Labels.governanceRoleView("liaison")!.emptyHint,
    /客户默认入口/,
    "Liaison 空态说明客户默认入口",
  );
  assert.match(
    Labels.governanceRoleView("proposal")!.emptyHint,
    /联络官/,
    "Rapporteur 空态说明通常由联络官交接打开（2026-10-18 起不再是空串）",
  );
  assert.equal(Labels.governanceRoleView(undefined), null, "未知/缺失 function ⇒ null（不当成治理角色）");
  assert.equal(Labels.governanceRoleView("other"), null);
});

test("UI：Liaison/Rapporteur/Nominator/Convener 专属空态逐字；未知 function ⇒ null", () => {
  const l = Labels.governanceRoleEmptyState("liaison");
  const r = Labels.governanceRoleEmptyState("proposal");
  const n = Labels.governanceRoleEmptyState("nomination");
  const c = Labels.governanceRoleEmptyState("schedule");
  assert.ok(l && r && n && c);
  assert.equal(l!.title, "联络官 Liaison");
  assert.equal(
    l!.sub,
    "客户默认入口：你说要做什么，我先确认目标、范围与验收，再交给报告员形成提案。我不写提案、不批准。本版起默认入口为联络官；报告员与历史提案不变。",
  );
  assert.equal(r!.title, "报告员 Rapporteur");
  assert.equal(r!.sub, "通常由联络官交接打开；客户也可以直接找我。我只写提案，不批准。");
  assert.equal(n!.title, "提名官 Nominator");
  assert.equal(n!.sub, "通常由流程单提名步骤打开；仅在客户明确要求时直接使用");
  assert.equal(c!.title, "召集人 Convener");
  assert.equal(c!.sub, "通常由已接受提案开启流程；只负责排步骤与派发，不批准方案");
  assert.equal(Labels.governanceRoleEmptyState(undefined), null);
});

// —————————————————————— 2) 状态行 / 旧模型提示 ——————————————————————

test("UI：状态行——治理模型（三权 · 四角色/旧模型）· 当前流程 · 四态；接口未给模型不猜", () => {
  assert.equal(
    Labels.governanceStatusText("trio", "flow-a", "awaiting-customer"),
    "治理模型：三权 · 四角色 · 当前流程：flow-a · 等待客户决定",
  );
  assert.equal(Labels.governanceStatusText("single", "", ""), "治理模型：旧模型（su）");
  assert.equal(
    Labels.governanceStatusText("trio", "flow-a", "in-progress"),
    "治理模型：三权 · 四角色 · 当前流程：flow-a · 进行中",
  );
  assert.equal(Labels.governanceStatusText("trio", "", "blocked"), "治理模型：三权 · 四角色 · 阻塞");
  assert.equal(
    Labels.governanceStatusText("trio", "", "escalated-to-customer"),
    "治理模型：三权 · 四角色 · 已升级客户",
  );
  assert.equal(Labels.governanceStatusText(undefined, "flow-a", "awaiting-customer"), "当前流程：flow-a · 等待客户决定", "未知模型不显示、不猜");
  assert.equal(Labels.governanceStatusText("trio", "", "made-up"), "治理模型：三权 · 四角色", "未知状态不显示、不猜");
  assert.equal(Labels.GOVERNANCE_MIGRATION_TEXT, "本项目使用旧治理模型（su）。可升级为三权模型。");
  assert.equal(Labels.GOVERNANCE_DECISION_BADGE, "治理决定 · 客户最终批准");
  assert.equal(Labels.GOVERNANCE_QUEUE_NOTE, "等待前一个决定");
});

test("UI：迁移按钮——桥齐备启用「查看差异 / 升级」；未接线禁用「升级入口待本版后续」", () => {
  const wired = Labels.governanceMigrationButtonView(true);
  assert.equal(wired.label, "查看差异 / 升级");
  assert.equal(wired.disabled, false);
  assert.match(wired.title, /零写入/);
  const pending = Labels.governanceMigrationButtonView(false);
  assert.equal(pending.label, "升级入口待本版后续");
  assert.equal(pending.disabled, true);
  assert.match(pending.title, /不可用/);
  // 只有 true 才启用（不接受 truthy）。
  assert.equal(Labels.governanceMigrationButtonView("true").disabled, true);
});

// —————————————————————— 3) 迁移预览 / 成功 / 失败 ——————————————————————

test("UI：迁移预览视图——模型/写路径/modelField/manifestLine/pinChanges/保留文件/摘要前 8 位；无摘要不发行", () => {
  const preview = {
    model: "single",
    targetModel: "trio",
    writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"],
    modelField: null,
    manifestLine: "治理模型升级（su → trio）",
    pinChanges: [],
    retainedFiles: ["角色卡/governance-boundary.yaml", "docs/su/memo.md"],
    snapshotDigest: "0123456789abcdef".repeat(4),
  };
  const v = Labels.governanceMigrationPreviewView(preview);
  assert.equal(v.title, "升级为三权治理模型（预览）");
  assert.equal(v.modelLine, "模型：旧模型（su） → 三权");
  assert.deepEqual(v.writeLines, ["将写入：.ans/project.json", "将写入：docs/bootstrap-manifest.md"]);
  assert.equal(v.modelFieldLine, '将写入 .ans 字段：（字段缺失，将新增 governanceModel: "trio"）');
  assert.equal(v.manifestLine, "将追加 manifest 记录：治理模型升级（su → trio）");
  assert.deepEqual(v.pinLines, ["pin 变更：无（不重算 pin）"]);
  assert.deepEqual(v.retainedLines, ["保留文件：角色卡/governance-boundary.yaml、docs/su/memo.md"]);
  assert.equal(v.digestLine, "预览摘要（前 8 位）：01234567");
  assert.match(v.warning, /预览零写入/);
  assert.equal(v.canConfirm, true, "有摘要 ⇒ 可确认");
  assert.equal(v.digest, preview.snapshotDigest);

  const empty = Labels.governanceMigrationPreviewView({});
  assert.equal(empty.canConfirm, false, "无摘要 ⇒ 不得确认（fail-closed）");
  assert.deepEqual(empty.writeLines, ["将写入：（未报告）"]);
  assert.equal(empty.digestLine, "预览摘要（前 8 位）：（未报告）");
});

test("UI：迁移成功/失败视图——write 阶段失败绝不说「已升级/未写入」；already-trio/no-record 不提供重试", () => {
  assert.match(Labels.governanceMigrationSuccessText(), /已升级为三权治理模型/);
  assert.match(Labels.governanceMigrationSuccessText(), /旧角色卡\/边界\/pin\/历史会话保留/);
  const wf = Labels.governanceMigrationFailureView("write", "write-failed", "写入中断：x");
  assert.ok(wf.lines.includes("写入中断：x"));
  assert.ok(wf.lines.includes("写入阶段失败，可能已写入部分文件，请核对现场。"));
  assert.equal(wf.lines.some((l) => /已升级/.test(l)), false, "write 阶段失败不得说已升级");
  assert.equal(wf.lines.some((l) => /未写入任何文件/.test(l)), false, "write 阶段失败不得断言零写入");
  assert.equal(wf.noRetry, true);
  const at = Labels.governanceMigrationFailureView("guard", "already-trio", "");
  assert.ok(at.lines.includes("已是三权治理模型，无需升级；本次未写入任何文件。"));
  assert.equal(at.noRetry, true);
  const nr = Labels.governanceMigrationFailureView("guard", "no-record", "");
  assert.ok(nr.lines.includes("没有治理记录（.ans/project.json）；本次未写入任何文件。"));
  assert.equal(nr.noRetry, true);
  const stale = Labels.governanceMigrationFailureView("guard", "preview-stale", "");
  assert.ok(stale.lines.some((l) => /预览后 \.ans 又有变化/.test(l)));
  assert.equal(stale.noRetry, false);
});

// —————————————————————— 4) renderer 源码结构钉（三组/副标题/空态/状态行/迁移） ——————————————————————

test("UI：左树三组顺序＝主入口 → 治理职能（内置）→ 其他角色；治理行由 governanceFunction 派生（不硬编码 id）", () => {
  const start = renderer.indexOf("function renderRoleTree(");
  const end = renderer.indexOf("function selectedRole(");
  assert.ok(start >= 0 && end > start, "renderRoleTree 存在");
  const tree = renderer.slice(start, end);
  const primary = tree.indexOf('treeGroupLabel("主入口")');
  const gov = tree.indexOf("treeGroupLabel(UiLabels.GOVERNANCE_GROUP_LABEL)");
  const others = tree.indexOf('treeGroupLabel("其他角色（查看/调试）")');
  assert.ok(primary >= 0 && gov > primary && others > gov, "三组顺序固定");
  assert.ok(tree.includes("state.primaryRoleId"), "主入口来自 primaryRoleId");
  assert.ok(tree.includes("UiLabels.governanceRoleView(r.governanceFunction)"), "治理分组由 governanceFunction 派生");
  const code = renderer.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const id of ["liaison", "rapporteur", "nominator", "convener"]) {
    assert.equal(code.includes(id), false, `renderer 代码不得硬编码治理角色 id：${id}`);
  }
  assert.ok(renderer.includes("function roleSubtitle(role)"));
  assert.ok(renderer.includes("var gov = UiLabels.governanceRoleView(role && role.governanceFunction);"), "副标题经 governanceRoleView");
  assert.ok(renderer.includes("UiLabels.governanceRoleEmptyState(role.governanceFunction)"), "专属空态经纯函数");
  assert.ok(renderer.includes("UiLabels.governanceStatusText("), "状态行经纯函数");
  assert.ok(renderer.includes("UiLabels.GOVERNANCE_MIGRATION_TEXT"), "旧模型提示条文案来自 ui-labels");
});

test("UI：迁移入口——按桥能力探测、按钮 data 属性、点击只开预览、确认按钮才调 migrate（传 snapshotDigest）", () => {
  assert.ok(renderer.includes('typeof d.previewGovernanceMigration === "function"'), "预览桥能力探测");
  assert.ok(renderer.includes('typeof d.migrateGovernanceModel === "function"'), "写入桥能力探测");
  assert.ok(renderer.includes("data-governance-migrate' + (view.disabled ? \" disabled\" : \"\")"), "按钮显隐/禁用按 view");
  assert.ok(renderer.includes("if (btn.getAttribute(\"data-governance-migrate\") !== null) openGovernanceMigrationPreview();"), "点击只打开预览");
  assert.ok(renderer.includes("else if (t.closest(\"[data-governance-migrate-confirm]\")) confirmGovernanceMigration();"), "确认走独立按钮");
  assert.ok(renderer.includes("res = await d.migrateGovernanceModel(projectRoot, preview.snapshotDigest);"), "确认后传预览摘要");
  assert.ok(renderer.includes("UiLabels.governanceMigrationPreviewView("), "预览视图经纯函数");
  assert.ok(renderer.includes("UiLabels.governanceMigrationFailureView("), "失败视图经纯函数");
  assert.ok(renderer.includes("UiLabels.governanceMigrationSuccessText()"), "成功文案经纯函数");
  assert.ok(renderer.includes("GOVERNANCE_QUEUE_NOTE") || renderer.includes("等待前一个决定"), "排队卡提示「等待前一个决定」");
});

// —————————————————————— 5) 假 IPC：Interface 列表与 S1/迁移契约 ——————————————————————

const EMPTY_BOUNDARY = { entries: [], boundarySource: "<built-in:trio/>", acceptance: { accepted: false, source: "" } };

function fakeTrioListing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: "liaison" | "proposal" | "nomination" | "schedule") => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: `# ${roleId}`,
    boundary: { ...EMPTY_BOUNDARY, boundarySource: `<built-in:trio/${roleId}>` },
    builtIn: true,
    governanceFunction: fn,
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("liaison", "liaison"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "# A",
        boundary: { ...EMPTY_BOUNDARY, boundarySource: "角色卡/A/boundary.yaml" },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "liaison",
    governanceModel: "trio",
  };
}

function servicePreview(): GovernancePreview {
  return {
    projectRoot: "/p",
    governanceBoundaryRel: "角色卡/governance-boundary.yaml",
    writePaths: [".ans/project.json", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"],
    pinPaths: ["角色卡/governance-boundary.yaml"],
    roleIds: ["A"],
    adoptExistingGovernanceDoc: false,
    acceptanceSource: "desktop-app:test",
    governanceModel: "trio",
    legacyBoundaryRoleIds: [],
  };
}

test("假 IPC：listProject 透传 governanceModel / role.governanceFunction / primaryRoleId（原样，不猜）", async () => {
  const { root, cleanup } = makeRoot("ui-ipc-list");
  try {
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => fakeTrioListing(root),
      buildProjectConfigFn: buildProjectConfig,
      loadEffectiveConfig,
    });
    const res = await iface.listProject({ projectRoot: root });
    assert.equal(res.governanceModel, "trio");
    assert.equal(res.primaryRoleId, "liaison");
    assert.deepEqual(
      res.roles.filter((r) => r.builtIn).map((r) => `${r.roleId}:${r.governanceFunction}`),
      ["liaison:liaison", "rapporteur:proposal", "nominator:nomination", "convener:schedule"],
    );
    assert.equal(res.governanceRecord.state, "missing", "无 `.ans` ⇒ missing（不是 present）");
  } finally {
    cleanup();
  }
});

test("假 IPC：S1 预览/建立透传治理模型；非法模型 invalid-request；迁移预览/写入守卫与透传", async () => {
  const { root, cleanup } = makeRoot("ui-ipc-s1");
  try {
    const previews: unknown[] = [];
    const establishes: unknown[] = [];
    const migrations: unknown[] = [];
    const migrationWrites: unknown[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => fakeTrioListing(root),
      buildProjectConfigFn: buildProjectConfig,
      loadEffectiveConfig,
      previewGovernanceRecordFn: async (input) => {
        previews.push(input);
        return { ok: true, preview: { ...servicePreview(), governanceModel: input.governanceModel ?? "single" } };
      },
      establishGovernanceRecordFn: async (input) => {
        establishes.push(input);
        return {
          ok: true,
          phase: "write",
          status: "completed",
          message: "ok",
          finalize: { ok: true, status: "completed", message: "ok", wrote: [], pins: [], roles: [] },
        } as never;
      },
      previewGovernanceMigrationFn: async (input): Promise<GovernanceMigrationPreviewResult> => {
        migrations.push(input);
        return {
          ok: true,
          preview: {
            model: "single",
            targetModel: "trio",
            writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"],
            modelField: null,
            manifestLine: "治理模型升级（su → trio）",
            pinChanges: [],
            retainedFiles: [],
            snapshotDigest: "a".repeat(64),
          },
        };
      },
      migrateGovernanceModelFn: async (input): Promise<GovernanceMigrationResult> => {
        migrationWrites.push(input);
        return { ok: true, phase: "write", status: "completed", model: "trio", message: "完成" };
      },
    });
    await iface.listProject({ projectRoot: root });

    const p = await iface.previewGovernanceRecord({ projectRoot: root, governanceModel: "trio" });
    assert.equal(p.ok, true);
    assert.deepEqual(previews, [{ projectRoot: root, governanceModel: "trio" }], "显式 trio 原样透传");
    const pDefault = await iface.previewGovernanceRecord({ projectRoot: root });
    assert.equal(pDefault.ok, true);
    assert.deepEqual(previews[1], { projectRoot: root }, "缺省不传模型（旧行为逐字不变）");
    const pBad = await iface.previewGovernanceRecord({ projectRoot: root, governanceModel: "quad" as never });
    assert.equal(pBad.ok, false);
    if (!pBad.ok) assert.equal(pBad.code, "invalid-request");
    assert.equal(previews.length, 2, "非法模型不得进入机制");

    const est = await iface.establishGovernanceRecord({ projectRoot: root, confirm: true, governanceModel: "trio" });
    assert.equal(est.ok, true);
    assert.deepEqual(establishes, [{ projectRoot: root, governanceModel: "trio" }], "建立透传模型；confirm 由 Interface 消费");
    const estBad = await iface.establishGovernanceRecord({ projectRoot: root, governanceModel: "trio" } as never);
    assert.equal(estBad.ok, false, "缺 confirm ⇒ guard 拒绝");
    assert.equal(establishes.length, 1);

    const mp = await iface.previewGovernanceMigration({ projectRoot: root });
    assert.equal(mp.ok, true);
    assert.deepEqual(migrations, [{ projectRoot: root }]);
    const mw = await iface.migrateGovernanceModel({ projectRoot: root, confirm: true, previewDigest: "b".repeat(64) });
    assert.equal(mw.status, "completed");
    assert.deepEqual(migrationWrites, [{ projectRoot: root, confirm: true, previewDigest: "b".repeat(64) }]);
    const staleDigest = await iface.migrateGovernanceModel({ projectRoot: root, confirm: true, previewDigest: "not-hex" });
    assert.equal(staleDigest.status, "invalid-request");
    assert.equal(migrationWrites.length, 1, "非法摘要不得进入机制");
  } finally {
    cleanup();
  }
});
