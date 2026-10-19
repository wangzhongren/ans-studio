// test/编排/govern.test.ts
// 编排角色自测：`ans govern` **真治理会话**（设计 §2.2 / §3.2 / §5.2 / §12.3，任务 T5/T32）。
//
// 覆盖 §5.2：
//   ① 治理会话的 gate 对**项目治理边界**求值——命中 角色卡/ 条件目录 + 可写集 → 放行；角色卡/ 内但
//      不在可写集（未列角色）→ F4 收窄拒；
//   ② 负例：越界写（目标项目 src/、项目根以外）→ **写之前被拒**；
//   ③ 负例：改治理边界文件致 pin 失配 → 拒写（命令非 0，不落盘）；
//   ④ 正例：治理会话真落盘建 角色卡/X/ → `listProject` 能枚举到 X（无 parseError）；
//   ⑤ `governCommand` **接收并使用**装配注入的 ConfigInjection（缺注入 → 非 0；有注入 → 运行）；
//   ⑥ **目标目录**（设计 §12.3，T32）：`ans govern [<目录>]` 的解析与经 deps 的传递。
//
// T32：**不再预建骨架**——夹具改为自备一份「项目治理边界」文档（取代已退役的 `writeGovernanceSkeleton`），
// 直接构造 project（不落 .ans、不建角色骨架），以贴近「su 从空文件夹起、按对话决定建角色」的新形态。
// 全部用系统临时目录，用后清理——不在仓库留文件。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { governCommand, resolveGovernTargetDir } from "../../src/interface/cli/govern.ts";
import { runGovernSession } from "../../src/pipeline/orchestration/govern-session.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { parseGovernArgs } from "../../src/common/编排/args.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { EXIT_OK, EXIT_USAGE } from "../../src/common/编排/exit-codes.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  ToolCall,
  WriteGate,
} from "../../src/provider/pi/session.ts";

/** 项目治理边界文档（§2.2 形状：3 个条件目录）——T32 起测试自备（旧夹具 writeGovernanceSkeleton 已退役）。 */
const GOV_BOUNDARY_REL = "角色卡/governance-boundary.yaml";
const GOV_BOUNDARY_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: conditional-directory",
  "    path: 角色卡/",
  "    condition: role-restructuring",
  "    root: project",
  "    purpose: 项目治理产物：角色目录",
  "  - kind: conditional-directory",
  "    path: docs/",
  "    condition: docs-bootstrap",
  "    root: project",
  "    purpose: 项目级文档脚手架",
  "  - kind: conditional-directory",
  "    path: .ans/",
  "    condition: project-init",
  "    root: project",
  "    purpose: 项目初始化产物",
  "",
].join("\n");

/** 新建临时根，用后清理。fn 拿到 { root, target }（target 尚未建，用例按需建）。 */
async function withTarget<T>(fn: (ctx: { root: string; target: string }) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-govern-"));
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

/** 在 target 写一份项目治理边界文档，返回直接构造的 project（**不预建角色骨架**，T32 新形态）。 */
function fixtureProject(target: string): ProjectConfig {
  mkdirSync(join(target, "角色卡"), { recursive: true });
  writeFileSync(join(target, "角色卡", "governance-boundary.yaml"), GOV_BOUNDARY_YAML);
  return {
    projectRoot: target,
    skillRoot: target,
    roles: {},
    governanceModel: "single",
    governanceBoundary: {
      path: GOV_BOUNDARY_REL,
      acceptance: { accepted: true, source: "test:fixture governance boundary" },
    },
  };
}

/** 桩适配器：建一次会话、立即 settled、dispose 无事——用于捕获 gate，不触盘。 */
function okAdapter(): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
      return {
        async prompt(): Promise<void> {},
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            yield { kind: "settled", summary: "完成" } as SessionEvent;
          })();
        },
        async dispose(): Promise<void> {},
      };
    },
  };
}

/** 恒「同意」客户通道（A-3：确认制下 writeSet 从空开始，须经确认才发行）。 */
const confirmAllow: CustomerInputFn = (req) =>
  req.kind === "confirm"
    ? { outcome: "answered", value: { confirmed: true }, operatorId: "test-客户" }
    : { outcome: "answered", value: { selected: [] }, operatorId: "test-客户" };

/** 确认脚本：预览列出「将要写出的具体路径」并给每条路径一段可核对正文。
 *  2026-10-19 起：写盘类卡片的 preview 必须对每条声明路径给正文/结构，否则编排在呈现前拒绝发卡。 */
