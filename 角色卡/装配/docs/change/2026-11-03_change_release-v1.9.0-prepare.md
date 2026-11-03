---
id: v1.9.0-release-prepare-20261103
type: change
title: v1.9.0 发布准备：契约 schema 查询、客户授权平面与角色资料抽屉修复
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-11-03"
    kind: created
    summary: 客户决定发布 1.9.0 版（功能版）；版本 1.8.4→1.9.0；README 当前版本/下载表/要点 → v1.9.0
  - date: "2026-11-03"
    kind: verified
    summary: 本地预检 npm run typecheck 0、装配测试 87/87 通过
  - date: "2026-11-03"
    kind: updated
    summary: PR #43 合并（1fb2d63，含 prepare 4d023ce）；annotated tag v1.9.0 已打并推送（tag 对象 04d9941，指向 1fb2d63）
  - date: "2026-11-03"
    kind: verified
    summary: pipeline 钉版本轮完成并本地验证——node --test 装配 87/87、npm run typecheck 0
---

# v1.9.0 发布准备

客户已授权发布 **1.9.0 版（功能版）**（同前几轮形态：未签名 ZIP）。发布准备（版本标识、README 发布说明与本记录）已随 PR #43 合并（`1fb2d63`），annotated tag `v1.9.0` 已打并推送。本轮完成流水线钉版：发布策略与声明、打包测试、release workflow 切到 v1.9.0。发布 workflow 触发与发布在后续轮次完成。

## 版本与冻结源

- 版本 1.8.4 → **1.9.0**（minor / 功能版）。`package.json` 与 `package-lock.json` 仅根两处版本字段（`package-lock.json` 的根 `version` 与 `packages[""].version`），依赖与锁结构零变动。
- 发布源（冻结源）：annotated tag **`v1.9.0`**（tag 对象 **`04d99416223e6629f20e13a2be3840b1366f8e0a`**）→ prepare PR #43 合并提交 **`1fb2d634ef1b337775cbb48ed566412b0339c0b0`**（含 prepare 提交 `4d023ce`）。其产品代码基线为原 `origin/main` **`72baac4`**（Merge pull request #42 from wangzhongren/fix/role-profile-layout），包含自 v1.8.4 以来的三项功能变更：
  - PR #38/#39/#40 `contract-schema-query`（提交 `ed3d6f3` / `bf33f31`，合并 `9f1a894` / `f104029` / `4c3a6e4`）：`contract_check` 只读 schema 查询（modules/roster/topology）与逐字段错误诊断；
  - PR #41 `customer-authorization-plane`（提交 `0963f48`，合并 `cfb685a`）：`@审批` / `@决策` 标记、`customer.directives.jsonl` 账本、两个消费者与审计归属；
  - PR #42 角色资料抽屉布局修复（提交 `3302a2b`，合并 `72baac4`）：容器查询适配。
- 发布准备提交：**`4d023ce`**（`chore(release): prepare v1.9.0`，PR #43）；流水线切换提交：`ci(release): point pipeline at v1.9.0`（本轮）。

## 本轮变化（相对 v1.8.4）

- **`contract-schema-query`**：
  - `contract_check` 新增只读 `topic=modules|roster|topology`：直接返回字段表与最小合法 YAML 示例；topic 模式不读盘，输出限 4 KiB（roster ≤ 3900 B）；未知/非字符串 topic 拒绝，空/空白回退原有行为；
  - 校验错误拆成逐字段消息并报出实际收到的类型（如 `publicContract boolean:true`）；拓扑 management 提示与检查统一按扁平数组；错误码与接受/拒绝集合不变；
  - 策划角色的卡片补充 schema 查询指引与 `publicContract`/management 约束。
- **`customer-authorization-plane`**：
  - 主进程开头识别 `@审批` / `@决策` 标记：命中后不投递幕僚，经应用级 IPC 走确认面板与回执；
  - 新增 `customer.directives.jsonl` 账本：approval/decision 双 target 隔离、once/session/forever 期限、撤销；
  - shell 审批与 decision 卡两个消费者接线；Q9 审计归属扩展 `directive` + `directiveId`；
  - 桌面 UI 确认对话框、双指令面板与卡内入口。
- **角色资料抽屉布局修复**：宽屏下抽屉以 padding-right 推挤中列，而会话头紧凑/换行规则只按视口断点触发；抽屉打开不改变视口宽度，导致头部溢出、身份区被压至 0 宽、动作区越过抽屉边缘。修复给中列增加容器查询，抽屉打开时按容器宽度（≤728px）复用既有紧凑头部规则（纯 CSS，+29/−0），关闭态像素不变。
- 其余能力与 v1.8.4 相同。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.8.4 → 1.9.0（prepare 轮）。
- `README.md`、`README.en.md` 发布区：当前版本 v1.9.0（2026-11-03 发布）；下载/校验链接指向 v1.9.0 资产；SHA256 表按先例留待发布后回填（中文「发布后回填」、英文 "filled in after release"，不预填、不虚构）；要点补充上述三项内容；发布记录链接指向本文件（prepare 轮）。
- 流水线钉版（本轮）：`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`、`src/common/装配/release-policy.d.mts`、`test/装配/release-packaging.test.ts`。
- 本文件。

