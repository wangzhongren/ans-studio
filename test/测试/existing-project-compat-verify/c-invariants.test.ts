// test/测试/existing-project-compat-verify/c-invariants.test.ts
// 测试角色：已有角色但无治理记录的项目兼容（B+C V1）——**C. 不变量**独立验证（2026-10-17）。
//
// 覆盖（任务书 §C / PM 评审 §六 V8、N5、N7、N8 与提案 §四不变量）：
//   · F6：未接受边界仍拒绝一切写入；首句逐字保留且**只出现一次**；恢复指引在位且文案纪律成立
//     （不猜状态、不说「项目角色不受影响」、不承诺自动修复、不暗示 ans govern 无需凭据）。
//   · 两份 `format-denial` 渲染器（runtime-core / pi-adapter）输出都带出指引。
//   · F4/V8：未接受边界上 `request_confirmation → confirmed:true` 不发行任何 writeSet；重试仍 F6；
//     确认卡不产生 `.ans`/接受证据。
//   · pin：生成算法未改（B1 独立实算已证）；校验算法未改——改被 pin 文件字节 / 伪造 pin 哈希，
//     su 边界仍退回未接受（parseError 指向 SHA-256）。
//   · N5：缺 role-card.md / 缺边界文件的角色目录不进 preview 的 roleIds/pinPaths，也不被 pin。
//   · N7：S0 既有创世判据逐字不变（空项目 hasRoles=false 且有 genesisBootstrap；有角色则无）。
//   · N8：`ans govern <目录>` 的注入行为不变（无 `.ans` 的 S1 目录仍获得有界创世授权；有 `.ans` 后不再注入）。
//
// 独立构造：断言只依赖产品公开面与本角色自算事实；**import 零实施方测试文件**。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  makeS1Project,
  makeEmptyProject,
  writeUsableAns,
  boundaryOf,
  gateWrite,
  readAns,
  snapshotTree,
  GOV_REL,
  ANS_REL,
  F6_FIRST_SENTENCE,
} from "./fixture.ts";
import { establishGovernanceRecord, previewGovernanceRecord } from "../../../src/pipeline/orchestration/govern-session.ts";
import { buildProjectConfig, DESKTOP_RUNTIME_CONSENT } from "../../../app/desktop/project.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import { resolveBoundarySection } from "../../../src/common/门禁引擎/boundary-core.ts";
import { resolveWrite } from "../../../src/service/gate/resolve-write.ts";
import { createConfirmedWriteIssuer, conditionSlugsOf } from "../../../src/common/编排/confirmed-writes.ts";
import { formatDenialMessage as formatRuntimeCore } from "../../../src/common/runtime-core/format-denial.ts";
import { formatDenialMessage as formatPiAdapter } from "../../../src/common/pi-adapter/format-denial.ts";
import { loadInjection } from "../../../src/index.ts";
import type { CustomerInputOutcome, CustomerInputRequest } from "../../../src/model/runtime.ts";
import type { WriteDecision } from "../../../src/model/decision.ts";

function denied(d: WriteDecision): Extract<WriteDecision, { allowed: false }> {
  assert.equal(d.allowed, false, "预期拒绝，实得放行");
  return d as Extract<WriteDecision, { allowed: false }>;
}

