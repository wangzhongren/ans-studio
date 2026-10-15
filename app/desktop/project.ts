// app/desktop/project.ts
// 桌面应用的「项目/角色」装配辅助（纯逻辑，不依赖 electron，可在 node 下单测）。
//
// 职责：
//  - 由门禁引擎的 listProject 结果构造会话所需的 ProjectConfig（角色清单来自枚举，不另写解析）；
//  - 读取某角色的变更记录与 docs 目录索引（展示用，非边界判定）。
//
// 边界纪律：本文件**不**做任何"路径能不能写"的判断——那永远是门禁引擎 resolveWrite 的事。

import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

import type { Acceptance } from "../../src/model/boundary.ts";
import type { ProjectConfig, RoleLocation } from "../../src/model/role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
// 共享载入器**只读导入的类型**（值不在此导入——载入器的**唯一实现**在 `src/common/shared/config-loader.ts`）。
import type { LoadConfigOptions, LoadedConfig } from "../../src/common/shared/config-loader.ts";
// 跨角色共享运行时原语（**单一来源**，pm 属主 `src/common/shared/`）：仅取 `resolveSkillRoot`。
import { resolveSkillRoot } from "../../src/common/shared/runtime-shared.ts";
// 跨角色共享路径原语（**单一来源**，pm 属主 `src/common/shared/`）：仅取 `toPosix`。
import { toPosix } from "../../src/common/shared/path-primitives.ts";

/**
 * 技能根解析：优先 ANS_SKILL_ROOT，否则默认技能目录 `~/.claude/skills/ans-governed-construction`。
 *
 * T22：**单一来源**已就位（pm 的 `src/common/shared/runtime-shared.ts`）。此处**删去本地逐字副本**、
 * 改从共享模块**只读导入**并**原样转出**——公开面 `resolveSkillRoot` 不变、行为逐字不变（配置取值，非判定逻辑）。
 */
export { resolveSkillRoot };

/**
 * 将路径统一为正斜杠形式（项目内相对路径一律用 /）。
 *
 * T22（补）：**单一来源**为 pm 的 `src/common/shared/path-primitives.ts`。此处**删去本地逐字副本**
 * （原 `p.replace(/\\/g, "/")`）、改从共享模块**只读导入**并**原样转出**——公开面 `toPosix` 不变、
 * 行为逐字不变（纯词法原语，非判定逻辑）。本模块内 `posixDirname` 的调用点不变。
 */
export { toPosix };

/** 某个项目相对路径的 POSIX 目录名。 */
export function posixDirname(rel: string): string {
  const q = toPosix(rel);
  const idx = q.lastIndexOf("/");
  return idx < 0 ? "" : q.slice(0, idx);
}

/**
 * 由 listProject 的枚举结果构造 ProjectConfig。
 *
 * acceptance 由调用方（界面确认流程）提供：
 *  - accepted=true 时，resolveBoundarySection 会采用该角色自己的项目边界文件（loc.boundary）；
 *  - accepted=false 时（含缺来源），门禁引擎 fail-closed，拒绝一切写入——与 CLI 同一条路径，不更松。
 *
 * acceptance 的来源之一是**桌面运行期同意**——设计 §3.3「终态规则」**登记的两个非-pin 例外之一**
 * （另一个是 CLI 演示内嵌 `DEMO_ACCEPTANCE`，归装配）。该来源**没有 pin，且不该有**：pin 的语义是对
 * **预先钉住的产物**做篡改检测，而桌面是**运行期实时人授权**（客户已定「导入项目 = 授权、无弹窗」）——
 * 授权由人在导入这一刻当场作出，没有可预先钉住的固定产物；硬加 hash 是**假证据**（既不表达「谁在何时
 * 授权了什么」，也检测不到任何篡改）。故它是**结构上不同于 pin 的授权来源**，不是「漏写 pin」。
 * （具体构造见 `app/desktop/session.ts`，经参数传入本函数。）
 *
 * governanceBoundary.path：**采纳载入器给出的项目治理边界路径**（见 `buildEffectiveProjectConfig`）——
 * 非空时 `resolveBoundarySection` 走「**治理边界覆盖**」分支，**内置治理角色（su）**改由项目的治理边界文档治理
 * （`已 bootstrap 的项目里 su 按项目治理边界工作`）；**无 `.ans` / 无治理边界路径时传空串**，走原有回退
 * （`src/**` 拒绝判定不受影响）。
 *
 * builtInRoles：由枚举结果里 builtIn===true 的角色 id 填充，供**会话式入口**（openRoleSession / 桌面聊天）
 * 开启内置治理角色。这些角色无角色目录、不进 roles 映射；缺省为空集——不额外允许任何内置角色。
 *
 * genesisBootstrap（设计 §10.1 / §12.2，任务 T30）：**未 bootstrap 的项目**（`hasRoles === false`）时
 * 显式设置，把「**操作者导入空文件夹并开启内置治理角色对话**」这一授权事实交给门禁引擎——见下方注释。
 */
