// test/编排/confirmation-gated.test.ts
// 编排角色自测：**客户确认制收窄（A-3）+ CLI 终端映射（A-5）+ 自动收尾联动（A-4）**
// ——设计稿 `角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md` A 组。
//
// 机制（本文件钉死）：`customerInput` 给定时，会话 writeSet 从**空**开始——只有「经 request_confirmation
// 预览、且客户 confirmed:true」的路径会被发行进 writeSet（编排侧真状态，模型无法重算），
// 写入照旧经 gate：**F4 拒掉一切未确认路径**（resolve-write.ts 的精确 writeSet 语义）。
// 客户同意并写入后，settle 触发的**自动收尾**写出 `.ans` + 治理边界文档 + manifest。
//
// 覆盖：
//   ① 未确认（脚本直接 write）→ F4 拒、不落盘、零收尾（gate 直断言的拒绝理由含 writeSet）；
//   ② 确认（预览列出路径）→ 写入落盘 + 自动收尾三产物（pin 一致、来源 = 创世授权）；
//   ③ 确认被拒 / 通道不可用 → 不发行 → 写被拒、零收尾（fail-closed）；
//   ④ 发行**精确性**：预览只列一部分 → 只那些可写（其余被拒；不足成角色 → 无物可 pin、不转正）；
//   ⑤ 预览含**越界路径**（src/）→ 不发行 → 越界写被拒（写集有界）；
//   ⑥ gate 直断言：确认后已发行路径放行、未发行路径被拒；
//   ⑥b su 预授权写目录（客户裁定 2026-10-16）：docs/su/**、docs/contracts/** 与 docs/skills/**
//      （第三棵＝G-4 角色能力安装 V1 裁定扩列）与 docs/mcp/**（第四棵＝G-4 V2 裁定扩列，
//      2026-10-16 批准）是**初始 writeSet**的一部分——不经 request_confirmation 直接落盘（客户
//      通道零调用）；docs/ 其它路径与 角色卡/ 未确认仍被 F4 拒、零副作用。
//   ⑦ `request_choice` 的勾选经通道回传（多选，transcript 含「客户已选择」）；
//   ⑧ CLI 终端映射单元：`parseChoiceInput`（单选 `1`、多选 `1,3`、非法/重复/越界 → 拒）、
//      `createCliCustomerInput`（y/n/空/EOF）、`formatCustomerInputPrompt`、`extractPathCandidates`。
//
// 【已登记残余漏洞（客户 2026-10-12 明确不采纳 O-A1）】本机制保证「**路径**已预览且已确认」；
// 「预览内容 ≠ 写出内容」的内容漂移**关不住**——不做内容比对（如实登记，不实现）。
//
// 全部用系统临时目录，用后清理；全程假适配器，不发任何模型请求。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { governCommand } from "../../src/interface/cli/govern.ts";
import { runGovernSession } from "../../src/pipeline/orchestration/govern-session.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { EXIT_OK } from "../../src/common/编排/exit-codes.ts";
import {
  createCliCustomerInput,
  formatCustomerInputPrompt,
  parseChoiceInput,
} from "../../src/common/编排/operator-channel.ts";
import { extractPathCandidates } from "../../src/common/编排/confirmed-writes.ts";
import type { GovernDeps } from "../../src/interface/cli/govern.ts";
import type { ConfigSource } from "../../src/common/装配/config-loader.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  CustomerInputOption,
  CustomerInputRequest,
  ToolCall,
  WriteGate,
} from "../../src/provider/pi/session.ts";

const GOV_REL = "角色卡/governance-boundary.yaml";
const ANS_REL = ".ans/project.json";
const MANIFEST_REL = "docs/bootstrap-manifest.md";
const GENESIS_SOURCE =
  "cli:ans govern <目录> = 操作者发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）";
/** 预览文本：把**将要写出的具体路径**列出（发行从呈现文本里提取——粗体/反引号包裹都能提取）。 */
const PREVIEW_X =
  "# 角色：边界守门员 X\n\n职责：……\n\n" +
  "**将写出**：`角色卡/X/role-card.md`、`角色卡/X/boundary.yaml`、`角色卡/X/memo.md`";

