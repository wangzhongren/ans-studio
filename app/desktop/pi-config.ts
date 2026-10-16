// app/desktop/pi-config.ts
// 桌面应用的「Pi 配置面板」逻辑层（纯逻辑，**不依赖 electron**，可在 node 下单测）。
//
// 客户需求（设计 §11，客户 2026-10-11）：「为啥不能通过页面设置呢」→ 页面里设置 Pi 配置、**保存到 `.env`**。
//
// **为何这块不只是「好用」，而是让桌面 pi 路径可用的前提**（设计 §11 抬头）：
//  ① `package.json` 的 `"app": "electron app/main.ts"` **没有 `--env-file`** ⇒ Electron 进程 `process.env`
//     里**没有** `ANS_PI_*` 与 token；
//  ② 桌面**没有通道**把 Pi 配置交给适配器（且设计已裁定**不扩** `createPiAdapterFactory` 签名）。
//  故：**启动时用共享模块把 `.env` 载入 `process.env`**（=`main.ts` 补上的 `--env-file`），此后
//     `resolvePiProviderConfig(opts, process.env)` 原样复用、单一来源。本模块提供该载入 + 面板读写。
//
// —— 单一来源（硬约束：不得有第二份实现）——
// `.env` 的**读写全仓唯一**实现在共享模块 `src/common/shared/env-file.ts`（**属主：项目管理**；本角色
// **只读导入，不复制**；规则见 `角色卡/项目管理/docs/architecture/shared-components.md` 组件 5）。
// 本模块**只**做：路径解析、面板视图组装（掩码）、以及把面板提交**转成**共享模块的调用 + 保存后重载。
// **不重写 `.env` 解析/合并/原子写**——那些逐字来自共享模块。
//
// —— 凭据纪律（设计 §11.4，客户红线）——
//  · **掩码**：机密键（`isSecretKey` 判定的 `ANTHROPIC_AUTH_TOKEN`）**值绝不外发**——`getPiConfig`
//    对机密键恒返回空串 `value:""`，只给 `isSet` 布尔；界面据此显示「已设置/未设置」，**永不回显**。
//  · **只改相关键**：保存经 `saveEnvFile` → `mergeEnvText` **逐行**、只替换命中键，其余**逐字节保留**。
//  · **不回显到错误/回报**：回报只含**键名**；错误文本由共享模块 redact，本模块再对入参值**兜底** redact。
//  · **原子写 + 失败显式**：均由共享模块保证（同目录 temp+rename；失败抛错）。
//  · **保存后重载**：`savePiConfig` 成功后 `loadEnvFileInto(env, path)`——**下一会话用新值**。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";

// 跨角色共享 `.env` 读写模块（**单一来源**，pm 属主）：**只读导入，不复制**（见文件抬头）。
import {
  readEnvFile,
  saveEnvFile,
  loadEnvFileInto,
  isSecretKey,
  type EnvMap,
  type EnvTarget,
  type LoadEnvResult,
} from "../../src/common/shared/env-file.ts";

/**
 * 面板纳入的键（设计 §11.2；**G-5 wave 2 起与注册表 `RUNTIME_SETTINGS.pi` 字段集对齐**——3 项必填 + 2 项可选）：
 *  · 必填：`ANTHROPIC_AUTH_TOKEN`（**机密，掩码**）、`ANS_PI_BASE_URL`（**必需**——拒绝回落任何默认端点，
 *    故必须显式给）、`ANS_PI_MODEL`；
 *  · 可选（收进「高级」、**可留空**）：`ANS_PI_CONTEXT_WINDOW`（客户起点正是它要手查手填；Pi适配器已改为
 *    **可选 + 保守默认**，留空 = 不下发该键，缺失不再硬失败）；`ANS_PI_REASONING_EFFORT`（G-5：推理强度，
 *    注册表带 `choices` 值域——**本列表纳入该键是为旧路径不静默失去写入面**：现行生产面的
 *    `pi-config:*` IPC 在未注入替身时**已委托注册表路径**（`interface.ts` → `getRuntimeConfig`/
 *    `saveRuntimeConfig`，读取/校验/生效全在彼处；本模块的 get/save 仅注入替身与直接导入者使用）。
 *    旧路径无 `choices` 控件与值域校验——值域校验**单一来源**在注册表保存链（`runtime-config.ts`），
 *    此处**不复制**第二份判定）。
 *
 * **`ANS_PI_PROVIDER` 不在面板里**（客户 2026-10-11 裁定）：它在代码里**有默认值**（`ans-gateway`）、是
 * **内部标签**，不是用户该做的决定。底层仍支持该环境变量（`resolvePiProviderConfig` 照读），**只是不再占
 * 一个输入框**——故它**不在**下面这组里，保存时也**不写**它（已在 `.env` 里的那一行原样保留，见写纪律）。
 *
 * **只允许写这些键**（写纪律：只改相关键；不越界写任意键）。
 */