export function buildProjectConfig(
  listing: ProjectListing,
  acceptance: Acceptance,
  env: Record<string, string | undefined> = process.env,
  governanceBoundaryPath: string = "",
): ProjectConfig {
  const roles: Record<string, RoleLocation> = {};
  const builtInRoles: string[] = [];
  for (const r of listing.roles) {
    // 内置治理角色（su）没有角色目录；不进 roles 映射——门禁引擎据此把它下沉为 built-in-governance，
    // 并回退到内置边界。若强行登记，resolveRole 会去读一个空路径的角色卡而报错。
    if (r.builtIn) {
      // 但登记进 builtInRoles：本配置允许**会话式入口**（openRoleSession / 桌面聊天）开启它。
      // 数据直接来自门禁引擎的枚举结果（builtIn===true），桌面应用不自行发明角色 id。
      builtInRoles.push(r.roleId);
      continue;
    }
    roles[r.roleId] = { card: r.cardPath, boundary: r.boundaryPath };
  }

  // ——— 冷启动「有界创世例外」的触发（设计 §10.1 / §12.2，任务 T30）———
  //
  // 未 bootstrap 的项目（`hasRoles === false`：尚无任何**项目角色**）上，「**操作者导入空文件夹并开启
  // 内置治理角色对话**」这一刻本身，就是一次**操作者发起的 bootstrap**——故此处**显式**设 `genesisBootstrap`，
  // 把该授权来源如实交给门禁引擎：`resolveBoundarySection` 据此对**内置治理角色**返回「**项目根**」治理
  // 种子边界（**普通目录** `角色卡/`、`docs/`、`.ans/`；`scope: undefined` 下命中即放行，**无需 scope/slug**），
  // acceptance = 下面的 `source`。
  //
  // **这不是 blanket**：种子条目**仅此三处治理产物**（**不含 `src/`、不含项目内任意文件**），且**仅在
  // `!hasRoles` 时设**——「有界性不变」的实质在门禁引擎 `governance-seed.ts`，此处只负责**何时**设。
  //
  // **切换条件（§12.2，双保险之一）**：项目**一有角色**（`hasRoles === true`）就**不再设**本字段——su 随即
  // 改由**项目边界**治理（`resolveBoundarySection` 的**项目覆盖**分支），回到普通聊天。**另一重保险是门禁
  // 引擎的结构性自终止**：项目自己的治理边界文档一经写出并被接受（`governanceBoundary.path` 非空），
  // **项目覆盖分支先于创世分支求值**，创世授权随之失效——**即便本字段残留也不再生效**（不依赖调用方清除它）。
  //
  // `source` 如实记录该授权来源（供 F6 与审计）——**用枚举给出的 `primaryRoleId`，不硬编码 "su"**
  // （本项目既有纪律：入口/角色以数据表达）。
  const genesisBootstrap =
    listing.hasRoles === false
      ? {
          source: `desktop-app:操作者导入空文件夹并开启 ${listing.primaryRoleId} 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）`,
        }
      : undefined;

  return {
    projectRoot: listing.projectRoot,
    skillRoot: resolveSkillRoot(env),
    roles,
    builtInRoles,
    governanceBoundary: { path: governanceBoundaryPath, acceptance },
    // 仅在未 bootstrap 时附带（有角色即不带——见上方切换条件注释）。
    ...(genesisBootstrap ? { genesisBootstrap } : {}),
  };
}

