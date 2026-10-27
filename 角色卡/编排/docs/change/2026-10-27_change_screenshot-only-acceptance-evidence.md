---
id: screenshot-only-acceptance-evidence
type: change
title: 验收标准/交付演示证据改为截图 only（不得要求录屏）
created: "2026-10-27"
updated: "2026-10-27"
timezone: Asia/Shanghai
status: implemented-unverified
related: [report-artifact-orchestration]
events:
  - date: "2026-10-27"
    kind: implemented
    summary: 客户新规则（ANS 系统，不是 demo）——验收标准/交付演示证据最多真实运行截图，不得要求录屏，缺录屏不得判失败；编排治理会话提示词与测试同步，定向 39/39、编排套件 1022/1024（既有 symlink 红）、typecheck exit 0
---

# 变更记录：验收标准/交付演示证据改为截图 only（不得要求录屏）

- 角色：编排
- 日期：2026-10-27
- 状态：**implemented-unverified**（编排提示词与测试已改并跑；门禁引擎角色卡/桌面验收任务文案由各属主
  同步，跨角色 e2e 与独立验收未做）
- 来源：客户 2026-10-27 新规则（**ANS 系统，不是 demo**）：**策划的验收标准最多截图，不能要求录屏**；
  验收/交付证据中的视觉证据最多真实运行截图，**不得要求录屏，缺录屏不得判失败**。经主控任务转达，
  仅更新编排边界内的标准工作流提示/流程文本与测试。
- 写集（实际只改以下文件）：
  - `src/pipeline/orchestration/govern-session.ts`
  - `test/编排/governance-session.test.ts`
  - 本记录、`changelog.md`
- **未改** `src/model/**`、`src/service/**`、`src/provider/**`、`app/**`、`src/common/门禁引擎/**`、
  角色卡、共享 i18n、PM、skill、游戏项目、`demos/`；**未新增**角色 / `FlowStepKind` / cardKind /
  权限；未 commit/push、未重启。

## 一、active 文案改动（全部在 `govern-session.ts`）

| 位置 | 以前 | 现在 |
| --- | --- | --- |
| `ENGINEERING_QUALITY_BASELINE`「交付」条（约 L628） | `启动命令、访问地址或截图/录屏` | `启动命令/访问地址 + 真实运行截图；验收证据最多截图，**不得要求录屏，缺录屏不得判失败**；日志/校验输出/哈希照旧保留` |
| `STANDARD_WORKFLOW_PROMPT`「验收标准」（约 L690） | 结构合格（验收表/风险档位/判定规则/证据计划） | 结构合格（验收表/风险档位/判定规则/证据计划——视觉证据**最多真实运行截图，不得要求录屏，缺录屏不得判失败**） |
| `STANDARD_WORKFLOW_PROMPT` Proof 复核流程 ③（约 L695） | `形成截图/录屏证据` | `形成**真实运行截图**证据；视觉证据最多截图，**不得要求录屏，缺录屏不得判失败**` |
| Steward（schedule）「质量与演示」（约 L911） | `启动命令、访问地址或截图/录屏` | `启动命令/访问地址 + 真实运行截图；视觉证据最多截图，**不得要求录屏，缺录屏不得判失败**` |
| Verifier（verification）「质量与演示核对」（约 L968） | `无启动命令/访问地址/截图/录屏` | `无启动命令/访问地址/真实运行截图`；并明确视觉证据**最多真实运行截图：不得要求录屏，缺录屏不得判失败** |
| Draft（proposal）「质量与证据」证据计划（约 L835） | `单元+集成+端到端与真实启动演示` | 追加 `视觉证据最多真实运行截图，**不得要求录屏，缺录屏不得判失败**` |
| single/su `ENGINEERING_QUALITY_STAGE_REQUIREMENTS`（约 L710） | `派发/流程须写清质量与演示要求` | 追加 `（视觉证据最多真实运行截图，不得要求录屏，缺录屏不得判失败）` |

保留不变：日志、校验输出、哈希、关 DEBUG、真实启动/可访问性、质量基线逐项核对、证据复用、风险档位、
架构核对、验收卡与「验收 ≠ 批准」纪律。

## 二、flow skeleton / acceptance 检查

- `src/common/编排/flow-service.ts::ensureFlowSkeleton`：八步骨架只定义 step id/kind/owner/dependsOn，
  无任何录屏要求；未改。
- `src/common/编排/flow-state.ts`：`visual-baseline` 注释已要求「DEBUG 关闭截图由 Proof 判」，无录屏；
  未改。
- 编排边界内其余提示词（`run-role.ts`、`common/编排/**`）无「录屏/录像/录制」要求（已全量 grep）。

## 三、测试与证据（2026-10-27，win32 / Node v24.22.1）

- `test/编排/governance-session.test.ts` 更新：
  - trio 五角色与 single/su 提示词均断言含 `真实运行截图`、`不得要求录屏`、`缺录屏不得判失败`，且
    **不得再出现** `截图/录屏`；
  - 标准工作流断言新增「验收标准证据最多截图」「Proof 演示证据为真实运行截图」两条；
  - 运营/质检纪律断言新增截图 only 关键字。
- `node --test test/编排/governance-session.test.ts` → **39/39 通过**。
- `node --test "test/编排/**/*.test.ts"` → **1024 计 / 1022 过 / 1 红 / 1 skip**（唯一红＝既有
  Windows symlink EPERM `shell-authorized-routine.test.ts:103`，与基线一致）。
- `npm run typecheck` → **exit 0**。

## 四、明确不做 / 跨角色缺口（需各属主按同一客户规则同步）

1. **门禁引擎角色卡**（属主，本批按任务边界不改）：`src/common/门禁引擎/governance-roles.ts` 仍有
   「截图/录屏」——`ENGINEERING_QUALITY_BASELINE`（约 L1389 测试夹具对应的同源条）、Convener 卡
   （约 L1079）、Verifier 卡（约 L1207）；门禁引擎测试仍按旧文本断言。两份质量基线原是「逐字一致」
   物理副本，本批造成**暂时不一致**，需该属主同步后恢复。
2. **桌面窗口**（属主）：`app/desktop` 的 `buildAcceptanceTaskMessage`/自动验收任务仍要求
   「截图或录屏」（`test/桌面应用/operator-wiring.test.ts`、`acceptance-dispatch.test.ts` 有断言），
   需桌面属主改为截图 only。
3. **运行时核心**：`test/runtime-core/request-choice-decision-card.test.ts` 的「录屏演示」是 decision 卡
   选项夹具，不属本规则要求面（未改）。
4. **未做**：跨角色 e2e、真实 Electron/模型端到端、独立验收、commit/push、重启。
