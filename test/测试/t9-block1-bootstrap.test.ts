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
// 「su **真的据对话**决定并建出哪些角色」需**真实模型轮次**（凭据 + 已配置 provider；`ANS_PI_CONTEXT_WINDOW` **可选**），
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
import { listProject, resolveRole, type ProjectListing } from "../../src/service/role/resolve-role.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { resolveBoundarySection, builtInBoundarySection, BUILT_IN_ROLE_CARD_TEXT } from "../../src/common/门禁引擎/boundary-core.ts";
import { sha256File } from "../../src/common/门禁引擎/io.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { renderGovernanceBoundaryDoc, repinIfBootstrapped } from "../../src/common/编排/finalize.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { OpenResult } from "../../app/desktop/session.ts";
import type { CustomerInputFn, CustomerInputRequest, ToolCall, WriteGate } from "../../src/provider/pi/session.ts";

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

/** 创世项目（空文件夹 + 操作者发起的 bootstrap）：**不预建任何东西**，也不预置治理边界。
 *  2026-10-17 三权 V1 后，su 创世属于**旧 single 模型**（新空项目默认 trio）——本文件显式 single
 *  以钉住「旧项目逐字兼容」；trio 新项目的创世/默认见 `test/测试/governance-trio-verify/`。 */
function genesisProject(target: string): ProjectConfig {
  return {
    projectRoot: target,
    skillRoot: target,
    roles: {},
    governanceModel: "single",
    genesisBootstrap: { source: "test:T35 操作者导入空文件夹并开启 su 对话=发起 bootstrap（操作者指令）" },
  };
}

