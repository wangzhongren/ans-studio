// test/测试/existing-project-compat-verify/b-establish.test.ts
// 测试角色：已有角色但无治理记录的项目兼容（B+C V1）——**B. 建立**独立验证（2026-10-17）。
//
// 覆盖（任务书 §B / PM 评审 §六 V2/V3/V4/V5/V6/V6b/V7、N1/N2/N5/N6）：
//   · 成功：三产物落盘；`.ans` 可解析、governanceBoundary.path 非空、accepted===true；pin 覆盖治理文档
//     与全部可 pin 角色边界（**逐条独立实算 SHA-256**）；manifest 与实算一致；finalize.status=completed。
//   · su 解卡（确定性）：真实 `resolveBoundarySection` + `resolveWrite` —— docs/su/memo.md allowed，
//     src/** 仍拒。
//   · V4：建立前后项目角色写各自边界内路径仍 allowed、边界外仍拒。
//   · V5：预览/取消不写（目录树 + mtime 一致；渲染侧取消不调 IPC 的源码级守卫）。
//   · V6：guard 拒绝零写入；precheck 层（finalizeBootstrap 直调，无可 pin / 门禁拒）零写入。
//   · V6b：写入阶段注入错误（`docs` 为文件）→ phase==="write"、ok===false、message 明确可能部分写入；
//     文案层**绝不**出现「未写入任何文件」。
//   · V7：`.ans` 有效后 preview/establish 拒绝且零写入；动作可见谓词对 present 为 false。
//   · 并发：同项目两次 establish → 恰一次 ok、一次 busy，不得双写。
//   · 一次性边界不持久化：重复建立复用重新求值（删 `.ans` 改边界后新 pin 反映当刻字节）；
//     `.ans` 无「创世种子」标记。
//
// 独立构造：断言只依赖产品公开面与本角色自算事实；**import 零实施方测试文件**。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  makeS1Project,
  makeEmptyProject,
  makeDesktop,
  writeUsableAns,
  snapshotTree,
  readAns,
  sha256OfFile,
  boundaryOf,
  gateWrite,
  GOV_REL,
  ANS_REL,
  MANIFEST_REL,
} from "./fixture.ts";
import {
  previewGovernanceRecord,
  establishGovernanceRecord,
  GOVERNANCE_RECORD_ACCEPTANCE_SOURCE,
} from "../../../src/pipeline/orchestration/govern-session.ts";
import { finalizeBootstrap } from "../../../src/common/编排/finalize.ts";
import {
  buildGovernanceSeedBoundary as buildSeedFromService,
} from "../../../src/service/boundary/resolve-boundary.ts";
import type { BoundarySection1 } from "../../../src/model/boundary.ts";
import { governanceActionFor, governanceFailureView } from "../../../app/renderer/src/chat/governance-view.ts";
import { translate } from "../../../src/common/shared/i18n/index.ts";

/** 5B：旧 ui-labels.js 已删除；映射到新渲染器 governance-view 纯逻辑。 */
async function loadUiLabels(): Promise<Record<string, Function>> {
  return {
    canEstablishGovernance: (hasProject: boolean, hasRoles: boolean, state: string) =>
      governanceActionFor(hasProject, hasRoles, state) === "establish",
    governanceFailureView,
  };
}

function roleRel(root: string, id: string): string {
  const name = fs.existsSync(path.join(root, "角色卡", id, "boundary.yaml")) ? "boundary.yaml" : "boundary.md";
  return `角色卡/${id}/${name}`;
}

