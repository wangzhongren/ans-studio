// test/装配/govern-target.test.ts
// 装配：`ans govern [<目录>]` 的**目标目录 → projectRoot** 接线（设计 §12.3，任务 T34）。
//
// 背景：原 `ans govern` **不取目标目录**，只在装配注入的 project（`resolveProjectRoot()` = ans-cli 自身）
// 上工作——CLI 连「对某个空文件夹做 bootstrap」都办不到。T32（编排）已解析位置参数并给出 §6 安全的出口
// `resolveGovernTargetDir`；本任务（装配）在入口 govern 分支据它把注入的 `project.projectRoot` 设为
// `path.resolve(dir)`（缺省仍 `resolveProjectRoot()`）。
//
// ── 2026-10-12 修复（见 `角色卡/装配/docs/fix/2026-10-12_fix-govern-target-boundary.md`）──────
// T34 只换了 `projectRoot`，但无 `.ans` 时回退的内置演示配置里的路径（roles[*].card/boundary、
// governanceBoundary.path）都**相对 ans-cli 自身**——对目标目录解析必 ENOENT（`ans govern <空目录>`
// 报「治理边界解析失败」的根因）。修复：目标目录 ≠ ans-cli 根且为内置回退时，改注入目标项目的如实
// 形态（roles 空、治理边界 path 空串 = 走既有约定），并按客户批准（O1）带 CLI 创世授权
// `genesisBootstrap`（与桌面「导入空文件夹」同一条有界创世授权）。
//
// 覆盖：
//  1) 给出目标目录 → 注入的 `project.projectRoot` 即该目录（绝对化；相对路径按 cwd 绝对化）；
//  2) 缺省 → 仍为 ans-cli 自身（`resolveProjectRoot()`，行为不变）；
//  3) 目标目录含 `.ans/project.json` → 角色照常载入，且 projectRoot 仍取目标目录；
//  4) 显式目标目录**优先于** `.ans` 自带的 projectRoot；
//  5) 目录不存在 / 非目录 → 入口明确报错并非 0，**不静默回退到 ans-cli**；
//  6) 目标目录的**注入合同**：空目录 → 不注入 ans-cli 自身的演示数据 + 带 CLI 创世授权；
//     显式给 ans-cli 根 → 与缺省一致（演示配置原样，自身行为逐字不变）；
//  7) 目录存在 → 目录校验放行；治理链路走通（经 `governCommand` + 假适配器：EXIT_OK、
//     边界解析不再失败；新空项目按 trio 默认开 rapporteur，客户确认制下提案写入真落盘——脚本先
//     `request_confirmation` 把将写出的路径摆给放行桩 `GovernDeps.customerInput`，并断言确认通道
//     被请求恰好一次）；
//  8) `main` 入口（环境已清空 Pi 配置）：目录校验放行、不再报治理边界解析失败，
//     如实以非 0 报缺 provider 配置。
//
// 治理模型注入（评审 2026-10-17 §5.4「CLI 同步」，2026-10-17 修复）：`loadInjection` 对外来目标目录
// 调共享 `readGovernanceModel` 并按「无 `.ans` + 无项目角色 → trio / 其余 single」判定；详见
// `test/装配/governance-model-injection.test.ts`。
//
// 说明：main 的 govern 分支对**真实**适配器需要 provider 配置（会话开启时才解析），故「注入的
// projectRoot / 注入合同」经导出的 `loadInjection` 直接断言；链路与入口行为经 `governCommand`
// 注入假适配器、或经 `main`（先清空 Pi 相关环境变量，保证不发真实模型请求）断言退出码与 stderr。
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { test, after } from "node:test";

import { loadInjection, resolveProjectRoot, main } from "../../src/index.ts";
// 2026-10-12：入口链路经编排 §6 安全的 Interface 出口驱动（装配本就动态导入它）；假适配器/脚本来自
// §4 冻结契约家，只读导入，不复制实现。
import { governCommand } from "../../src/interface/cli/govern.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import type { CustomerInputFn, CustomerInputRequest, ToolCall } from "../../src/provider/pi/session.ts";
import { PI_CREDENTIAL_ENV_VARS } from "../../src/common/装配/runtime.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-govern-target-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
});