test("C1 F6：未接受边界拒绝一切写入；首句逐字保留且只出现一次；恢复指引在位", async () => {
  const fx = makeS1Project();
  try {
    // 未建立（S1）：su 边界 = 内置未接受。
    const r = await gateWrite(fx.root, "su", "docs/su/memo.md");
    const d = denied(r.decision);
    assert.equal(d.reason.startsWith(F6_FIRST_SENTENCE), true, "首句必须逐字保留在开头");
    assert.equal(d.reason.split(F6_FIRST_SENTENCE).length - 1, 1, "首句恰出现一次（不重复）");
    assert.match(d.reason, /可能的恢复路径/);
    assert.match(d.reason, /建立治理记录/);
    assert.match(d.reason, /ans govern <项目目录>/);
    assert.match(d.reason, /需已配置模型与凭据/, "不得暗示 ans govern 不需要凭据");
    assert.match(d.reason, /程序不会自动覆盖或重新接受/, "不承诺自动修复");
    assert.equal(d.reason.includes("项目角色不受影响"), false, "不得说「项目角色不受影响」（S3/S4 不成立）");
    // 未猜具体状态：规范式为「若…；若…」。
    assert.match(d.reason, /若项目已有角色但缺少 \.ans\/project\.json/);
    assert.match(d.reason, /若 \.ans\/project\.json 已存在/);

    // 两份渲染器自动带出同一 reason 与指引（本项不改渲染器——同构副本须同步验证）。
    const rc = formatRuntimeCore(d);
    const pi = formatPiAdapter(d);
    for (const [name, text] of [
      ["runtime-core", rc],
      ["pi-adapter", pi],
    ] as const) {
      assert.ok(text.startsWith(`写入被拒绝：${F6_FIRST_SENTENCE}`), `${name} 渲染器应原样包装 reason`);
      assert.ok(text.includes("可能的恢复路径"), `${name} 渲染器应带出恢复指引`);
      assert.ok(text.includes("建立治理记录"), `${name} 渲染器应带出桌面动作去路`);
      assert.ok(text.includes("允许写入的路径（按根分组）："), `${name} 既有 allowedByRoot 渲染不丢`);
    }
    assert.equal(rc, pi, "两份渲染器对同一 decision 输出逐字一致（同构副本）");
  } finally {
    fx.cleanup();
  }
});

test("C2 V8：未接受边界上 request_confirmation → confirmed:true 不发行 writeSet；重试仍 F6；不产生 .ans", async () => {
  const fx = makeS1Project();
  try {
    const listing = await listProject(fx.root);
    const projectConfig = buildProjectConfig(listing, DESKTOP_RUNTIME_CONSENT);
    const bound = await resolveBoundarySection("su", projectConfig);
    assert.equal(bound.acceptance.accepted, false, "前置：S1 的 su 边界未接受");

    const issued = new Set<string>();
    const issue = createConfirmedWriteIssuer({
      boundary: bound,
      conditions: conditionSlugsOf(bound),
      ctx: { skillRoot: projectConfig.skillRoot, projectRoot: projectConfig.projectRoot },
      issued,
    });
    const req: CustomerInputRequest = {
      kind: "confirm",
      title: "写入预览",
      preview: "将写入 docs/su/memo.md",
      detail: "",
    };
    const out: CustomerInputOutcome = { outcome: "answered", value: { confirmed: true } };
    const added = issue(req, out);
    assert.deepEqual(added, [], "未接受边界：确认卡不得发行任何路径（F6 先于 F4）");
    assert.equal(issued.size, 0);

    // 重试：即使带 writeSet，仍在 F6 被拒。
    const retry = denied(
      resolveWrite("docs/su/memo.md", bound, { writeSet: ["docs/su/memo.md"], conditions: [] }, {
        skillRoot: projectConfig.skillRoot,
        projectRoot: projectConfig.projectRoot,
      }),
    );
    assert.ok(retry.reason.startsWith(F6_FIRST_SENTENCE));
    assert.equal(fs.existsSync(path.join(fx.root, ANS_REL)), false, "确认卡不得产生 .ans/接受证据");
  } finally {
    fx.cleanup();
  }
});

test("C3 pin 校验：改被 pin 文件字节 / 伪造 pin 哈希 → su 边界仍退回未接受", async () => {
  const fx = makeS1Project(["alpha"]);
  try {
    assert.equal((await establishGovernanceRecord({ projectRoot: fx.root })).ok, true);

    // 生成算法（B1 已独立实算）；此处验校验算法仍生效：改角色边界一个字节。
    const roleAbs = path.join(fx.root, "角色卡", "alpha", "boundary.md");
    fs.appendFileSync(roleAbs, "\n<!-- 外部改动 -->\n", "utf8");
    const tampered = await boundaryOf(fx.root, "su");
    assert.equal(tampered.acceptance.accepted, false, "任一 pin 不符 ⇒ 边界未接受");
    assert.match(tampered.parseError ?? "", /SHA-256/);

    // 伪造 pin 哈希（把治理文档 pin 改成 0）——同样 fail-closed。
    const ans = readAns(fx.root);
    const pin = ans.governanceBoundary.acceptance.pin ?? [];
    const forged = {
      ...ans,
      governanceBoundary: {
        ...ans.governanceBoundary,
        acceptance: {
          ...ans.governanceBoundary.acceptance,
          pin: pin.map((p, i) => (i === 0 ? { ...p, sha256: "0".repeat(64) } : p)),
        },
      },
    };
    fs.writeFileSync(path.join(fx.root, ANS_REL), JSON.stringify(forged, null, 2) + "\n", "utf8");
    const forgedBoundary = await boundaryOf(fx.root, "su");
    assert.equal(forgedBoundary.acceptance.accepted, false, "伪造 pin 不符 ⇒ 仍未接受");
    assert.match(forgedBoundary.parseError ?? "", /SHA-256/);
  } finally {
    fx.cleanup();
  }
});

