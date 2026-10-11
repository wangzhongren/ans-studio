# 项目管理 变更记录（治理动作）

## 2026-10-11 — Governance 移除编排 Section 1 一条已失效条目（`src/interface/cli/init.ts`）

**性质**：跨角色治理动作，**只减不增**。客户已**废除 `ans init` 命令**（改为「导入空文件夹 → 与内置治理角色 su 对话 → su 建角色」），编排据此**删除**了 `src/interface/cli/init.ts` **整个文件**（能力迁入 `src/common/编排/bootstrap.ts`）。于是 `角色卡/编排/boundary.yaml` 里授权该文件的条目失效——它授权的是一个**不存在的文件**。本记录由 **ANS Governance（内置治理角色 su）** 以治理身份写入；**只有 Governance 能改各角色边界 Section 1**。

**移除的是什么（原文）**。`角色卡/编排/boundary.yaml` 的 `entries` 删除一条：

```yaml
  - kind: file
    path: src/interface/cli/init.ts
    purpose: ans init 命令的解析与输出
```

**为什么**：`ans init` 命令已废、`src/interface/cli/init.ts` 实体文件已删（实测 `existsSync` = false），该条目授权一个不存在的路径，属**死条目**。保留它只会让白名单与实际代码漂移，且是无效授权。

**该改动只减不增**：本次**仅移除**一条写入权限，**未授予任何新路径**、**未新增任何条目**，编排 Section 1 条目数 **16 → 15**。同文件其余条目、注释头、以及其它任何文件**均未改动**。

**编排未自改而是交出**：编排**未**自行编辑自己的治理产物（边界 Section 1 是 Governance 专属写权），而是把该变更**交出给 Governance** 执行——符合治理流程。

**自证（Governance 独立执行，临时脚本置于系统临时目录，未入库）**
- `parseBoundaryYaml` 解析改后 `角色卡/编排/boundary.yaml` → **不抛错**，条目数 **15**。
- `src/interface/cli/` 下现存两个文件**仍在白名单**：`run.ts`、`govern.ts`（`kind: file`）→ `resolveWrite` 均为 `allowed: true`，**未误删**。
- 负例：`init.ts` 目标 → `resolveWrite` `allowed: false`（理由「目标路径未匹配任何边界条目（根：project）：src/interface/cli/init.ts」），证明失效条目确已移除。
- 磁盘确认：`src/interface/cli/init.ts` **不存在**。

**回归**：`node --test "test/**/*.test.ts"`（**带引号**，走 Node 的 glob）全量 **445 通过 / 1 失败**；唯一失败为 `test/测试/real-entry.test.ts` 中 `ans init` 的旧断言（已排给测试角色，**非本次改动引入**），除该条外全绿。

**边界与合规**：仅写 `角色卡/编排/boundary.yaml`（治理授权本体）与项目管理变更记录（全项目变更记录归档于此）。未读 `.env`、未发网络请求、未打印凭据；未改任何其他角色文件。

**记录更新**：本文件（`角色卡/项目管理/docs/change/`）。