/** 新建临时根，用后清理。 */
async function withTarget<T>(fn: (ctx: { root: string; target: string }) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-confirm-"));
  try {
    return await fn({ root, target: join(root, "proj") });
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

/** 创世态 project（= 装配 M1+O1 注入形态）：roles 空、gov.path 空串、genesisBootstrap 在。
 *  W2 起显式钉 `governanceModel: "single"`：本文件验证的是旧 su 创世路径（trio 的空项目缺省不在此列）。 */
function genesisProject(target: string): ProjectConfig {
  return {
    projectRoot: target,
    skillRoot: target,
    roles: {},
    governanceModel: "single",
    governanceBoundary: { path: "", acceptance: { accepted: true, source: "test:DEMO" } },
    genesisBootstrap: { source: GENESIS_SOURCE },
  };
}

function configSourceFor(project: ProjectConfig): ConfigSource {
  return {
    kind: "builtin-fallback",
    path: join(project.projectRoot, ".ans", "project.json"),
    acceptance: project.governanceBoundary?.acceptance ?? { accepted: false, source: "" },
    pinPaths: [],
  };
}

/** 构造 governCommand 的 deps（假适配器 + 可选客户通道 + 可选 gate 捕获）。
 *  注意：确认制下客户通道经**能力面**（`capabilities.customerInput`）转交给适配器——自定义工厂必须
 *  像 `createPiAdapterFactory` 那样把 caps 送进去（否则 `request_confirmation` 不注册）。 */
function depsFor(
  project: ProjectConfig,
  script: ToolCall[],
  opts: { customerInput?: CustomerInputFn; captureGate?: (g: WriteGate) => void } = {},
): GovernDeps {
  return {
    project,
    configSource: configSourceFor(project),
    createAdapter: (gate: WriteGate, caps?: AdapterCapabilities) => {
      opts.captureGate?.(gate);
      return createFakeRuntimeAdapter({
        gate,
        script,
        writeRoot: project.projectRoot,
        customerInput: caps?.customerInput,
      });
    },
    ...(opts.customerInput !== undefined ? { customerInput: opts.customerInput } : {}),
  };
}

/** 恒「同意」客户通道（confirm → confirmed:true；choice → 空选择）。 */
const confirmAllow: CustomerInputFn = (req) =>
  req.kind === "confirm"
    ? { outcome: "answered", value: { confirmed: true }, operatorId: "test-客户" }
    : { outcome: "answered", value: { selected: [] }, operatorId: "test-客户" };
/** 恒「拒绝」客户通道。 */
const confirmDecline: CustomerInputFn = () => ({ outcome: "declined", operatorId: "test-客户", reason: "不同意" });
/** 恒「不可用」客户通道（无人值守等价）。 */
const inputUnavailable: CustomerInputFn = () => ({ outcome: "unavailable", reason: "无人值守" });

const WRITE_SCRIPT: ToolCall[] = [
  { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n" } },
  { name: "write_file", args: { path: "角色卡/X/boundary.yaml", content: "role: X\nentries: []\n" } },
  { name: "write_file", args: { path: "角色卡/X/memo.md", content: "# X 备忘录\n" } },
];
/** su 的标准动作序列：先预览确认，再写三件套。 */
const CONFIRM_THEN_WRITE: ToolCall[] = [
  { name: "request_confirmation", args: { title: "创建角色 X（请预览）", preview: PREVIEW_X } },
  ...WRITE_SCRIPT,
];

// ————————— ① 未确认 → F4 拒（不落盘、零收尾） —————————

test("未确认：脚本直接 write（没有 request_confirmation）→ F4 拒、不落盘、零收尾", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    let gate!: WriteGate;
    // 不注入 customerInput ⇒ runGovernSession 补 CLI 默认通道——但脚本里没有 request_confirmation，
    // 通道不会被调用；写入仍被 F4 拒（writeSet 空）。这同时证明「缺省 CLI 前端 = 确认制」。
    const code = await governCommand(["govern", target], depsFor(genesisProject(target), WRITE_SCRIPT, {
      captureGate: (g) => (gate = g),
    }));
    assert.equal(code, EXIT_OK);
    assert.equal(existsSync(join(target, "角色卡", "X", "role-card.md")), false, "未确认路径不得落盘");
    assert.equal(existsSync(join(target, "角色卡")), false, "拒绝不得建目录（零副作用）");
    assert.equal(existsSync(join(target, ANS_REL)), false, "无写入 → 无可 pin 之物 → 不转正");
    const d = gate("角色卡/X/role-card.md");
    assert.equal(d.allowed, false, "F4：未确认路径被拒");
    assert.match((d as { reason: string }).reason, /writeSet/, "拒绝理由应指明 writeSet 收窄（F4）");
  });
});

