// test/桌面UI/governance-view.test.ts
// Phase 4B 纯逻辑：治理动作选择、状态/空态/预览/迁移文案、失败 phase 语义。

import test from "node:test";
import assert from "node:assert/strict";
import {
  changedEntries,
  governanceActionFor,
  governanceCardMetaView,
  governanceEstablishPreviewView,
  governanceFailureView,
  governanceInvalidText,
  governanceMigrationButtonView,
  governanceMigrationFailureView,
  governanceMigrationPreviewView,
  governanceMigrationSuccessText,
  governanceModelOptionText,
  governanceModelStatusText,
  governancePinMismatchEmptyState,
  governancePinMismatchText,
  governanceReacceptFailureView,
  governanceReacceptPreviewView,
  governanceReacceptSuccessText,
  governanceQueueAggregateText,
  governanceMirrorSourceLabel,
  governanceRoleEmptyHint,
  governanceStatusText,
  projectRoleCount,
} from "../../app/renderer/src/chat/governance-view.ts";

test("动作可见谓词：pin-mismatch→reaccept；missing+hasRoles→establish；其余 null", () => {
  assert.equal(governanceActionFor(true, true, "pin-mismatch"), "reaccept");
  assert.equal(governanceActionFor(true, true, "missing"), "establish");
  assert.equal(governanceActionFor(true, false, "missing"), null);
  assert.equal(governanceActionFor(false, true, "pin-mismatch"), null);
  assert.equal(governanceActionFor(true, true, "present"), null);
  assert.equal(governanceActionFor(true, true, "invalid"), null);
});

test("状态行：模型未知不显示；三权 · 五角色；流程四态逐字", () => {
  assert.equal(governanceModelStatusText(null), "");
  assert.equal(governanceModelStatusText("unknown"), "");
  assert.equal(governanceModelStatusText("single"), "治理模型：旧模型（su）");
  assert.equal(governanceModelStatusText("trio"), "治理模型：三权 · 五角色");
  assert.equal(
    governanceStatusText("trio", "flow-1", "awaiting-customer"),
    "治理模型：三权 · 五角色 · 当前流程：flow-1 · 等待客户决定",
  );
  assert.equal(governanceStatusText("trio", "", "mystery"), "治理模型：三权 · 五角色");
  assert.equal(governanceStatusText(null, "", ""), "");
});

test("项目角色计数排除 builtIn；缺失字段按项目角色计", () => {
  assert.equal(
    projectRoleCount([
      { roleId: "liaison", builtIn: true },
      { roleId: "A" },
      { roleId: "B", builtIn: false },
      null,
    ]),
    2,
  );
});

test("pin-mismatch 状态/空态：计数与逐类明细；changed 缺省回退 pinFiles", () => {
  const record = {
    pinCount: 9,
    pinFiles: [{ path: "a.yaml", status: "modified", pinned: "a1b2c3d4", actual: "9f8e7d6c" }],
    changed: [{ path: "b.yaml", status: "missing" }],
  };
  const changed = changedEntries(record);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].status, "missing");
  const text = governancePinMismatchText(9, changed);
  assert.ok(text.includes("共 9 条 pin"));
  assert.ok(text.includes("1 个缺失"));
  assert.ok(text.includes("未确认前，会话不能开启、写入会被拒绝。"));
  const empty = governancePinMismatchEmptyState(9, changed);
  assert.equal(empty.title, "治理记录与盘上边界不一致");
  assert.ok(empty.sub.includes("不会修改任何边界文件内容"));
  assert.equal(empty.hint, "也可在终端核对 git 历史后再处理。");
  assert.equal(governanceInvalidText(""), "治理记录不可用：原因未提供；本版不自动覆盖");
});

