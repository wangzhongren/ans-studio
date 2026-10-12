// 门禁引擎测试：边界文件「解析出 0 条」的响亮失败（客户 2026-10-12 裁定 A）+ 合法空集/合成边界不误伤
//
// 缺陷现场（真机端到端实测，证据见 角色卡/门禁引擎/docs/fix/2026-10-12_fix_boundary-prose-silent-empty.md）：
// su 给新建的三个角色写了**散文式 Markdown** `boundary.md`（「## 允许写入（白名单，仅此）」+ 反引号
// 路径列表）。加载器的文件名白名单接受 `boundary.md`，但 legacy 表格解析器从散文里静默解析出 0 条、
// `parseError` 为空 ⇒ 该角色一切写入被拒，而拒写信息只说「未匹配任何边界条目…允许路径：（无）」，
// 完全不提示「边界文件读不懂」。
//
// 本文件钉住（A）：
//  1. 散文 `boundary.md`（文件存在、被读到、解析 0 条）→ parseError，文案含原因与出路（改写为 boundary.yaml）；
//  2. `listProject` 对这类角色走**既有 warnings 通道**；绝不出现「0 条且无 parseError」的静默角色；
//  3. 闸链贯通：`resolveBoundarySection` → `resolveWrite` 的拒绝理由**携带解析原因**（不是只列「允许路径：（无）」），
//     且经 format-denial 渲染后仍可见；
//  4. **合成边界不被误伤**：内置（builtInBoundarySection）/ 治理种子 / 未接受段不是文件解析路径，无 parseError；
//  5. **合法显式空集不被误伤**：YAML 显式 `entries: []`（按声明格式明确表达空集）不是解析失败，
//     角色仍可枚举（客户裁定的 O1 角落依赖此语义，见 test/测试/cli-genesis-boundary.test.ts）；
//  6. 向后兼容：`.md` 带合法 legacy 表格仍解析出条目；后缀错配（散文写成 .yaml）已有严格 YAML 报错。
//
// 全部在系统临时目录内进行，用完清理，不在仓库留文件。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BUILT_IN_GOVERNANCE_ROLE_ID,
  BUILT_IN_ROLE_CARD_TEXT,
  builtInBoundarySection,
  loadBoundaryFile,
  resolveBoundarySection,
} from "../../src/common/门禁引擎/boundary-core.ts";
import { governanceBoundaryEntries } from "../../src/common/门禁引擎/governance-seed.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { formatDenialMessage } from "../../src/common/pi-adapter/format-denial.ts";
import type { DeniedDecision } from "../../src/common/pi-adapter/format-denial.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "boundary-empty-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

// 与 ans-playground2 实测同形的散文边界（su 真实写出的那种）：标题 + 反引号路径列表，无表格。
const PROSE_BOUNDARY_MD = [
  "# 写盘边界 · 实现者",
  "",
  "## 允许写入（白名单，仅此）",
  "- `src/**`",
  "- `package.json`",
  "",
  "## 禁止写入（黑名单，其余一切）",
  "- `test/**`",
  "- `docs/**`",
  "",
  "## 执行规则",
  "1. 只在白名单路径内创建/覆盖/修改文件。",
  "",
].join("\n");

/** 建一个项目：角色目录 + role-card.md + 指定的边界文件内容。返回项目根。 */
function makeProject(name: string, roleId: string, boundaryName: string, boundaryText: string): string {
  const proj = join(ROOT, name);
  const dir = join(proj, "角色卡", roleId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "role-card.md"), `# 角色：${roleId}\n`, "utf8");
  writeFileSync(join(dir, boundaryName), boundaryText, "utf8");
  return proj;
}

// ———————————— 1) 散文 boundary.md → parseError（原因 + 出路） ————————————

test("A：散文 boundary.md（存在、被读到、解析 0 条）→ parseError，文案含原因与出路（改写为 boundary.yaml）", async () => {
  const proj = makeProject("prose", "实现者", "boundary.md", PROSE_BOUNDARY_MD);
  const rel = "角色卡/实现者/boundary.md";
  const b = await loadBoundaryFile(rel, join(proj, rel), proj, join(ROOT, "skill"), {
    accepted: false,
    source: "",
  });

  assert.equal(b.entries.length, 0);
  assert.equal(typeof b.parseError, "string", "解析出 0 条必须记为 parseError（不得静默空集）");
  assert.match(b.parseError!, /边界文件存在但 Section 1 为空或无法解析/, "文案须点明文件存在但读不懂");
  assert.ok(b.parseError!.includes(rel), "文案须含该文件的项目相对路径");
  assert.match(b.parseError!, /boundary\.yaml/, "文案须给出出路（改写为 boundary.yaml）");
  assert.match(b.parseError!, /Markdown|散文/, "文案须点明 Markdown 散文不会被解析");
  assert.equal(b.acceptance.accepted, false, "解析失败一律 fail-closed（未接受）");
});

