// test/测试/governance-pin-recovery-verify/pin-recovery-e2e.test.ts
// 测试角色：治理记录 pin 不符「重新接受」端到端独立验证（2026-10-17）。
//
// 任务书：`角色卡/项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md`
// §5.5 / §六 / §八 / §九；产品提案 §三/§四/§七。
//
// 覆盖（场景 a–i；AC1–AC12 映射见验证报告）：
//   a. 全部一致 → `inspectPinnedBoundaries` ok；`listProject` present；无动作；预览 not-needed。
//   b. 修改 1 个边界 → mismatch（1 条 modified）；预览 ok/canConfirm/changed；**预览前后零变化**。
//   c. 确认写入 → completed；仅 `.ans` 与 manifest 变化；pin 路径/顺序/条数不变；roles/source 不变；
//      manifest 追加一条含时间/变更数/路径/完整旧新哈希的记录。
//   d. 写入后 → present；`resolveRole("su")` accepted/parseError 空；确定性桩会话可开启。
//   e. 删除 1 个被 pin 文件 → 预览 canConfirm:false + missing blocker；写入 missing-file/precheck、零写入。
//   f. 预览后再改文件 → preview-stale/precheck、零写入。
//   g. 预览后取消 → 零写入；状态仍 pin-mismatch。
//   h. `.ans` 缺失 → missing 且不允许重新接受；不可解析 → invalid。
//   i. 坏 YAML / 空 Section 1 → unparseable-boundary、零写入。
//
// 「零写入」一律用**完整目录树快照（含文件内容哈希与 mtime）前后 deepEqual**，不只看返回码。
// 不依赖桌面进程、不调用真实模型、不读取 `.env`。

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  makePinnedProject,
  makeDesktop,
  effectiveOf,
  settledAdapter,
  loadUiLabels,
  snapshotTree,
  changedFiles,
  sha256OfFile,
  modifyBoundary,
  writeBoundaryRaw,
  deleteBoundary,
  readAns,
  readManifest,
  GOV_REL,
  ANS_REL,
  MANIFEST_REL,
  ACCEPTANCE_SOURCE,
} from "./fixture.ts";

import { inspectPinnedBoundaries } from "../../../src/service/boundary/resolve-boundary.ts";
import {
  openGovernanceSession,
  previewGovernanceReacceptance,
  reacceptGovernancePins,
} from "../../../src/pipeline/orchestration/govern-session.ts";
import { resolveRole } from "../../../src/service/role/resolve-role.ts";

const BETA_REL = "角色卡/beta/boundary.yaml";
const GAMMA_REL = "角色卡/gamma/boundary.yaml";
const ALPHA_REL = "角色卡/alpha/boundary.yaml";

function pinOf(pins: { path: string; sha256: string }[], rel: string): string {
  const found = pins.find((p) => p.path === rel);
  assert.ok(found, `缺少 pin：${rel}`);
  return found.sha256;
}

// —————————————————————— a. 全部一致 ——————————————————————