function confirmScript(paths: string[]): ToolCall {
  return {
    name: "request_confirmation",
    args: {
      title: "预览并请求确认",
      preview:
        `将写出：\n${paths.map((p) => `- ${p}`).join("\n")}\n\n` +
        paths.map((p) => `## ${p}\n# 预览正文\n（测试用正文，内容略。）`).join("\n\n"),
    },
  };
}

/** 跑一次治理会话并捕获其 gate（经 deps.createAdapter 注入桩）。 */
async function runAndCaptureGate(
  project: ProjectConfig,
  targetRoleIds: string[],
  opts: { customerInput?: CustomerInputFn; script?: ToolCall[] } = {},
): Promise<{ code: number; gate?: WriteGate }> {
  let gate: WriteGate | undefined;
  const script = opts.script ?? [];
  const result = await runGovernSession(
    {
      taskId: "T-GOV-1",
      project,
      targetRoleIds,
      ...(opts.customerInput !== undefined ? { customerInput: opts.customerInput } : {}),
    },
    {
      createAdapter: (g, caps) => {
        gate = g;
        return script.length > 0
          ? createFakeRuntimeAdapter({ gate: g, script, writeRoot: project.projectRoot, customerInput: caps?.customerInput })
          : okAdapter();
      },
    }
  );
  return { code: result.code, gate };
}

const ROLE_X_BOUNDARY = "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: 测试角色条目\n";

// —— ① 正例：gate 命中治理边界 + 条件 + 已确认路径发行（A-3）——

test("正例：客户确认（预览列出路径）→ 发行进 writeSet → 角色卡/X/… 可写；未确认路径仍 F4 拒", async () => {
  await withTarget(async ({ target }) => {
    const project = fixtureProject(target);
    const { code, gate } = await runAndCaptureGate(project, ["X"], {
      customerInput: confirmAllow,
      script: [confirmScript(["角色卡/X/role-card.md", "角色卡/X/boundary.yaml", "角色卡/X/memo.md"])],
    });
    assert.equal(code, EXIT_OK);
    assert.ok(gate, "应构建出 gate");
    assert.equal(gate!("角色卡/X/role-card.md").allowed, true, "已确认发行的路径应放行");
    assert.equal(gate!("角色卡/X/boundary.yaml").allowed, true);
    assert.equal(gate!("角色卡/X/memo.md").allowed, true);

    // 治理边界内（角色卡/）但**未确认发行**（角色 Y 既未被预览也未被确认）→ F4 收窄拒绝。
    const y = gate!("角色卡/Y/role-card.md");
    assert.equal(y.allowed, false);
    assert.match((y as { reason: string }).reason, /F4|writeSet/);
  });
});

// —— ② 负例：越界写（项目 src/ / 项目根以外）→ 写前被拒 ——

test("负例：治理会话写项目 src/ 或项目根以外 → 写之前被拒", async () => {
  await withTarget(async ({ target }) => {
    const project = fixtureProject(target);
    const { code, gate } = await runAndCaptureGate(project, ["X"]);
    assert.equal(code, EXIT_OK);
    assert.ok(gate);

    // 目标项目的 src/：不在治理边界（角色卡//docs//.ans/）内 → 拒。
    const src = gate!("src/evil.ts");
    assert.equal(src.allowed, false, "写项目 src/ 应被拒");
    assert.match((src as { reason: string }).reason, /未匹配任何边界条目|解析失败|未被接受/);

    // 项目根以外：不在任何受治理根内 → 拒。
    const outside = gate!(join(target, "..", "outside.txt"));
    assert.equal(outside.allowed, false, "写项目根以外应被拒");
  });
});

// —— ④ 正例：治理会话真落盘建 角色卡/X/ → listProject 枚举到 X ——