// ————————— ② 确认 → 落盘 + 自动收尾 —————————

test("确认：预览列出路径 + 客户同意 → 写入落盘 + 自动收尾（.ans/治理边界文档/manifest）", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const code = await governCommand(["govern", target], depsFor(genesisProject(target), CONFIRM_THEN_WRITE, {
      customerInput: confirmAllow,
    }));
    assert.equal(code, EXIT_OK);
    for (const rel of ["角色卡/X/role-card.md", "角色卡/X/boundary.yaml", "角色卡/X/memo.md"]) {
      assert.ok(existsSync(join(target, rel)), `${rel} 应落盘（路径已被确认发行）`);
    }
    for (const rel of [ANS_REL, GOV_REL, MANIFEST_REL]) {
      assert.ok(existsSync(join(target, rel)), `自动收尾应写出 ${rel}`);
    }
    const ans = JSON.parse(readFileSync(join(target, ANS_REL), "utf8")) as {
      roles?: Record<string, unknown>;
      governanceBoundary?: { path?: string; acceptance?: { accepted?: boolean; source?: string; pin?: unknown[] } };
    };
    assert.equal(ans.governanceBoundary?.path, GOV_REL);
    assert.equal(ans.governanceBoundary?.acceptance?.accepted, true);
    assert.equal(ans.governanceBoundary?.acceptance?.source, GENESIS_SOURCE, "来源 = 创世授权来源（无独立收口确认）");
    assert.ok((ans.governanceBoundary?.acceptance?.pin?.length ?? 0) >= 2, "pin 应覆盖治理边界文档 + 角色边界");
    assert.ok(ans.roles?.["X"] !== undefined, "roles 应含 X");
  });
});

// ————————— ③ 拒绝 / 通道不可用 → 不发行（fail-closed） —————————

test("确认被拒：客户 declined → 不发行 → 写被拒、零收尾", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const code = await governCommand(["govern", target], depsFor(genesisProject(target), CONFIRM_THEN_WRITE, {
      customerInput: confirmDecline,
    }));
    assert.equal(code, EXIT_OK);
    assert.equal(existsSync(join(target, "角色卡")), false, "拒绝 → 不发行 → 全部写入被拒（零副作用）");
    assert.equal(existsSync(join(target, ANS_REL)), false, "拒绝 → 不转正");
  });
});

test("通道不可用（无人值守等价）：不发行 → 写被拒、零收尾", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const code = await governCommand(["govern", target], depsFor(genesisProject(target), CONFIRM_THEN_WRITE, {
      customerInput: inputUnavailable,
    }));
    assert.equal(code, EXIT_OK);
    assert.equal(existsSync(join(target, "角色卡")), false, "不可用 → 不发行（fail-closed）");
    assert.equal(existsSync(join(target, ANS_REL)), false);
  });
});

// ————————— ④ 发行精确性：预览只列一部分 → 只那些可写 —————————

test("发行精确性：预览只列出 role-card.md → boundary.yaml 仍被拒（精确集合，不扩权）", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const script: ToolCall[] = [
      {
        name: "request_confirmation",
        args: { title: "创建角色 X", preview: "将写出：`角色卡/X/role-card.md`（仅此一个文件）" },
      },
      ...WRITE_SCRIPT,
    ];
    const code = await governCommand(["govern", target], depsFor(genesisProject(target), script, {
      customerInput: confirmAllow,
    }));
    assert.equal(code, EXIT_OK);
    assert.ok(existsSync(join(target, "角色卡", "X", "role-card.md")), "已预览确认的路径应可写");
    assert.equal(existsSync(join(target, "角色卡", "X", "boundary.yaml")), false, "未预览的路径仍被 F4 拒");
    // 角色不完整（缺 boundary.yaml）→ 收尾扫描不到角色 → 无可 pin 之物 → 不转正（fail-closed）。
    assert.equal(existsSync(join(target, ANS_REL)), false, "不足成角色 → 无物可 pin → 不转正");
  });
});

