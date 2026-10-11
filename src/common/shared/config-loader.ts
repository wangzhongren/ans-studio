// 共享组件（跨角色）：加载 `.ans/project.json` 并按设计 §3.3 的**终态规则**做 fail-closed
// 规范化，再把 roles / governanceBoundary / pins / acceptance 作为纯值注入给命令（run /
// govern / init）与 doctor。
//
// **属主：项目管理**（`src/common/shared/` 的唯一写入者）。**消费方：装配、桌面应用**
// ——只读导入，**不得复制第二份实现**（工程法案 §一.5、`docs/architecture/shared-components.md`）。
//
// **来历（T11）**：本模块的**全部**能力由 `src/common/装配/config-loader.ts` **整体搬迁**
// 而来（**搬迁，非 fork**——保持单一实现）。搬迁**逐字等价**：两个 fail-closed 分支
// （`accepted:true` 无 pin → 置未接受并清空 source；`.ans` 存在但不可解析 → 未接受、**不**
// 回退演示 acceptance）与 pin 形状判定全部原样保留。装配侧 `src/common/装配/config-loader.ts`
// 的本地副本由 **T12（装配）** 改为从本模块导入并删除——在 T12 完成前，存在**两处并存窗口**
// （两份代码逐字相同、行为不分叉）。
//
// 本层只做两件事，件件是「载入方」的职责：
//  1) 有没有配置：读 `.ans/project.json`；**无该文件** → 回退入参 fallback（现有内置演示
//     路径，行为**绝不放松**）；文件存在但不可用 → fail-closed（未接受，**不**回退到演示
//     acceptance，否则一个损坏的 .ans 反而换来一份「已接受」）。
//  2) 有没有 pin：`.ans` 存在时其 acceptance 必须 **pin-backed**——声明 accepted:true 而
//     **无 pin**，即由本层置为**未接受**（无 pin 即无证据；「漏写 pin 就绕过大可」是洞）。
//
// 边界（不做）：**pin 对不对**（逐文件 SHA-256 比对）不在这里做——那是门禁引擎
// `boundary-core.ts::verifyPins` 在其上**再加一层**（设计 §3.3：本层管「有没有 pin」，
// 引擎管「pin 对不对」）。故本层对 pin 只做**存在性与形状**判定。
//
// 登记的非-pin 例外**仅两个**（设计 §3.3）：桌面导入的运行期同意、CLI 演示内嵌配置
// `DEMO_ACCEPTANCE`。它们**都不经 `.ans` 载入**（前者走实时同意、后者走 fallback），
// 故凡从 `.ans` 读入的 acceptance **一律**适用「必须 pin-backed」，**没有第三档**，
// 也没有任何自填的「例外标记」可以绕过。

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Acceptance, PinEntry } from "../../model/boundary.ts";
import type { ProjectConfig, RoleLocation } from "../../model/role.ts";

/** `.ans/` 目录名（配置，与 package.json/tsconfig.json 同类；归属装配）。 */
export const ANS_DIR_NAME = ".ans";
/** `.ans/` 下的项目配置文件名。 */
export const ANS_PROJECT_FILE_NAME = "project.json";

/** 配置来源种类：ans=读了 `.ans/project.json`；builtin-fallback=无该文件；ans-invalid=有但不可用。 */
export type ConfigSourceKind = "ans" | "builtin-fallback" | "ans-invalid";

/** 供 doctor 展示的配置来源描述（doctor 需「打印 pin 来源」，本结构即其数据面）。 */
export interface ConfigSource {
  kind: ConfigSourceKind;
  /** 期望/实际配置文件的绝对路径（fallback/invalid 时为期望路径，仅供展示）。 */
  path: string;
  /** 生效的 acceptance（已被终态规则规范化）。 */
  acceptance: Acceptance;
  /** 声明到的 pin 目标路径（即便因降级而未生效，也保留以便如实展示）。 */
  pinPaths: string[];
  /** fail-closed 降级原因（accepted:true 无 pin；或 `.ans` 不可解析）。 */
  downgradeReason?: string;
}

export interface LoadedConfig {
  project: ProjectConfig;
  source: ConfigSource;
}

