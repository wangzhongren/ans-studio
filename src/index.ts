// ANS CLI 根入口（装配层）。
//
// 职责（契约 §6）：main 只持有 **Interface 层句柄**——解析 argv 后调用
// runRoleCommand / governCommand。**不**导入 Service/Provider 对象，
// **不**建立导入全部层的中央工厂。Interface 模块在需要时**动态导入**，因此：
//  - 本文件在其余角色落盘前也能被加载、解析与自检（doctor / help 立即可用）；
//  - 顶层加载不会因某个下游模块缺失而整体失败。
//
// 运行时依赖注入：runRoleCommand(argv, deps) 需要 deps.createAdapter（把 gate 绑进
// 一个 runtime 适配器）。装配选择注入**装配自有的演示假 runtime**（§7：演示用假 runtime；
// §4 的 Provider 假适配器“仅单元测试用”）。这样 main 无需导入 Provider 对象即可完成接线。
// 演示配置（projectRoot/skillRoot/roles 及 T-1 的 scope）同样经 deps 作为纯值注入。

import path from "node:path";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseInvocation } from "./common/装配/cli-parse.ts";
import { createDemoRuntimeAdapter } from "./common/装配/demo-runtime.ts";
import {
  extractRuntimeArg,
  resolveRuntime,
  hasPiCredential,
  type RuntimeSelection,
} from "./common/装配/runtime.ts";
// §6 单一来源（T24）：`resolveSkillRoot` / `PI_CREDENTIAL_ENV_VARS` 改从共享模块只读导入，删本地副本。
import { resolveSkillRoot, PI_CREDENTIAL_ENV_VARS } from "./common/shared/runtime-shared.ts";
import {
  loadEffectiveConfig,
  type ConfigSource,
  type LoadedConfig,
} from "./common/装配/config-loader.ts";

import type { ProjectConfig, RoleLocation } from "./model/role.ts";
import type { BoundarySection1, Acceptance } from "./model/boundary.ts";
import type { TaskScope } from "./model/decision.ts";
import type { RuntimeAdapter, WriteGate } from "./provider/pi/session.ts";

// ---------------------------------------------------------------------------
// 默认演示配置（契约 §6 末尾表）。属**配置数据**，不是解析逻辑硬编码（F8）。
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根：本文件位于 <root>/src/index.ts。 */
export function resolveProjectRoot(): string {
  return path.resolve(HERE, "..");
}

/**
 * 技能根：优先 ANS_SKILL_ROOT，否则默认技能目录 ans-governed-construction。
 * 单一来源（T24）：改从 `src/common/shared/runtime-shared.ts` 导入；在原位置**再导出**以保持
 * 本模块公开面不变。无参调用走 shared 的默认参数（读 `process.env`），行为逐字不变。
 */
export { resolveSkillRoot };

/**
 * 边界接受证据：如实标注演示来源，程序不自行判定 accepted（F6）。
 *
 * **此为设计 §3.3「登记的非-pin 例外」之一**，理由须写死在此并进文档：CLI 演示内嵌配置是
 * **原型演示替身**，其 acceptance 是本进程内嵌的纯值、**不经 `.ans/project.json` 载入**；
 * 它没有、也不该有客户 pin——因为它是「已知偏离」的演示来源，不是「预先钉住的客户产物」。
 * 另一个登记例外是**桌面应用导入时的运行期同意**（实时授权，非预钉产物，pin 语义不适用）。
 * 除这两个外**没有第三档**：凡经 `.ans` 载入的 acceptance 一律必须 pin-backed（见
 * `src/common/装配/config-loader.ts` 的 `enforcePinBackedAcceptance`）。
 */
export const DEMO_ACCEPTANCE: Acceptance = {
  accepted: true,
  source: "demo:embedded-config (无客户 pin，已知偏离)",
};

// 注：契约 §2 的 RoleLocation 冻结为 {card, boundary}，未含 acceptance 槽位。
// §6 要求演示配置为各角色边界提供如实标注的 Acceptance，故这里在**本地**把它扩展为
// RoleLocation & {acceptance}（结构上是 RoleLocation 的超集，仍可赋给 ProjectConfig.roles）。
// 门禁引擎若要消费该 acceptance，需相应放宽 RoleLocation（或在实现里读取该额外字段）。
type DemoRoleLocation = RoleLocation & { acceptance: Acceptance };