// ————————— ⑤ 预览含越界路径 → 不发行 —————————

test("越界不发行：预览里的 src/ 路径被校验拒绝（写集有界，非 blanket）", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const script: ToolCall[] = [
      {
        name: "request_confirmation",
        args: {
          title: "创建角色 X（另附一份草稿文件）",
          preview: "将写出：`角色卡/X/role-card.md`；另：`src/evil.ts`",
        },
      },
      { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n" } },
      { name: "write_file", args: { path: "src/evil.ts", content: "// 越界\n" } },
    ];
    const code = await governCommand(["govern", target], depsFor(genesisProject(target), script, {
      customerInput: confirmAllow,
    }));
    assert.equal(code, EXIT_OK);
    assert.ok(existsSync(join(target, "角色卡", "X", "role-card.md")), "边界内路径照常发行");
    assert.equal(existsSync(join(target, "src")), false, "越界路径不发行、不落盘（且不得建目录）");
  });
});

// ————————— ⑥ gate 直断言：发行前后 —————————

test("gate 直断言：确认后已发行路径放行、未发行路径（同目录其它文件）仍拒", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    let gate!: WriteGate;
    await runGovernSession(
      { taskId: "T-CONF", project: genesisProject(target), customerInput: confirmAllow },
      {
        createAdapter: (g: WriteGate, caps?: AdapterCapabilities) => {
          gate = g;
          return createFakeRuntimeAdapter({ gate: g, script: CONFIRM_THEN_WRITE, writeRoot: target, customerInput: caps?.customerInput });
        },
      },
    );
    assert.equal(gate("角色卡/X/role-card.md").allowed, true, "已确认发行的路径放行");
    assert.equal(gate("角色卡/X/memo.md").allowed, true);
    const other = gate("角色卡/X/role-cards.md");
    assert.equal(other.allowed, false, "F4 为精确集合：未确认的同目录其它文件仍拒");
    assert.match((other as { reason: string }).reason, /writeSet/);
  });
});

// ————————— ⑥b su 预授权写目录（客户裁定 2026-10-16） —————————

test("su 预授权：docs/su/**、docs/contracts/**、docs/skills/** 与 docs/mcp/** **不经 request_confirmation** 直接落盘；docs/ 其它与 角色卡/ 未确认仍被 F4 拒", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    // 脚本**不发** request_confirmation：预授权 = 初始 writeSet 的一部分（不属「经确认发行的写权」）。
    const script: ToolCall[] = [
      { name: "write_file", args: { path: "docs/su/memo.md", content: "# su 备忘录（免确认）\n" } },
      { name: "write_file", args: { path: "docs/contracts/api-v1.md", content: "# 契约（免确认）\n" } },
      { name: "write_file", args: { path: "docs/skills/t1/install.md", content: "# 安装登记：t1（免确认）\n" } },
      { name: "write_file", args: { path: "docs/skills/t1/SKILL.md", content: "# 技能：t1（免确认）\n" } },
      { name: "write_file", args: { path: "docs/mcp/echo.md", content: "# MCP 声明：echo（免确认）\n" } },
      { name: "write_file", args: { path: "docs/mcp/sub/deep.md", content: "# MCP 声明子树（免确认）\n" } },
      { name: "write_file", args: { path: "docs/其他.md", content: "应被 F4 拒\n" } },
      { name: "write_file", args: { path: "角色卡/Y/role-card.md", content: "应被 F4 拒\n" } },
    ];
    const asked: CustomerInputRequest[] = [];
    const shouldNotBeAsked: CustomerInputFn = (req) => {
      asked.push(req);
      return { outcome: "unavailable", reason: "本测试不应发起确认" };
    };
    const code = await governCommand(["govern", target], depsFor(genesisProject(target), script, {
      customerInput: shouldNotBeAsked,
    }));
    assert.equal(code, EXIT_OK);
    assert.equal(asked.length, 0, "预授权写入无需确认（客户通道零调用）");
    assert.ok(existsSync(join(target, "docs", "su", "memo.md")), "docs/su/memo.md 免确认落盘");
    assert.ok(existsSync(join(target, "docs", "contracts", "api-v1.md")), "docs/contracts/** 免确认落盘");
    assert.ok(existsSync(join(target, "docs", "skills", "t1", "install.md")), "docs/skills/** 免确认落盘（G-4 裁定扩列）");
    assert.ok(existsSync(join(target, "docs", "skills", "t1", "SKILL.md")), "技能内容文件同口径（含子路径）");
    assert.ok(existsSync(join(target, "docs", "mcp", "echo.md")), "docs/mcp/** 免确认落盘（G-4 V2 裁定扩列）");
    assert.ok(existsSync(join(target, "docs", "mcp", "sub", "deep.md")), "MCP 声明树含子路径同口径");
    assert.equal(existsSync(join(target, "docs", "其他.md")), false, "docs/ 其它路径未确认 → F4 拒、零副作用");
    assert.equal(existsSync(join(target, "角色卡")), false, "角色卡/ 未确认 → F4 拒且不得建目录");
  });
});

