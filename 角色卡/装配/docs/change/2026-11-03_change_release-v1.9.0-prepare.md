---
id: v1.9.0-release-prepare-20261103
type: change
title: v1.9.0 发布准备：契约 schema 查询、客户授权平面与角色资料抽屉修复
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related: []
events:
  - date: "2026-11-03"
    kind: created
    summary: 客户决定发布 1.9.0 版（功能版）；版本 1.8.4→1.9.0；README 当前版本/下载表/要点 → v1.9.0
  - date: "2026-11-03"
    kind: verified
    summary: 本地预检 npm run typecheck 0、装配测试 87/87 通过
---

# v1.9.0 发布准备

客户已授权发布 **1.9.0 版（功能版）**（同前几轮形态：未签名 ZIP）。本轮只做发布准备：版本标识、README 发布说明与本记录；打 tag、流水线钉版与发布 workflow 在后续轮次完成。prepare PR 合并提交与 tag SHA 待下一轮回填。

## 版本与冻结源

- 版本 1.8.4 → **1.9.0**（minor / 功能版）。`package.json` 与 `package-lock.json` 仅根两处版本字段（`package-lock.json` 的根 `version` 与 `packages[""].version`），依赖与锁结构零变动。
- 发布源（冻结源）：`origin/main` 当前 **`72baac4`**（`Merge pull request #42 from wangzhongren/fix/role-profile-layout`），包含自 v1.8.4 以来的三项功能变更：
  - PR #38/#39/#40 `contract-schema-query`（提交 `ed3d6f3` / `bf33f31`，合并 `9f1a894` / `f104029` / `4c3a6e4`）：`contract_check` 只读 schema 查询（modules/roster/topology）与逐字段错误诊断；
  - PR #41 `customer-authorization-plane`（提交 `0963f48`，合并 `cfb685a`）：`@审批` / `@决策` 标记、`customer.directives.jsonl` 账本、两个消费者与审计归属；
  - PR #42 角色资料抽屉布局修复（提交 `3302a2b`，合并 `72baac4`）：容器查询适配。
- prepare PR 合并提交与 annotated tag **`v1.9.0`** 的 SHA：**待下一轮回填**（本轮不打 tag、不触发 workflow）。
- 发布准备提交：`chore(release): prepare v1.9.0`（本轮，PR 待创建）；流水线切换与发布记录在后续轮次完成。

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

- `package.json`、`package-lock.json`：仅版本字段 1.8.4 → 1.9.0。
- `README.md`、`README.en.md` 发布区：当前版本 v1.9.0（2026-11-03 发布）；下载/校验链接指向 v1.9.0 资产；SHA256 表按先例留待发布后回填（中文「发布后回填」、英文 "filled in after release"，不预填、不虚构）；要点补充上述三项内容；发布记录链接指向本文件。
- 本文件。
- 未改（留给下一轮）：`release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`。

## 本地预检

2026-11-03，Node v24.22.1 / npm 11.19.1，工作树 `release/v1.9.0-prepare`（基于 `72baac4` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.9.0`，`tsc --noEmit` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 87 tests / 87 pass / 0 fail / 0 skip（duration ≈ 7.6s） |
| `npm run typecheck:renderer` | — | 未执行（本轮无渲染层代码改动；发布 workflow 覆盖） |
| `npm run build:renderer` | — | 未执行（同前几轮口径） |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（tag v1.9.0 尚未创建） |

装配测试中的 `release-packaging.test.ts` 仍断言当前流水线的 `SOURCE_REF='v1.8.4'`（下一轮切换），本轮如常通过，无预期失败；未删除测试、未放宽断言。

## 发布配方（下一轮）

- `release-policy.mjs`：`SOURCE_REF='v1.9.0'`、`SOURCE_SHA=<tag 合并提交 SHA>`；白名单保持基础集与历史保留条目（若有发布阻断修复，按 v1.8.0/v1.8.2 先例逐文件加入）。
- `release-policy.d.mts`：字面量同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言切到 v1.9.0；历史批次用例保留。
- `.github/workflows/release.yml`：source_ref 默认、并发组、`gh release` 引用、标题与 notes → v1.9.0；`publish` 默认 false。

## 证据边界

- 本轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck` 与装配测试；未运行全量测试、`typecheck:renderer`、`build:renderer`、prepare 预演，未触发 CI，未打 tag。
- 本轮产品能力的验证证据沿用（不重跑）：`contract-schema-query` 的 E2（AC-1–AC-18、K1–K8 全 pass）与 T3 回归（3478/3451/9/18 对 B0 3462/3435/9/18，新增确定性失败 0）；`customer-authorization-plane` 的 E2 v2 独立验收（23 pass / 0 fail / 0 insufficient / 1 N/A）与 T3 全量（403 文件 / 3624 tests / 3597 pass / 9 既有 Windows symlink EPERM / 18 skip）；角色资料抽屉修复的桌面UI 402/402、phase4b smoke 69/0 与双端 typecheck/build 0。完整回归与三平台构建由发布 workflow 作为独立门执行。