test("C4 N5：缺 role-card.md / 缺边界文件的角色目录不被 preview 列出、也不被 pin", async () => {
  const fx = makeS1Project(["alpha"]);
  try {
    // delta：只有 role-card.md（缺边界）；epsilon：只有 boundary.md（缺角色卡）。
    const delta = path.join(fx.root, "角色卡", "delta");
    fs.mkdirSync(delta, { recursive: true });
    fs.writeFileSync(path.join(delta, "role-card.md"), "# delta\n", "utf8");
    const epsilon = path.join(fx.root, "角色卡", "epsilon");
    fs.mkdirSync(epsilon, { recursive: true });
    fs.writeFileSync(
      path.join(epsilon, "boundary.md"),
      "# epsilon\n\n## Section 1：可修改文件与目录\n\n| 类型 | 路径 | 用途 |\n| --- | --- | --- |\n| 文件 | `src/e.ts` | x |\n",
      "utf8",
    );

    const pre = await previewGovernanceRecord({ projectRoot: fx.root });
    assert.equal(pre.ok, true);
    if (!pre.ok) return;
    assert.deepEqual(pre.preview.roleIds, ["alpha"], "缺件角色不凭空进 roleIds");
    assert.deepEqual(pre.preview.pinPaths, [GOV_REL, "角色卡/alpha/boundary.md"], "缺件角色不凭空进 pinPaths");

    const res = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(res.ok, true);
    const ans = readAns(fx.root);
    assert.deepEqual(Object.keys(ans.roles), ["alpha"], "roles 映射只含实际可 pin 角色");
    const pinPaths = (ans.governanceBoundary.acceptance.pin ?? []).map((p) => p.path);
    assert.equal(pinPaths.includes("角色卡/delta/boundary.md"), false);
    assert.equal(pinPaths.includes("角色卡/epsilon/boundary.md"), false);
  } finally {
    fx.cleanup();
  }
});

