// 门禁引擎测试：F6 拒绝回执的恢复指引（I5，已并入 V1；
// PM 评审 `2026-10-17_design_existing-project-compat-review.md` §三、§五 F1）。
//
// 真实现场（客户项目 `D:\work\vibe-code\codeagent`）：有 7 个项目角色、无 `.ans/project.json`，su 的
// 每次写入都被 F6 拒绝，回执只说「未被接受或缺少证据来源」——模型与客户均不知道下一步做什么。
//
// 本文件钉住 F1 后的行为（**判定逻辑、条件与顺序零变化**，只追加文案）：
//  1. 未接受边界仍 `allowed:false`（fail-closed 不放松），首句逐字保留，其后含完整指引；
//  2. `source` 为空同样仍拒、同样带指引（F6 的另一个入口）；
//  3. 两份 `format-denial.ts` 渲染器（运行时核心 / Pi适配器）输出都带出该指引（渲染器本身零改动）；
//  4. 已接受边界不受影响：覆盖路径照常放行；其非 F6 拒绝（如未匹配）**不出现**指引。
//  5. 指引不重复首句（`test/编排/shell-gate.test.ts:370` 按整句计数，不能变成 2 次/段）。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { formatDenialMessage as formatRuntimeCore } from "../../src/common/runtime-core/format-denial.ts";
import { formatDenialMessage as formatPiAdapter } from "../../src/common/pi-adapter/format-denial.ts";
import type { DeniedDecision } from "../../src/common/runtime-core/format-denial.ts";

// 真实临时根（与 f4-denial-guidance.test.ts 同法：F7 realpath 解析的祖先须真实存在）
const ROOT = mkdtempSync(join(tmpdir(), "f6-guidance-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
mkdirSync(join(PROJ, "docs"), { recursive: true });
mkdirSync(SKILL, { recursive: true });

const ctx = { skillRoot: SKILL, projectRoot: PROJ };

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
});

// 首句（逐字，跨角色既有断言依赖）与指引全文（逐字，PM 评审 §三）
const F6_HEAD = "边界未被接受或缺少证据来源（F6）：拒绝一切写入。";
const F6_GUIDANCE =
  "可能的恢复路径：若项目已有角色但缺少 .ans/project.json，请由操作者在桌面点击「建立治理记录」，" +
  "或在终端运行 ans govern <项目目录>（需已配置模型与凭据）；若 .ans/project.json 已存在，请检查它" +
  "可解析、accepted:true 且 pin 齐全、被 pin 的边界文件未被改动——程序不会自动覆盖或重新接受。";

const ACC = { accepted: true, source: "test:unit" };

function bnd(entries: any[], acceptance: any = ACC): any {
  return { entries, boundarySource: "test", acceptance };
}
function dir(root: string, path: string): any {
  return { root, path, kind: "directory", purpose: "t" };
}

// ---- 1. 未接受边界：仍拒绝 + 首句逐字 + 完整指引 ----
test("F6（accepted:false）：仍拒绝一切写入；首句逐字开头；其后为完整恢复指引", () => {
  const b = bnd([dir("project", "docs")], { accepted: false, source: "" });
  const d = resolveWrite("docs/su/memo.md", b, undefined, ctx);
  assert.equal(d.allowed, false, "F6 判定不得放松：未接受边界必须仍拒绝一切写入");
  if (d.allowed) return;
  assert.ok(d.reason.startsWith(F6_HEAD), `首句须逐字开头，实得：${d.reason}`);
  assert.ok(d.reason.includes(F6_GUIDANCE), `须包含指引全文，实得：${d.reason}`);
  // 指引不重复首句（shell-gate.test.ts 按整句计数：原判 + 重试各一次，指引不得再加一次）
  assert.equal(
    d.reason.split(F6_HEAD).length - 1,
    1,
    "首句在 reason 中恰出现一次（指引不重复首句）",
  );
  // 文案纪律：不猜具体状态、不说「项目角色不受影响」、不承诺自动修复、不暗示无需凭据
  for (const forbidden of ["项目角色不受影响", "自动修复", "无需凭据"]) {
    assert.equal(d.reason.includes(forbidden), false, `指引不得出现：${forbidden}`);
  }
});

test("F6（accepted:true 但 source 为空）：同样仍拒绝、同样带指引", () => {
  const b = bnd([dir("project", "docs")], { accepted: true, source: "   " });
  const d = resolveWrite("docs/su/memo.md", b, undefined, ctx);
  assert.equal(d.allowed, false, "source 空白视同缺少证据来源（既有 F6 语义不变）");
  if (d.allowed) return;
  assert.ok(d.reason.startsWith(F6_HEAD), `首句须逐字开头，实得：${d.reason}`);
  assert.ok(d.reason.includes(F6_GUIDANCE));
});

// ---- 2. 两份渲染器（运行时核心 / Pi适配器）都带出指引（渲染器代码零改） ----
test("渲染链：两份 format-denial 的输出都包含完整指引（renders reason 自动带出）", () => {
  const b = bnd([dir("project", "docs")], { accepted: false, source: "" });
  const d = resolveWrite("docs/su/memo.md", b, undefined, ctx);
  assert.equal(d.allowed, false);
  if (d.allowed) return;

  for (const [name, render] of [
    ["runtime-core", formatRuntimeCore],
    ["pi-adapter", formatPiAdapter],
  ] as const) {
    const text: string = render(d as DeniedDecision);
    assert.ok(text.startsWith(`写入被拒绝：${F6_HEAD}`), `${name}：首行＝「写入被拒绝：首句」`);
    assert.ok(text.includes(F6_GUIDANCE), `${name}：输出须包含指引全文`);
    assert.ok(text.includes("允许写入的路径（按根分组）："), `${name}：既有分组标题保留`);
  }
});

// ---- 3. 已接受边界不受影响 ----
test("已接受边界：覆盖路径照常放行（不出现指引）", () => {
  const b = bnd([dir("project", "docs")]);
  const ok = resolveWrite("docs/su/memo.md", b, undefined, ctx);
  assert.equal(ok.allowed, true, "已接受边界的行为零变化");
  assert.equal("reason" in ok, false, "放行分支没有拒绝理由（自然不含指引）");
});

test("已接受边界的非 F6 拒绝（未匹配）：不出现 F6 指引", () => {
  const b = bnd([dir("project", "docs")]);
  const d = resolveWrite("nope/x.ts", b, undefined, ctx);
  assert.equal(d.allowed, false);
  if (d.allowed) return;
  assert.match(d.reason, /未匹配任何边界条目/, "仍是既有的未匹配拒绝理由");
  assert.equal(d.reason.includes("可能的恢复路径"), false, "非 F6 拒绝不得混入 F6 指引");
  assert.equal(d.reason.includes(F6_HEAD), false);
});