/**
 * 桌面「导入即授权」的**运行期同意**（设计 §3.3「终态规则」**明确登记的两个非-pin 例外之一**——
 * 另一个是 CLI 演示内嵌 `DEMO_ACCEPTANCE`，归装配）。它**没有、也不该有 pin**：
 *  - pin 的语义是对**预先钉住的产物**做**篡改检测**；
 *  - 桌面的信任模型是**运行期实时的人授权**：客户已定「导入项目 = 授权、无弹窗」，授权由**人**在导入
 *    这一刻当场作出，不存在「先于授权而存在的固定产物」可供比对；
 *  - 给一个当场作出的授权硬加 hash 是**假证据**（既不表达「谁在何时授权了什么」，也检测不到篡改）。
 * 故它是**结构上不同于 pin 的授权来源**，不是「漏写 pin」。
 */
export const DESKTOP_RUNTIME_CONSENT: Acceptance = {
  accepted: true,
  source: "desktop-app:导入项目即授权该角色按其完整边界工作（原型，无客户 pin，已知偏离）",
};

export interface EffectiveProjectConfigDeps {
  /** 构造 ProjectConfig（**真实实现** `buildProjectConfig`；注入以便单测）。 */
  buildProjectConfig: (
    listing: ProjectListing,
    acceptance: Acceptance,
    env?: Record<string, string | undefined>,
    governanceBoundaryPath?: string,
  ) => ProjectConfig;
  /** 载入有效配置（`.ans` 优先）——**共享载入器**（`src/common/shared/config-loader.ts`，只读导入、不复制）。 */
  loadEffectiveConfig: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
}

/**
 * 桌面**授权链的唯一实现**（会话开会话与界面只读判定**共用同一份**，杜绝两处漂移）：
 *
 *  1. `fallback` = **运行期同意**（无 `.ans` 时，载入器原样返回它——既有「导入即授权」行为不放松）；
 *  2. **共享载入器**（`.ans` 优先）：有可用 `.ans` → 用其 **pin-backed acceptance**；无 → fallback；
 *     有但不可用 → fail-closed 未接受（**不回退**运行期同意）；
 *  3. **采纳载入器给出的项目治理边界路径**（`loaded.project.governanceBoundary.path`）并传给
 *     `buildProjectConfig`（→ `ProjectConfig.governanceBoundary.path`）。
 *
 * ⚠️ 第 3 步是**此前缺失的一环**：桌面曾**丢弃**该路径（恒空串）⇒ `resolveBoundarySection` 的
 * 「**治理边界覆盖**」分支被跳过 ⇒ **已 bootstrap 项目里的内置治理角色（su）掉回内置未接受、拒一切写**，
 * 且界面据此**误标「只读」**——bootstrap 建出的治理结构在桌面上成了空的。本函数即该缺口的修复：
 * 治理边界路径**如实取自** `.ans`（`src/model/role.ts` 注释早已写明的前提「`governanceBoundary.path` 非空
 * ⇒ 项目覆盖接管、创世自终止」，此前从未被满足）。
 */