export interface LoadConfigOptions {
  /** 项目根（`.ans/project.json` 相对它解析）。 */
  projectRoot: string;
  /** 技能根（注入的 ProjectConfig.skillRoot）。 */
  skillRoot: string;
  /** 无 `.ans/project.json` 时的回退配置（现有内置演示路径；本层不改它、行为不放松）。 */
  fallback: ProjectConfig;
  /** `.ans` 目录名覆盖（仅供测试注入）。缺省 `.ans`。 */
  ansDirName?: string;
}

/** `.ans/project.json` 的绝对路径（fallback / doctor 展示共用同一来源，避免两处各拼一遍）。 */
export function ansProjectPath(projectRoot: string, ansDirName: string = ANS_DIR_NAME): string {
  return path.join(projectRoot, ansDirName, ANS_PROJECT_FILE_NAME);
}

/**
 * 终态规则（设计 §3.3）：accepted:true 必须 pin-backed，否则由载入方置为**未接受**。
 *
 * 规则刻意**没有第三档**：不存在「已登记为例外」的自填标记——两个非-pin 例外
 * （桌面运行期同意、CLI `DEMO_ACCEPTANCE`）在**本函数之外**产生，不流经 `.ans` 载入，
 * 故凡走到这里的 acceptance 一律适用本规则。降级时**同时清空 source**（不留貌似有证据
 * 的说明，与门禁引擎 `unaccepted()` 一致）。
 */
export function enforcePinBackedAcceptance(
  acceptance: Acceptance,
  origin: string,
): { acceptance: Acceptance; downgraded: boolean; reason?: string } {
  if (acceptance.accepted === true) {
    const hasPin = Array.isArray(acceptance.pin) && acceptance.pin.length > 0;
    if (!hasPin) {
      return {
        acceptance: { accepted: false, source: "" },
        downgraded: true,
        reason:
          `${origin}：声明 accepted:true 但未提供 pin —— 无 pin 即无证据，` +
          "fail-closed 置为未接受（设计 §3.3 终态规则）",
      };
    }
  }
  return { acceptance, downgraded: false };
}

// ---- 内部解析（对畸形输入一律 fail-closed，不抛出到调用方） ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 解析 pin 列表；非法/空 → undefined（= 无有效 pin 证据，交由终态规则降级）。 */
function parsePin(value: unknown): PinEntry[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const pins: PinEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }
    const p = item.path;
    const h = item.sha256;
    if (typeof p !== "string" || p.trim() === "") {
      return undefined;
    }
    if (typeof h !== "string" || h.trim() === "") {
      return undefined;
    }
    pins.push({ path: p, sha256: h });
  }
  return pins;
}

/**
 * 解析一条 acceptance 并应用终态规则。pin 缺省时允许从顶层 `pins` 兜底（配置数据单一
 * 来源的灵活性：既可在 acceptance 内联 pin，也可顶层列 pins）。
 */
function parseAcceptance(
  accRaw: unknown,
  fallbackPins: unknown,
  origin: string,
): { acceptance: Acceptance; downgraded: boolean; reason?: string; pinPaths: string[] } {
  const acc: Acceptance = { accepted: false, source: "" };
  let pinPaths: string[] = [];
  if (isRecord(accRaw)) {
    acc.accepted = accRaw.accepted === true;
    acc.source = typeof accRaw.source === "string" ? accRaw.source : "";
    const pin = parsePin(accRaw.pin) ?? parsePin(fallbackPins);
    if (pin) {
      acc.pin = pin;
      pinPaths = pin.map((p) => p.path);
    }
  }
  const enforced = enforcePinBackedAcceptance(acc, origin);
  // 展示用 pinPaths 即便被降级也保留（如实展示「它声称有/无 pin」）。
  return { acceptance: enforced.acceptance, downgraded: enforced.downgraded, reason: enforced.reason, pinPaths };
}

