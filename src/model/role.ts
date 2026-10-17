// Model 层：角色与来源的共享类型
// 冻结契约：角色卡/项目管理/docs/design/2026-10-11_design_ans-cli-v1-prototype.md §2
// 只用可擦除语法。

import type { Acceptance, BoundarySection1 } from "./boundary.ts";

export type RoleKind = "project" | "built-in-governance";

/**
 * 治理模型（客户 2026-10-17 拍板「V1 + V1b 分期；新项目 trio、旧项目默认 single 兼容」；
 * 冻结契约：`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §5.1）。
 *
 * - `"single"`：旧治理模型（内置角色 `su`）——**缺省值**，任何未显式声明 trio 的调用方行为逐字不变。
 * - `"trio"`：三权治理模型（`rapporteur` / `nominator` / `convener` 三个内置治理角色）。
 *
 * 模型来源：`src/common/shared/config-loader.ts::readGovernanceModel`（PM 属主，只读消费）；
 * `listProject` 按本模型枚举内置角色，`resolveBoundarySection` 按本模型选择边界来源。
 */
export type GovernanceModel = "single" | "trio";

/**
 * 内置治理角色的三权职能（评审 §5.1）：提案权 `proposal` / 提名权 `nomination` / 编排权 `schedule`。
 * 仅 trio 的三个内置治理角色携带；`su`（single）与项目角色为 `undefined`。
 */
export type GovernanceFunction = "proposal" | "nomination" | "schedule";

/** 角色卡声明的协作信息，仅供展示；不授予权限或改变角色身份。 */
export interface RoleGroupMetadata {
  readonly group?: string;
  readonly groupDuty?: string;
}

// F8：角色路径来自配置，不硬编码 角色卡/<角色>/
export interface RoleLocation {
  card: string; // 项目相对路径，如 角色卡/编排/role-card.md
  boundary: string; // 项目相对路径
}

export interface ResolvedRole extends RoleGroupMetadata {
  id: string;
  kind: RoleKind;
  cardText: string;
  boundary: BoundarySection1;
  boundarySource: string;
  location: RoleLocation;
  /** 仅 trio 的三个内置治理角色携带（proposal/nomination/schedule）；su 与项目角色不出现。 */
  governanceFunction?: GovernanceFunction;
}

export interface ProjectConfig {
  projectRoot: string;
  skillRoot: string;
  roles: Record<string, RoleLocation>; // F8：由配置提供
  /** 允许**会话式入口**（openRoleSession / 桌面聊天）开启的内置治理角色 id 列表。
   *  这些角色无角色目录、不登记在 roles 映射（登记会让 resolveRole 去读空 cardPath 而报错）；
   *  调用方（桌面应用）据门禁引擎 listProject 的枚举结果（builtIn===true）填充。
   *  缺省/未设置 = 不额外允许任何内置角色——此时仅 roles 登记的角色可寻址（CLI `ans role run` 即此情形，行为不变）。 */
  builtInRoles?: string[];
  /** 治理模型（评审 §5.1/§5.5）：缺省 `"single"`——旧行为逐字不变。
   *  由共享载入器 `readGovernanceModel`（PM 属主）与 `listProject().governanceModel` 填充；
   *  门禁引擎只读消费，不写 `.ans`。 */
  governanceModel?: GovernanceModel;
  governanceBoundary?: { path: string; acceptance: Acceptance };
  /** 冷启动「**有界创世例外**」的触发与证据（设计 §10.1 / §12.2，任务 T31）。
   *
   *  仅在**操作者发起的 bootstrap**（导入空文件夹并开启内置治理角色对话）时，由调用方（编排 / 桌面）
   *  **显式**设置——**不是** `acceptance.accepted === true` 的自动推论（若自动推论，任何已接受项目都会
   *  意外获得创世授权，即 blanket）。`source` 如实记录该操作者指令（供 F6 与审计）。
   *
   *  设置后，`resolveBoundarySection` 对**内置治理角色**返回「**项目根**」治理种子边界
   *  （**普通目录** `角色卡/`、`docs/`、`.ans/`——见 §12.2：由条件目录改为普通目录，故 su 的
   *  `scope: undefined` 下命中即放行，**无需 scope、也无需 slug**），acceptance 即
   *  `{ accepted: true, source }`——**这仍是有界授权**：条目仅此三处治理产物（不含 `src/`、不含
   *  项目内任意文件），且仅在**本字段被显式设置**时出现。
   *
   *  **自终止**：项目自己的治理边界文档一旦写出并经 pin 接受（`.ans/project.json` 令
   *  `governanceBoundary.path` 非空），`resolveBoundarySection` 的**项目覆盖**分支**先于**本字段求值，
   *  创世授权随之失效——**本字段即便残留也不再生效**（自终止是结构性的，不依赖调用方清除它）。 */
  genesisBootstrap?: { source: string };
}