export async function buildEffectiveProjectConfig(
  listing: ProjectListing,
  deps: EffectiveProjectConfigDeps,
): Promise<{ project: ProjectConfig; source: LoadedConfig["source"] }> {
  const fallback = deps.buildProjectConfig(listing, DESKTOP_RUNTIME_CONSENT);
  const loaded = await deps.loadEffectiveConfig({
    projectRoot: listing.projectRoot,
    skillRoot: fallback.skillRoot,
    fallback,
  });
  const governanceBoundaryPath = loaded.project.governanceBoundary?.path ?? "";
  const project = deps.buildProjectConfig(listing, loaded.source.acceptance, undefined, governanceBoundaryPath);
  return { project, source: loaded.source };
}

// —————————————————————— 文档/变更记录索引（展示用）————————————————————
export interface DocsIndexEntry {
  path: string; // 相对角色目录，如 docs/design/x.md
  kind: "file" | "directory";
}

export interface RoleDocsIndex {
  /** 变更记录：changelog.md 是否存在及正文（不存在为 null）。 */
  changelog: { path: string; text: string } | null;
  /** docs/ 目录索引（相对角色目录的路径 + 类型）。 */
  docs: DocsIndexEntry[];
}

const MAX_DOC_ENTRIES = 500;

/** 递归列目录（相对路径，正斜杠），跳过隐藏文件；有界以防异常目录结构。 */
async function walkDir(absDir: string, relPrefix: string, out: DocsIndexEntry[]): Promise<void> {
  if (out.length >= MAX_DOC_ENTRIES) return;
  let dirents;
  try {
    dirents = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  dirents.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  for (const d of dirents) {
    if (out.length >= MAX_DOC_ENTRIES) return;
    if (d.name.startsWith(".")) continue;
    const rel = relPrefix ? `${relPrefix}/${d.name}` : d.name;
    if (d.isDirectory()) {
      out.push({ path: rel, kind: "directory" });
      await walkDir(path.join(absDir, d.name), rel, out);
    } else if (d.isFile()) {
      out.push({ path: rel, kind: "file" });
    }
  }
}

/**
 * 读取某角色的变更记录与 docs/ 目录索引。
 * 输入 cardPathRel 为角色卡项目相对路径（如 角色卡/编排/role-card.md）；角色目录取其父目录。
 */
export async function readRoleDocsIndex(
  projectRoot: string,
  cardPathRel: string,
): Promise<RoleDocsIndex> {
  const roleDirRel = posixDirname(cardPathRel);
  const roleDirAbs = path.join(projectRoot, ...roleDirRel.split("/").filter(Boolean));

  // changelog.md
  let changelog: RoleDocsIndex["changelog"] = null;
  const changelogRel = `${roleDirRel}/changelog.md`;
  try {
    const s = await stat(path.join(projectRoot, ...changelogRel.split("/").filter(Boolean)));
    if (s.isFile()) {
      const text = await readFile(path.join(projectRoot, ...changelogRel.split("/").filter(Boolean)), "utf8");
      changelog = { path: changelogRel, text };
    }
  } catch {
    changelog = null;
  }

  // docs/ 目录索引
  const docs: DocsIndexEntry[] = [];
  const docsAbs = path.join(roleDirAbs, "docs");
  try {
    const s = await stat(docsAbs);
    if (s.isDirectory()) await walkDir(docsAbs, "docs", docs);
  } catch {
    // 无 docs 目录：返回空索引。
  }

  return { changelog, docs };
}


/** Converts the existing trusted listing only; renderer paths/evidence are never document candidates. */
export function projectDocumentCandidates(role: {
  roleId: string; builtIn: boolean; cardPath: string;
  changelog: { path: string; text: string } | null; docs: DocsIndexEntry[];
}): import("../../src/model/project-document.ts").ProjectDocumentRoleCandidates {
  return { roleId: role.roleId, builtIn: role.builtIn, cardPath: role.cardPath,
    ...(role.changelog ? { changelogPath: role.changelog.path } : {}), docs: role.docs };
}