test("正例：治理会话真落盘建 角色卡/X/ → listProject 能枚举到 X（无 parseError）", async () => {
  await withTarget(async ({ target }) => {
    const project = fixtureProject(target);
    const script: ToolCall[] = [
      confirmScript(["角色卡/X/role-card.md", "角色卡/X/boundary.yaml", "角色卡/X/memo.md"]),
      { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n\n由治理会话创建。\n" } },
      { name: "write_file", args: { path: "角色卡/X/boundary.yaml", content: ROLE_X_BOUNDARY } },
      { name: "write_file", args: { path: "角色卡/X/memo.md", content: "# X 备忘录\n" } },
    ];
    const result = await runGovernSession(
      { taskId: "T-GOV-1", project, targetRoleIds: ["X"], customerInput: confirmAllow },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, writeRoot: target, customerInput: caps?.customerInput }) }
    );
    assert.equal(result.code, EXIT_OK);
    assert.ok(existsSync(join(target, "角色卡", "X", "role-card.md")), "role-card.md 应落盘");
    assert.ok(existsSync(join(target, "角色卡", "X", "boundary.yaml")), "boundary.yaml 应落盘");

    const listing = await listProject(target);
    const x = listing.roles.find((r) => r.roleId === "X");
    assert.ok(x, "listProject 应枚举到治理会话新建的角色 X");
    assert.equal(x!.boundary.parseError, undefined);
    assert.match(x!.cardText, /角色：X/);
  });
});

// —— 负例：治理会话写项目 src/ → 写前被拒、零副作用 ——

test("负例：治理会话写项目 src/ → 写之前被拒、零副作用（不落盘、不建目录）", async () => {
  await withTarget(async ({ target }) => {
    const project = fixtureProject(target);
    const script: ToolCall[] = [
      { name: "write_file", args: { path: "src/evil.ts", content: "// 越界写入示例\n" } },
    ];
    const result = await runGovernSession(
      { taskId: "T-GOV-1", project, targetRoleIds: ["X"] },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, writeRoot: target, customerInput: caps?.customerInput }) }
    );
    // 会话本身成功结束（该次写入被拒，不是会话失败）……
    assert.equal(result.code, EXIT_OK);
    // ……但越界写零副作用：文件未创建、目录也未建。
    assert.equal(existsSync(join(target, "src", "evil.ts")), false, "越界写不得落盘");
    assert.equal(existsSync(join(target, "src")), false, "拒绝不得建目录（零副作用）");
  });
});

// —— ③ 负例：治理边界文件 pin 失配 → 拒写 ——

test("负例：改治理边界文件致 pin 失配 → 拒写（命令非 0，不落盘）", async () => {
  await withTarget(async ({ target }) => {
    mkdirSync(join(target, "角色卡"), { recursive: true });
    const govAbs = join(target, "角色卡", "governance-boundary.yaml");
    writeFileSync(govAbs, GOV_BOUNDARY_YAML);
    const sha = createHash("sha256").update(readFileSync(govAbs)).digest("hex");
    const project: ProjectConfig = {
      projectRoot: target,
      skillRoot: target,
      roles: {},
      governanceModel: "single",
      governanceBoundary: {
        path: GOV_BOUNDARY_REL,
        acceptance: { accepted: true, source: "pin:test", pin: [{ path: GOV_BOUNDARY_REL, sha256: sha }] },
      },
    };
    // 手改治理边界文件 → 其 SHA-256 与 acceptance.pin 不符 → 载入时未接受（parseError）。
    writeFileSync(govAbs, GOV_BOUNDARY_YAML + "# 篡改：pin 失配\n");

    const script: ToolCall[] = [
      { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# X\n" } },
    ];
    const result = await runGovernSession(
      { taskId: "T-GOV-1", project, targetRoleIds: ["X"] },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, writeRoot: target, customerInput: caps?.customerInput }) }
    );
    assert.notEqual(result.code, 0, "pin 失配 → 命令应非 0");
    assert.equal(existsSync(join(target, "角色卡", "X")), false, "pin 失配 → 不得写盘");
  });
});

// —— ⑤ governCommand：接收并使用 ConfigInjection ——

test("governCommand：缺注入配置（ConfigInjection）→ 非 0", async () => {
  assert.equal(await governCommand(["govern"], undefined), EXIT_USAGE);
});

test("governCommand：用法错误（未知参数 / 缺值）→ 非 0", async () => {
  assert.equal(await governCommand(["govern", "--bogus"], undefined), EXIT_USAGE);
  assert.equal(await governCommand(["govern", "--task"], undefined), EXIT_USAGE);
});