## 本地预检

### prepare 轮（PR #43 前）

2026-11-03，Node v24.22.1 / npm 11.19.1，工作树 `release/v1.9.0-prepare`（基于 `72baac4` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.9.0`，`tsc --noEmit` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 87 tests / 87 pass / 0 fail / 0 skip（duration ≈ 7.6s） |
| `npm run typecheck:renderer` | — | 未执行（本轮无渲染层代码改动；发布 workflow 覆盖） |
| `npm run build:renderer` | — | 未执行（同前几轮口径） |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（当时 tag v1.9.0 尚未创建） |

### pipeline 钉版轮（本轮，基于 tag v1.9.0 / 1fb2d63）

2026-11-03，Node v24.22.1 / npm 11.19.1，工作树 `release/v1.9.0-pipeline`（基于 `1fb2d63` 加本轮改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node --test "test/装配/**/*.test.ts"` | 0 | 87 tests / 87 pass / 0 fail / 0 skip（duration ≈ 6.1s） |
| `npm run typecheck` | 0 | `ans-cli@1.9.0`，`tsc --noEmit` 无诊断 |
| `grep -n "1\.8\.4" .github/workflows/release.yml` | 0（1 行匹配） | 仅命中发布 notes 中按要求保留的对照句「其余能力与 v1.8.4 相同」；source_ref 默认、并发组、`gh release view/create/upload/edit` 引用均已切到 v1.9.0，无其他 v1.8.4 字面量 |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（不触发 workflow；由发布轮独立门执行） |

说明：发布 notes 按发布说明需要保留「其余能力与 v1.8.4 相同」对照句，因此该 grep 仅命中 notes 一行；source_ref 默认、并发组与全部 `gh release` 引用等管线字段均无 v1.8.4 字面量。`release-policy.mjs` 的 `SOURCE_REF`/`SOURCE_SHA`、声明字面量与打包测试均随本轮切到 v1.9.0。

## 发布配方（本轮实际做法）

- `release-policy.mjs`：`SOURCE_REF='v1.9.0'`、`SOURCE_SHA='1fb2d634ef1b337775cbb48ed566412b0339c0b0'`；白名单**重置为基础集**（files＝`package.json`、`package-lock.json`、`.github/workflows/release.yml`；dirs＝`src/common/装配/`、`test/装配/`），**无产品/测试 overlay 条目**。v1.8.4 发布阻断修复条目及更早的 v1.8.0/v1.8.2/v1.7.0/v1.6.0/v1.5.0 精确条目均已随冻结源吸收，整批移出活动白名单（历史注释保留并标注「历史」）；fail-closed/excluded 机制不变。
- `release-policy.d.mts`：`SOURCE_REF`/`SOURCE_SHA` 字面量同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言切到 v1.9.0；v1.5.0/v1.7.0/v1.8.0/v1.8.2 四个历史批次用例改写为 fail-closed/excluded 断言（生产文件 `assert.throws(/Unreviewed production overlay/)`、测试/夹具路径精确 excluded、`selected` 为空），不删除用例、不放宽为恒真断言。
- `.github/workflows/release.yml`：source_ref 默认、并发组、`gh release` 引用、标题 `ANS Studio 1.9.0` 与 notes 切到 v1.9.0；`publish` 默认保持 `false`。

## 证据边界

- prepare 轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck` 与装配测试；pipeline 轮只改发布策略/声明、打包测试、release workflow 与本记录，并运行本地装配测试与 `typecheck`。两轮均未运行全量测试、`typecheck:renderer`、`build:renderer`、prepare 预演，未触发 CI，未打 tag、未移动既有 tag，未发布。
- 本轮产品能力的验证证据沿用（不重跑）：`contract-schema-query` 的 E2（AC-1–AC-18、K1–K8 全 pass）与 T3 回归（3478/3451/9/18 对 B0 3462/3435/9/18，新增确定性失败 0）；`customer-authorization-plane` 的 E2 v2 独立验收（23 pass / 0 fail / 0 insufficient / 1 N/A）与 T3 全量（403 文件 / 3624 tests / 3597 pass / 9 既有 Windows symlink EPERM / 18 skip）；角色资料抽屉修复的桌面UI 402/402、phase4b smoke 69/0 与双端 typecheck/build 0。完整回归与三平台构建由发布 workflow 作为独立门执行。