test("reaccept 预览：逐文件三态、pin/write/warning 逐字、blocker 与 canConfirm", () => {
  const view = governanceReacceptPreviewView({
    pinCount: 9,
    changed: [
      { path: "x.yaml", status: "modified", pinned: "aaaaaaaa11", actual: "bbbbbbbb22" },
      { path: "y.yaml", status: "missing" },
      { path: "z.yaml", status: "unreadable" },
      { path: "w.yaml", status: "mystery" },
    ],
    blockers: [{ message: "文件缺失，无法继续" }],
    canConfirm: false,
    previewDigest: "a".repeat(64),
  });
  assert.equal(view.fileLines.length, 3);
  assert.equal(
    view.fileLines[0].text,
    "x.yaml — 内容已变更（pin aaaaaaaa… → 现 bbbbbbbb…）",
  );
  assert.equal(view.fileLines[1].text, "y.yaml — 文件缺失（无法重新 pin）");
  assert.equal(view.fileLines[2].text, "z.yaml — 文件不可读（无法重新 pin）");
  assert.equal(view.writeLine, "将写入：.ans/project.json、docs/bootstrap-manifest.md");
  assert.equal(
    view.pinLine,
    "将重算这 9 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。",
  );
  assert.equal(view.canConfirm, false);
  assert.deepEqual(view.blockerLines, ["文件缺失，无法继续"]);
});

test("reaccept 成功/失败：非 write 声明零写入；write 不出现零写入/成功", () => {
  assert.equal(
    governanceReacceptSuccessText(9, 1),
    "已重新接受：更新 1 条 pin（共 9 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。",
  );
  const guard = governanceReacceptFailureView("guard", "preview-stale", "预览已过期");
  assert.ok(guard.lines.includes("本次未写入任何文件。"));
  assert.ok(guard.lines.includes("预览后边界文件又有变化，已取消本次写入；请重新检查。"));
  assert.equal(guard.noRetry, false);
  const write = governanceReacceptFailureView("write", "write-failed", "磁盘写入失败");
  assert.deepEqual(write.lines, ["磁盘写入失败"]);
  assert.ok(!write.lines.join(" ").includes("未写入任何文件"));
  assert.equal(write.noRetry, true);
});

test("establish 预览/失败：模型选择、声明、phase!=write 才可声明零写入", () => {
  assert.equal(governanceModelOptionText("single"), "单模型（single）");
  assert.equal(governanceModelOptionText("trio"), "三权（trio）");
  const view = governanceEstablishPreviewView({
    writePaths: [".ans/project.json"],
    pinPaths: ["a", "b"],
    pinCount: 2,
    roleCount: 3,
    adoptExistingBoundary: true,
    governanceModel: "single",
    suggestedGovernanceModel: "trio",
    canConfirm: true,
  });
  assert.deepEqual(view.writeLines, ["将写入：.ans/project.json"]);
  assert.equal(view.adoptLine, "将采纳既有治理边界文档（不覆盖其内容）。");
  assert.equal(view.declaration, "不扩大任何角色写边界、不修改任何角色边界文件内容。");
  assert.equal(view.suggestion, "trio");
  assert.equal(view.canConfirm, true);
  const fail = governanceFailureView("precheck", "already-established", "已存在");
  assert.deepEqual(fail.lines, ["已存在", "治理记录已存在；本次未写入任何文件。"]);
  assert.equal(fail.noRetry, true);
  const writeFail = governanceFailureView("write", "EACCES", "写入中断");
  assert.deepEqual(writeFail.lines, ["写入中断", "错误码：EACCES"]);
  assert.ok(!writeFail.lines.join(" ").includes("未写入任何文件"));
});