test("governCommand：接收并使用注入配置 + 适配器 → 运行治理会话并落盘", async () => {
  await withTarget(async ({ target }) => {
    const project = fixtureProject(target);
    const script: ToolCall[] = [
      confirmScript(["角色卡/X/role-card.md", "角色卡/X/boundary.yaml"]),
      { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n" } },
      { name: "write_file", args: { path: "角色卡/X/boundary.yaml", content: ROLE_X_BOUNDARY } },
    ];
    const deps = {
      project,
      configSource: {
        kind: "ans" as const,
        path: join(target, ".ans", "project.json"),
        acceptance: project.governanceBoundary?.acceptance ?? { accepted: false, source: "" },
        pinPaths: [],
      },
      targetRoleIds: ["X"],
      customerInput: confirmAllow,
      createAdapter: (gate: WriteGate, caps?: AdapterCapabilities) => createFakeRuntimeAdapter({ gate, script, writeRoot: target, customerInput: caps?.customerInput }),
    };
    const code = await governCommand(["govern", "--role", "X"], deps);
    assert.equal(code, EXIT_OK);
    assert.ok(existsSync(join(target, "角色卡", "X", "role-card.md")), "governCommand 应驱动治理会话落盘");
  });
});

// —— ⑥ 目标目录（设计 §12.3，T32）——

test("parseGovernArgs：可选位置参数解析为目标目录；缺省 undefined；第二个裸词计用法错误", () => {
  // 位置参数 = 目标目录（`ans govern <目录>`）
  const p = parseGovernArgs(["govern", "./orders-service"]);
  assert.equal(p.dir, "./orders-service");
  assert.equal(p.taskId, "T-GOV-1");
  assert.deepEqual(p.roleIds, []);
  assert.deepEqual(p.errors, []);

  // 与 --task / --role 混用
  const q = parseGovernArgs(["govern", "./proj", "--task", "T-9", "--role", "A", "--role=B"]);
  assert.equal(q.dir, "./proj");
  assert.equal(q.taskId, "T-9");
  assert.deepEqual(q.roleIds, ["A", "B"]);
  assert.deepEqual(q.errors, []);

  // 缺省（未给出）→ undefined（装配回退 ans-cli 自身）
  const def = parseGovernArgs(["govern"]);
  assert.equal(def.dir, undefined);
  assert.equal(def.taskId, "T-GOV-1");
  assert.deepEqual(def.roleIds, []);

  // 第二个裸词 = 多余参数（不静默忽略）
  assert.ok(parseGovernArgs(["govern", "a", "b"]).errors.some((e) => /多余参数/.test(e)));
  assert.ok(parseGovernArgs(["govern", "--role"]).errors.some((e) => /缺少值/.test(e)));
});

test("resolveGovernTargetDir：argv 位置参数优先，其次 deps.targetDir，都无则 undefined", () => {
  // argv 优先于 deps
  assert.equal(resolveGovernTargetDir(["govern", "./from-argv"], { targetDir: "./from-deps" }), "./from-argv");
  // 无 argv → 用 deps.targetDir（装配注入通道）
  assert.equal(resolveGovernTargetDir(["govern"], { targetDir: "./from-deps" }), "./from-deps");
  // 都无 → undefined
  assert.equal(resolveGovernTargetDir(["govern"]), undefined);
});

test("目标目录经 deps/会话输入传递：runGovernSession 原样带出 targetDir", async () => {
  await withTarget(async ({ target }) => {
    const project = fixtureProject(target);
    const result = await runGovernSession(
      { taskId: "T-GOV-1", project, targetRoleIds: ["X"], targetDir: "./orders-service" },
      { createAdapter: () => okAdapter() }
    );
    assert.equal(result.code, EXIT_OK);
    assert.equal(result.targetDir, "./orders-service", "targetDir 应经 deps/会话输入原样带出");
  });
});

test("governCommand：接受位置参数目标目录（argv）→ 解析不报错并驱动会话", async () => {
  await withTarget(async ({ target }) => {
    const project = fixtureProject(target);
    const script: ToolCall[] = [
      confirmScript(["角色卡/X/role-card.md"]),
      { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n" } },
    ];
    const deps = {
      project,
      configSource: {
        kind: "ans" as const,
        path: join(target, ".ans", "project.json"),
        acceptance: project.governanceBoundary?.acceptance ?? { accepted: false, source: "" },
        pinPaths: [],
      },
      targetRoleIds: ["X"],
      customerInput: confirmAllow,
      createAdapter: (gate: WriteGate, caps?: AdapterCapabilities) => createFakeRuntimeAdapter({ gate, script, writeRoot: target, customerInput: caps?.customerInput }),
    };
    // 位置参数目标目录（此处用 target 自身，写盘仍落在 project.projectRoot）不应被当作「多余参数」。
    const code = await governCommand(["govern", target, "--role", "X"], deps);
    assert.equal(code, EXIT_OK);
    assert.ok(existsSync(join(target, "角色卡", "X", "role-card.md")));
  });
});