// ————————— ⑦ request_choice：勾选经通道回传 —————————

test("request_choice：多选勾选经通道回传（transcript 如实呈现客户选择）", async () => {
  await withTarget(async ({ root, target }) => {
    mkdirSync(target, { recursive: true });
    const options: CustomerInputOption[] = [
      { id: "a", label: "选项 A" },
      { id: "b", label: "选项 B" },
      { id: "c", label: "选项 C" },
    ];
    const script: ToolCall[] = [
      { name: "request_choice", args: { title: "选角色范围", question: "选哪些？", options, multiple: true } },
    ];
    const input: CustomerInputFn = (req) => {
      assert.equal(req.kind, "choice");
      return { outcome: "answered", value: { selected: ["a", "c"] }, operatorId: "test-客户" };
    };
    const result = await runGovernSession(
      { taskId: "T-CHOICE", project: genesisProject(target), customerInput: input },
      { createAdapter: (gate: WriteGate, caps?: AdapterCapabilities) => createFakeRuntimeAdapter({ gate, script, writeRoot: target, customerInput: caps?.customerInput }) },
    );
    assert.equal(result.code, EXIT_OK);
    const chosen = result.transcript.filter((ev) => ev.summary.includes("客户已选择"));
    assert.equal(chosen.length, 1, `transcript 应含一条「客户已选择」：${JSON.stringify(result.transcript.map((e) => e.summary))}`);
    assert.match(chosen[0].summary, /a（选项 A）/);
    assert.match(chosen[0].summary, /c（选项 C）/);
  });
});

// ————————— ⑧ CLI 终端映射单元 —————————

test("parseChoiceInput：单选 `1`、多选 `1,3`；非法/重复/越界/空 → 拒绝", () => {
  const opts: CustomerInputOption[] = [
    { id: "o1", label: "一" },
    { id: "o2", label: "二" },
    { id: "o3", label: "三" },
  ];
  assert.deepEqual(parseChoiceInput("2", opts, false), ["o2"], "单选：一个序号");
  assert.deepEqual(parseChoiceInput("1,3", opts, true), ["o1", "o3"], "多选：逗号分隔");
  assert.deepEqual(parseChoiceInput("1、3", opts, true), ["o1", "o3"], "多选：顿号分隔");
  assert.deepEqual(parseChoiceInput("3", opts, true), ["o3"], "多选：选一个也合法");
  assert.equal(parseChoiceInput("1,2", opts, false), undefined, "单选收到多个 → 拒绝（不猜意图）");
  assert.equal(parseChoiceInput("1,1", opts, true), undefined, "重复序号 → 拒绝");
  assert.equal(parseChoiceInput("0", opts, false), undefined, "越界（0）→ 拒绝");
  assert.equal(parseChoiceInput("9", opts, false), undefined, "越界（9）→ 拒绝");
  assert.equal(parseChoiceInput("x", opts, false), undefined, "非数字 → 拒绝");
  assert.equal(parseChoiceInput("", opts, true), undefined, "空 → 拒绝");
});