export const PI_PANEL_KEYS: readonly string[] = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANS_PI_BASE_URL",
  "ANS_PI_MODEL",
  "ANS_PI_CONTEXT_WINDOW",
  "ANS_PI_REASONING_EFFORT",
];

const HERE = path.dirname(fileURLToPath(import.meta.url)); // <repo>/app/desktop

/**
 * 默认 `.env` 路径 = **仓库根 `.env`**（设计 §11.2：与 CLI `--env-file=.env` **同一文件**，
 * 装配 Section 1 已列、`.gitignore` 忽略）。由模块位置反推：`app/desktop/` → 上两级 = 仓库根。
 * **可注入**：测试/e2e 传系统临时目录下的假 `.env`，**绝不指向真实的仓库根 `.env`**。
 */
export function resolveRepoEnvPath(): string {
  return path.join(path.resolve(HERE, "..", ".."), ".env");
}

/** Main injects this one path into startup loading and every runtime settings operation. */
export function resolveDesktopEnvPath(options: { isPackaged: boolean; userDataPath?: string }): string {
  if (!options.isPackaged) return resolveRepoEnvPath();
  if (typeof options.userDataPath !== "string" || !path.isAbsolute(options.userDataPath)) {
    throw new Error("Packaged runtime configuration requires an absolute userData path.");
  }
  return path.join(options.userDataPath, ".env");
}

/** 面板里单个键的视图。 */
export interface PiConfigField {
  key: string;
  /** 是否机密（`isSecretKey`）——机密键的 `value` 恒为空串（值绝不外发）。 */
  secret: boolean;
  /** 非机密键：当前值（未设置则空串）；**机密键：恒空串**（界面据 `isSet` 呈现「已设置/未设置」）。 */
  value: string;
  /** 该键在 `.env` 中是否已设置（有非空值）。供界面「已设置，留空则不修改」提示。 */
  isSet: boolean;
}

/** `getPiConfig` 的结果：面板路径 + 各键视图（**不含机密键的值**）。 */
export interface PiConfigView {
  path: string;
  fields: PiConfigField[];
}

/** `savePiConfig` 的结果：**只含键名**，不含值（凭据不回显）。失败时 `error` 亦不含值。 */
export interface PiConfigSaveResult {
  ok: boolean;
  /** 本次写入的键名（面板键；失败时为空）。 */
  appliedKeys: string[];
  /** 失败原因（不含任何值；shared 已 redact，本模块再兜底）。 */
  error?: string;
}

/** 可注入环境（缺省 `process.env`）；测试传假对象以隔离。 */
export type PiConfigEnv = EnvTarget;

/** 机密值兜底 redact（与共享模块的保证叠加：即便底层错误意外带了值，也不会外发）。 */
function redactValues(text: string, values: Iterable<string>): string {
  let out = text;
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) out = out.split(v).join("[redacted]");
  }
  return out;
}

/** 文件是否存在（用于把「无 `.env`」与「读取失败」分开：前者空视图，后者**明确抛错**）。 */
async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取面板视图（供界面呈现）。
 *
 *  - `.env` **不存在** → 返回空字段视图（不抛；= 无 `.env`，与 `loadEnvFileInto` 的 ENOENT 语义一致）；
 *  - `.env` **存在但读取失败** → **明确抛错**（不静默，设计 §11.4）；
 *  - **机密键的值绝不外发**：`value` 恒为空串，只给 `isSet`。
 */