test("迁移：按钮接线/未接线、预览摘要与 canConfirm、失败不假成功", () => {
  const unwired = governanceMigrationButtonView(false);
  assert.equal(unwired.label, "升级入口待本版后续");
  assert.equal(unwired.disabled, true);
  const wired = governanceMigrationButtonView(true);
  assert.equal(wired.label, "查看差异 / 升级");
  assert.equal(wired.disabled, false);
  const preview = governanceMigrationPreviewView({
    model: "single",
    targetModel: "trio",
    writePaths: [".ans/project.json"],
    modelField: null,
    pinChanges: [],
    retainedFiles: ["a"],
    snapshotDigest: "c".repeat(64),
  });
  assert.equal(preview.modelLine, "模型：旧模型（su） → 三权");
  assert.equal(preview.modelFieldLine, '将写入 .ans 字段：（字段缺失，将新增 governanceModel: "trio"）');
  assert.deepEqual(preview.pinLines, ["pin 变更：无（不重算 pin）"]);
  assert.equal(preview.digestLine, "预览摘要（前 8 位）：cccccccc");
  assert.equal(preview.canConfirm, true);
  const bare = governanceMigrationPreviewView({});
  assert.equal(bare.canConfirm, false);
  assert.equal(bare.digestLine, "预览摘要（前 8 位）：（未报告）");
  assert.ok(governanceMigrationSuccessText().includes("旧角色卡/边界/pin/历史会话保留"));
  const writeFail = governanceMigrationFailureView("write", "write-failed", "失败");
  assert.ok(writeFail.lines.includes("写入阶段失败，可能已写入部分文件，请核对现场。"));
  assert.ok(!writeFail.lines.join(" ").includes("已升级"));
});

test("治理卡元信息/镜像来源/聚合文案逐字；未知 cardKind 无徽标", () => {
  const card = governanceCardMetaView({
    cardKind: "proposal",
    flowId: "f1",
    stepId: "s1",
    paths: ["a.md"],
    summary: "摘要",
    artifactSha256: "h",
  });
  assert.equal(card.governance, true);
  assert.equal(card.badge, "治理决定 · 客户最终批准");
  assert.deepEqual(card.lines, ["流程：f1", "步骤：s1", "权力类型：提案", "将写路径：a.md", "摘要：摘要", "哈希：h"]);
  // 2026-10-22 治理拆分：appointment 由客户任命发起，徽标「提名」→「任命」；写卡同步为「任命写卡」。
  const appointment = governanceCardMetaView({ cardKind: "appointment" });
  assert.equal(appointment.power, "任命");
  assert.ok(appointment.lines.includes("权力类型：任命"));
  assert.equal(appointment.badge, "治理决定 · 客户最终批准");
  const appointmentWrite = governanceCardMetaView({ cardKind: "appointment-write" });
  assert.equal(appointmentWrite.power, "任命写卡");
  assert.ok(appointmentWrite.lines.includes("权力类型：任命写卡"));
  assert.equal(governanceCardMetaView({ cardKind: "intent-confirm" }).badge, "需求确认 · 客户");
  assert.equal(governanceCardMetaView({}).badge, "");
  assert.equal(
    governanceMirrorSourceLabel("Draft / 提案"),
    "来自 Draft / 提案 的治理决定 · 客户最终批准",
  );
  assert.equal(governanceMirrorSourceLabel(""), "来自 发起角色 的治理决定 · 客户最终批准");
  assert.equal(governanceQueueAggregateText(2), "还有 2 个决定等待前一个决定");
  assert.equal(governanceQueueAggregateText(0), "");
});

test("2026-10-22 治理拆分：Crew 空态提示改为「客户任命后打开写卡」；其他角色提示不变", () => {
  const crewHint = "客户任命后打开写卡；只按团队计划与任命名单写角色卡与边界，不选择角色、不批准。";
  assert.equal(governanceRoleEmptyHint("nomination"), crewHint);
  assert.ok(!governanceRoleEmptyHint("nomination").includes("提名"));
  assert.equal(
    governanceRoleEmptyHint("schedule"),
    "通常由已接受提案开启流程；只负责排步骤与派发，不批准方案",
  );
  assert.equal(governanceRoleEmptyHint("unknown"), "");
  assert.equal(governanceRoleEmptyHint(undefined), "");
});
