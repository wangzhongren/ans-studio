# 项目管理 变更记录（治理动作）

## 2026-10-11 — Governance 补登记两处既有事实（编排 `pm-reviewer.ts`、装配 `package-lock.json`）

**性质**：跨角色治理动作。本记录由 **ANS Governance（内置治理角色 su）** 以治理身份写入；变更本体是两份角色边界 Section 1 唯一写入白名单的**补登记**——即把**业已存在、已在使用**的路径补入白名单，**不是对任何新能力的授权**。

- **补登记 1（编排）**：`角色卡/编排/boundary.yaml` 的 `entries` 新增一条
  `kind: file`、`path: src/pipeline/orchestration/pm-reviewer.ts`、
  `purpose: (b) 第二闸的真实接线：把命令原文交 pm 角色判读并取回复原文`。
- **补登记 2（装配）**：`角色卡/装配/boundary.yaml` 的 `entries` 新增一条
  `kind: file`、`path: package-lock.json`、
  `purpose: npm install 自动生成的依赖锁定文件`。

### 为什么这是「补登记已有事实」而非「新授权」

- **已存在、已在使用、已有测试覆盖**：
  - `src/pipeline/orchestration/pm-reviewer.ts` 是编排在 T8b 建立并接线完成的 `(b)` 第二闸组装（读该文件头部注释可得：产出 `PmAskFn` 经注入交给 `createShellGate`），已被 `test/编排/shell-review-chain.test.ts` 覆盖。它此前只是**漏登**在编排逐文件白名单里（该目录条目原本只列 `run-role.ts`/`govern-session.ts`）。
  - `package-lock.json` 是仓库刚装 `typescript`（devDependency）时由 `npm install` **自动写出**的依赖管理必然产物；其产生不依赖任何角色授权，也不构成新的写入能力面。
- **编排没有自改边界**：该文件的创建者（编排）**未自行**修改自己的 Section 1，而是把规整化交给 Governance——符合「只有 Governance 能改各角色边界 Section 1」的分权约束。本次补登记正是对这一交办事实的登记，未扩大任何角色的实际工作范围。
- **未新增写入面**：两条均为对**既有文件**的登记，白名单覆盖的路径集合与补登记前实际发生写入的集合一致，故不构成新授权。

### 附带核对：`src/pipeline/orchestration/` 逐文件登记是否仍完整

- 该目录实际文件为 `run-role.ts`、`govern-session.ts`、`pm-reviewer.ts` 三个；补登记后**三个均已在册**，无其它未登记文件。
- 是否将 `src/pipeline/orchestration/` 整体由逐文件改为 `kind: directory`：**给出建议但本次不改**。`kind: directory` 会将该目录内**任意**新增文件一并纳入授权，属扩大授权面的另一种决定，应由客户在需要时单独批准。（本记录仅作备忘，未落改动。）

### 校验依据（只读确认）

`src/common/门禁引擎/boundary-yaml.ts` 严格校验——只允许键 `kind`/`path`/`purpose`/`root`/`condition`；`kind` 三选一；`conditional-directory` 必带 slug 形状的 `condition`；`root` 取 `project`/`skill`，缺省 `project`。本次两条均为合法键组合（`file` + `path` + `purpose`，`root` 缺省为 `project`）。

### 自证（Governance 独立执行，临时脚本置于系统临时目录，未入库）

- `parseBoundaryYaml` 解析改后两文件 → **均不抛错**（编排 16 条、装配 21 条）。
- `resolveWrite` 正向：
  - 编排身份、目标 `src/pipeline/orchestration/pm-reviewer.ts` → **`allowed: true`**（命中条目 `pm-reviewer.ts` / `file`）。
  - 装配身份、目标 `package-lock.json` → **`allowed: true`**（命中条目 `package-lock.json` / `file`）。
- **回归**：`node --test "test/**/*.test.ts"` 全量通过（448 通过 / 0 失败，见本次会话验证输出）。