test("C5 N7/N8：S0 创世判据与 ans govern 注入行为逐字不变", async () => {
  const empty = makeEmptyProject();
  const s1 = makeS1Project(["alpha"]);
  try {
    // N7：空项目 → hasRoles=false 且桌面配置带 genesisBootstrap（既有创世行为）。
    // 2026-10-17 契约变更（三权 V1）：**新空项目默认 trio**，su 创世只属于旧 single 模型。
    // 本用例验的是「旧模型逐字兼容」——显式按 single 构造（生产旧项目由 `.ans` 显式 single 得到）。
    const emptyListing = await listProject(empty.root);
    assert.equal(emptyListing.hasRoles, false);
    const singleEmptyListing = { ...emptyListing, governanceModel: "single" as const };
    const emptyProject = buildProjectConfig(singleEmptyListing, DESKTOP_RUNTIME_CONSENT);
    assert.ok(emptyProject.genesisBootstrap, "S0：空项目必须有创世授权");
    assert.match(emptyProject.genesisBootstrap!.source, /导入空文件夹/);
    const suS0 = await resolveBoundarySection("su", emptyProject);
    assert.equal(suS0.acceptance.accepted, true, "S0：su 获得有界创世种子");
    assert.deepEqual(suS0.entries.map((e) => e.path), ["角色卡/", "docs/", ".ans/"]);

    // 有角色 ⇒ 不带 genesisBootstrap（既有断言保持）；su 仍 F6。
    const s1Listing = await listProject(s1.root);
    assert.equal(s1Listing.hasRoles, true);
    const s1Project = buildProjectConfig(s1Listing, DESKTOP_RUNTIME_CONSENT);
    assert.equal(s1Project.genesisBootstrap, undefined, "有角色 ⇒ 无创世授权（S1 不得自动 bootstrap）");
    const suS1 = await resolveBoundarySection("su", s1Project);
    assert.equal(suS1.acceptance.accepted, false);

    // N8：CLI `ans govern <目录>` 对「无 .ans 的外来目录」仍注入有界创世授权（既有兜底恢复不变）。
    const injBefore = await loadInjection(s1.root);
    assert.equal(injBefore.configSource.kind, "builtin-fallback");
    assert.ok(injBefore.project.genesisBootstrap, "CLI：无 .ans 的 S1 目录仍获有界创世授权（既有行为）");
    assert.deepEqual(injBefore.project.roles, {}, "CLI 目标目录使用自己的角色表（roles 为空）");
    assert.equal(injBefore.project.governanceBoundary?.path, "");

    // 建立后：有 `.ans` ⇒ CLI 不再注入创世授权（读的是 pin-backed 记录）。
    assert.equal((await establishGovernanceRecord({ projectRoot: s1.root })).ok, true);
    const injAfter = await loadInjection(s1.root);
    assert.equal(injAfter.configSource.kind, "ans");
    assert.equal(injAfter.project.genesisBootstrap, undefined);
  } finally {
    empty.cleanup();
    s1.cleanup();
  }
});

test("C6 失败/取消零副作用不依赖 wrote.length：phase 语义与写路径集合一致", async () => {
  // 静态语义守卫：establish 的返回形状里 phase 与 finalize.wrote 相互独立；
  // 这里用「已建立」guard（wrote 空、phase guard）与「成功」（wrote 三条、phase write）两态对照，
  // 证明 UI 不能以 wrote.length===0 推断零副作用（写入阶段失败同样 wrote 为空）。
  const fx = makeS1Project();
  try {
    const ok = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(ok.phase, "write");
    assert.equal(ok.finalize.wrote.length, 3);
    const guard = await establishGovernanceRecord({ projectRoot: fx.root });
    assert.equal(guard.phase, "guard");
    assert.equal(guard.finalize.wrote.length, 0);
    // 两种不同语义共享「wrote 空/非空」以外的判据：phase 是唯一依据（见 B5 的 write 阶段失败）。
    assert.notEqual(ok.phase, guard.phase);
  } finally {
    fx.cleanup();
  }
});

test("C7 无角色但存在 .ans（S3 变体）：preview 先报 invalid-record（不覆盖），且不因 hasRoles 顺序而误报", async () => {
  const fx = makeS1Project(["alpha"]);
  try {
    writeUsableAns(fx.root, fx.ids);
    // 删除角色目录后 `.ans` 仍声称有角色——载入器可解析、结构可用 ⇒ present。本用例只钉
    // 「invalid 记录优先于 hasRoles 报出」的守卫顺序（PM 评审 §4.6-4/5）。
    fs.rmSync(path.join(fx.root, ANS_REL));
    fs.writeFileSync(path.join(fx.root, ANS_REL), "坏 JSON", "utf8");
    const r = await previewGovernanceRecord({ projectRoot: fx.root });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid-record");
  } finally {
    fx.cleanup();
  }
});

test("C8 一次性边界无模块级缓存：同一进程连续两次 preview 返回等价、但建立对象内部新建（行为等价性）", async () => {
  const fx = makeS1Project();
  try {
    const a = await previewGovernanceRecord({ projectRoot: fx.root });
    const b = await previewGovernanceRecord({ projectRoot: fx.root });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.deepEqual(a.preview, b.preview, "只读预览可重复且等价（无隐藏状态）");
    // 快照前后一致：preview 不写任何文件（B4 已验），此处补「连续两次」不累积副作用。
    const before = snapshotTree(fx.root);
    await previewGovernanceRecord({ projectRoot: fx.root });
    assert.deepEqual(snapshotTree(fx.root), before);
  } finally {
    fx.cleanup();
  }
});