export async function getPiConfig(envPath: string = resolveRepoEnvPath()): Promise<PiConfigView> {
  let map: EnvMap = {};
  if (await fileExists(envPath)) {
    map = await readEnvFile(envPath); // 真实读取失败 → 抛错（不吞）
  }
  const fields: PiConfigField[] = PI_PANEL_KEYS.map((key) => {
    const secret = isSecretKey(key);
    const raw = map[key];
    const isSet = typeof raw === "string" && raw !== "";
    return { key, secret, value: secret ? "" : (raw ?? ""), isSet };
  });
  return { path: envPath, fields };
}

export interface SavePiConfigOptions {
  /** 目标 `.env` 路径（缺省仓库根；测试/e2e 注入临时路径）。 */
  envPath?: string;
  /** 待写键值（**只采纳面板键**；其余键忽略——写纪律：只改相关键）。值绝不出现在回报里。 */
  updates: EnvMap;
  /** 保存后载入的环境目标（缺省 `process.env`）；注入以便单测。 */
  env?: PiConfigEnv;
}

/**
 * 保存面板提交 → `.env`（**只改相关键**、原子写），成功后**重载** `env`（下一会话用新值）。
 *
 *  - 过滤：只采纳 `PI_PANEL_KEYS` 内的键（防越界写任意键）；
 *  - 写：`saveEnvFile`（逐行、只替换命中键、其余逐字节保留、原子；错误只含键名/路径）；
 *  - 重载：`loadEnvFileInto(env, envPath)`（补 `--env-file`；同名键以 `.env` 为准覆盖）；
 *  - 失败：**显式**返回 `{ok:false,error}`，且 error **不含任何值**（兜底 redact）。
 */
export async function savePiConfig(opts: SavePiConfigOptions): Promise<PiConfigSaveResult> {
  const envPath = opts.envPath ?? resolveRepoEnvPath();
  const env = opts.env ?? process.env;
  const filtered: EnvMap = {};
  for (const key of Object.keys(opts.updates)) {
    if (PI_PANEL_KEYS.includes(key)) filtered[key] = opts.updates[key];
  }
  const appliedKeys = Object.keys(filtered);
  if (appliedKeys.length === 0) {
    // 无面板键可写：不触碰文件（恒等），如实回报空 apply。
    return { ok: true, appliedKeys: [] };
  }
  try {
    await saveEnvFile(envPath, filtered);
    await loadEnvFileInto(env, envPath);
    return { ok: true, appliedKeys };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, appliedKeys: [], error: redactValues(raw, Object.values(filtered)) };
  }
}

/**
 * 启动时把 `.env` 载入 `env`（缺省 `process.env`）——**这就是补上缺失的 `--env-file`**（设计 §11.3）。
 * 只回报**键名**（`LoadEnvResult.applied`），不含值。`.env` 不存在 → 无操作、不抛。
 */
export async function loadPiEnv(
  env: PiConfigEnv = process.env,
  envPath: string = resolveRepoEnvPath(),
): Promise<LoadEnvResult> {
  return loadEnvFileInto(env, envPath);
}

/**
 * 面板里的**必填键**（3 项）——端点 / 模型 / token。缺失任一 → 选 pi 开会话会被拒（fail-closed）。
 * `ANS_PI_CONTEXT_WINDOW` **不在**此列（它是「高级」里的**可选**项：留空 = Pi适配器用保守默认，不下发该键，
 * 不会硬失败），故它缺失**不算**「配置不全」。
 */
export const PI_REQUIRED_KEYS: readonly string[] = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANS_PI_BASE_URL",
  "ANS_PI_MODEL",
];

/**
 * 面板里**必填键**中「未设置」的键名（供界面「选 pi 但配置不全 → 会被拒」告警用；**不含任何值**）。
 * 只数必填键——可选的 `ANS_PI_CONTEXT_WINDOW` 缺失**不**在此列（留空是合法的默认路径）。
 */
export function missingPiKeys(view: PiConfigView): string[] {
  return view.fields.filter((f) => PI_REQUIRED_KEYS.includes(f.key) && !f.isSet).map((f) => f.key);
}