test("B1 V2：成功建立——三产物、.ans 结构与 pin 逐条独立复算、manifest 一致、completed", async () => {
  const fx = makeS1Project();
  try {
    const pre = await previewGovernanceRecord({ projectRoot: fx.root });
    assert.equal(pre.ok, true, "建立前预览应成功（建立时仍重新求值）");

    const res = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(res.ok, true, JSON.stringify(res.finalize));
    assert.equal(res.phase, "write");
    assert.equal(res.finalize.status, "completed");
    assert.deepEqual(res.finalize.wrote, [GOV_REL, ANS_REL, MANIFEST_REL]);
    for (const rel of [GOV_REL, ANS_REL, MANIFEST_REL]) {
      assert.equal(fs.existsSync(path.join(fx.root, rel)), true, `${rel} 应落盘`);
    }

    const ans = readAns(fx.root);
    assert.equal(ans.governanceBoundary.path, GOV_REL, "governanceBoundary.path 非空");
    assert.equal(ans.governanceBoundary.acceptance.accepted, true);
    assert.equal(
      ans.governanceBoundary.acceptance.source,
      GOVERNANCE_RECORD_ACCEPTANCE_SOURCE,
      "acceptance.source 如实记操作者动作（逐字）",
    );
    const pins = ans.governanceBoundary.acceptance.pin ?? [];
    const expectedPaths = [GOV_REL, ...fx.ids.map((id) => roleRel(fx.root, id))];
    assert.deepEqual(pins.map((p) => p.path), expectedPaths, "pin 覆盖治理文档 + 全部可 pin 角色边界");
    for (const pin of pins) {
      assert.equal(
        pin.sha256,
        sha256OfFile(path.join(fx.root, pin.path)),
        `pin 哈希须与当刻字节独立实算一致：${pin.path}`,
      );
    }
    assert.deepEqual(Object.keys(ans.roles).sort(), [...fx.ids].sort(), "roles 映射恰为可 pin 角色");

    const manifest = fs.readFileSync(path.join(fx.root, MANIFEST_REL), "utf8");
    for (const pin of pins) {
      assert.ok(manifest.includes(`| ${pin.path} | ${pin.sha256} |`), `manifest 须列出实算 pin：${pin.path}`);
    }
    assert.ok(manifest.includes(`角色（${fx.ids.length}）`), "manifest 角色数如实");

    // 一次性边界不持久化：`.ans` 中无「创世种子」标记 / genesis 字段。
    const raw = fs.readFileSync(path.join(fx.root, ANS_REL), "utf8");
    assert.equal("genesisBootstrap" in ans, false, ".ans 不得携带 genesisBootstrap");
    assert.equal(/genesis/i.test(raw), false, ".ans 不得含 genesis 标记");
    assert.equal(raw.includes("创世种子"), false, ".ans 不得含「创世种子」标记");

    // 桌面状态派生：建立后 present（动作隐藏）。
    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    assert.equal(listing.governanceRecord.state, "present");
  } finally {
    fx.cleanup();
  }
});

test("B2 V3（确定性）：真实 resolveBoundarySection + resolveWrite——su 写 docs/su/memo.md allowed，src/** 仍拒", async () => {
  const fx = makeS1Project();
  try {
    const res = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(res.ok, true);

    const suBoundary = await boundaryOf(fx.root, "su");
    assert.equal(suBoundary.acceptance.accepted, true, "su 边界必须已接受");
    assert.equal(suBoundary.acceptance.source, GOVERNANCE_RECORD_ACCEPTANCE_SOURCE);
    assert.equal(suBoundary.entries.length, 3, "治理边界 = 三个普通目录（角色卡/、docs/、.ans/）");

    const memo = await gateWrite(fx.root, "su", "docs/su/memo.md");
    assert.equal(memo.decision.allowed, true, "su 写 docs/su/memo.md 应 allowed");
    const code = await gateWrite(fx.root, "su", "src/alpha.ts");
    assert.equal(code.decision.allowed, false, "su 不得获得代码写权（仍拒）");
  } finally {
    fx.cleanup();
  }
});

test("B3 V4：建立前后项目角色写各自边界内 allowed、边界外仍拒（角色不受影响）", async () => {
  const fx = makeS1Project(["alpha", "beta"]);
  try {
    const before: Record<string, { inAllowed: boolean; outAllowed: boolean }> = {};
    for (const id of fx.ids) {
      const inD = await gateWrite(fx.root, id, `src/${id}.ts`);
      const outId = id === "alpha" ? "beta" : "alpha";
      const outD = await gateWrite(fx.root, id, `src/${outId}.ts`);
      before[id] = { inAllowed: inD.decision.allowed, outAllowed: outD.decision.allowed };
      assert.equal(inD.decision.allowed, true, `建立前 ${id} 写自身边界应 allowed`);
      assert.equal(outD.decision.allowed, false, `建立前 ${id} 写他人边界应拒`);
    }

    const res = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(res.ok, true);

    for (const id of fx.ids) {
      const inD = await gateWrite(fx.root, id, `src/${id}.ts`);
      const outId = id === "alpha" ? "beta" : "alpha";
      const outD = await gateWrite(fx.root, id, `src/${outId}.ts`);
      assert.equal(inD.decision.allowed, before[id].inAllowed, `建立后 ${id} 自身边界判定不变`);
      assert.equal(outD.decision.allowed, before[id].outAllowed, `建立后 ${id} 越界判定不变`);
      assert.equal(inD.decision.allowed, true);
      assert.equal(outD.decision.allowed, false);
    }
  } finally {
    fx.cleanup();
  }
});