// 边界格式由 Governance 由 Markdown 表格迁移为 YAML 固定格式：boundary 值一律指向
// 角色卡/<角色>/boundary.yaml（门禁引擎解析器以 .yaml/.yml 走严格 YAML；.md 仅作
// 技能内置边界的 legacy 回退）。
const DEMO_ROLES: Record<string, DemoRoleLocation> = {
  项目管理: {
    card: "角色卡/项目管理/role-card.md",
    boundary: "角色卡/项目管理/boundary.yaml",
    acceptance: DEMO_ACCEPTANCE,
  },
  编排: {
    card: "角色卡/编排/role-card.md",
    boundary: "角色卡/编排/boundary.yaml",
    acceptance: DEMO_ACCEPTANCE,
  },
  门禁引擎: {
    card: "角色卡/门禁引擎/role-card.md",
    boundary: "角色卡/门禁引擎/boundary.yaml",
    acceptance: DEMO_ACCEPTANCE,
  },
  Pi适配器: {
    card: "角色卡/Pi适配器/role-card.md",
    boundary: "角色卡/Pi适配器/boundary.yaml",
    acceptance: DEMO_ACCEPTANCE,
  },
  装配: {
    card: "角色卡/装配/role-card.md",
    boundary: "角色卡/装配/boundary.yaml",
    acceptance: DEMO_ACCEPTANCE,
  },
  测试: {
    card: "角色卡/测试/role-card.md",
    boundary: "角色卡/测试/boundary.yaml",
    acceptance: DEMO_ACCEPTANCE,
  },
};

export function buildDemoProjectConfig(): ProjectConfig {
  return {
    projectRoot: resolveProjectRoot(),
    skillRoot: resolveSkillRoot(),
    roles: DEMO_ROLES,
    governanceBoundary: {
      path: "角色卡/门禁引擎/boundary.yaml",
      acceptance: DEMO_ACCEPTANCE,
    },
  };
}

/**
 * 演示任务 T-1 的写入范围。
 * writeSet 取演示角色“编排”边界 Section 1 的**真子集**（只含 run.ts 一个文件），
 * 因此“边界内但在 writeSet 外”的写入（如 src/common/编排/output.ts）
 * 也会被拒——用于同时演示 F4。
 *
 * conditions 为空数组：它是本次任务声明满足的条件 slug（用于放开
 * conditional-directory 条目），而“编排”边界当前不含任何 conditional-directory
 * 条目，故演示任务不声明条件。字段仍显式携带，以对齐门禁引擎的 TaskScope 形状。
 */
export function buildDemoTaskScope(): TaskScope {
  return { writeSet: ["src/interface/cli/run.ts"], conditions: [] };
}

// ---------------------------------------------------------------------------
// 配置加载（`.ans/project.json`）——配置数据的单一来源在装配
// ---------------------------------------------------------------------------

/**
 * 加载有效 project 配置。
 *  - 仓库存在 `.ans/project.json` → 载入它（含终态规则：accepted:true 必须 pin-backed）；
 *  - 无该文件 → 回退**内置演示配置**（现行为，行为不放松）；
 *  - 有但不可用 → fail-closed 未接受（见 config-loader）。
 * 任一情形都在 `source` 里如实标注来源，供 doctor 打印与命令注入。
 *
 * T34：`projectRoot` 由调用方给定——doctor / role run 仍传 `resolveProjectRoot()`（ans-cli 自身，
 * 缺省行为不变）；govern 传 `ans govern [<目录>]` 的目标目录。
 */
async function loadConfig(projectRoot: string = resolveProjectRoot()): Promise<LoadedConfig> {
  const fallback = buildDemoProjectConfig();
  // 无 `.ans` 时的回退也取**生效根**：否则 `ans govern <空目录>`（尚无 .ans）会回退到 ans-cli 的
  // projectRoot，写入落在工具自身而非目标目录——正是本任务要修的行为。
  fallback.projectRoot = projectRoot;
  return loadEffectiveConfig({
    projectRoot,
    skillRoot: resolveSkillRoot(),
    fallback,
  });
}