/** 「客户跑」的手工验步骤（本机不可自动验收，如实写明）。 */
export const CLIENT_MANUAL_STEPS = [
  "① 桌面导入一个**空文件夹**（无 角色卡/、无 .ans/）→ 左树应显示 su、并提示「项目尚未 bootstrap」。",
  "② 在 .env 配置真实 provider：ANS_PI_BASE_URL / ANS_PI_MODEL（必填）+ ANTHROPIC_AUTH_TOKEN；ANS_PI_CONTEXT_WINDOW 可选（留空 = 用系统默认 500000，缺失不报错）。",
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

/** 桌面链取 gate：2026-10-17 后 su 只存在于**显式 single** 的旧项目——注入 `listProjectFn`
 *  返回「旧 single 项目」的枚举形态（内置 su + 既有项目角色；模型显式 single），仍交给真实
 *  `buildProjectConfig`/`openRoleSession` 装配 gate。新空项目默认 trio 由独立套件覆盖。 */
async function openSuViaDesktop(dir: string): Promise<DesktopGateCapture> {
  let gate: WriteGate | undefined;
  let project: ProjectConfig | undefined;
  const singleListing = async (root: string): Promise<ProjectListing> => {
    const real = await listProject(root);
    return {
      ...real,
      governanceModel: "single",
      primaryRoleId: "su",
      roles: [
        {
          roleId: "su",
          cardPath: "",
          boundaryPath: "",
          cardText: BUILT_IN_ROLE_CARD_TEXT,
          boundary: builtInBoundarySection(),
          builtIn: true,
        },
        ...real.roles.filter((r) => r.builtIn !== true),
      ],
    };
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => dir,
    emitEvent: () => {},
    listProjectFn: singleListing,
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

test("用户入口/空文件夹：IPC listProject 不抛错，新空项目默认三权（5 内置 / liaison 主入口）", async () => {
  const dir = tempRoot("empty");
  const iface = createDesktopInterface({ pickDirectory: async () => dir, emitEvent: () => {} });
  const listing = await iface.listProject({ projectRoot: dir });

  assert.equal(listing.hasRoles, false, "空项目应 hasRoles:false（尚未 bootstrap）");
  // 2026-10-18 客户拍板「三权不变、五角色」：新增主理 Lead 默认入口与验收 Proof。
  assert.equal(listing.governanceModel, "trio", "新空项目默认 trio（评审 §5.4）");
  assert.equal(listing.primaryRoleId, "liaison", "primaryRoleId 应是主入口 liaison（由门禁引擎给出）");
  assert.deepEqual(
    listing.roles.map((r) => r.roleId),
    ["liaison", "rapporteur", "nominator", "convener", "verifier"],
    "空项目 roles 恰含五个内置治理角色（顺序固定）",
  );
  for (const r of listing.roles) {
    assert.equal(r.builtIn, true);
    assert.ok(r.cardText.length > 0, "内置治理角色应带角色说明（无角色卡文件，由引擎合成）");
  }
  assert.deepEqual(
    listing.roles.map((r) => r.governanceFunction),
    ["liaison", "proposal", "nomination", "schedule", "verification"],
    "治理职能原样透传（渲染侧不硬编码 id）",
  );
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
  // 创世态：内置角色**不再带** `readOnly` 字段——客户 2026-10-11 裁定移除「只读」徽标（它偏离了
  // 「门禁静默执行、拒绝内联显示在聊天流里」的原模型；内置角色本就一直能聊天/写治理产物）。
  // 留**反向守卫**（断言该字段**不存在**）而非删行：它不会再长回来。
  for (const r of listing.roles) {
    assert.equal("readOnly" in r, false, "内置角色不应再带 readOnly 字段（只读徽标已移除）");
  }
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

// —————————————————————— 6) 客户确认制 + 自动收尾（2026-10-12 A-3/A-4 新语义）————————————
//
// ── 为何本节按**新语义**断言（客户 2026-10-12 批准设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` A 组）──
// 客户裁定：**删掉「收口」**（原话：「客户确定了才加，不要有个收口，收口去掉」）——「su 提议收口 →
// 客户确认 → 完成」这套旧面（句柄 `finalize()`/`settled`、`operatorChannel` 注入、`finalize_bootstrap`
// 工具）**已全部删除**。新语义两层：
//   · **确认在写入之前**（A-1/A-3）：su 先经 `request_confirmation` 工具（客户通道 = 契约家
//     `CustomerInputFn`）取得 `confirmed:true`；编排把**预览文本里列出且校验在边界内**的路径发行进
//     本次会话 writeSet，**F4 拒掉一切未确认路径**（未获同意 → 不落盘，fail-closed）；
//   · **自动收尾**（A-4）：每轮 su settle 后自动写 `.ans`(pin) + `角色卡/governance-boundary.yaml` +
//     `docs/bootstrap-manifest.md`（无可 pin 之物 → 零副作用）。`acceptance.source` = **会话边界来源**
//     （创世指令本身）——旧断言「source 含 operator:<id>」随证据模型变更被**替代**为「等于创世来源」
//     （确认的审计在工具事件里，不在 `.ans`；这是钉住批准后的新证据模型，不是删断言）。
//
// 旧三条用例按此改写为三条（**原有断言逐条保留或按新面等价替代，未放宽**）：
//   ① **未获同意**（客户拒绝 / 通道不可用）→ 确认请求如实回报，后续写入被 F4 拒、零副作用；
//   ② **确认通过** → 写入真落盘并经自动收尾转正（治理边界文档 + .ans + manifest；pin 独立重算一致）；
//   ③ **授权拿掉**（边界未接受）→ F6 拒一切、自动收尾被门禁拒（不凭代码身份绕门）。

/** 独立重算文件 SHA-256（与 finalize/门禁引擎同一算法：原始字节 + node:crypto）——**不复用实现方断言**。 */
function independentSha256(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

/** 确认预览文本：列出将写出的具体路径（A-3 的路径发行以预览文本为准）。 */
function confirmPreview(): string {
  return [
    "将创建角色 新角色，写出以下文件：",
    "角色卡/新角色/role-card.md",
    "角色卡/新角色/boundary.yaml",
    "角色卡/新角色/memo.md",
  ].join("\n");
}

/** su 的动作脚本：**先经客户确认，再写盘**（新语义下的标准流程）。 */
function roleScaffoldScript(): ToolCall[] {
  return [
    { name: "request_confirmation", args: { title: "创建角色 新角色（预览）", preview: confirmPreview() } },
    { name: "write_file", args: { path: "角色卡/新角色/role-card.md", content: "# 角色：新角色\n由 su 据对话写出。\n" } },
    {
      name: "write_file",
      args: { path: "角色卡/新角色/boundary.yaml", content: "role: 新角色\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: t\n" },
    },
    { name: "write_file", args: { path: "角色卡/新角色/memo.md", content: "# 新角色 备忘录\n" } },
  ];
}

/** 计次客户通道：记录调用次数（「未获同意」必须是**问过之后**的裁决，不是「没问」）。 */
function countingChannel(inner: CustomerInputFn): { channel: CustomerInputFn; calls: () => number } {
  let n = 0;
  return { calls: () => n, channel: (req) => { n++; return inner(req); } };
}

test("用户入口/确认制未获同意：客户**拒绝** / 通道**不可用** → 未确认路径被 F4 拒、零副作用（.ans / 治理边界文档 / manifest 都不写）", async () => {
  const scenarios: Array<[string, CustomerInputFn]> = [
    ["declined", () => ({ outcome: "declined", operatorId: "test-客户", reason: "测试：客户拒绝" })],
    ["unavailable", () => ({ outcome: "unavailable", reason: "测试：无人值守（等价 stdin EOF）" })],
  ];
  for (const [tag, inner] of scenarios) {
    const dir = tempRoot(`confirm-${tag}`);
    const { channel, calls } = countingChannel(inner);
    const toolSummaries: string[] = [];
    const handle = await openGovernanceSession(
      // ★ 注入**原始**客户通道（拒绝/不可用）——编排在其外再包「确认 → 发行 writeSet」的发行器。
      { taskId: `T35-confirm-${tag}`, project: genesisProject(dir), customerInput: channel },
      {
        createAdapter: (gate, caps) =>
          createFakeRuntimeAdapter({ gate, script: roleScaffoldScript(), writeRoot: dir, customerInput: caps?.customerInput }),
      },
    );
    await handle.send("请据对话建出新角色（须先经客户确认）");
    for await (const ev of handle.events()) {
      if (ev.kind === "tool_call" || ev.kind === "accepted" || ev.kind === "denied") {
        toolSummaries.push(`${ev.kind}: ${ev.summary}`);
      }
    }
    await handle.dispose();

    // ★「未获同意」必须是**问过之后**的裁决：su 真发起过确认请求（恰一次），不是没问。
    assert.equal(calls(), 1, `${tag}：su 应恰好发起过一次客户确认`);
    // ★ 未获同意 → 不得有任何写入获准；确认请求如实回报；后续写入被 F4 拒（未确认路径不发行）。
    assert.ok(!toolSummaries.some((s) => s.startsWith("accepted:")), `${tag}：未获同意时不得有任何写入获准：${toolSummaries.join(" | ")}`);
    assert.ok(toolSummaries.some((s) => /未获客户同意/.test(s)), `${tag}：确认请求应如实回报「未获客户同意」：${toolSummaries.join(" | ")}`);
    assert.ok(toolSummaries.some((s) => /F4/.test(s)), `${tag}：后续写入应被 F4 拒：${toolSummaries.join(" | ")}`);
    // ★ 零副作用：角色三件套、.ans、治理边界文档、manifest **都没被写**。
    assert.equal(existsSync(join(dir, "角色卡", "新角色")), false, `${tag}：未确认不得写出角色文件`);
    assert.equal(existsSync(join(dir, ".ans")), false, `${tag}：未确认不得创建 .ans/`);
    assert.equal(existsSync(join(dir, ".ans", "project.json")), false, `${tag}：未确认不得写 .ans/project.json`);
    assert.equal(existsSync(join(dir, GOV_REL)), false, `${tag}：未确认不得写治理边界文档`);
    assert.equal(existsSync(join(dir, "docs", "bootstrap-manifest.md")), false, `${tag}：未确认不得写 docs/bootstrap-manifest.md`);
  }
});

test("用户入口/确认制确认通过：su 先经 request_confirmation 预览并获确认 → 写入真落盘并经**自动收尾**转正（治理边界文档 + .ans + manifest）；pin 与我独立重算一致；载入器验为 pin-backed accepted", async () => {
  const dir = tempRoot("confirm-allow");
  // ★ 确认通道替身 = 契约家 `CustomerInputFn` 形状：客户**恰好确认**，并记录被问到的请求。
  let seenReq: CustomerInputRequest | undefined;
  const { channel, calls } = countingChannel(() => ({
    outcome: "answered",
    value: { confirmed: true },
    operatorId: "test-客户",
  }));
  const recording: CustomerInputFn = (req) => {
    seenReq = req;
    return channel(req);
  };
  const handle = await openGovernanceSession(
    { taskId: "T35-confirm-allow", project: genesisProject(dir), customerInput: recording },
    {
      createAdapter: (gate, caps) =>
        createFakeRuntimeAdapter({ gate, script: roleScaffoldScript(), writeRoot: dir, customerInput: caps?.customerInput }),
    },
  );
  await handle.send("请据对话建出新角色（先经客户确认）");
  for await (const _ev of handle.events()) {
    /* 消费到 settled（其间的自动收尾已在事件流内完成） */
  }
  await handle.dispose();

  // ★ 确认先于写盘：通道恰被调用一次，且预览列出了将写出的路径（A-1/A-3 的发行依据）。
  assert.equal(calls(), 1, "应恰发起一次客户确认");
  assert.ok(seenReq, "应捕获到确认请求");
  assert.equal(seenReq!.kind, "confirm", "应以 confirm 型请求征询客户");
  assert.ok(seenReq!.title.includes("新角色"), `确认标题应点名预览对象，实得：${seenReq!.title}`);
  for (const p of ["角色卡/新角色/role-card.md", "角色卡/新角色/boundary.yaml", "角色卡/新角色/memo.md"]) {
    assert.ok((seenReq!.preview ?? "").includes(p), `预览应列出将写出的路径 ${p}`);
  }

  // ★ 确认后的写入**真落盘**（字节相等）。
  const cardAbs = join(dir, "角色卡", "新角色", "role-card.md");
  assert.ok(existsSync(cardAbs), "确认后角色文件应真实落盘");
  assert.equal(readFileSync(cardAbs, "utf8"), "# 角色：新角色\n由 su 据对话写出。\n", "落盘内容须与所写字节相等");

  // ★ 自动收尾（A-4）：settle 后写出 治理边界文档 + .ans + manifest。
  const ansAbs = join(dir, ".ans", "project.json");
  const manifestAbs = join(dir, "docs", "bootstrap-manifest.md");
  const govAbs = join(dir, GOV_REL);
  assert.ok(existsSync(govAbs), "自动收尾应写出治理边界文档");
  assert.equal(
    readFileSync(govAbs, "utf8"),
    renderGovernanceBoundaryDoc(),
    "治理边界文档内容应 = renderGovernanceBoundaryDoc()（角色卡//docs//.ans/ 三普通目录）",
  );
  assert.ok(existsSync(ansAbs), "自动收尾应写出 .ans/project.json");
  assert.ok(existsSync(manifestAbs), "自动收尾应写出 docs/bootstrap-manifest.md");

  const ans = JSON.parse(readFileSync(ansAbs, "utf8")) as {
    roles: Record<string, { card: string; boundary: string }>;
    governanceBoundary: { path: string; acceptance: { accepted: boolean; source: string; pin: { path: string; sha256: string }[] } };
  };
  assert.equal(ans.governanceBoundary.acceptance.accepted, true);
  assert.match(ans.governanceBoundary.acceptance.source, /bootstrap/, "acceptance.source 须如实记录 bootstrap 来源");
  // ★ A-4 证据模型：`.ans` 的接受来源 = **会话边界来源**（创世指令本身）。客户确认发生在**每笔写入
  // 之前**（request_confirmation + F4 发行），operatorId 记录在工具事件里、不在 `.ans`——故此处按
  // 新语义断言**逐字等于**创世来源（比旧的 /operator:<id>/ 更严：钉住它就是那一串来源本身）。
  assert.equal(
    ans.governanceBoundary.acceptance.source,
    genesisProject(dir).genesisBootstrap!.source,
    "acceptance.source 应逐字等于会话边界（创世指令）的来源",
  );
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

// —————————————————————— 7) 自动收尾不绕门（负例）：拿掉授权 → 被拒且零副作用 ————————————

test("用户入口/收尾负例：**把授权拿掉**（边界未接受）→ su 写入被 F6 拒、自动收尾被门禁拒且零副作用（不凭代码身份绕门）", async () => {
  const dir = tempRoot("finalize-deny");
  // 项目治理边界文档存在且可解析，但 **acceptance 未接受**（授权被拿掉）——su 的写入与自动收尾的两笔写须被 F6 拒。
  mkdirSync(join(dir, "角色卡"), { recursive: true });
  writeFileSync(join(dir, GOV_REL), ["role: 治理边界", "entries:", "  - kind: directory", "    path: docs/", "    root: project", "    purpose: x", ""].join("\n"), "utf8");
  const unaccepted: ProjectConfig = {
    projectRoot: dir,
    skillRoot: dir,
    roles: {},
    // 旧 single 模型（本用例验 su 收尾不绕门；新空项目默认 trio，走独立套件）。
    governanceModel: "single",
    governanceBoundary: { path: GOV_REL, acceptance: { accepted: false, source: "" } },
  };

  // 会话：su 尝试写角色文件（应被 F6 拒）；settle 时自动收尾也应被门禁拒（零副作用）。
  const script: ToolCall[] = [{ name: "write_file", args: { path: "角色卡/新角色/role-card.md", content: "# 角色：新角色\n" } }];
  const deniedSummaries: string[] = [];
  const handle = await openGovernanceSession(
    { taskId: "T35-finalize-deny", project: unaccepted },
    { createAdapter: (gate) => createFakeRuntimeAdapter({ gate, script, writeRoot: dir }) },
  );
  await handle.send("（授权被拿掉：一切写应被拒）");
  for await (const ev of handle.events()) {
    if (ev.kind === "denied") deniedSummaries.push(ev.summary);
  }
  await handle.dispose();

  // ★ 授权被拿掉 → F6 拒一切（su 的写入不得落盘）。
  assert.ok(
    deniedSummaries.some((s) => /F6|未被接受/.test(s)),
    `su 写入应被 F6 拒，实得：${deniedSummaries.join(" | ")}`,
  );
  assert.equal(existsSync(join(dir, "角色卡", "新角色")), false, "F6 拒一切：角色目录不得出现");
  assert.equal(existsSync(join(dir, ".ans")), false, "授权被拿掉：自动收尾不得创建 .ans/");

  // ★ 自动收尾**本体**被门禁拒（与会话 settle 时调用的是同一函数 `repinIfBootstrapped`）：
  //   结果如实报「被门禁拒绝」，且零副作用——不凭代码身份绕门。
  const boundary = (await resolveRole("su", unaccepted)).boundary;
  const res = await repinIfBootstrapped({ projectRoot: dir, skillRoot: dir, boundary, governanceBoundaryPath: GOV_REL });
  assert.ok(res, "创世态（无 .ans）下应返回收尾结果");
  assert.equal(res!.ok, false, "授权被拿掉后自动收尾必须被拒");
  assert.equal(res!.status, "blocked", "应为门禁拒绝（blocked），不是静默完成");
  assert.match(res!.message ?? "", /门禁拒绝|未被接受|F6/, `拒绝原因应说明门禁判定，实得：${res!.message}`);
  // 零副作用：不建 .ans/、不建任何文件。
  assert.equal(existsSync(join(dir, ".ans")), false, "被拒不得创建 .ans/");
  assert.deepEqual(res!.wrote, [], "被拒不得写任何文件");
});
