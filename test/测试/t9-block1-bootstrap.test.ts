// 测试角色：T35 用户入口确定性验收 —— 块1（创世 bootstrap / 创建权 · su 有界创世）
//
// ── 本次改写（T35，设计 §12.6）─────────────────────────────────────────────────
// 本文件取代 T9 旧版 `t9-block1-bootstrap.test.ts`——旧版三处失据，一并消除：
//   · 它断言「固定 7 角色骨架落盘」——**客户已定「不预建，全由 su 对话决定」**，该前提被推翻；
//   · 它用 **T32 已退役的 `bootstrap` 选项**（`openGovernanceSession` 不再接收）——1 处 typecheck 错；
//   · 两条失败用例均源自「固定骨架」这一被否定的前提。
// 新形态（本文件）：**su 不预建**——它**直接写出**角色；`openGovernanceSession` **不预先创建**
// `角色卡/` / `docs/` / `.ans/`；角色是 su（经创世边界）**写出来的**。
//
// ── 验收从**用户入口**出发（§12.6，本次方法要求）──────────────────────────────
// T9 结论「未发现自证与实际不符」是实话，但它**验错了对象**——验的是编排的 `openGovernanceSession`
// （那条确实通），**没验桌面那条链**。故本文件沿**桌面实际会走的那条链**组织：
//   **导入一个空文件夹（IPC）→ `listProject` → 构造 `ProjectConfig` → 开门禁判定（gate）**。
// 能自动验的部分就自动验，**不跳过中间层直接调底层函数了事**（gate 取自真实会话装配）。
//
// ── 「客户跑」的部分（本机不可自动验收，如实标注）─────────────────────────────
// 「su **真的据对话**决定并建出哪些角色」需**真实模型轮次**（凭据 + 已配置 provider + `ANS_PI_CONTEXT_WINDOW`），
// 按项目当前操作约束**须客户本人运行**——**不列入自动验收**。手工验步骤见文件末注释块。
//
// 全部在**系统临时目录**内进行，用完清理，仓库不留文件。
// 设计依据：docs/design/2026-10-11_design_v1-full-implementation.md §12（尤其 §12.2/§12.6/§12.7 T35）。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { openRoleSession as realOpenRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { openGovernanceSession } from "../../src/pipeline/orchestration/govern-session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveBoundarySection } from "../../src/common/门禁引擎/boundary-core.ts";
import { sha256File } from "../../src/common/门禁引擎/io.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { renderGovernanceBoundaryDoc } from "../../src/common/编排/finalize.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { OpenResult } from "../../app/desktop/session.ts";
import type { OperatorChannelFn, OperatorPrompt, RuntimeAdapter, SessionEvent, ToolCall, WriteGate } from "../../src/provider/pi/session.ts";

const TMP_ROOTS: string[] = [];
function tempRoot(tag: string): string {
  const d = mkdtempSync(join(tmpdir(), `t35-blk1-${tag}-`));
  TMP_ROOTS.push(d);
  return d;
}
after(() => {
  for (const d of TMP_ROOTS) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
});

const GOV_REL = "角色卡/governance-boundary.yaml";

/** 创世项目（空文件夹 + 操作者发起的 bootstrap）：**不预建任何东西**，也不预置治理边界。 */
function genesisProject(target: string): ProjectConfig {
  return {
    projectRoot: target,
    skillRoot: target,
    roles: {},
    genesisBootstrap: { source: "test:T35 操作者导入空文件夹并开启 su 对话=发起 bootstrap（操作者指令）" },
  };
}

/** 「客户跑」的手工验步骤（本机不可自动验收，如实写明）。 */
export const CLIENT_MANUAL_STEPS = [
  "① 桌面导入一个**空文件夹**（无 角色卡/、无 .ans/）→ 左树应显示 su、并提示「项目尚未 bootstrap」。",
  "② 在 .env 配置真实 provider：ANS_PI_BASE_URL / ANS_PI_MODEL / ANS_PI_PROVIDER / ANS_PI_CONTEXT_WINDOW（必填）+ ANTHROPIC_AUTH_TOKEN。",
  "③ 选 pi 运行时，点 su 开始对话，**用自然语言**说明要建哪些角色（例：「建一个『项目管理』和『编排』角色」）。",
  "④ 断言：su 真的发起 write_file 写出 角色卡/<角色>/{role-card.md,boundary.yaml,memo.md}；越界写（如 src/**）在写前被拒。",
  "⑤ 断言：写完后左树（su 轮次 settle 触发 project:changed）随 su 建角色而**长出**对应角色。",
].join("\n");