test("B4 V5：预览零写入；取消不调 IPC（渲染源码级守卫）；present 时动作不可见", async () => {
  const fx = makeS1Project();
  try {
    const before = snapshotTree(fx.root);
    const pre = await previewGovernanceRecord({ projectRoot: fx.root });
    assert.equal(pre.ok, true);
    assert.deepEqual(snapshotTree(fx.root), before, "预览前后目录树与 mtime 一致");

    const UL = await loadUiLabels();
    // 动作可见谓词唯一入口：仅 hasRoles && state==="missing"。
    assert.equal(UL.canEstablishGovernance(true, true, "missing"), true);
    assert.equal(UL.canEstablishGovernance(true, true, "present"), false);
    assert.equal(UL.canEstablishGovernance(true, true, "invalid"), false);
    assert.equal(UL.canEstablishGovernance(true, false, "missing"), false);
    assert.equal(UL.canEstablishGovernance(false, true, "missing"), false);

    // 取消：新渲染器只经 governance-store cancel（不直接调 IPC）。
    // B1（2026-10-23 i18n）：提示文案已从源码中文字面量迁到共享目录 key
    // `ui.governanceStore.cancelled`；源码守卫改为匹配 **keyed translate 调用**（不是自由文本），
    // 旧中文由共享目录 zh-CN 逐字断言保留，守卫强度不降。
    const panel = fs.readFileSync(new URL("../../../app/renderer/src/shell/GovernancePanel.tsx", import.meta.url), "utf8");
    assert.match(panel, /cancelPreview/);
    const store = fs.readFileSync(new URL("../../../app/renderer/src/stores/governance-store.ts", import.meta.url), "utf8");
    assert.match(
      store,
      /cancel:\s*\(\)\s*=>\s*\{[\s\S]{0,400}?translate\(\s*currentLocale\(\s*\)\s*,\s*"ui\.governanceStore\.cancelled"\s*\)/,
      "cancel 路径须经 keyed translate 取词（ui.governanceStore.cancelled）",
    );
    assert.equal(
      store.includes("已取消，未写入任何文件"),
      false,
      "governance-store 不再内嵌旧中文字面量（文案单一来源＝共享目录）",
    );
    assert.equal(
      translate("zh-CN", "ui.governanceStore.cancelled"),
      "已取消，未写入任何文件。",
      "共享目录 zh-CN 仍为迁移前文案（逐字）",
    );
    assert.equal(/cancel:[\s\S]{0,200}?bridge\./.test(store), false, "cancel 不直接调用 IPC");
  } finally {
    fx.cleanup();
  }
});

test("B5 V6b：写入阶段失败（docs 为文件）→ phase=write、ok=false、message 明确可能部分写入；文案不宣称零副作用", async () => {
  const fx = makeS1Project();
  try {
    // 注入写入错误：manifest 的父目录 `docs` 是不可用文件的路径（先让治理文档与 .ans 写出，再中断）。
    fs.writeFileSync(path.join(fx.root, "docs"), "not a directory", "utf8");
    const res = await establishGovernanceRecord({ projectRoot: fx.root });

    assert.equal(res.ok, false);
    assert.equal(res.phase, "write", "写入阶段失败必须 phase=write（不能用 wrote.length 推断）");
    assert.equal(res.finalize.status, "blocked");
    const msg = res.finalize.message ?? "";
    assert.ok(msg.length > 0, "写入阶段失败必须有明确 message");
    assert.match(msg, /写入中断/);
    assert.match(msg, /可能已写入部分文件/);
    // 编排 reverify 修正：不再承诺「重新执行」，改为「请核对现场」＋不自动覆盖既有 .ans。
    assert.match(msg, /治理边界文档\/\.ans\/manifest 不保证齐全/);
    assert.match(msg, /请核对现场/);
    assert.match(msg, /不会自动覆盖已存在的 \.ans/);
    assert.equal(msg.includes("重新执行"), false, "写入阶段失败不得承诺重新执行（.ans 可能已存在）");
    assert.equal(msg.includes("未写入任何文件"), false, "写入阶段失败不得宣称未写入任何文件");
    // 部分写入确有其事：治理文档与 .ans 已落盘（manifest 未写）。
    assert.equal(fs.existsSync(path.join(fx.root, GOV_REL)), true, "治理文档可能已落盘");
    assert.equal(fs.existsSync(path.join(fx.root, ANS_REL)), true, ".ans 可能已落盘");
    assert.equal(fs.existsSync(path.join(fx.root, MANIFEST_REL)), false, "manifest 未写");

    // 文案层：phase==="write" 绝不追加「未写入任何文件」；非 write 阶段才允许。
    const UL = await loadUiLabels();
    const writeView = UL.governanceFailureView("write", "", msg) as { lines: string[]; noRetry: boolean };
    assert.equal(writeView.lines.join("\n").includes("未写入任何文件"), false);
    assert.equal(writeView.noRetry, false, "写入阶段失败可重试");
    const guardView = UL.governanceFailureView("guard", "", "门禁拒绝") as { lines: string[]; noRetry: boolean };
    assert.equal(guardView.lines.join("\n").includes("未写入任何文件"), true);
    const establishedView = UL.governanceFailureView("guard", "already-established", "已存在") as {
      lines: string[];
      noRetry: boolean;
    };
    assert.equal(establishedView.noRetry, true, "already-established 不提供重试");
  } finally {
    fx.cleanup();
  }
});

test("B6 V6：guard 拒绝零写入（已建立 / 无效记录 / 无角色 / 桌面守卫）", async () => {
  const valid = makeS1Project();
  const invalid = makeS1Project();
  const empty = makeEmptyProject();
  try {
    writeUsableAns(valid.root, valid.ids);
    fs.mkdirSync(path.join(invalid.root, ".ans"), { recursive: true });
    fs.writeFileSync(path.join(invalid.root, ANS_REL), "{bad json", "utf8");

    const vb = snapshotTree(valid.root);
    const vr = await establishGovernanceRecord({ projectRoot: valid.root });
    assert.equal(vr.ok, false);
    assert.equal(vr.phase, "guard");
    assert.equal(vr.code, "already-established");
    assert.equal(vr.finalize.status, "not-genesis");
    assert.deepEqual(snapshotTree(valid.root), vb, "已建立：零写入");

    const ib = snapshotTree(invalid.root);
    const ir = await establishGovernanceRecord({ projectRoot: invalid.root });
    assert.equal(ir.ok, false);
    assert.equal(ir.phase, "guard");
    assert.equal(ir.code, "invalid-record");
    assert.deepEqual(snapshotTree(invalid.root), ib, "无效记录：零写入（不覆盖）");

    const eb = snapshotTree(empty.root);
    const er = await establishGovernanceRecord({ projectRoot: empty.root });
    assert.equal(er.ok, false);
    assert.equal(er.phase, "guard");
    assert.equal(er.code, "no-roles");
    assert.deepEqual(snapshotTree(empty.root), eb, "无角色：零写入");

    // 桌面 API 守卫：非当前导入项目 / 缺 confirm —— 不进入机制、零写入。
    const other = makeS1Project(["other"]);
    try {
      const { iface } = makeDesktop(valid.root);
      await iface.listProject({ projectRoot: valid.root });
      const ob = snapshotTree(other.root);
      const notImported = await iface.establishGovernanceRecord({ projectRoot: other.root, confirm: true });
      assert.equal(notImported.phase, "guard");
      assert.equal(notImported.code, "invalid-request");
      assert.deepEqual(snapshotTree(other.root), ob);

      const noConfirm = await iface.establishGovernanceRecord({
        projectRoot: valid.root,
        // 故意不满足 confirm:true（模拟绕过 preload 的调用）。
        confirm: false as unknown as true,
      });
      assert.equal(noConfirm.phase, "guard");
      assert.equal(noConfirm.code, "invalid-request");
    } finally {
      other.cleanup();
    }
  } finally {
    valid.cleanup();
    invalid.cleanup();
    empty.cleanup();
  }
});

test("B6b V6（precheck 层）：finalizeBootstrap 无可 pin / 门禁拒 → 零写入（机制内部无条件构造，故经 direct 验证）", async () => {
  const empty = makeEmptyProject();
  try {
    const seed = buildSeedFromService("test:独立验证 precheck");
    const before = snapshotTree(empty.root);
    const r = await finalizeBootstrap({
      projectRoot: empty.root,
      skillRoot: empty.root,
      boundary: seed,
      writeGovernanceBoundaryDoc: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, "nothing-to-pin", "N6：无可 pin 之物 → nothing-to-pin");
    assert.deepEqual(snapshotTree(empty.root), before, "nothing-to-pin 零写入");

    // 门禁拒（边界缺 docs/）：manifest 写入被拒 → blocked，零写入。
    const partial: BoundarySection1 = {
      entries: [
        { root: "project", path: "角色卡/", kind: "directory", purpose: "角色" },
        { root: "project", path: ".ans/", kind: "directory", purpose: "配置" },
      ],
      boundarySource: "test:缺 docs",
      acceptance: { accepted: true, source: "test:独立验证 precheck" },
    };
    const fx = makeS1Project(["alpha"]);
    try {
      const b = snapshotTree(fx.root);
      const r2 = await finalizeBootstrap({
        projectRoot: fx.root,
        skillRoot: fx.root,
        boundary: partial,
        writeGovernanceBoundaryDoc: true,
      });
      assert.equal(r2.ok, false);
      assert.equal(r2.status, "blocked");
      assert.deepEqual(snapshotTree(fx.root), b, "precheck 门禁拒：零写入（全有或全无）");
    } finally {
      fx.cleanup();
    }
  } finally {
    empty.cleanup();
  }
});

test("B7 V7：.ans 有效后 preview/establish 拒绝且零写入；动作隐藏", async () => {
  const fx = makeS1Project();
  try {
    assert.equal((await establishGovernanceRecord({ projectRoot: fx.root })).ok, true);
    const ansMtime = fs.statSync(path.join(fx.root, ANS_REL)).mtimeMs;
    const before = snapshotTree(fx.root);

    const pre = await previewGovernanceRecord({ projectRoot: fx.root });
    assert.equal(pre.ok, false);
    if (!pre.ok) assert.equal(pre.code, "already-established");
    const est = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(est.ok, false);
    assert.equal(est.phase, "guard");
    assert.equal(est.code, "already-established");
    assert.deepEqual(snapshotTree(fx.root), before, "幂等：零写入");
    assert.equal(fs.statSync(path.join(fx.root, ANS_REL)).mtimeMs, ansMtime, ".ans mtime 不变");

    const UL = await loadUiLabels();
    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    assert.equal(UL.canEstablishGovernance(true, listing.hasRoles, listing.governanceRecord.state), false);
  } finally {
    fx.cleanup();
  }
});

test("B8 并发：同项目两次 establish → 恰一次 ok、一次 busy；不双写", async () => {
  const fx = makeS1Project();
  try {
    const [a, b] = await Promise.all([
      establishGovernanceRecord({ projectRoot: fx.root }),
      establishGovernanceRecord({ projectRoot: fx.root }),
    ]);
    const okCount = [a, b].filter((r) => r.ok === true).length;
    const busyCount = [a, b].filter((r) => r.ok === false && r.phase === "guard" && r.code === "busy").length;
    assert.equal(okCount, 1, "并发建立恰一次成功");
    assert.equal(busyCount, 1, "并发建立恰一次 busy（进程内互斥）");

    const ans = readAns(fx.root);
    const pins = ans.governanceBoundary.acceptance.pin ?? [];
    assert.equal(pins.length, 1 + fx.ids.length, "产物恰一份（pin 集完整且无叠加）");
    for (const pin of pins) assert.equal(pin.sha256, sha256OfFile(path.join(fx.root, pin.path)));
  } finally {
    fx.cleanup();
  }
});

test("B9 一次性边界不持久化：删 .ans 后重新建立复用重新求值（采纳既有治理文档 + 新 pin 反映当刻字节）", async () => {
  const fx = makeS1Project(["alpha"]);
  try {
    assert.equal((await establishGovernanceRecord({ projectRoot: fx.root })).ok, true);
    // 改角色边界（外部变更）并删 `.ans` —— 模拟「写入中断后重新执行」路径。
    fs.writeFileSync(
      path.join(fx.root, "角色卡", "alpha", "boundary.md"),
      [
        "# 角色 alpha 边界",
        "",
        "## Section 1：可修改文件与目录",
        "",
        "| 类型 | 路径 | 用途 |",
        "| --- | --- | --- |",
        "| 文件 | `src/alpha.ts` | 角色代码（改后） |",
        "| 文件 | `src/alpha-extra.ts` | 新增条目 |",
        "",
      ].join("\n"),
      "utf8",
    );
    fs.rmSync(path.join(fx.root, ANS_REL));

    const pre = await previewGovernanceRecord({ projectRoot: fx.root });
    assert.equal(pre.ok, true);
    if (!pre.ok) return;
    assert.equal(pre.preview.adoptExistingGovernanceDoc, true, "既有治理文档被采纳（不覆盖）");
    assert.deepEqual(pre.preview.writePaths, [ANS_REL, MANIFEST_REL], "采纳时不再写治理文档");

    const res = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(res.ok, true);
    const ans = readAns(fx.root);
    const pins = ans.governanceBoundary.acceptance.pin ?? [];
    const alphaPin = pins.find((p) => p.path === "角色卡/alpha/boundary.md");
    assert.ok(alphaPin, "角色边界仍被 pin");
    assert.equal(
      alphaPin!.sha256,
      sha256OfFile(path.join(fx.root, "角色卡/alpha/boundary.md")),
      "重新建立重新求值（不复用上次对象/快照）",
    );
    // 治理文档内容保持既有（未被覆盖）：仍含三目录。
    assert.match(fs.readFileSync(path.join(fx.root, GOV_REL), "utf8"), /角色卡\//);
  } finally {
    fx.cleanup();
  }
});

test("B11 建立重新求值：不信任预览快照——预览后改动角色边界，pin 反映建立当刻字节；预览 pin 列表＝建立 pin 列表", async () => {
  const fx = makeS1Project(["alpha"]);
  try {
    const pre = await previewGovernanceRecord({ projectRoot: fx.root });
    assert.equal(pre.ok, true);
    if (!pre.ok) return;

    // 预览之后、建立之前改动角色边界（同进程内即时生效）。
    const roleAbs = path.join(fx.root, "角色卡", "alpha", "boundary.md");
    fs.writeFileSync(
      roleAbs,
      [
        "# 角色 alpha 边界",
        "",
        "## Section 1：可修改文件与目录",
        "",
        "| 类型 | 路径 | 用途 |",
        "| --- | --- | --- |",
        "| 文件 | `src/alpha.ts` | 预览后改动 |",
        "",
      ].join("\n"),
      "utf8",
    );

    const res = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(res.ok, true);
    const ans = readAns(fx.root);
    const pins = ans.governanceBoundary.acceptance.pin ?? [];
    const alphaPin = pins.find((p) => p.path === "角色卡/alpha/boundary.md");
    assert.ok(alphaPin);
    assert.equal(
      alphaPin!.sha256,
      sha256OfFile(roleAbs),
      "建立时重新求值：pin 必须是建立当刻字节，而不是预览时快照",
    );
    assert.deepEqual(pins.map((p) => p.path), pre.preview.pinPaths, "目标集合与预览一致（路径不漂移）");
  } finally {
    fx.cleanup();
  }
});

test("B12 V6b 复审：写入阶段失败后新文案不再承诺「重新执行」；.ans 已落盘时重试确为 already-established（如实登记，不判缺陷）", async () => {
  const fx = makeS1Project();
  try {
    fs.writeFileSync(path.join(fx.root, "docs"), "blocked", "utf8");
    const first = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(first.phase, "write");
    assert.equal(fs.existsSync(path.join(fx.root, ANS_REL)), true, "部分写入：.ans 已落盘");
    const msg = first.finalize.message ?? "";
    assert.equal(msg.includes("重新执行"), false, "编排 reverify 后不再承诺重新执行");
    assert.match(msg, /请核对现场/);
    assert.match(msg, /不会自动覆盖已存在的 \.ans/);

    const retry = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(retry.phase, "guard");
    assert.equal(retry.code, "already-established", "重新执行被已存在记录拦截（与不自动覆盖文案一致）");
  } finally {
    fx.cleanup();
  }
});

test("B10 A1 公共出口：Service 导出的种子边界与门禁引擎私有实现**同一函数引用**（三目录、有界）", async () => {
  // 同一函数引用（不是复制实现）：跨角色只经 Service 公开出口。
  const { buildGovernanceSeedBoundaryForGate } = await import(
    "../../../src/common/门禁引擎/governance-seed.ts"
  );
  assert.equal(buildSeedFromService, buildGovernanceSeedBoundaryForGate, "Service 再导出必须是同一函数引用");

  const a = buildSeedFromService("test:source-a");
  assert.deepEqual(
    a.entries.map((e) => e.path),
    ["角色卡/", "docs/", ".ans/"],
    "种子条目恰为三处治理产物（有界；不含 src/**）",
  );
  assert.equal(a.acceptance.accepted, true);
  assert.equal(a.acceptance.source, "test:source-a", "来源原样进入 acceptance（F6 证据）");
});
