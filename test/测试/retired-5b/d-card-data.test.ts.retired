// test/测试/su-shell-approval-verify/d-card-data.test.ts
// 测试角色：su 命令审批策略——**确认卡数据面与渲染契约**独立验证（2026-10-17）。
//
// 覆盖 PM 评审 §3.2/§3.6：
//   · 档位解析：只认行首 `su-审批档[tier]`；项目角色文案恒 null；后缀 /risky/ 不得抢先；
//   · 卡片数据：tier/policy、command 原文、cwd、reasonRaw；reasonPlain 三档各有正确档位名，且都含
//     「逐条客户批准 / 拒绝超时通道不可用＝拒绝 / 可能绕过 ANS 文件写边界」；
//   · UI 纯映射：SU 标题 vs 项目标题；三档档位标签；
//   · 渲染源码：SU 警告、默认拒绝焦点、标题/档位/原因/警告接线；
//   · 前缀单一来源：Pipeline 公共出口与编排私有实现同一字符串。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildShellConfirmRequest,
  parseSuApprovalTier,
  plainReasonFor,
  type ShellCommandDisplay,
} from "../../../app/desktop/operator-channel.ts";
import {
  renderSuApprovalReason,
  SU_APPROVAL_REASON_PREFIX,
} from "../../../src/pipeline/orchestration/shell-arming.ts";
import { SU_APPROVAL_REASON_PREFIX as PREFIX_FROM_GATE } from "../../../src/common/编排/shell-gate.ts";

function display(reason: string): ShellCommandDisplay {
  return {
    command: "rm -rf build",
    argv: ["rm", "-rf", "build"],
    argvLines: ['"rm"', '"-rf"', '"build"'],
    cwd: "/proj",
    reason,
    text: "fixture",
  };
}