// ———————————— 2) listProject：既有 warnings 通道；无静默空集角色 ————————————

test("A：listProject 对散文边界角色记 warning（既有通道）并跳过；一切被列角色都无「0 条且无 parseError」", async () => {
  const proj = makeProject("prose-list", "实现者", "boundary.md", PROSE_BOUNDARY_MD);
  const listing = await listProject(proj);

  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"], "散文角色不得被静默列为空集角色");
  const w = listing.warnings.join("\n");
  assert.match(w, /实现者/, "warning 须指名角色");
  assert.match(w, /Section 1 为空或无法解析/, "warning 须含解析原因");
  assert.match(w, /boundary\.yaml/, "warning 须含出路提示");

  // 反向守卫：被列出的角色（含内置 su）一律有条目——「0 条且无 parseError」这一静默签名不得出现。
  for (const r of listing.roles) {
    assert.ok(
      r.boundary.entries.length > 0 || typeof r.boundary.parseError === "string",
      `${r.roleId} 不得以「0 条且无 parseError」的静默空集出现`,
    );
  }
});

// ———————————— 3) 闸链：拒绝理由携带原因（不是只列「允许路径：（无）」） ————————————

test("A：闸链贯通——resolveBoundarySection(角色) 得 parseError；resolveWrite 拒绝理由与 format-denial 渲染均呈现原因", async () => {
  const proj = makeProject("gate", "实现者", "boundary.md", PROSE_BOUNDARY_MD);
  const skill = join(ROOT, "skill-gate");
  const project: ProjectConfig = {
    projectRoot: proj,
    skillRoot: skill,
    roles: { 实现者: { card: "角色卡/实现者/role-card.md", boundary: "角色卡/实现者/boundary.md" } },
    // 项目覆盖分支（第 1 步）生效所需：治理边界路径 + 已接受（无 pin 的运行期同意，与桌面同形）。
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:runtime-consent" },
    },
  };

  const b = await resolveBoundarySection("实现者", project);
  assert.match(String(b.parseError), /Section 1 为空或无法解析/, "resolveBoundarySection 须把 parseError 带出");

  const d = resolveWrite("src/x.ts", b, undefined, { skillRoot: skill, projectRoot: proj });
  assert.equal(d.allowed, false, "parseError 边界拒一切写入（fail-closed）");
  if (d.allowed) return; // 类型收窄（上一断言已钉 false）
  assert.match(d.reason, /边界解析失败/, "拒绝理由须是解析失败而非泛泛的「未匹配」");
  assert.match(d.reason, /Section 1 为空或无法解析/, "拒绝理由须给出可读原因");
  assert.match(d.reason, /boundary\.yaml/, "拒绝理由须给出出路");

  // format-denial 那条链：渲染面向模型与客户的完整信息，必须携带原因——而非只列「允许路径：（无）」。
  const rendered = formatDenialMessage(d as DeniedDecision);
  assert.match(rendered, /Section 1 为空或无法解析/, "渲染后的拒写信息须呈现原因");
  assert.match(rendered, /boundary\.yaml/, "渲染后的拒写信息须含出路提示");
});

// ———————————— 4) 合成边界不被误伤（非文件解析路径） ————————————

test("A 反向：代码合成边界（内置 / 治理种子 / 未知角色回退）一律无 parseError——修复只针对文件解析", async () => {
  // 内置边界（builtInBoundarySection）：合成，条目非空且无 parseError
  const builtIn = builtInBoundarySection();
  assert.equal(builtIn.parseError, undefined);
  assert.ok(builtIn.entries.length > 0);

  // 治理种子（创世分支，buildGovernanceSeedBoundaryForGate 经 resolveBoundarySection 第 3 步）：
  const proj = join(ROOT, "synth");
  mkdirSync(proj, { recursive: true });
  const seed = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, {
    projectRoot: proj,
    skillRoot: join(ROOT, "skill-synth"),
    roles: {},
    genesisBootstrap: { source: "test:operator-bootstrap" },
  } satisfies ProjectConfig);
  assert.equal(seed.parseError, undefined, "治理种子是合成边界，不得被误判为解析失败");
  assert.deepEqual(seed.entries.map((e) => e.path).sort(), [".ans/", "docs/", "角色卡/"].sort());

  // 未知角色回退内置（分支 4）：合成，同样无 parseError
  const fallback = await resolveBoundarySection("并不存在的角色", {
    projectRoot: proj,
    skillRoot: join(ROOT, "skill-synth"),
    roles: {},
  } satisfies ProjectConfig);
  assert.equal(fallback.parseError, undefined);
});

