---
id: appointment-artifact-gate
type: change
title: 写卡产物确定性门控——appointment-write 后校验 role-card/boundary，问题反馈 Crew 修正、不派 Steward
created: "2026-10-20"
status: implemented
---

# 写卡产物确定性门控

## 客户要求

「写角色的角色（Crew/Nominator 的 appointment-write）写完角色卡/边界后要有一个**确定性门控**——核对卡
的格式和文件是否都存在；有问题把具体问题反馈给 Crew 修正，不能继续推进，也不弹客户卡。」

## 改动（`app/desktop/interface.ts`）

### 1. `validateAppointmentArtifacts(projectRoot, roleIds, listing)`

对 appointment 的每个目标角色逐个检查（返回 `{roleId, path, issue}[]`）：

- `角色卡/<id>/role-card.md`：**存在、可读、非空**；至少一个 Markdown 标题（`^#{1,6}\s`）。
- `角色卡/<id>/boundary.yaml`：**存在、可读、非空**；用 **Service 公开出口
  `validateBoundaryYamlText`** 校验（与运行时加载器同一个 `parseBoundaryYamlDoc`，**不另写第二份解析器**）；
  顶层 `role` 与目录 id 一致（同一 `yaml` 包解析身份）；`entries` 非空。散文式 Markdown 混入导致的 YAML
  解析失败逐字反馈。
- 用 `listProjectFn` 刷新后的 `ProjectListing.warnings` **辅助定位**（缺文件/边界解析失败/角色重复/与内置
  冲突等）；已由直接检查覆盖的同类问题不重复报。不只依赖 `roles` 是否枚举到（角色卡空/role 不一致时
  `listProject` 仍会枚举）。
- 文件名的严格口径＝客户原话的 `role-card.md` / `boundary.yaml`（不把 `.yml`/`.md` 别名算通过）。

### 2. 触发面与处置

- **`runPostWriteAdvanceCheck`（appointment-write 后 / 内置治理角色 settle）**：
  - 角色已在 listing 但产物不合格 ⇒ 立即反馈、`continue`（不派 Convener）。
  - 角色仍有缺（listing 未枚举）⇒ 保留既有 100/300/600ms 有界重试（写卡落盘/缓存滞后）；**重试耗尽仍缺**
    ⇒ 逐 flow 执行同一校验并反馈 Crew（不再只记诊断）。
  - 全部通过 ⇒ 清除该 flow 的反馈去重，继续既有「派 Convener / 继续」逻辑。
- **`advanceGovernanceFlow` 的 appointment→Convener 路径**（先派 appointment-write 写卡、等角色出现）：
  角色出现后、派 Convener 前执行同一校验；不合格 ⇒ 反馈 Crew 并 `chainFail`（`ok:false, dispatched:true,
  targetRoleId:"nominator"`），**不派 Convener、不写派发账本**。
- 处置内容：
  - 向 **Crew/Nominator** 后台投一条修正任务（`openBackground`/`sendBackground`），逐文件列出
    `路径：问题`，并要求「**重新发 appointment-write 确认卡**」完成写卡；
  - 向 **Lead（主入口）** 落一条 delivery-note 系统行：「写卡产物未通过校验（流程 X）：N 个问题——已反馈
    Crew 修正；未派 Steward / 统筹、未把 appointment 步骤标为 done」；
  - **不弹客户卡**（全程不经 customerInput）；**不写** `dispatch.accepted`（appointment 步骤不会被标 done）；
  - 诊断 `advance.appointment.artifacts-invalid` / `advance.appointment.artifacts-rejected`。
  - **去重**：同 `projectRoot+flowId` 的问题哈希一致 ⇒ 只反馈一次（重复 settle/重复触发不刷屏）；问题变化
    （Crew 修正了一部分）⇒ 重新反馈；校验通过后清除，后续回归可再报。
  - 运行时无法确定/开会话/发送失败 ⇒ 只记诊断，下一次真实事件重试（不循环）。

## 测试与证据（真实输出）

- `test/桌面应用/interface.test.ts`：
  - 新增「重试耗尽仍缺文件 ⇒ 反馈 Crew（逐文件路径+‘文件不存在’+重发 appointment-write 卡）、不派
    Convener、不写派发账本、零客户卡、Lead 恰一条系统行；重复 settle/再次 appointment-write 不刷屏」；
  - 新增「role-card 空 / boundary 混 Markdown / role 与目录不一致 / entries 空 / 无 Markdown 标题 ⇒ 逐项
    具体反馈、不派 Convener、无客户卡」；
  - 既有「写卡后推进」「任命写卡→Convener」用例的夹具补写真实合法 role-card/boundary（门控生效后的
    应有前提），断言不放宽。**655/655 过**。
- `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts`（编排/验收侧规格文件，7 例，未修改）：
  正常写卡 ⇒ Convener 恰一次；缺 role-card / 缺 boundary / 空 role-card / boundary 混 Markdown /
  role 不一致 ⇒ Crew 收到具体修正任务、不派 Convener、零客户卡、重复 settle 不刷屏；Crew 修正后重新写卡
  ⇒ 校验通过并继续派 Convener 恰一次。**7/7 过**。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **655 计 / 655 过 / 0 红**（17.0s）。
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **40/40 过**（11.5s）。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- 只看客户点名的 `role-card.md` / `boundary.yaml` 文件名：若 Crew 写成 `boundary.yml` 等别名，门控会按
  「缺 boundary.yaml」退回（宁可 strict；如需放宽须客户拍板）。
- 「角色始终未写出」要在有界重试（~1s）后才反馈；极慢写盘可能导致一次提前反馈，Crew 修正/重发后校验
  会重新走（去重按问题哈希）。
- 归档角色（boundary `archived: true`）由 `listProject` 静默跳过；门控按缺文件反馈——归档角色不应出现在
  任命名单（上游任命卡校验负责）。