// —————————————————————— 用户入口链的取 gate 辅助 ——————————————————————
// 沿**桌面实际会走的那条链**取到 su 会话的 gate：经 IPC `createDesktopInterface` →
// `listProject`（门禁引擎）→ `buildProjectConfig`（构造 ProjectConfig）→ `openSession`
// → 真实 `openRoleSession` 构造 gate。gate 从**注入的适配器工厂**捕获（注入缝是为此设的），
// **不是**直接调 `resolveWrite` 了事。

interface DesktopGateCapture {
  gate: WriteGate;
  project: ProjectConfig;
  open: OpenResult;
}

async function openSuViaDesktop(dir: string): Promise<DesktopGateCapture> {
  let gate: WriteGate | undefined;
  let project: ProjectConfig | undefined;
  const iface = createDesktopInterface({
    pickDirectory: async () => dir,
    emitEvent: () => {},
    // 捕获「构造出的 ProjectConfig」后，仍交给**真实** openRoleSession 装配 gate（不换底层）。
    openRoleSessionFn: async (input, deps) => {
      project = input.project;
      return realOpenRoleSession(input, deps);
    },
    // demo 路径的适配器工厂接缝恰好拿到真实 gate——用它捕获，并返回一个不落盘的空脚本替身。
    createDemoAdapterFn: ({ gate: g }) => {
      gate = g;
      return createFakeRuntimeAdapter({ gate: g, script: [] });
    },
  });
  await iface.listProject({ projectRoot: dir }); // 用户入口：导入（枚举）
  const open = await iface.openSession({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await iface.stopSession(); // 收口（释放后台事件消费）
  assert.ok(gate, "应经桌面链捕获到 su 会话的 gate");
  assert.ok(project, "应捕获到桌面构造的 ProjectConfig");
  return { gate: gate!, project: project!, open };
}

// —————————————————————— 1) 导入空文件夹：listProject（IPC）不抛错 ——————————————————————

test("用户入口/空文件夹：IPC listProject 不抛错，返回内置 su + hasRoles:false + primaryRoleId", async () => {
  const dir = tempRoot("empty");
  const iface = createDesktopInterface({ pickDirectory: async () => dir, emitEvent: () => {} });
  const listing = await iface.listProject({ projectRoot: dir });

  assert.equal(listing.hasRoles, false, "空项目应 hasRoles:false（尚未 bootstrap）");
  assert.equal(listing.primaryRoleId, "su", "primaryRoleId 应为主入口（内置 su，由门禁引擎给出）");
  assert.equal(listing.roles.length, 1, "空项目 roles 只应含内置 su");
  assert.equal(listing.roles[0].roleId, "su");
  assert.equal(listing.roles[0].builtIn, true);
  assert.ok(listing.roles[0].cardText.length > 0, "内置 su 应带角色说明（无角色卡文件，由引擎合成）");
  // 空项目是**正常状态**（**客户 2026-10-11 裁定**）：「无角色目录」=「项目尚未 bootstrap」的**初始态**，
  // 客户为「空文件夹 → 与 su 对话 → su 建角色」专门设计了整套流程，故**不该报警**——门禁引擎据此改，
  // `listProject` 在**无角色目录**时不再推 warning（`hasRoles:false` 与界面「项目尚未 bootstrap」提示已说清楚）。
  // 留**反向守卫**（断言**没有** warning）而非删行：它不会再长回来。
  // 真异常的 warning（缺 role-card.md / 缺 boundary.yaml / 读取失败 / 边界解析失败 / 角色重复 /
  // 「有目录却无有效角色」）**全部保留**，见 src/service/role/resolve-role.ts（只读）。
  assert.deepEqual(
    listing.warnings,
    [],
    `空项目不应有任何 warning（空项目是正常状态），实得：${JSON.stringify(listing.warnings)}`,
  );
  assert.ok(
    !listing.warnings.some((w) => /无角色目录|尚未 bootstrap/.test(w)),
    `空项目不得再出现「无角色目录 / 尚未 bootstrap」类 warning，实得：${JSON.stringify(listing.warnings)}`,
  );
  // 创世态：su **不再带** `readOnly` 字段——客户 2026-10-11 裁定移除「只读」徽标（它偏离了
  // 「门禁静默执行、拒绝内联显示在聊天流里」的原模型；su 本就一直能聊天/写治理产物）。
  // 留**反向守卫**（断言该字段**不存在**）而非删行：它不会再长回来。
  assert.equal("readOnly" in listing.roles[0], false, "su 不应再带 readOnly 字段（只读徽标已移除）");
});

test("用户入口/空文件夹对照：项目根不存在 / 是文件 → 仍是**真错误**（抛错），不伪装成空项目", async () => {
  const iface = createDesktopInterface({ pickDirectory: async () => "", emitEvent: () => {} });
  await assert.rejects(() => iface.listProject({ projectRoot: join(tempRoot("nodir"), "根本不存在") }), /不存在|不可访问/);

  const base = tempRoot("file-as-root");
  const filePath = join(base, "this-is-a-file");
  writeFileSync(filePath, "not a dir", "utf8");
  await assert.rejects(() => iface.listProject({ projectRoot: filePath }), /不是目录/);
});

// —————————————————————— 2) 创世边界：su 的 gate（沿桌面链取出）——————————————

test("用户入口/创世边界：未 bootstrap 时 su 的 gate **放行** 治理产物（角色卡//docs//.ans/）", async () => {
  const dir = tempRoot("genesis-allow");
  const { gate, project, open } = await openSuViaDesktop(dir);

  assert.equal(open.ok, true, `点 su 应开成会话：${open.error ?? ""}`);
  assert.ok(project.genesisBootstrap, "未 bootstrap 时桌面须给 su 带 genesisBootstrap（否则 su 一个字也写不了）");
  assert.ok(project.genesisBootstrap!.source.includes("desktop-app"), "source 须如实标注 desktop-app（操作者授权来源）");
  assert.ok(project.genesisBootstrap!.source.includes("su"), "source 须含主入口角色 id（不硬编码 su）");
  assert.equal(project.governanceBoundary?.acceptance.accepted, true, "导入空文件夹即授权（运行期同意）");

  // 创世放行的**具体**治理产物：对话中才定的「任意新角色」名也放行（不预建、按对话决定）。
  for (const p of [
    "角色卡/任意新角色/role-card.md",
    "角色卡/任意新角色/boundary.yaml",
    "角色卡/任意新角色/memo.md",
    "角色卡/governance-boundary.yaml",
    "docs/design/x.md",
    "docs/bootstrap-manifest.md",
    ".ans/project.json",
  ]) {
    assert.equal(gate(p).allowed, true, `创世应放行治理产物：${p}`);
  }
});

test("用户入口/创世边界：未 bootstrap 时 su 的 gate **拒绝** src/** 与项目根外（非治理产物）", async () => {
  const dir = tempRoot("genesis-deny");
  const { gate } = await openSuViaDesktop(dir);

  for (const p of ["src/index.ts", "README.md", "package.json", "app/desktop/main.ts", "任意文件.txt"]) {
    const d = gate(p);
    assert.equal(d.allowed, false, `创世不得放行非治理产物：${p}`);
    assert.ok((d as { reason: string }).reason.length > 0, "拒绝须给出原因");
  }
  // 项目根之外的**绝对路径** → 不在任何受治理根内 → 拒。
  const outside = gate(join(dir, "..", "outside.txt"));
  assert.equal(outside.allowed, false, "项目根之外的绝对路径必须被拒");
});

// —————————————————————— 3) 切回：项目一有角色 → 不再设 genesisBootstrap ————————————

test("用户入口/切回：项目一有角色（hasRoles:true）→ 桌面**不再设** genesisBootstrap，su 回普通边界（拒一切）", async () => {
  const dir = tempRoot("switch-back");

  // 先经创世 gate 由 su「写出」一个角色（真实经 buildGovernedTools 落盘）——故文件确由 su 写。
  const { gate: genesisGate } = await openSuViaDesktop(dir);
  const tools = buildGovernedTools(genesisGate, { writeRoot: dir });
  const writeFile = tools.find((t) => t.name === "write_file")!;
  const roleCard = await writeFile.handler({ name: "write_file", args: { path: "角色卡/R/role-card.md", content: "# 角色：R\n" } });
  const roleBoundary = await writeFile.handler({
    name: "write_file",
    args: { path: "角色卡/R/boundary.yaml", content: "role: R\nentries:\n  - kind: file\n    path: src/r.ts\n    purpose: t\n" },
  });
  assert.equal(roleCard.ok, true, roleCard.message);
  assert.equal(roleBoundary.ok, true, roleBoundary.message);
  assert.ok(existsSync(join(dir, "角色卡", "R", "role-card.md")), "su 写出的角色卡应落盘");

  // 再导入：项目已有角色 → hasRoles:true → 桌面不再设 genesisBootstrap → su 回内置（未接受）。
  const { gate: laterGate, project: laterProject, open } = await openSuViaDesktop(dir);
  assert.equal(open.ok, true);
  assert.equal(laterProject.genesisBootstrap, undefined, "有角色即不得再设 genesisBootstrap（改由项目边界治理）");
  assert.ok(!("genesisBootstrap" in laterProject), "键本身也不应出现（而非显式 undefined）");

  // su 回到普通边界（内置未接受 → F6 拒一切写）——原本创世可写的路径统统写不了了。
  for (const p of ["角色卡/Y/role-card.md", "docs/x.md", ".ans/project.json", "src/x.ts"]) {
    assert.equal(laterGate(p).allowed, false, `切回后 su 不得再写：${p}`);
  }
});

// —————————————————————— 4) 自终止（结构性）：项目边界就位并 pin 后，创世放行失效 ————————

test("用户入口/自终止：项目治理边界就位并 pin 后，创世放行**结构性**失效（即便 genesisBootstrap 残留）", async () => {
  const dir = tempRoot("selfterm");
  const ctx = { skillRoot: dir, projectRoot: dir };

  // 对照基线：纯创世（无项目边界）下 角色卡/Y/role-card.md 是**可写**的。
  const genesisOnly = genesisProject(dir);
  const before = await resolveBoundarySection("su", genesisOnly);
  assert.equal(before.acceptance.accepted, true, "纯创世边界本身 accepted（授权来自操作者指令）");
  assert.equal(resolveWrite("角色卡/Y/role-card.md", before, undefined, ctx).allowed, true, "对照：纯创世下 角色卡/Y 可写");

  // 写出**项目自己的**治理边界（仅 `docs/` 普通目录）并 pin 住它。
  mkdirSync(join(dir, "角色卡"), { recursive: true });
  const govAbs = join(dir, GOV_REL);
  writeFileSync(
    govAbs,
    ["role: 治理边界", "entries:", "  - kind: directory", "    path: docs/", "    root: project", "    purpose: 项目自己的边界（仅 docs/）", ""].join("\n"),
    "utf8",
  );
  const sha = await sha256File(govAbs);

  const after: ProjectConfig = {
    projectRoot: dir,
    skillRoot: dir,
    roles: {},
    governanceBoundary: { path: GOV_REL, acceptance: { accepted: true, source: "pin:项目边界", pin: [{ path: GOV_REL, sha256: sha }] } },
    // ★ 刻意残留 genesisBootstrap：自终止必须**结构性**生效，不靠调用方清除它。
    genesisBootstrap: { source: "test:op bootstrap（残留）" },
  };
  const b = await resolveBoundarySection("su", after);
  // 项目覆盖先命中：边界来源是项目边界（条目只剩 docs/），genesis 分支永不求值。
  assert.equal(b.entries.length, 1, "项目覆盖应接管（只含项目边界的 docs/ 一条）");
  assert.equal(b.acceptance.source, "pin:项目边界");
  assert.equal(resolveWrite("角色卡/Y/role-card.md", b, undefined, ctx).allowed, false, "★ 自终止：项目边界就位后，创世放行的 角色卡/Y 写入必须失效");
  // 对照：项目边界覆盖的 docs/ 仍可写（证明换的是边界，不是边界坏掉）。
  assert.equal(resolveWrite("docs/x.md", b, undefined, ctx).allowed, true, "项目边界覆盖的 docs/ 仍应可写（对照）");
});

// —————————————————————— 5) 旧形态退场：引擎不再预建骨架 ——————————————————————

test("旧形态退场：openGovernanceSession **不预先创建** 角色卡//docs//.ans/（空脚本 → 无任何骨架落盘）", async () => {
  const dir = tempRoot("no-prebuild");
  const handle = await openGovernanceSession(
    { taskId: "T35-no-prebuild", project: genesisProject(dir) },
    { createAdapter: (gate) => createFakeRuntimeAdapter({ gate, script: [] }) },
  );
  // §12.2：创世（普通目录种子边界）无目标角色 → scope 为 undefined（普通聊天，不做 F4 收窄）。
  assert.equal(handle.scope, undefined, "创世种子边界下 scope 应为 undefined（不预建、不造 writeSet）");

  await handle.send("（空脚本：su 本轮不写任何东西）");
  for await (const _ev of handle.events()) {
    /* 消费到 settled */
  }
  await handle.dispose();

  assert.equal(existsSync(join(dir, "角色卡")), false, "引擎不得预先创建 角色卡/");
  assert.equal(existsSync(join(dir, "docs")), false, "引擎不得预先创建 docs/");
  assert.equal(existsSync(join(dir, ".ans")), false, "引擎不得预先创建 .ans/");
});

test("新形态：su **直接写出**角色（经创世边界）→ 真实落盘且字节相等；越界写被拒零副作用；可被 listProject 枚举", async () => {
  const dir = tempRoot("su-writes");
  const script: ToolCall[] = [
    { name: "write_file", args: { path: "角色卡/新角色/role-card.md", content: "# 新角色\n由 su 据对话直接写出。\n" } },
    {
      name: "write_file",
      args: { path: "角色卡/新角色/boundary.yaml", content: "role: 新角色\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: t\n" },
    },
    { name: "write_file", args: { path: "角色卡/新角色/memo.md", content: "# 新角色 备忘录\n" } },
    { name: "write_file", args: { path: "src/evil.ts", content: "// 越界\n" } },
  ];
  const handle = await openGovernanceSession(
    { taskId: "T35-su-writes", project: genesisProject(dir) },
    { createAdapter: (gate) => createFakeRuntimeAdapter({ gate, script, writeRoot: dir }) },
  );
  await handle.send("请据对话建出新角色");
  for await (const _ev of handle.events()) {
    /* 消费到 settled */
  }
  await handle.dispose();

  // 写集内治理产物真实落盘，字节等于所写内容。
  const card = join(dir, "角色卡", "新角色", "role-card.md");
  assert.ok(existsSync(card), "写集内的治理产物应真实落盘（角色是 su 写出来的，不是预建）");
  assert.equal(readFileSync(card, "utf8"), "# 新角色\n由 su 据对话直接写出。\n", "落盘内容须与所写字节相等");
  assert.ok(existsSync(join(dir, "角色卡", "新角色", "boundary.yaml")), "边界应落盘");

  // 越界写：**写入之前被拒**——文件不存在，父目录也不建（零副作用）。
  assert.equal(existsSync(join(dir, "src", "evil.ts")), false, "越界写应被拒且不产生文件");
  assert.equal(existsSync(join(dir, "src")), false, "拒绝路径不得顺带建出父目录");

  // 建角色那条路真正闭环：listProject 枚举到新角色。
  const listing = await listProject(dir);
  assert.equal(listing.hasRoles, true, "su 写出角色后应 hasRoles:true");
  assert.ok(listing.roles.some((r) => r.roleId === "新角色"), "listProject 应枚举到 su 建出的新角色");
});

// —————————————————————— 6) finalize：提议收口需客户确认（T37 新语义）————————————
//
// ── 为何这两条按**新语义**断言（客户 2026-10-11 裁定）──────────────────────────
// 客户裁定 **bootstrap 的完成方式 =「su 主动提议 → 客户确认 → 完成」**（原话：「完成 bootstrap 应该是 su
// 主动觉得差不多了，来完成」+「当然需要客户确认了」）。编排（T37）据此改造 `finalize()`：**它不再
// 「被调用即完成」**，而是**构造提议、经客户确认通道挂起**；**通道缺省/不可用/超时/拒绝 → 不完成**
// （fail-closed）。故旧断言「调 `finalize()` 即期望完成」**已被新语义推翻**——本文件按新语义改写为
// **两条**：① **未确认 → 不完成且零副作用**（负例，原样被删的旧断言）；② **确认通过 → 完成**（正例）。
//
// ── 确认通道的形状：与 shell 闸 (a) **同一套 `OperatorChannelFn`** ─────────────────
// `finalize` 的「提议」是**一种 `OperatorPrompt`**（`{command, argv, cwd, toolCallId, reason?}`），经
// **shell 闸 (a) 的 `OperatorChannelFn`** 挂起问客户——**不是第二套确认机制**（形状单一来源：
// `src/provider/pi/session.ts`）。故下表「注入替身」注入的就是**那个形状**：
//   `(prompt: OperatorPrompt) => { outcome: "allow" | "deny" | "unavailable", operatorId?, reason? }`。
// 通道缺省（未注入）→ `unavailable` → **不完成**（fail-closed）。

/** 独立重算文件 SHA-256（与 finalize/门禁引擎同一算法：原始字节 + node:crypto）——**不复用实现方断言**。 */
function independentSha256(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

test("用户入口/finalize 未确认：**未接入客户确认通道** → 提议收口但**不完成**（fail-closed），零副作用（.ans / 治理边界文档 / manifest 都不写）", async () => {
  const dir = tempRoot("finalize-no-confirm");
  const script: ToolCall[] = [
    { name: "write_file", args: { path: "角色卡/新角色/role-card.md", content: "# 角色：新角色\n由 su 据对话写出。\n" } },
    { name: "write_file", args: { path: "角色卡/新角色/boundary.yaml", content: "role: 新角色\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: t\n" } },
    { name: "write_file", args: { path: "角色卡/新角色/memo.md", content: "# 新角色 备忘录\n" } },
    // 注：su 本轮**不写**项目治理边界文档——这样才可断言「未确认 → 治理边界文档没被写」。
  ];
  const handle = await openGovernanceSession(
    // ★ **不注入** `operatorChannel`（缺省）——如实模拟「未接入客户确认通道」（无人值守）。
    { taskId: "T35-finalize-no-confirm", project: genesisProject(dir) },
    { createAdapter: (gate) => createFakeRuntimeAdapter({ gate, script, writeRoot: dir }) },
  );
  await handle.send("请据对话建出新角色");
  for await (const _ev of handle.events()) {
    /* 消费到 settled */
  }
  assert.equal(handle.settled, true, "会话应已 settle（否则 finalize 因未 settle 被拒，测不到本语义）");

  const res = await handle.finalize();
  await handle.dispose();

  // ★ 新语义：**未获客户确认 → 不完成**（fail-closed；status=unavailable 表示确认通道未接/不可用）。
  assert.equal(res.ok, false, "未获客户确认**不得**完成（旧的「被调用即完成」语义已被推翻）");
  assert.equal(res.status, "unavailable", "缺省确认通道 → unavailable（不是静默完成）");
  assert.match(
    res.message ?? "",
    /未获确认|未接入客户确认通道|fail-closed/,
    `拒绝原因应说明「收口未获客户确认」，实得：${res.message}`,
  );
  // ★ 零副作用：.ans / 治理边界文档 / manifest **都没被写**（提议挂起，未落盘）。
  assert.equal(existsSync(join(dir, ".ans")), false, "未确认不得创建 .ans/");
  assert.equal(existsSync(join(dir, ".ans", "project.json")), false, "未确认不得写 .ans/project.json");
  assert.equal(existsSync(join(dir, GOV_REL)), false, "未确认不得写治理边界文档");
  assert.equal(existsSync(join(dir, "docs", "bootstrap-manifest.md")), false, "未确认不得写 docs/bootstrap-manifest.md");
  assert.deepEqual(res.wrote, [], "未确认不得写任何文件");
});

test("用户入口/finalize 确认通过：注入 **allow 确认通道替身**（= shell 闸 (a) 的 OperatorChannelFn 形状）→ 完成（写出 治理边界文档 + .ans + manifest）；pin 与我独立重算一致；载入器验为 pin-backed accepted", async () => {
  const dir = tempRoot("finalize-confirm");
  const script: ToolCall[] = [
    { name: "write_file", args: { path: "角色卡/新角色/role-card.md", content: "# 角色：新角色\n由 su 据对话写出。\n" } },
    { name: "write_file", args: { path: "角色卡/新角色/boundary.yaml", content: "role: 新角色\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: t\n" } },
    { name: "write_file", args: { path: "角色卡/新角色/memo.md", content: "# 新角色 备忘录\n" } },
  ];
  // ★ 确认通道替身：**就是 shell 闸 (a) 的 `OperatorChannelFn` 形状**——su 提议收口时被调用，客户 allow。
  let proposed: OperatorPrompt | undefined;
  const allowChannel: OperatorChannelFn = (prompt) => {
    proposed = prompt;
    return { outcome: "allow", operatorId: "test-客户" };
  };
  const handle = await openGovernanceSession(
    { taskId: "T35-finalize-confirm", project: genesisProject(dir), operatorChannel: allowChannel },
    { createAdapter: (gate) => createFakeRuntimeAdapter({ gate, script, writeRoot: dir }) },
  );
  await handle.send("请据对话建出新角色");
  for await (const _ev of handle.events()) {
    /* 消费到 settled */
  }
  assert.equal(handle.settled, true, "会话应已 settle");
  const res = await handle.finalize();
  await handle.dispose();

  // ★ 确认通过 → 完成。
  assert.equal(res.ok, true, `确认通过后应完成：${res.status ?? ""} ${res.message ?? ""}`);
  assert.equal(res.status, "completed");
  // 提议确实是经**那条确认通道**提出的（形状与 shell 闸 (a) 同一 `OperatorPrompt`：command/argv/cwd/toolCallId）。
  assert.ok(proposed, "应经注入的确认通道提出收口提议");
  assert.equal(typeof proposed!.command, "string", "提议应带 command（OperatorPrompt 形状）");
  assert.ok(proposed!.command.length > 0, "提议应有可读文案（「su 提议：可以收口了」）");
  assert.ok(Array.isArray(proposed!.argv), "提议应带 argv（OperatorPrompt 形状）");
  assert.equal(proposed!.cwd, dir, "提议的固定 cwd 应为项目根");
  assert.equal(typeof proposed!.toolCallId, "string", "提议应带 toolCallId（审计串联）");

  const ansAbs = join(dir, ".ans", "project.json");
  const manifestAbs = join(dir, "docs", "bootstrap-manifest.md");
  const govAbs = join(dir, GOV_REL);
  assert.ok(existsSync(ansAbs), "应写出 .ans/project.json");
  assert.ok(existsSync(manifestAbs), "应写出 docs/bootstrap-manifest.md");
  // §13.2：**首次（确认通过）的 finalize 写出**项目治理边界文档（三个普通目录）。
  assert.ok(existsSync(govAbs), "确认通过后应写出治理边界文档");
  assert.equal(
    readFileSync(govAbs, "utf8"),
    renderGovernanceBoundaryDoc(),
    "治理边界文档内容应 = renderGovernanceBoundaryDoc()（角色卡//docs//.ans/ 三普通目录）",
  );

  const ans = JSON.parse(readFileSync(ansAbs, "utf8")) as {
    roles: Record<string, { card: string; boundary: string }>;
    governanceBoundary: { path: string; acceptance: { accepted: boolean; source: string; pin: { path: string; sha256: string }[] } };
  };
  assert.equal(ans.governanceBoundary.acceptance.accepted, true);
  assert.match(ans.governanceBoundary.acceptance.source, /bootstrap/, "acceptance.source 须如实记录 bootstrap");
  assert.match(ans.governanceBoundary.acceptance.source, /operator:test-客户/, "acceptance.source 应如实记录**客户确认者**（operator:<id>）");
  const pins = ans.governanceBoundary.acceptance.pin;
  assert.deepEqual(
    pins.map((p) => p.path).sort(),
    [GOV_REL, "角色卡/新角色/boundary.yaml"].sort(),
    "pin 应覆盖 项目治理边界 + 各角色 boundary.yaml",
  );

  // ★ 独立重算比对：逐条 pin 的 SHA-256 必须等于**我自己**算出的文件哈希（不信实现方断言）。
  for (const p of pins) {
    assert.equal(independentSha256(join(dir, p.path)), p.sha256.trim().toLowerCase(), `pin 与我独立重算的 SHA-256 须一致：${p.path}`);
  }

  // 留痕列出实际创建路径。
  const manifest = readFileSync(manifestAbs, "utf8");
  for (const p of ["角色卡/新角色/role-card.md", "角色卡/新角色/boundary.yaml", "角色卡/新角色/memo.md", GOV_REL, ".ans/project.json"]) {
    assert.ok(manifest.includes(p), `留痕应列出 ${p}`);
  }

  // ★ 该 `.ans` 能被**装配的载入器** `loadEffectiveConfig` 载入为 pin-backed accepted。
  const loaded = await loadEffectiveConfig({ projectRoot: dir, skillRoot: dir, fallback: genesisProject(dir) });
  assert.equal(loaded.source.kind, "ans", "应识别为 .ans 配置");
  assert.equal(loaded.source.acceptance.accepted, true, "载入器应把该 .ans 验为 accepted");
  assert.ok((loaded.source.pinPaths ?? []).length >= 2, "载入器应看到 pin-backed 证据");
  // 且角色边界经 pin 校验后可解析（verifyPins 通过，无 parseError）。
  const role = await resolveRole("新角色", loaded.project);
  assert.equal(role.boundary.acceptance.accepted, true, "角色边界应 accepted（pin 校验通过）");
  assert.equal(role.boundary.parseError, undefined, `角色边界不应有 parseError：${role.boundary.parseError}`);
});

// —————————————————————— 7) finalize 不绕门（负例）：拿掉授权 → 被拒且零副作用 ————————————

test("用户入口/finalize 负例：**把授权拿掉** → finalize 被门禁拒绝且零副作用（不凭代码身份绕门）", async () => {
  const dir = tempRoot("finalize-deny");
  // 项目治理边界文档存在且可解析，但 **acceptance 未接受**（授权被拿掉）——finalize 的两笔写须被 F6 拒。
  mkdirSync(join(dir, "角色卡"), { recursive: true });
  writeFileSync(join(dir, GOV_REL), ["role: 治理边界", "entries:", "  - kind: directory", "    path: docs/", "    root: project", "    purpose: x", ""].join("\n"), "utf8");
  const unaccepted: ProjectConfig = {
    projectRoot: dir,
    skillRoot: dir,
    roles: {},
    governanceBoundary: { path: GOV_REL, acceptance: { accepted: false, source: "" } },
  };

  // 桩会话：立即 settle（无真实模型），只为让 finalize 的前置守卫（须已 settle）通过。
  const immediateSettle = (): RuntimeAdapter => ({
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole() {
      return {
        async prompt(): Promise<void> {},
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            yield { kind: "settled", summary: "完成" } as const;
          })();
        },
        async dispose(): Promise<void> {},
      };
    },
  });

  const handle = await openGovernanceSession({ taskId: "T35-finalize-deny", project: unaccepted }, { createAdapter: immediateSettle });
  await handle.send("（桩会话，立即 settle）");
  for await (const _ev of handle.events()) {
    /* 消费到 settled */
  }
  assert.equal(handle.settled, true);

  const res = await handle.finalize();
  assert.equal(res.ok, false, "授权被拿掉后 finalize 必须被拒");
  assert.match(res.reason ?? "", /门禁拒绝|未被接受|F6/, `拒绝原因应说明门禁判定，实得：${res.reason}`);
  // 零副作用：不建 .ans/、不建任何文件。
  assert.equal(existsSync(join(dir, ".ans")), false, "被拒不得创建 .ans/");
  assert.deepEqual(res.wrote, [], "被拒不得写任何文件");
  await handle.dispose();
});