test("a 全部一致：inspect ok / listProject present / 无动作 / 预览 not-needed；零写入", async () => {
  const fx = makePinnedProject();
  try {
    const before = snapshotTree(fx.root);

    const evidence = await inspectPinnedBoundaries({
      projectRoot: fx.root,
      pins: fx.pins,
      requiredPath: GOV_REL,
    });
    assert.equal(evidence.state, "ok");
    assert.deepEqual(evidence.files, []);
    assert.equal(evidence.checked, fx.pins.length);

    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    assert.equal(listing.governanceRecord.state, "present");
    assert.equal(listing.governanceRecord.pinFiles, undefined);

    const ui = await loadUiLabels();
    assert.equal(
      ui.governanceActionFor(true, listing.hasRoles, listing.governanceRecord.state),
      null,
      "present 不显示任何动作",
    );

    const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
    assert.equal(preview.ok, false);
    if (!preview.ok) assert.equal(preview.status, "not-needed");

    assert.deepEqual(snapshotTree(fx.root), before, "检测/列举/预览零写入");
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— b. 修改 1 个边界 ——————————————————————

test("b 修改 1 个边界：mismatch 明细 1 条 modified；预览 ok/canConfirm/changed；预览前后零变化", async () => {
  const fx = makePinnedProject();
  try {
    modifyBoundary(fx.root, "beta", "b");
    const actual = sha256OfFile(path.join(fx.root, BETA_REL));
    const oldPin = pinOf(fx.pins, BETA_REL);
    assert.notEqual(actual, oldPin, "夹具前提：修改后哈希必须变化");

    const evidence = await inspectPinnedBoundaries({
      projectRoot: fx.root,
      pins: fx.pins,
      requiredPath: GOV_REL,
    });
    assert.equal(evidence.state, "mismatch");
    assert.equal(evidence.files.length, 1, "恰好 1 条不一致");
    assert.equal(evidence.files[0].path, BETA_REL);
    assert.equal(evidence.files[0].status, "modified");
    assert.equal(evidence.files[0].pinned, oldPin);
    assert.equal(evidence.files[0].actual, actual);
    assert.notEqual(evidence.files[0].pinned, evidence.files[0].actual);

    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    assert.equal(listing.governanceRecord.state, "pin-mismatch");
    assert.equal(listing.governanceRecord.pinCount, fx.pins.length);
    assert.equal(listing.governanceRecord.pinFiles?.length, 1);
    assert.equal(listing.governanceRecord.pinFiles?.[0].status, "modified");

    const beforePreview = snapshotTree(fx.root);
    const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
    const afterPreview = snapshotTree(fx.root);

    assert.deepEqual(afterPreview, beforePreview, "预览只读：全部文件哈希/mtime/目录树不变");
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const p = preview.preview;
    assert.equal(p.canConfirm, true);
    assert.equal(p.pinCount, fx.pins.length);
    assert.deepEqual(
      p.pinPaths,
      fx.pins.map((x) => x.path),
      "预览 pin 路径与顺序必须与记录一致",
    );
    assert.deepEqual(p.writePaths, [ANS_REL, MANIFEST_REL], "只写两个路径（固定顺序）");
    assert.equal(p.changed.length, 1);
    assert.equal(p.changed[0].path, BETA_REL);
    assert.equal(p.changed[0].status, "modified");
    assert.equal(p.changed[0].pinned, oldPin);
    assert.equal(p.changed[0].actual, actual);
    assert.match(p.previewDigest, /^[0-9a-f]{64}$/);
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— c. 确认写入 ——————————————————————

test("c 确认写入：completed；仅 .ans 与 manifest 变化；pin 路径/顺序/条数/roles/source 不变；留痕完整", async () => {
  const fx = makePinnedProject();
  try {
    modifyBoundary(fx.root, "beta", "c");
    const newBetaHash = sha256OfFile(path.join(fx.root, BETA_REL));
    const ansBefore = readAns(fx.root);
    const manifestBefore = readManifest(fx.root);
    const pinsBefore = ansBefore.governanceBoundary.acceptance.pin ?? [];

    const { iface } = makeDesktop(fx.root);
    await iface.listProject({ projectRoot: fx.root });
    const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const previewDigest = preview.preview.previewDigest;

    const beforeWrite = snapshotTree(fx.root);
    const result = await iface.reacceptGovernancePins({
      projectRoot: fx.root,
      confirm: true,
      previewDigest,
    });
    const afterWrite = snapshotTree(fx.root);

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.phase, "write");
    assert.deepEqual(result.wrote, [ANS_REL, MANIFEST_REL]);

    // 「仅两个文件变化」：按内容哈希比较全部文件（边界文件内容必须不变）。
    assert.deepEqual(
      changedFiles(beforeWrite, afterWrite),
      [ANS_REL, MANIFEST_REL].sort(),
      "除 .ans/project.json 与 docs/bootstrap-manifest.md 外不得有文件变化/新增/删除",
    );

    const ansAfter = readAns(fx.root);
    const pinsAfter = ansAfter.governanceBoundary.acceptance.pin ?? [];
    assert.equal(pinsAfter.length, pinsBefore.length, "pin 条数不变");
    assert.deepEqual(
      pinsAfter.map((p) => p.path),
      pinsBefore.map((p) => p.path),
      "pin 路径与顺序不变",
    );
    for (let i = 0; i < pinsAfter.length; i++) {
      if (pinsAfter[i].path === BETA_REL) {
        assert.equal(pinsAfter[i].sha256, newBetaHash, "被修改项写回当刻实际哈希");
      } else {
        assert.equal(pinsAfter[i].sha256, pinsBefore[i].sha256, `未修改项保持原 pin：${pinsAfter[i].path}`);
      }
    }
    assert.deepEqual(ansAfter.roles, ansBefore.roles, "roles 映射不变");
    assert.equal(
      ansAfter.governanceBoundary.acceptance.source,
      ansBefore.governanceBoundary.acceptance.source,
      "acceptance.source 保持最初授权来源",
    );
    assert.equal(ansAfter.governanceBoundary.acceptance.source, ACCEPTANCE_SOURCE);
    assert.equal(ansAfter.governanceBoundary.acceptance.accepted, true);
    assert.deepEqual(ansAfter.fixtureNote, ansBefore.fixtureNote, "未知字段原样保留（只替换 pin）");
    assert.equal(ansAfter.governanceBoundary.path, GOV_REL);

    // manifest：既有内容逐字节保留 + 追加一条完整记录。
    const manifestAfter = readManifest(fx.root);
    assert.ok(manifestAfter.startsWith(manifestBefore), "既有 manifest 逐字节保留");
    assert.match(
      manifestAfter,
      /- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z：操作者在桌面应用确认重新接受；变更 1 个边界文件（本次刷新 4 条 pin）/,
      "记录含时间、变更数、pin 条数",
    );
    const oldBetaHash = pinOf(fx.pins, BETA_REL);
    assert.ok(
      manifestAfter.includes(`${BETA_REL}（旧 pin ${oldBetaHash} → 新 pin ${newBetaHash}）`),
      "记录含路径与完整旧/新哈希",
    );
    assert.equal(
      manifestAfter.split("## 重新接受记录（治理记录 pin 刷新）").length - 1,
      1,
      "一次写入只追加一条重新接受记录",
    );
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— d. 写入后重新加载 ——————————————————————

test("d 写入后重新加载：present；su accepted 且 parseError 空；确定性桩会话入口不再因 pin 抛错", async () => {
  const fx = makePinnedProject();
  try {
    modifyBoundary(fx.root, "gamma", "d");
    const { iface } = makeDesktop(fx.root);
    await iface.listProject({ projectRoot: fx.root });
    const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const result = await iface.reacceptGovernancePins({
      projectRoot: fx.root,
      confirm: true,
      previewDigest: preview.preview.previewDigest,
    });
    assert.equal(result.status, "completed");

    const listing = await iface.listProject({ projectRoot: fx.root });
    assert.equal(listing.governanceRecord.state, "present", "接受后同一检测路径返回 present");

    const { project } = await effectiveOf(fx.root);
    const su = await resolveRole("su", project);
    assert.equal(su.boundary.acceptance.accepted, true);
    assert.equal(su.boundary.parseError ?? "", "", "su 边界不再带 pin 失配的 parseError");

    // 确定性桩会话入口（无真实模型）：只验证「不因 pin 抛错」，不发送任何轮次。
    const handle = await openGovernanceSession(
      {
        taskId: "T-PIN-RECOVERY-E2E",
        runtime: "demo",
        persistSession: false,
        autoRepin: false,
        project,
      },
      { createAdapter: () => settledAdapter() },
    );
    try {
      assert.equal(handle.governanceRoleId, "su");
      assert.equal(handle.acceptance.accepted, true);
    } finally {
      await handle.dispose();
    }
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— e. 删除被 pin 文件 ——————————————————————

test("e 删除 1 个被 pin 文件：预览 canConfirm:false + missing blocker；写入 missing-file/precheck、零写入", async () => {
  const fx = makePinnedProject();
  try {
    deleteBoundary(fx.root, "alpha");
    const { iface } = makeDesktop(fx.root);
    await iface.listProject({ projectRoot: fx.root });

    const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
    assert.equal(preview.ok, true, "有明细可展示：缺失不吞掉预览");
    if (!preview.ok) return;
    assert.equal(preview.preview.canConfirm, false);
    const missing = preview.preview.changed.find((c) => c.path === ALPHA_REL);
    assert.ok(missing, "明细含缺失项");
    assert.equal(missing?.status, "missing");
    assert.equal(missing?.actual, null);
    assert.ok(
      preview.preview.blockers.some((b) => b.code === "missing-file" && b.paths.includes(ALPHA_REL)),
      "blockers 点名缺失文件",
    );

    const before = snapshotTree(fx.root);
    const result = await iface.reacceptGovernancePins({
      projectRoot: fx.root,
      confirm: true,
      previewDigest: preview.preview.previewDigest,
    });
    assert.deepEqual(snapshotTree(fx.root), before, "missing 阻断：零写入（含哈希/mtime）");
    assert.equal(result.ok, false);
    assert.equal(result.status, "missing-file");
    assert.equal(result.phase, "precheck");
    assert.deepEqual(result.wrote, []);
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— e2. AC3：2 修改 + 1 删除 ——————————————————————

test("e2 AC3：2 个修改 + 1 个删除 → changed 3 条（2 modified + 1 missing）、canConfirm:false；写入 missing-file/precheck 零写入", async () => {
  const fx = makePinnedProject();
  try {
    modifyBoundary(fx.root, "beta", "e2-beta");
    modifyBoundary(fx.root, "gamma", "e2-gamma");
    deleteBoundary(fx.root, "alpha");
    const { iface } = makeDesktop(fx.root);
    await iface.listProject({ projectRoot: fx.root });

    const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.preview.canConfirm, false);
    assert.equal(preview.preview.changed.length, 3);
    assert.equal(preview.preview.changed.filter((c) => c.status === "modified").length, 2);
    assert.equal(preview.preview.changed.filter((c) => c.status === "missing").length, 1);
    assert.ok(
      preview.preview.blockers.some((b) => b.code === "missing-file" && b.paths.includes(ALPHA_REL)),
    );

    const before = snapshotTree(fx.root);
    const result = await iface.reacceptGovernancePins({
      projectRoot: fx.root,
      confirm: true,
      previewDigest: preview.preview.previewDigest,
    });
    assert.deepEqual(snapshotTree(fx.root), before, "缺失优先阻断：零写入");
    assert.equal(result.status, "missing-file");
    assert.equal(result.phase, "precheck");
    assert.deepEqual(result.wrote, []);
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— f. 预览后再次变化 ——————————————————————

test("f 预览后再次修改文件：preview-stale / precheck、零写入", async () => {
  const fx = makePinnedProject();
  try {
    modifyBoundary(fx.root, "beta", "f1");
    const { iface } = makeDesktop(fx.root);
    await iface.listProject({ projectRoot: fx.root });
    const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;

    // 预览之后、确认之前再改另一个 pin 目标。
    modifyBoundary(fx.root, "gamma", "f2");
    const before = snapshotTree(fx.root);
    const result = await iface.reacceptGovernancePins({
      projectRoot: fx.root,
      confirm: true,
      previewDigest: preview.preview.previewDigest,
    });
    assert.deepEqual(snapshotTree(fx.root), before, "preview-stale：零写入");
    assert.equal(result.ok, false);
    assert.equal(result.status, "preview-stale");
    assert.equal(result.phase, "precheck");
    assert.deepEqual(result.wrote, []);
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— g. 取消 ——————————————————————

test("g 预览后取消（不调用写入口）：零写入；状态仍 pin-mismatch", async () => {
  const fx = makePinnedProject();
  try {
    modifyBoundary(fx.root, "alpha", "g");
    const { iface } = makeDesktop(fx.root);
    const listingBefore = await iface.listProject({ projectRoot: fx.root });
    assert.equal(listingBefore.governanceRecord.state, "pin-mismatch");

    const before = snapshotTree(fx.root);
    const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
    assert.equal(preview.ok, true);
    // 取消 = 不调用 reacceptGovernancePins（也不调用任何 IPC）。
    assert.deepEqual(snapshotTree(fx.root), before, "取消零写入");

    const listingAfter = await iface.listProject({ projectRoot: fx.root });
    assert.equal(listingAfter.governanceRecord.state, "pin-mismatch", "取消后状态不变");
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— h. .ans 缺失 / 不可解析 ——————————————————————

test("h .ans 缺失 → missing 且预览 no-record；.ans 不可解析 → invalid + invalid-record；均零写入", async () => {
  const missing = makePinnedProject({ withAns: false });
  const broken = makePinnedProject({ ansRaw: "{ this is not json " });
  try {
    const ui = await loadUiLabels();

    const { iface: missingIface } = makeDesktop(missing.root);
    const missingBefore = snapshotTree(missing.root);
    const missingListing = await missingIface.listProject({ projectRoot: missing.root });
    assert.equal(missingListing.governanceRecord.state, "missing");
    assert.equal(
      ui.governanceActionFor(true, missingListing.hasRoles, missingListing.governanceRecord.state),
      "establish",
      "缺失只出现「建立治理记录」",
    );
    const missingPreview = await missingIface.previewGovernanceReacceptance({ projectRoot: missing.root });
    assert.equal(missingPreview.ok, false);
    if (!missingPreview.ok) assert.equal(missingPreview.status, "no-record");
    assert.deepEqual(snapshotTree(missing.root), missingBefore, ".ans 缺失：零写入");

    const { iface: brokenIface } = makeDesktop(broken.root);
    const brokenBefore = snapshotTree(broken.root);
    const brokenListing = await brokenIface.listProject({ projectRoot: broken.root });
    assert.equal(brokenListing.governanceRecord.state, "invalid");
    assert.ok((brokenListing.governanceRecord.reason ?? "").length > 0, "invalid 必须给出原因");
    assert.equal(
      ui.governanceActionFor(true, brokenListing.hasRoles, brokenListing.governanceRecord.state),
      null,
      "不可解析不出现重新接受动作",
    );
    const brokenPreview = await brokenIface.previewGovernanceReacceptance({ projectRoot: broken.root });
    assert.equal(brokenPreview.ok, false);
    if (!brokenPreview.ok) assert.equal(brokenPreview.status, "invalid-record");
    assert.deepEqual(snapshotTree(broken.root), brokenBefore, ".ans 不可解析：零写入");
  } finally {
    missing.cleanup();
    broken.cleanup();
  }
});

// —————————————————————— i. 坏 YAML / 空 Section 1 ——————————————————————

test("i 坏 YAML / 空 Section 1 → unparseable-boundary、canConfirm:false、写入零副作用", async () => {
  const cases: { label: string; raw: string }[] = [
    { label: "坏 YAML", raw: 'role: [未闭合\nentries: "\n' },
    { label: "空 Section 1", raw: "role: beta\nentries: []\n" },
  ];
  for (const item of cases) {
    const fx = makePinnedProject();
    try {
      writeBoundaryRaw(fx.root, "beta", item.raw);
      const { iface } = makeDesktop(fx.root);
      await iface.listProject({ projectRoot: fx.root });

      const preview = await iface.previewGovernanceReacceptance({ projectRoot: fx.root });
      assert.equal(preview.ok, true, `${item.label}：有明细可展示`);
      if (!preview.ok) continue;
      assert.equal(preview.preview.canConfirm, false, `${item.label}：确认按钮必须禁用`);
      const blocker = preview.preview.blockers.find((b) => b.code === "unparseable-boundary");
      assert.ok(blocker, `${item.label}：blockers 含 unparseable-boundary`);
      assert.ok(blocker?.paths.includes(BETA_REL), `${item.label}：blockers 点名文件`);

      const before = snapshotTree(fx.root);
      const result = await iface.reacceptGovernancePins({
        projectRoot: fx.root,
        confirm: true,
        previewDigest: preview.preview.previewDigest,
      });
      assert.deepEqual(snapshotTree(fx.root), before, `${item.label}：零写入`);
      assert.equal(result.ok, false, item.label);
      assert.equal(result.status, "unparseable-boundary", item.label);
      assert.equal(result.phase, "precheck", item.label);
      assert.deepEqual(result.wrote, [], item.label);
    } finally {
      fx.cleanup();
    }
  }
});

// —————————————————————— 补充：公共出口契约 ——————————————————————

test("公共出口：Pipeline 再导出与 Service 入口可调用（不依赖桌面进程）", async () => {
  const fx = makePinnedProject();
  try {
    modifyBoundary(fx.root, "beta", "exports");
    const preview = await previewGovernanceReacceptance({ projectRoot: fx.root, skillRoot: fx.root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const before = snapshotTree(fx.root);
    const result = await reacceptGovernancePins({
      projectRoot: fx.root,
      skillRoot: fx.root,
      confirm: true,
      previewDigest: preview.preview.previewDigest,
    });
    assert.equal(result.status, "completed");
    assert.deepEqual(changedFiles(before, snapshotTree(fx.root)), [ANS_REL, MANIFEST_REL].sort());
  } finally {
    fx.cleanup();
  }
});