async function loadUiLabels(): Promise<Record<string, Function>> {
  const href = new URL("../../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  const UL = (globalThis as Record<string, unknown>).ANSUiLabels as Record<string, Function> | undefined;
  assert.ok(UL, "ui-labels.js 应挂 globalThis.ANSUiLabels");
  return UL;
}

test("D1 档位解析：行首前缀优先；deny 不被后缀 /risky/ 抢占；项目角色恒 null", () => {
  assert.equal(parseSuApprovalTier(`${SU_APPROVAL_REASON_PREFIX}[risky]：x`), "risky");
  assert.equal(parseSuApprovalTier(`${SU_APPROVAL_REASON_PREFIX}[review]：x`), "review");
  assert.equal(parseSuApprovalTier(`${SU_APPROVAL_REASON_PREFIX}[deny]：x`), "deny");
  assert.equal(
    parseSuApprovalTier(`${SU_APPROVAL_REASON_PREFIX}[deny]：命中 hard deny；原文提到 risky`),
    "deny",
    "前缀优先，不被既有 /risky/ 泛匹配串线",
  );
  assert.equal(parseSuApprovalTier("risky：自动审核判定有风险"), null, "项目角色文案不得被识别为 su 审批档");
  assert.equal(parseSuApprovalTier(`前导字 ${SU_APPROVAL_REASON_PREFIX}[deny]：x`), null, "只认行首");
  assert.equal(parseSuApprovalTier(null), null);
});

test("D2 卡片数据：tier/policy、命令原文/cwd/reasonRaw；三档 plain reason 含必备披露", () => {
  for (const tier of ["risky", "review", "deny"] as const) {
    const raw = renderSuApprovalReason(tier, "命中规则：fixture");
    const req = buildShellConfirmRequest(`id-${tier}`, display(raw));
    assert.equal(req.tier, tier);
    assert.equal(req.policy, "su-approval");
    assert.equal(req.command, "rm -rf build", "命令原文逐字");
    assert.equal(req.cwd, "/proj");
    assert.equal(req.reasonRaw, raw);
    for (const must of [
      "逐条客户批准",
      "拒绝/超时/通道不可用 = 拒绝",
      "可能绕过 ANS 文件写边界",
    ]) {
      assert.ok(req.reasonPlain.includes(must), `${tier} 的 plain reason 须含：${must}`);
    }
  }
  assert.match(buildShellConfirmRequest("d", display(renderSuApprovalReason("deny"))).reasonPlain, /硬拒类（deny）/);
  assert.match(buildShellConfirmRequest("r", display(renderSuApprovalReason("risky"))).reasonPlain, /风险命令（risky）/);
  assert.match(buildShellConfirmRequest("v", display(renderSuApprovalReason("review"))).reasonPlain, /未自动判定（review）/);

  // 项目角色三层链：policy=project、tier=null、plain reason 逐字走既有映射（不加 SU 前缀文案）。
  const projectReq = buildShellConfirmRequest("p", display("auto-review risky：有风险"));
  assert.equal(projectReq.policy, "project");
  assert.equal(projectReq.tier, null);
  assert.equal(projectReq.reasonPlain.includes("SU 审批档"), false);
});

test("D3 UI 纯映射：SU 标题/项目标题；三档标签；未知档位不编造", async () => {
  const UL = await loadUiLabels();
  assert.equal(UL.shellConfirmTitle("su-approval"), "SU 命令审批");
  assert.equal(UL.shellConfirmTitle("project"), "shell 命令请求");
  assert.equal(UL.shellConfirmTitle(undefined), "shell 命令请求");
  assert.equal(UL.suApprovalTierLabel("risky"), "风险命令（risky）");
  assert.equal(UL.suApprovalTierLabel("review"), "未自动判定（review）");
  assert.equal(UL.suApprovalTierLabel("deny"), "硬拒类（deny）");
  assert.equal(UL.suApprovalTierLabel("other"), "");
});

test("D4 渲染源码：SU 警告/默认拒绝焦点/标题档位原因接线；不得把审批呈现成已获准", () => {
  const src = fs.readFileSync(new URL("../../../app/renderer/renderer.js", import.meta.url), "utf8");
  assert.ok(
    src.includes("批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。"),
    "必备警告逐字在位",
  );
  assert.ok(src.includes('$("sc-deny").focus();'), "拒绝为默认焦点");
  assert.ok(
    src.includes('var confirmRoleId = typeof payload.roleId === "string" && payload.roleId !== "" ? payload.roleId : cur.roleId;'),
    "标题角色优先取载荷 roleId，缺省回退当前角色",
  );
  assert.ok(
    src.includes("UiLabels.shellConfirmTitle(payload.policy, confirmRoleId)"),
    "标题按 policy + 实际角色（roleId）",
  );
  assert.ok(src.includes("UiLabels.suApprovalTierLabel(payload.tier)"), "档位标签");
  assert.ok(src.includes('"命中原因：" + payload.reasonRaw'), "su 卡把 reasonRaw 作为可见原因行");
  assert.ok(src.includes('overlay.classList.toggle("is-su-approval", suApproval)'), "SU 卡样式钩子");
  assert.ok(src.includes("SU_APPROVAL_WARNING"), "SU 警告常量接入 hint");
  // 既有 fail-closed 文案仍在：Esc/关闭/拒绝 = 不执行。
  assert.ok(src.includes("点「拒绝」、按 Esc 或关闭本框 = 不放行（不会执行）。"));
  // 不允许正向「已获准/已批准执行」措辞（呈现必须停在「已提交审批」语义）。
  const scBlock = src.slice(src.indexOf("function renderShellConfirm"), src.indexOf("function closeShellConfirm"));
  assert.equal(/已获准|已批准执行/.test(scBlock), false, "卡片不得呈现为已获准");
});

test("D5 前缀单一来源：Pipeline 公共出口与编排私有实现逐字相同", () => {
  assert.equal(SU_APPROVAL_REASON_PREFIX, "su-审批档");
  assert.equal(SU_APPROVAL_REASON_PREFIX, PREFIX_FROM_GATE);
  const desktop = fs.readFileSync(new URL("../../../app/desktop/operator-channel.ts", import.meta.url), "utf8");
  assert.ok(desktop.includes("SU_APPROVAL_REASON_PREFIX"), "桌面解析前缀取自公共出口，不另写一份");
  assert.equal(desktop.includes('"su-审批档"'), false, "桌面不得硬编码第二份前缀字面");
});

test("D6 内置角色卡命令纪律：免审批/逐条批准/不走 pm/不得说已获准/写边界披露齐备", async () => {
  const { BUILT_IN_ROLE_CARD_TEXT } = await import("../../../src/common/门禁引擎/boundary-core.ts");
  const text = BUILT_IN_ROLE_CARD_TEXT;
  for (const must of [
    "命令纪律（su 审批档，run_shell）",
    "只读白名单命令",
    "免审批、直接执行",
    "客户批准后才执行",
    "拒绝、超时、通道不可用 = **不执行**",
    "不走 pm 审读",
    "把「已提交审批」说成已获准",
    "shell 命令不受 ANS 文件写入边界约束",
    "客户审批是唯一闸",
  ]) {
    assert.ok(text.includes(must), `su 卡命令纪律须含：${must}`);
  }
  assert.equal(text.includes("rm -rf 属 deny"), false, "不得把 rm 错标 deny（规则事实：risky）");
});