function newDir(name: string): string {
  return mkdtempSync(join(ROOT, name));
}

function capture(): { err: string[]; restore: () => void } {
  const err: string[] = [];
  const origErr = process.stderr.write.bind(process.stderr);
  // 只劫持 stderr：**不动** `process.stdout.write`——node:test 的报告器自己也往 stdout 写，
  // 一旦替换它，报告器会丢失若干行（表现为「测试数偏少」）。本文件只断言 stderr，无需动 stdout。
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    err,
    restore: () => {
      process.stderr.write = origErr;
    },
  };
}

/**
 * 清空 Pi 相关环境变量后跑一段（跑完原样恢复）：让「无凭据环境」确定、**绝不触发真实模型请求**
 * （真实适配器在会话开启时才经 `resolvePiProviderConfig` 读 env；缺 base URL 即明确失败，
 * 不会回落到任何默认端点）。
 */
async function withScrubbedPiEnv<T>(fn: () => Promise<T>): Promise<T> {
  const keys = [...PI_CREDENTIAL_ENV_VARS, "ANS_PI_BASE_URL", "ANS_PI_MODEL", "ANS_PI_CONTEXT_WINDOW"];
  const saved = new Map<string, string | undefined>();
  for (const k of keys) {
    saved.set(k, process.env[k]);
    delete process.env[k];
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ---- 1) 目标目录 → 注入的 projectRoot 即该目录 ----

test("loadInjection(目标目录) → 注入的 projectRoot 即该目录（绝对化）", async () => {
  const dir = newDir("target-");
  const { project } = await loadInjection(dir);
  assert.equal(project.projectRoot, resolve(dir));
  assert.ok(isAbsolute(project.projectRoot), "projectRoot 应为绝对路径");
});

test("loadInjection(相对路径) → 绝对化（相对 cwd）", async () => {
  const dir = newDir("rel-");
  const rel = relative(process.cwd(), dir);
  const { project } = await loadInjection(rel);
  assert.equal(project.projectRoot, resolve(rel));
  assert.equal(project.projectRoot, resolve(dir), "相对路径应绝对化到同一个目录");
  assert.ok(isAbsolute(project.projectRoot));
});

// ---- 2) 缺省 → 仍为 ans-cli 自身（行为不变） ----

test("loadInjection() 缺省 → projectRoot 仍为 ans-cli 自身（行为不变）", async () => {
  const { project } = await loadInjection();
  assert.equal(project.projectRoot, resolveProjectRoot());
});

// ---- 6) 注入合同（2026-10-12 修复）：空目录不带 ans-cli 演示数据；自身根逐字不变 ----

test("loadInjection(空目录) → 不注入 ans-cli 自身的演示数据；带 CLI 操作的创世授权（genesisBootstrap）", async () => {
  const dir = newDir("empty-contract-");
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "builtin-fallback", "空目录无 .ans → 内置回退");
  assert.deepEqual(project.roles, {}, "ans-cli 的角色表不得当作目标项目的角色表注入");
  assert.equal(project.governanceBoundary?.path, "", "目标项目尚未声明治理边界 → 空串（走既有约定）");
  const genesis = project.genesisBootstrap;
  assert.ok(genesis, "未 bootstrap 的目标目录须带 genesisBootstrap（否则 su 一个字也写不了）");
  assert.match(genesis.source, /cli:ans govern/);
  assert.match(genesis.source, /操作者发起 bootstrap/);
  assert.match(genesis.source, /角色卡\/\/docs\/\/\.ans\//, "source 应如实标注有界创世的三处治理产物");
});

test("loadInjection(ans-cli 根，显式给出) → 与缺省同款：演示配置原样（自身行为逐字不变）", async () => {
  const self = resolveProjectRoot();
  const variants: Array<[string, Awaited<ReturnType<typeof loadInjection>>]> = [
    ["显式自身根", await loadInjection(self)],
    ["缺省", await loadInjection()],
  ];
  for (const [label, { project }] of variants) {
    assert.equal(project.projectRoot, self, label);
    assert.deepEqual(Object.keys(project.roles).sort(), ["Pi适配器", "门禁引擎", "编排", "测试", "项目管理", "装配", "运行时核心", "Codex适配器", "Claude适配器"].sort(), `${label}：保留六个原角色并登记三个已接受的运行时角色`);
    assert.equal(
      project.governanceBoundary?.path,
      "角色卡/门禁引擎/boundary.yaml",
      `${label}：演示治理边界路径应原样保留`,
    );
    assert.equal(project.genesisBootstrap, undefined, `${label}：自身不得带创世授权`);
  }
});

// ---- 3) 目标目录含 .ans → 角色载入，projectRoot 仍取目标目录 ----

test("目标目录含 .ans/project.json → 角色载入，projectRoot 仍取目标目录", async () => {
  const dir = newDir("with-ans-");
  mkdirSync(join(dir, ".ans"), { recursive: true });
  writeFileSync(
    join(dir, ".ans", "project.json"),
    JSON.stringify({
      roles: { R: { card: "角色卡/R/role-card.md", boundary: "角色卡/R/boundary.yaml" } },
      governanceBoundary: {
        path: "角色卡/R/boundary.yaml",
        acceptance: { accepted: false, source: "test" },
      },
    }),
    "utf8",
  );
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "ans", "应载入目标目录的 .ans（而非回退内置）");
  assert.equal(project.projectRoot, resolve(dir), "projectRoot 仍取目标目录");
  assert.equal(project.roles.R.boundary, "角色卡/R/boundary.yaml", "目标目录的角色应被载入");
});