/**
 * 构造 govern 的注入参数（见 ConfigInjection，T34）。
 *
 * `targetDir` 为 `ans govern [<目录>]` 的**目标目录**（解析归编排 T32、注入归装配 T34）：
 *  - 给出 → 注入的 `project.projectRoot = path.resolve(targetDir)`（绝对化；目录存在性由入口先校验）；
 *  - 缺省 → 仍为 `resolveProjectRoot()`（ans-cli 自身，行为不变）。
 * 显式目标目录**优先于** `.ans/project.json` 自带的 projectRoot——用户 `ans govern <dir>` 意在为
 * 「那个」目录 bootstrap。
 *
 * **目标目录 ≠ ans-cli 自身且无 `.ans`（回退内置演示配置）时**（2026-10-12 修复，见
 * `角色卡/装配/docs/fix/2026-10-12_fix-govern-target-boundary.md`）：`buildDemoProjectConfig()` 描述的是
 * **ans-cli 自己**——`roles[*].card/boundary` 与 `governanceBoundary.path` 全是相对本仓库根的项目相对
 * 路径；若照原样注入，边界解析会去**目标目录**下找 ans-cli 的文件（`ans govern <空目录>` 报
 * 「治理边界解析失败：ENOENT」的根因）。故此处改注入**目标项目如实形态**：
 *  · `roles = {}`（ans-cli 的角色表不是目标项目的角色表）；
 *  · `governanceBoundary.path = ""`（目标项目尚未声明治理边界 → 回到既有约定：空串不参与「治理边界
 *    覆盖」分支；finalize 落点由 `path || DEFAULT_GOVERNANCE_BOUNDARY_REL` 给出）——与桌面
 *    「无 `.ans` 传空串」（`app/desktop/project.ts`）同款；
 *  · `genesisBootstrap`：`ans govern <目录>`（操作者显式发起）在未 bootstrap 的目录上 = 一次**有界创世
 *    授权**（仅治理产物 角色卡//docs//.ans/；项目自己的治理边界文档一经写出并经 pin 接受即**结构性
 *    自终止**）——与桌面「导入空文件夹」同一条授权，源如实标注 CLI（不硬编码治理角色 id）。
 *
 * 导出以便测试直接断言注入结果与经 governCommand 的接线：main 的 govern 分支对**真实**适配器需要
 * provider 配置（在会话开启时才解析），测试经 `governCommand(argv, deps)` 注入假适配器走完链路
 * （见 `test/装配/govern-target.test.ts`）。
 */
export async function loadInjection(targetDir?: string): Promise<ConfigInjection> {
  const projectRoot = targetDir === undefined ? resolveProjectRoot() : path.resolve(targetDir);
  const { project, source } = await loadConfig(projectRoot);
  if (targetDir !== undefined) {
    project.projectRoot = projectRoot;
    if (source.kind === "builtin-fallback" && !isSelfProjectRoot(projectRoot)) {
      project.roles = {};
      project.governanceBoundary = { path: "", acceptance: DEMO_ACCEPTANCE };
      project.genesisBootstrap = {
        source:
          "cli:ans govern <目录> = 操作者发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）",
      };
    }
  }
  return { project, configSource: source };
}

/**
 * 「目标目录即 ans-cli 自身」判定（2026-10-12，配 `loadInjection`）：
 * 用 `path.resolve` 比较（两侧都已绝对化）——使 `ans govern` 与 `ans govern <ans-cli 根>` 两种写法
 * 行为一致、都不套用「外来目标目录」的配置（演示回退配置本就是描述 ans-cli 自己的）。
 * 已知边界：经符号链接等价的写法会被判为「外来」而走修复路径——方向是收紧到既有约定
 * （不放松任何授权），如实登记于上文链接的修复记录。
 */
function isSelfProjectRoot(projectRootAbs: string): boolean {
  return path.resolve(projectRootAbs) === path.resolve(resolveProjectRoot());
}

/**
 * govern 的**配置注入通道**（本任务 T2）。
 *
 * 契约 §5 把 `governCommand(argv)` 冻结为**只收 argv**——这正是
 * `ans govern` 只能以退出码 2 结束的根因（命令拿不到配置，无法开局）。按设计 §3.2，
 * 装配在此以**超集第二参**注入配置（与 `runRoleCommand(argv, deps)` 同形）：装配加载
 * `.ans/project.json`（或回退内置），把 project + 来源作为纯值注入。编排侧（T5）接收
 * 该参并据此开工；**在编排接收前，注入不改变命令的现有行为**（占位仍占位）。
 *
 * 注：`ans init` 子命令已由编排 T16 删除（客户废除 init），故本注入通道现仅服务 govern。
 */
