---
id: change_crew-write-validation
type: change
title: Crew appointment-write 后接受应用确定性校验并修正重发
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: Crew / nominator 卡新增写卡后应用校验纪律与边界文件格参；不改判定逻辑
events:
  - date: "2026-10-20"
    kind: implemented
    summary: Crew 卡补 appointment-write 后等待/接受应用确定性校验（role-card 非空且有标题、boundary role 与目录一致、entries 非空纯 YAML）；校验未通过反馈按文件/错误修正后重新发 appointment-write 卡，不得绕过校验/直接 write_file/把问题当客户同意
  - date: "2026-10-20"
    kind: verified
    summary: 门禁引擎套件 287 计 / 286 过 / 0 红 / 1 skip（新增 1 例）；npm run typecheck exit 0；未提交 git
---

# Crew appointment-write 后接受应用确定性校验

## 1. 客户要求

客户新要求：Crew / Nominator 的 `appointment-write` 写完后，应用会做确定性门控：

- 每个目标角色的 `role-card.md` 存在且非空；
- `boundary.yaml` 可解析，顶层 `role` 与目录 id 一致；
- `entries` 非空。

有问题时应用把**具体路径/错误**退回 Crew 修正，不派 Convener、不弹客户卡。本批只在**门禁引擎**
边界内补 Crew 卡纪律；不改 `app/**`、`src/common/编排/**`、`test/测试/**`。

## 2. 卡文本变更（Crew / `nominator`）

### 新增「appointment-write 后应用校验（必须）」段（位于 declined 段之后）

> 写卡完成后等待/接受应用的确定性校验——每个目标角色的 `role-card.md` 存在、非空且有 Markdown
> 标题；`boundary.yaml` 可解析、顶层 `role` 与目录 id 一致、`entries` 非空且为纯 YAML（不得混入
> Markdown 散文）。收到「角色卡/边界校验未通过」反馈任务时，按所列文件与错误修正后**重新发
> appointment-write 确认卡**；不得绕过校验、不得直接 `write_file` 绕过确认、不得把校验问题当客户
> 同意。应用校验不通过时不派 Convener、不弹客户卡，修正责任在 Crew。

### 角色边界文件格式段补充格参

> 写卡的确定性格参：`role-card.md` 必须存在、非空且含 Markdown 标题（如 `# <角色名>`）；
> `boundary.yaml` 顶层 `role` 必须等于目录 id（`角色卡/<角色 id>/boundary.yaml` →
> `role: <角色 id>`）；`entries` 必须非空；YAML 必须是纯 YAML，不要混入 Markdown 散文或额外代码围栏。

### 保留

- 既有任命卡 → appointment-write → 逐路径确认写卡的顺序不变。
- declined 修正重发纪律、不得绕过确认/直接 `write_file`/把原因当同意不变。
- 角色边界模板（只允许 `role`/`entries`/`archived` 顶层键、条目不写 `root`）逐字保留。

## 3. 测试（真实输出）

- `node --test "test/门禁引擎/**/*.test.ts"`
  - **287 tests / 286 pass / 0 fail / 1 skipped**（基线 280/279/0/1；本批新增 1 例）。
  - 新增：`标准工作流：Crew appointment-write 后应用校验——role-card 非空/标题、boundary role 与目录一致、entries 非空纯 YAML；失败修正重发`
    - 断言等待/接受应用校验、role-card 非空且有 Markdown 标题、boundary 可解析且 role 与目录一致、
      entries 非空纯 YAML、不得混入 Markdown 散文、校验未通过反馈按文件/错误修正后重新发
      appointment-write 卡、不得绕过校验/直接 write_file/当客户同意、不派 Convener/不弹客户卡。
    - 反向断言：不得把校验失败写成直接写文件绕过或客户同意。
  - 既有断言未放宽、未删除。
- `npm run typecheck` ⇒ **exit 0**。

## 4. 跨角色依赖（本角色边界外，未改）

1. **应用/编排**：确定性门控需在 appointment-write 写卡后执行——检查 `role-card.md` 存在非空且有
   Markdown 标题、`boundary.yaml` 可解析且 `role` 与目录 id 一致、`entries` 非空；失败把具体
   路径/错误退回 Crew。
2. 校验失败时**不派 Convener、不弹客户卡**；修正责任在 Crew（重发 appointment-write 卡）。
3. 卡文本只声明行为口径；不得直接 `write_file` 绕过确认仍由写权限/确认门机械保证。

## 5. 残余风险

- Crew 是否真的等待校验结果并按错误修正重发，依赖模型遵从；无机械检查「未修正不得重发」。
- 纯 YAML 校验的具体错误文案/格式由应用实现，卡文本只列要求。
- 真机端到端与独立复验未进行；未提交 git。

## 6. 边界与约束

仅改 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、
本文件、`changelog.md`、`memo.md`。未碰 `app/**`、`src/common/编排/**`、`test/测试/**`、
`src/provider/**`、`src/service/**`、其他角色文件/测试、真实项目；不读 `.env`、不跑真实模型/凭据/
网络；未 commit。