test("createCliCustomerInput：y/n/空/EOF 与拖号选择；fail-closed", async () => {
  const make = (lines: (string | null)[]) => {
    let i = 0;
    return createCliCustomerInput({ write: () => {}, readLine: async () => lines[i++] ?? null });
  };
  const confirm: CustomerInputRequest = { kind: "confirm", title: "同意吗？", preview: "x" };
  assert.deepEqual(await make(["y"])(confirm), { outcome: "answered", value: { confirmed: true }, operatorId: "cli" });
  assert.deepEqual(await make(["是"])(confirm), { outcome: "answered", value: { confirmed: true }, operatorId: "cli" });
  assert.deepEqual(await make(["n"])(confirm), { outcome: "answered", value: { confirmed: false }, operatorId: "cli" });
  assert.equal((await make([""])(confirm)).outcome, "declined", "空输入 → 拒绝");
  assert.equal((await make(["??"])(confirm)).outcome, "declined", "未识别 → 拒绝");
  assert.equal((await make([null])(confirm)).outcome, "unavailable", "EOF → 不可用（无人值守）");

  const choice: CustomerInputRequest = {
    kind: "choice",
    title: "选一个",
    options: [{ id: "a", label: "甲" }, { id: "b", label: "乙" }],
  };
  assert.deepEqual(await make(["2"])(choice), { outcome: "answered", value: { selected: ["b"] }, operatorId: "cli" });
  assert.equal((await make(["9"])(choice)).outcome, "declined", "越界序号 → 拒绝");
  assert.equal((await make([null])(choice)).outcome, "unavailable", "EOF → 不可用");
});

test("createCliCustomerInput（G-1）：**不设超时**——延迟作答仍生效；EOF → unavailable（fail-closed 不变）", async () => {
  const confirm: CustomerInputRequest = { kind: "confirm", title: "同意吗？", preview: "x" };
  // 无超时等待：读行**延迟**才返回——不受任何计时器掐断，作答照样生效（编排侧不自持计时器：
  // 见 operator-channel.ts 头注「不设超时」；轮次时限的处理在 Pi适配器，不在此处）。
  const delayed = createCliCustomerInput({
    write: () => {},
    readLine: async () => {
      await new Promise((r) => setTimeout(r, 250));
      return "y";
    },
  });
  assert.deepEqual(await delayed(confirm), { outcome: "answered", value: { confirmed: true }, operatorId: "cli" });

  // 延迟后的多选勾选同样生效。
  const choice: CustomerInputRequest = {
    kind: "choice",
    title: "选一选",
    options: [{ id: "a", label: "甲" }, { id: "b", label: "乙" }, { id: "c", label: "丙" }],
    multiple: true,
  };
  const delayedChoice = createCliCustomerInput({
    write: () => {},
    readLine: async () => {
      await new Promise((r) => setTimeout(r, 250));
      return "1,3";
    },
  });
  assert.deepEqual(await delayedChoice(choice), { outcome: "answered", value: { selected: ["a", "c"] }, operatorId: "cli" });

  // EOF 仍为 unavailable（硬约束：无人值守 = 未获同意，**不是**「等待」）。
  const eof = createCliCustomerInput({ write: () => {}, readLine: async () => null });
  assert.equal((await eof(confirm)).outcome, "unavailable", "EOF → unavailable（fail-closed 不变）");
});

test("formatCustomerInputPrompt：确认 y/n 提示；选择列出编号（含多选提示）；extractPathCandidates 提取路径", () => {
  const confirmText = formatCustomerInputPrompt({ kind: "confirm", title: "建角色 X", preview: "预览内容" });
  assert.match(confirmText, /客户确认请求/);
  assert.match(confirmText, /\[y\/确认\/是 = 同意/);

  const choiceText = formatCustomerInputPrompt({
    kind: "choice",
    title: "选范围",
    options: [{ id: "a", label: "甲" }, { id: "b", label: "乙", description: "说明" }],
    multiple: true,
  });
  assert.match(choiceText, /1\) 甲/);
  assert.match(choiceText, /2\) 乙——说明/);
  assert.match(choiceText, /多选，逗号分隔序号/);

  // 路径提取（发行器的第一步）：从预览文本提取；URL/绝对路径/目录 token 不取；尾标点剥离。
  const got = extractPathCandidates(
    "将写出：`角色卡/X/role-card.md`、**角色卡/X/boundary.yaml**。另见 https://example.com/a/b 与 /etc/passwd 及 ../up/x.md 与目录 角色卡/X/。",
  );
  assert.deepEqual(got.sort(), ["角色卡/X/boundary.yaml", "角色卡/X/role-card.md"].sort());
});