// ---- 4) 显式目标目录优先于 .ans 自带的 projectRoot ----

test("显式目标目录优先于 .ans 自带的 projectRoot", async () => {
  const dir = newDir("override-");
  mkdirSync(join(dir, ".ans"), { recursive: true });
  writeFileSync(
    join(dir, ".ans", "project.json"),
    JSON.stringify({ projectRoot: "D:/some/other/place", roles: {} }),
    "utf8",
  );
  const { project } = await loadInjection(dir);
  assert.equal(project.projectRoot, resolve(dir), "用户显式给出的目标目录应优先");
});

// ---- 5) 目录不存在 / 非目录 → 明确报错并非 0，不回退 ans-cli ----

test("ans govern <不存在的目录> → 明确报错、非 0，不静默回退到 ans-cli", async () => {
  const missing = join(ROOT, "does-not-exist-xyz");
  const cap = capture();
  const code = await main(["govern", missing], {});
  cap.restore();
  assert.equal(code, 2);
  const err = cap.err.join("");
  assert.match(err, /目标目录不存在/);
  assert.match(err, /回退到 ans-cli/, "应明确声明不会回退到 ans-cli");
});

test("ans govern <非目录（文件）> → 明确报错、非 0", async () => {
  const file = join(ROOT, "a-file.txt");
  writeFileSync(file, "x", "utf8");
  const cap = capture();
  const code = await main(["govern", file], {});
  cap.restore();
  assert.equal(code, 2);
  assert.match(cap.err.join(""), /不是目录/);
});

// ---- 7) 目录存在 → 目录校验放行；治理链路走通（2026-10-12 修复后：不再报边界解析失败） ----

