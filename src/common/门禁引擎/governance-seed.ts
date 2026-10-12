// 门禁引擎私有：**治理种子边界**（冷启动「有界创世例外」，设计 §10.1 / §12.2）。
//
// ── 归属（设计 §12.4）────────────────────────────────────────────────────────
// 种子边界本质是**边界/门禁**概念（一个 `BoundarySection1`），故其构造归本角色。此前它寄居在编排
// 私有的 `src/common/编排/bootstrap.ts`，并被 `boundary-core.ts` 跨角色导入——那是 **§6 违规**
// （跨角色导入他人私有 `common/` ＋ Service 层反向依赖 Pipeline）。**本文件即该违规的修复**：
// 函数**搬迁**到此（非 fork），`boundary-core.ts` 改从本角色内导入。
//
// ── §12.2 核心裁决：种子条目由 `conditional-directory` 改为普通 `directory` ──────
// 空项目上 su 的会话 `scope` 是 `undefined`（普通聊天，没有预先任务）。而条件目录须由
// `scope.conditions` **显式声明**其 slug 才激活（`resolve-write.ts` 的 `isActive`）⇒ 无 scope 时
// 条件目录**恒不激活** ⇒ su 一切写入被拒。改普通目录后：命中的目录（`角色卡/…`/`docs/…`/`.ans/…`）
// **直接 `allowed`**，不匹配的（`src/**`）**拒**——**无需 scope、也不需要 slug**。
// （不用「创世 scope」的理由：F4 的 `writeSet` 是**精确集合**，表达不了「`角色卡/<对话中才定的角色>/…`」，
// 且空 `writeSet` 的既有语义是「拒一切」。把门口放在**边界选择**层最干净——见 §12.2。）
//
// ── 有界性不变（仍非 blanket）────────────────────────────────────────────────
// 种子边界**只含** `角色卡/`、`docs/`、`.ans/` 三个 `directory`（**绝不含 `src/`、不含项目内任意
// 文件**），且**仅在 `ProjectConfig.genesisBootstrap` 被显式设置**（操作者发起的 bootstrap）时，由
// `resolveBoundarySection` 对**内置治理角色**返回。项目自己的治理边界文档一经写出并经 pin 接受，
// **项目覆盖分支先命中**，创世分支永不求值 ⇒ 授权**自终止**（结构性，不依赖调用方清除该字段）。

import type { BoundaryEntry, BoundarySection1 } from "../../model/boundary.ts";

/**
 * 项目治理边界种子文件（挂靠项目根）。它既是种子边界的 `boundarySource`（诊断标签），也是
 * bootstrap 写出项目边界文档的落点——写出并 pin 后创世授权即自终止（项目覆盖接管）。
 */
export const GOVERNANCE_BOUNDARY_REL = "角色卡/governance-boundary.yaml";

/** 项目根「普通目录」条目助手（种子边界的 root 恒为 `project`）。 */
function dir(path: string, purpose: string): BoundaryEntry {
  return { root: "project", path, kind: "directory", purpose };
}

/**
 * 项目治理边界种子条目（设计 §2.2 / §12.2）：以 **project 根**声明三个**普通目录**——
 * `角色卡/`、`docs/`、`.ans/`。`scope: undefined` 下命中即放行；`src/` 等不在集内，不匹配即拒。
 * **条目集合固定为这三个**（不含 `src/`、不含项目内任意文件）——这是「有界」的实质。
 *
 * 引导文案（客户 2026-10-12 裁定 C，从源头防）：每角色的边界文件**必须**是
 * `角色卡/<角色 id>/boundary.yaml`（YAML：`role` + `entries`），散文 `boundary.md` 不会被解析
 * （加载器只读 YAML 的 `role` + `entries` 结构，散文文件被判「Section 1 为空」）。格式要求与最小
 * 可抄示例的**单一来源**在 `BUILT_IN_ROLE_CARD_TEXT`（su 会话可见），此处 purpose 只作数据面提示，
 * 不另写一份长文案。
 * T-1（客户 2026-10-12 裁定「未通过产物」暂存区）：每角色一个项目根 `temp/<角色 id>/`，暂存
 * 被验收退回/要求返工的产物供审核对照（**不存**被门禁拒绝的写入内容——拒绝=零副作用）。种子
 * **不加** `temp/` 条目（创世种子恰为三处治理产物，不动写集）；temp 的完整约定同样以
 * `BUILT_IN_ROLE_CARD_TEXT` 为单一来源，此处仅在 角色卡/ 条目的 purpose 里交叉提示用途。
 */
export function governanceBoundaryEntries(): BoundaryEntry[] {
  return [
    dir("角色卡/", "项目治理产物：角色目录（每角色 role-card.md + boundary.yaml——必须 YAML：role + entries，散文 .md 不会被解析；另 memo/docs。未通过/返工产物另存项目根 temp/<角色 id>/——草稿区，不参与 pin）"),
    dir("docs/", "项目级文档脚手架（design/feature/change/fix）"),
    dir(".ans/", "项目初始化产物（.ans/project.json）"),
  ];
}

/**
 * 供门禁在**冷启动创世**下求值的治理种子边界（内存态，项目根）。
 * 授权证据 = **操作者发起的 bootstrap 指令本身**（作为 `acceptance.source`；§2.4 / §12.2）。
 * `source` 为空时 `resolveWrite` 的 F6 仍会拒绝一切写入（fail-closed）——不因「声称创世」而放行无证据的写入。
 */
export function buildGovernanceSeedBoundaryForGate(source: string): BoundarySection1 {
  return {
    entries: governanceBoundaryEntries(),
    boundarySource: GOVERNANCE_BOUNDARY_REL,
    acceptance: { accepted: true, source },
  };
}