export interface ConfigInjection {
  project: ProjectConfig;
  configSource: ConfigSource;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

/**
 * runRoleCommand 的依赖注入形状。
 * 契约 §5 冻结签名为 { createAdapter }；装配额外注入 project/scope（纯值）——
 * 这是 createAdapter 之外的**超集字段**，类型上与冻结签名兼容。
 *
 * 单一来源：注入的 project（六个角色的 card/boundary 路径 + acceptance）与
 * scope（writeSet + conditions）是演示配置的**唯一来源**。编排须优先使用此处注入的
 * project/scope，缺失时报清晰错误，不得再自持第二份演示数据。
 */
export interface RunRoleDeps {
  createAdapter: (gate: WriteGate) => RuntimeAdapter;
  project: ProjectConfig;
  scope: TaskScope;
}

const USAGE = `ans —— 受治理会话链路 CLI（v1）

用法：
  ans role run <角色> --task <任务>   运行一个受治理角色会话（演示：ans role run 编排 --task T-1）
  ans govern [<目录>] [--task <任务>] [--role <角色id>]…   真治理会话：对目标目录发起 bootstrap（缺省 = ans-cli 自身）
  ans doctor                         打印装配自检与内嵌演示配置（无需其余角色落盘）
  ans help                           显示本帮助

运行时选择（默认 demo）：
  --runtime demo|pi                   demo = 演示假替身；pi = 真实 Pi 适配器（需 Pi 凭据）
  环境变量 ANS_RUNTIME                未给出 --runtime 时生效；优先级：命令行 > 环境变量 > 默认

演示：npm run demo   # 等价于 ans role run 编排 --task T-1
`;

const RUNTIME_SOURCE_LABEL: Record<RuntimeSelection["source"], string> = {
  argv: "命令行 --runtime",
  env: "环境变量 ANS_RUNTIME",
  default: "默认",
};

/** 供 help / doctor 显示当前运行时及其来源。 */
function describeRuntime(selection: RuntimeSelection): string {
  return `${selection.runtime}（来源：${RUNTIME_SOURCE_LABEL[selection.source]}）`;
}

/** 供 doctor 展示配置来源（`.ans` 还是内置回退）。 */
function describeConfigSource(source: ConfigSource): string {
  switch (source.kind) {
    case "ans":
      return `.ans/project.json（${source.path}）`;
    case "ans-invalid":
      return `.ans/project.json 存在但不可用（${source.path}）`;
    default:
      return `内置回退（无 .ans/project.json；期望路径 ${source.path}）`;
  }
}

/** 供 doctor 展示 pin 来源（本任务要求：能看到当前配置用了哪份、pin 从哪来）。 */
function describePinSource(project: ProjectConfig, source: ConfigSource): string {
  if (source.pinPaths.length > 0) {
    return `${source.pinPaths.length} 条 pin（SHA-256）：${source.pinPaths.join(", ")}`;
  }
  if (source.kind === "builtin-fallback") {
    // DEMO_ACCEPTANCE 是登记的非-pin 例外（设计 §3.3）——如实标注，不假装有 pin。
    const isDemo = project.governanceBoundary?.acceptance === DEMO_ACCEPTANCE;
    return isDemo
      ? "无 pin（登记的非-pin 例外：CLI 演示内嵌配置 DEMO_ACCEPTANCE，设计 §3.3）"
      : "无 pin";
  }
  if (source.kind === "ans-invalid") {
    return "无 pin（.ans 不可用 → fail-closed 未接受）";
  }
  return "无 pin → 已置为未接受（fail-closed，设计 §3.3）";
}

async function printDoctor(selection: RuntimeSelection): Promise<void> {
  const { project, source } = await loadConfig();
  const scope = buildDemoTaskScope();
  const lines: string[] = [];
  lines.push("== ans doctor（装配自检）==");
  lines.push(`node:              ${process.version}`);
  lines.push(`platform:          ${process.platform}（原生 TS 类型擦除已启用）`);
  lines.push(`运行时:            ${describeRuntime(selection)}`);
  lines.push(`projectRoot:       ${project.projectRoot}`);
  lines.push(`skillRoot:         ${project.skillRoot}`);
  lines.push(`skillRoot 来源:    ${process.env.ANS_SKILL_ROOT ? "env:ANS_SKILL_ROOT" : "默认技能目录"}`);
  lines.push(`配置来源:          ${describeConfigSource(source)}`);
  lines.push(`演示任务 writeSet: ${JSON.stringify(scope.writeSet)}`);
  lines.push(`演示任务 conditions: ${JSON.stringify(scope.conditions)}`);
  lines.push(`边界接受来源:      ${source.acceptance.source}`);
  lines.push(`acceptance:        accepted=${source.acceptance.accepted}`);
  lines.push(`pin 来源:          ${describePinSource(project, source)}`);
  if (source.downgradeReason) {
    lines.push(`接受降级:          ${source.downgradeReason}`);
  }
  lines.push("角色表（roleId -> card / boundary）:");
  for (const [roleId, loc] of Object.entries(project.roles)) {
    lines.push(`  - ${roleId}: ${loc.card} | ${loc.boundary}`);
  }
  lines.push("（其余角色落盘前，role run 全链路尚不可端到端验证。）");
  process.stdout.write(lines.join("\n") + "\n");
}

/**
 * 依运行时选择构造 runRoleCommand 的依赖。
 * demo：注入装配自有的演示假替身。
 * pi：动态导入编排导出的 createPiAdapterFactory（run-role.ts 注明“供 Interface/装配构造
 *     默认真实适配器”），注入真实 Pi 适配器工厂。动态导入以便 pipeline 缺失时能被
 *     reportUnavailable 如实诊断，而非顶层加载即崩。
 * 两种情况都注入同一份 project/scope（演示配置的唯一来源，契约 §6）。
 *
 * ⚠️ shell 闸（`run_shell`）——**本 CLI 入口 V1 未接线**（如实登记；**客户确认的 V1 范围**，非欠账、
 *   也**不是「暂未启用」**）：
 *   · 本入口对**任一** runtime 都**不注入 `ShellGate`**——pi 分支调 `createPiAdapterFactory(project)`
 *     只传 project、**第二参 `shellGate` 略去**（其签名 `(project, shellGate?)`）；demo 假替身本不涉 shell。
 *   · 依设计 §7.5.1「能力缺席 = 最强 fail-closed」：**未注入 `ShellGate` ⇒ Pi 适配器根本不注册 `run_shell`**，
 *     故**本入口下模型没有 shell 能力**。
 *   · 三层链——(c) 确定性硬地板 → (b) pm 模型审读 → (a) 操作者确认——**已实现并已测试**，但从本入口**到不了**；
 *     该链在**运行时不影响任何行为**（本入口从不 arm；桌面侧同样刻意不 arm）。
 *   · 理由（客户裁定）：V1 无 OS 沙箱，`run_shell` 起的子进程写入**不受 `resolveWrite` 约束**，arm 风险大。
 *   · **将来要启用须新的裁定**并在此显式接线（另行评审）——**不会自行启用**。别把这段读成「已经在跑」。
 */
async function buildRoleRunDeps(selection: RuntimeSelection): Promise<RunRoleDeps> {
  const { project } = await loadConfig();
  const scope = buildDemoTaskScope();

  if (selection.runtime === "pi") {
    const mod = await import("./pipeline/orchestration/run-role.ts");
    return { createAdapter: mod.createPiAdapterFactory(project), project, scope };
  }

  return {
    createAdapter: (gate: WriteGate) => createDemoRuntimeAdapter({ gate }),
    project,
    scope,
  };
}

/**
 * 入口。`env` 便于测试注入（缺省 process.env）；这是冻结签名 main(argv) 的**可选超集**，
 * 类型与运行时均兼容原签名。
 */
export async function main(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  // 运行时选择：先从完整 argv 抽出 --runtime（并剔除，避免下游解析器误判为未知参数），
  // 再按「命令行 > 环境变量 > 默认」解析。非法取值即报错并非 0 结束（不静默忽略）。
  const { argv: restArgv, flag } = extractRuntimeArg(argv);
  const resolution = resolveRuntime(flag, env);
  if (!resolution.ok) {
    process.stderr.write(`错误：${resolution.message}\n\n${USAGE}`);
    return 2;
  }
  const selection = resolution.selection;

  const invocation = parseInvocation(restArgv);

  switch (invocation.kind) {
    case "help": {
      process.stdout.write(USAGE);
      process.stdout.write(`当前运行时：${describeRuntime(selection)}\n`);
      return 0;
    }

    case "doctor": {
      await printDoctor(selection);
      return 0;
    }

    case "unknown": {
      process.stderr.write(`错误：${invocation.message}\n\n${USAGE}`);
      return 2;
    }

    case "role-run": {
      // pi 无凭据：入口**预先**如实报错并非 0 退出；绝不退回 demo、绝不假装成功。
      if (selection.runtime === "pi" && !hasPiCredential(env)) {
        process.stderr.write(
          `错误：--runtime pi 需要 Pi 凭据，但未检测到。\n` +
            `请设置任一环境变量：${PI_CREDENTIAL_ENV_VARS.join(" / ")}。\n` +
            "不会退回 demo 运行时——静默降级比报错更坏。若要跑演示，请用 --runtime demo。\n",
        );
        return 1;
      }
      try {
        const deps = await buildRoleRunDeps(selection);
        const mod = await import("./interface/cli/run.ts");
        return await mod.runRoleCommand(invocation.argv, deps);
      } catch (err) {
        return reportUnavailable("role run", err);
      }
    }

    case "govern": {
      try {
        const mod = await import("./interface/cli/govern.ts");
        // T34（设计 §12.3）：`ans govern [<目录>]` 的**位置参数解析归编排**——装配经其 §6 安全的
        // Interface 出口 `resolveGovernTargetDir` 取「生效目标目录」，据此注入 projectRoot。
        // （装配本已动态导入本模块；此出口即为此设，装配**不**导入编排私有的 common/编排/args.ts。）
        const targetDir = mod.resolveGovernTargetDir(invocation.argv);
        // 显式给出但**不存在/非目录** → 明确报错并非 0；绝不静默回退到 ans-cli
        //（那会把「对空目录 bootstrap」变成「对工具自身 bootstrap」，是最坏的一类静默降级）。
        const dirError = validateGovernTargetDir(targetDir);
        if (dirError) {
          process.stderr.write(`错误：${dirError}\n`);
          return 2;
        }
        const inject = await loadInjection(targetDir);
        // 契约 §5 冻结签名 governCommand(argv) 原不接收配置（占位码 2 的根因）。按设计
        // §3.2 以**超集第二参**注入（见 ConfigInjection）；编排侧（T5）接收前，占位行为不变。
        const govern = mod.governCommand as (
          argv: string[],
          deps?: ConfigInjection,
        ) => Promise<number>;
        return await govern(invocation.argv, inject);
      } catch (err) {
        return reportUnavailable("govern", err);
      }
    }
  }
}

/**
 * 校验 govern 的显式目标目录（T34）：未给出 → 通过（`undefined`）；给出则须是**已存在的目录**。
 * 返回非空错误信息即拒绝，否则 `undefined`。目录不存在时**不新建、也不回退 ans-cli**——「空文件夹」
 * 场景里目录本就存在（用户导入/新建的空目录），不存在的多半是笔误；对工具自查目录做 bootstrap 更危险。
 */
function validateGovernTargetDir(targetDir: string | undefined): string | undefined {
  if (targetDir === undefined) return undefined;
  const abs = path.resolve(targetDir);
  let isDir: boolean;
  try {
    isDir = statSync(abs).isDirectory();
  } catch {
    return `ans govern 目标目录不存在：${abs}（不会新建目录，也不会回退到 ans-cli 自身——请先创建该目录）`;
  }
  if (!isDir) {
    return `ans govern 目标路径不是目录：${abs}`;
  }
  return undefined;
}

/** 下游 Interface 模块缺失/加载失败时的可读诊断；不吞失败，返回非零码。 */
function reportUnavailable(command: string, err: unknown): number {
  const detail = err instanceof Error ? err.message : String(err);
  process.stderr.write(
    `无法执行 "${command}"：Interface 层尚未就绪（${detail}）。\n` +
      "装配入口已就绪，待编排/门禁引擎/Pi适配器 落盘后方可端到端验证。\n" +
      "可先运行 `ans doctor` 检查装配自检与内嵌演示配置。\n",
  );
  return 1;
}