/** 解析 roles 映射：只保留 {card, boundary} 均为非空字符串的条目；其余静默丢弃（不凭空造角色）。 */
function parseRoles(value: unknown): Record<string, RoleLocation> {
  const roles: Record<string, RoleLocation> = {};
  if (!isRecord(value)) {
    return roles;
  }
  for (const [roleId, loc] of Object.entries(value)) {
    if (!isRecord(loc)) {
      continue;
    }
    const card = loc.card;
    const boundary = loc.boundary;
    if (typeof card !== "string" || card === "") {
      continue;
    }
    if (typeof boundary !== "string" || boundary === "") {
      continue;
    }
    roles[roleId] = { card, boundary };
  }
  return roles;
}

function fallbackSource(fallback: ProjectConfig, expectedPath: string): ConfigSource {
  const acceptance: Acceptance = fallback.governanceBoundary?.acceptance ?? { accepted: false, source: "" };
  return {
    kind: "builtin-fallback",
    path: expectedPath,
    acceptance,
    pinPaths: (acceptance.pin ?? []).map((p) => p.path),
  };
}

/**
 * `.ans/project.json` 存在但不可用（不可读/不可解析/顶层非对象）→ fail-closed：
 * 产出一份 roles 为空、治理边界未接受的配置（引擎将回退内置未接受 → 拒一切写），
 * **绝不**回退到调用方 fallback 的（可能是演示 accepted:true 的）acceptance。
 */
function invalidConfig(opts: LoadConfigOptions, file: string, reason: string): LoadedConfig {
  const acceptance: Acceptance = { accepted: false, source: "" };
  return {
    project: {
      projectRoot: opts.projectRoot,
      skillRoot: opts.skillRoot,
      roles: {},
      governanceBoundary: { path: "", acceptance },
    },
    source: {
      kind: "ans-invalid",
      path: file,
      acceptance,
      pinPaths: [],
      downgradeReason: `${reason} —— fail-closed：不回退到内置演示 acceptance，拒一切写`,
    },
  };
}

function buildFromAns(raw: Record<string, unknown>, file: string, opts: LoadConfigOptions): LoadedConfig {
  const projectRoot =
    typeof raw.projectRoot === "string" && raw.projectRoot !== "" ? raw.projectRoot : opts.projectRoot;
  const skillRoot = typeof raw.skillRoot === "string" && raw.skillRoot !== "" ? raw.skillRoot : opts.skillRoot;
  const roles = parseRoles(raw.roles);

  const project: ProjectConfig = { projectRoot, skillRoot, roles };

  const govRaw = raw.governanceBoundary;
  let acceptance: Acceptance = { accepted: false, source: "" };
  let downgradeReason: string | undefined;
  let pinPaths: string[] = [];

  if (isRecord(govRaw) && typeof govRaw.path === "string" && govRaw.path !== "") {
    const accRaw = isRecord(govRaw.acceptance) ? govRaw.acceptance : raw.acceptance;
    const parsed = parseAcceptance(accRaw, raw.pins, file);
    acceptance = parsed.acceptance;
    downgradeReason = parsed.reason;
    pinPaths = parsed.pinPaths;
    project.governanceBoundary = { path: govRaw.path, acceptance };
  } else {
    // 无 governanceBoundary：引擎将回退内置（未接受）。不是「降级」，只是回退。
    acceptance = { accepted: false, source: "" };
  }

  return {
    project,
    source: { kind: "ans", path: file, acceptance, pinPaths, downgradeReason },
  };
}

/**
 * 加载有效配置。**永远返回值**（不抛错），调用方据 `source.acceptance` 与 `project` 决策。
 *  - 无 `.ans/project.json` → fallback（现有内置演示路径，行为不放松）；
 *  - 有且可解析 → 载入 + 终态规则（accepted:true 必须 pin-backed）；
 *  - 有但不可用 → fail-closed 未接受。
 */
export async function loadEffectiveConfig(opts: LoadConfigOptions): Promise<LoadedConfig> {
  const file = ansProjectPath(opts.projectRoot, opts.ansDirName);

  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return { project: opts.fallback, source: fallbackSource(opts.fallback, file) };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return invalidConfig(opts, file, `无法解析 .ans/project.json：${(err as Error).message}`);
  }
  if (!isRecord(raw)) {
    return invalidConfig(opts, file, ".ans/project.json 顶层不是对象");
  }

  return buildFromAns(raw, file, opts);
}