test("ans govern <空目录>（经 governCommand + 假适配器）→ EXIT_OK，不再报 single 不可用；新空项目按 trio 开启 rapporteur 并可写提案", async () => {
  const dir = newDir("ok-");
  const inj = await loadInjection(dir);
  // 新空项目默认治理模型 trio（评审 §5.4「CLI 同步」）：默认治理角色是 rapporteur（提案权），
  // 可写预授权目录 `docs/proposals/`；`角色卡/**` 属 Nominator 的任命门禁范围（Rapporteur 写会被拒）。
  assert.equal(inj.project.governanceModel, "trio", "空目录注入的治理模型应为 trio");
  // 客户确认制（2026-10-12 A-1/A-3，取代原「收口提议 + operatorChannel」）：写盘前必须先用
  // `request_confirmation` 把**将写出的具体路径**摆给客户；客户确认后**编排**才把这些路径发行进
  // 本次会话的 writeSet（未确认路径被 F4 拒）。故脚本先确认、再写，且预览里列出目标路径。
  const proposalPath = "docs/proposals/demo-v1.md";
  const preview = `将写出以下文件（均已预览）：\n${proposalPath}`;
  const script: ToolCall[] = [
    { name: "request_confirmation", args: { title: "确认写出提案", preview } },
    { name: "write_file", args: { path: proposalPath, content: "# 提案\n" } },
  ];
  // 放行桩：确定性同意；同时计次——断言确认通道被请求**恰好一次**（加强，非放宽）。
  const confirmRequests: CustomerInputRequest[] = [];
  const allowCustomer: CustomerInputFn = (req) => {
    confirmRequests.push(req);
    return { outcome: "answered", value: { confirmed: true }, operatorId: "test:装配放行桩" };
  };
  const cap = capture();
  const code = await governCommand(["govern", dir, "--function", "proposal"], {
    ...inj,
    // 编排经 `createAdapter(gate, capabilities)` 把（已包发行器的）客户通道注入适配器：
    // 原样转发，`request_confirmation` 工具才会注册（「注入才注册」）。
    createAdapter: (gate, capabilities) =>
      createFakeRuntimeAdapter({ gate, script, writeRoot: dir, ...(capabilities ?? {}) }),
    customerInput: allowCustomer,
  });
  cap.restore();
  const err = cap.err.join("");
  assert.equal(code, 0, `应正常走完治理会话（含确认制写盘）；stderr=${err}`);
  assert.ok(
    !/治理边界解析失败|三权角色在 single 治理模型下不可用|目标目录不存在|不是目录/.test(err),
    `不得再报边界/模型/目录错，实际 stderr=${JSON.stringify(err)}`,
  );
  assert.ok(existsSync(join(dir, proposalPath)), "确认后提案文件应落盘");
  assert.equal(readFileSync(join(dir, proposalPath), "utf8"), "# 提案\n");
  assert.equal(confirmRequests.length, 1, "客户确认通道应被请求恰好一次（放行桩同意）");
  assert.equal(confirmRequests[0]?.kind, "confirm", "确认请求的形状应为 confirm（可带预览）");
  // 注：本会话没有写出角色 boundary.yaml，也无既存治理边界文档 ⇒ 自动收尾按既有守卫
  // `nothing-to-pin` 零副作用（不凭空写 `.ans`）。这是 finalize 的既有语义，不属于本次模型注入。
  assert.equal(existsSync(join(dir, ".ans", "project.json")), false, "无可 pin 之物时不得凭空收口");
});

test("ans govern <存在的目录>（main 入口；环境已清空 Pi 配置）→ 目录校验放行、不再报边界解析失败；如实非 0 报缺 provider 配置", async () => {
  const dir = newDir("ok-main-");
  const cap = capture();
  const code = await withScrubbedPiEnv(() => main(["govern", dir], {}));
  cap.restore();
  const err = cap.err.join("");
  assert.ok(
    !/目标目录不存在|不是目录/.test(err),
    `存在的目录应被接受，实际 stderr=${JSON.stringify(err)}`,
  );
  assert.ok(
    !/治理边界解析失败/.test(err),
    `不得再报治理边界解析失败（本修复的要害），实际 stderr=${JSON.stringify(err)}`,
  );
  // 无 provider 配置 → 治理会话无法建立 → 非 0（绝不静默假装成功）；缺项如实报出。
  assert.notEqual(code, 0);
  assert.match(err, /缺少 base URL/, "缺 provider 配置时应如实报出真实缺项");
});