// ———————————— 5) 合法显式空集：YAML entries: [] 不是解析失败 ————————————

test("A 反向：YAML 显式 entries: []（作者按声明格式明确表达空集）→ 无 parseError，角色仍可枚举（O1 角落语义）", async () => {
  const proj = makeProject("explicit-empty", "显式空", "boundary.yaml", "role: 显式空\nentries: []\n");
  const rel = "角色卡/显式空/boundary.yaml";
  const b = await loadBoundaryFile(rel, join(proj, rel), proj, join(ROOT, "skill"), {
    accepted: false,
    source: "",
  });
  assert.equal(b.parseError, undefined, "显式空集是结构完整的声明，不是「读不懂」");
  assert.equal(b.entries.length, 0);

  // 客户 2026-10-12 裁定的 O1 角落依赖：此类角色**仍被枚举**（hasRoles:true）、无解析失败 warning。
  const listing = await listProject(proj);
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "显式空"]);
  assert.equal(listing.hasRoles, true);
  assert.deepEqual(listing.warnings, [], "显式空集不得产生 warning");
});

// ———————————— 6) 向后兼容：.md 带合法表格仍解析；散文写成 .yaml 走严格报错 ————————————

test("A 兼容：.md 带合法 legacy 表格仍解析出条目；散文写成 boundary.yaml 走严格 YAML 报错（既响亮路径）", async () => {
  const mdTable = [
    "## Section 1: 可修改文件与目录",
    "",
    "| 类型 | 路径 | 用途 |",
    "| --- | --- | --- |",
    "| 单文件 | `src/a.ts` | 演示条目 |",
    "",
  ].join("\n");
  const proj = makeProject("md-table", "表格角色", "boundary.md", mdTable);
  const rel = "角色卡/表格角色/boundary.md";
  const b = await loadBoundaryFile(rel, join(proj, rel), proj, join(ROOT, "skill"), {
    accepted: false,
    source: "",
  });
  assert.equal(b.parseError, undefined, "带合法表格的 .md 仍按 legacy 解析（向后兼容，未加严）");
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].path, "src/a.ts");

  // 散文写成 boundary.yaml：parseBoundaryYaml 的严格校验本就会抛错（既有的响亮路径）。
  const proj2 = makeProject("yaml-prose", "错后缀角色", "boundary.yaml", PROSE_BOUNDARY_MD);
  const rel2 = "角色卡/错后缀角色/boundary.yaml";
  const b2 = await loadBoundaryFile(rel2, join(proj2, rel2), proj2, join(ROOT, "skill"), {
    accepted: false,
    source: "",
  });
  assert.equal(typeof b2.parseError, "string", "散文塞进 .yaml 后缀必须报错（既有严格 YAML 路径）");
  assert.equal(b2.acceptance.accepted, false);
});

// ———————————— 7) C：su 卡文本 + 治理种子文案写死格式与最小示例 ————————————

test("C：su 内置卡文本写死「角色边界必须是 boundary.yaml（YAML）」+ 最小可抄示例 + 散文不会被解析", () => {
  const t = BUILT_IN_ROLE_CARD_TEXT;
  assert.match(t, /ANS Governance/, "既有锚点（listProject/桌面测试依赖）不得丢");
  assert.match(t, /角色卡\/<角色 id>\/boundary\.yaml/, "须写死每角色边界文件名与位置");
  assert.match(t, /entries:/, "须写死 entries 列表结构");
  assert.match(t, /kind/, "须给出条目字段（kind/path/purpose）");
  // 最小可抄示例（可直接照抄）：含顶层 role 与一条完整条目
  assert.match(t, /```yaml\nrole: /, "须内嵌最小可抄示例（YAML 代码块，以 role: 开头）");
  assert.match(t, /kind: directory\n\s+path: /, "示例须含一条完整条目（kind + path）");
  assert.match(t, /不会被解析/, "须明确散文/表格不会被解析");
});

test("C：治理种子（governanceBoundaryEntries）的角色卡条目 purpose 明示 boundary.yaml（YAML：role+entries）", () => {
  const card = governanceBoundaryEntries().find((e) => e.path === "角色卡/");
  assert.ok(card, "种子须含 角色卡/ 条目");
  assert.match(card!.purpose, /boundary\.yaml/, "种子文案须点名 boundary.yaml");
  assert.match(card!.purpose, /YAML/, "种子文案须点名 YAML 格式");
  assert.match(card!.purpose, /不会被解析/, "种子文案须警示散文 .md 不会被解析");
});
