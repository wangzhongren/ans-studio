---
id: test-shell-judge-final-decision-fixtures
type: fix
title: shell 判断「manual 即拒绝」最终裁决后的测试断言重写（c-manual-flow / u1-renderer）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related:
  - ../verify/2026-10-17_verify_shell-judge-and-abort.md
  - 2026-10-19_verify_all-roles-shell-approval.md
events:
  - date: "2026-10-19"
    kind: created
    summary: 按客户「审查只有同意和拒绝」最终裁决，重写 c-manual-flow 的 manual 弹卡断言；更新 u1-renderer 系统消息/系统通知源码钉
  - date: "2026-10-19"
    kind: verified
    summary: 目标套件全绿；test/测试 785/783/2（剩余 g-desktop/t29 为 HEAD 既有红）；全仓 3174/3169/3/2；typecheck 0
---

# shell 判断「manual 即拒绝」最终裁决后的测试断言重写

## 症状与任务背景

客户 2026-10-19 最终裁定：开启「替我审批」时，**判断 agent 是唯一审查者**——「审查只有同意和拒绝，
不需要我来同意，拒绝要给理由」。shell 通道（`app/desktop/operator-channel.ts`）已按此落地：

- judge `allow` ⇒ 执行；judge `deny` ⇒ 拒绝；
- judge `manual`（`unavailable` / `timeout` / `parse-failed` / `read-denied` / `budget` /
  `read-truncated` / `retry-capped` / `unsupported-engine` / `context-too-large` / `model-manual`）
  ⇒ **直接按 deny 处理并带具体人话理由，不调用 presenter、不弹客户确认卡、不发结果行**；
  审计保留 manual 事实（`verdict:"deny"` + `modelVerdict:"manual"` + 原 `reasonCode` + `manualAsDeny:true`）；
- allow 结果行投达失败（`row-failed`）同样按 deny 处理（不弹卡），审计 `modelVerdict:"allow"`；
- 开关关闭 ⇒ 旧手动确认卡路径逐字不变。

本角色旧用例仍按 2026-10-17 的「manual ⇒ 原确认卡 + `judgeNotice`」口径断言，故在真实产品行为下
必然失败；同时 UI 侧把会话重建等系统注入改成了 `【系统通知·<子类>】` 独立系统行
（`tool-rows.js::classifySystemNotice` 单一来源 + `.sys sys-notice`），u1-renderer 的旧源码钉失配。

跑前实测（`node --test "test/测试/**/*.test.ts"`）：**782 计 / 768 过 / 14 红**：

| 套件 | 红数 | 性质 |
| --- | --- | --- |
| `shell-judge-verify/c-manual-flow.test.ts` | 11 | 旧 manual 弹卡口径（本批重写） |
| `g2-verify/u1-renderer.test.ts` | 1 | 系统消息/系统通知源码钉失配（本批更新） |
| `g5-reasoning-verify/g-desktop.test.ts`（G3） | 1 | HEAD 既有红（推理强度 UI 改动，与本批无关） |
| `t29-pi-config-roundtrip.test.ts`（G-5） | 1 | HEAD 既有红（推理强度档位文案中文化，与本批无关） |

任务背景所述「15 红」实为上述 14 条 + 别的角色目录 `test/桌面应用/runtime-ui.test.ts` 1 条；
其中 c-manual-flow 文件实际为 11 个用例（另 2 条为 g-desktop/t29 的 HEAD 既有红）。

## 修复内容（只改本角色测试与文档，产品代码零改动）

### 1) `test/测试/shell-judge-verify/c-manual-flow.test.ts`（重写）

保留原测试意图与强度，断言翻转如下：

- 新增统一断言助手 `assertManualDenied(result, chain, expected)`，对每个 manual/row-failed 用例同时钉死：
  - `result.allow === false`（编排结论 = 拒绝）；
  - `result.reason` **逐字**等于具体人话（不再含「已转你手动确认」）；
  - `chain.displays.length === 0`（presenter 零调用、不弹原确认卡）；
  - 不产生新的判断结果行（防循环用例允许此前已有的 2 条 deny 行）；
  - 审计 `conclusion:"deny"`、`branch:"c-<tier>→a-deny"`、`by` 归 `operator:judge:<引擎>`；
  - 审计 `judge` **深度等于** `{engine, verdict:"deny", modelVerdict, reasonCode, tier, manualAsDeny:true, reason}`，
    即保留 manual 事实、不伪装成模型主动 deny；
- 逐用例覆盖（11 条旧用例全部保留 + 2 条对照）：
  1. 会话不可用（bindError）⇒ `unavailable`，理由「判断服务不可用…」；
  2. 超时 ⇒ `timeout`，理由「判断超时…」，底层会话 abort/dispose 各 1；
  3. 输出不可解析 ⇒ `parse-failed`，理由「判断结果无法解析…」（`c-review→a-deny`）；
  4. allow + 读取被拒（真实驱动、`.env` 哨兵）⇒ `read-denied`，理由含具体路径/类别
     （`.env（环境变量文件）`）且不泄露内容；
  5. allow + 读取预算耗尽（显式 `maxCalls:8`）⇒ `budget`，理由「读取预算已用尽…」；
  6. allow + 读取截断（显式 `maxFileBytes:64KiB`，70KiB 文件）⇒ `read-truncated`，理由「读取内容被截断…」；
  7. 防循环：同命令连续 deny 达上限后不再调用模型 ⇒ `retry-capped`；同时回归前两次模型主动 deny
     仍各 1 条结果行、审计无 `manualAsDeny`；
  8. 引擎不支持（demo）⇒ `unsupported-engine`，不调用任何适配器（binds=0）；
  9. allow 结果行投达失败 ⇒ `row-failed` 按拒绝处理，审计 `modelVerdict:"allow"`；
  10. 请求超上限（命令 >16KB）⇒ `context-too-large`，不调用适配器（binds=0）；
  11. 模型自报 manual ⇒ `model-manual`；
  12. **对照**：judge allow/deny 正常路径不变（allow 0 卡 1 行、审计归 `judge:allow` 且无 manual 标记；
      deny 0 卡 1 行、理由按原格式、审计无 `manualAsDeny`）；
  13. **开关关闭**：presenter 仍被调用（恰 1 张旧确认卡、`judgeNotice === undefined`），判断 agent
      0 次调用，审计归 `operator:客户` 且不写 `judge` 字段。
- 不再期待 `judgeNotice` / 原确认卡；不再引用 `ui-labels.js::shellJudgeNoticeText` 的旧文案。

### 2) `test/测试/g2-verify/u1-renderer.test.ts`（源码钉更新 + 补强）

- 旧钉 `inj.label + (inj.sourceRoleId ? " · 来自 " + inj.sourceRoleId : "")` 已随实现更新为
  `sourceName` 派生（`displayNameOf(roleById(...)) || sourceRoleId`）；新钉保留原意
  **「来源恒空 ⇒ 无来自 X」**，并明确来源只认分类器的 `sourceRoleId`；
- 保留并更新「系统消息行单一来源」的四组钉子：
  - `el.className = "msg msg-injected is-" + inj.kind`（is-system 由归类 kind 派生）；
  - `inj.kind === "system" ? ICONS.shield`（shield 图标）；
  - 标签取分类器 `inj.label`、来源取分类器 `sourceRoleId`；
  - `.msg-injected.is-system` 样式钩子；撤回判据仍只认
    `var canWithdraw = v.kind === "message" && !running;`；
- 新增**系统通知单一来源**钉子：`tool-rows.js::classifySystemNotice` 函数存在、
  `classifyInjectedMessage` 先调用它（不复制第二份判据）、徽标文案由分类器构造
  （`label: sub ? "系统通知 · " + sub : "系统通知"`）；renderer 实时/回放两路都按
  `kind === "system-notice"` 走 `.sys sys-notice` 独立行，徽标/正文分别取
  `esc(inj.label)` / `esc(inj.displayBody)`，通知后的用户正文（`inj.remainder`）仍按普通消息另起一行；
- 新增**真实执行**的分类用例：`【系统通知】` / `【系统通知·会话重建】` ⇒ `kind:"system-notice"`、
  子类进徽标、通知正文到首个空行为止、其后用户正文进 `remainder`；行内提及 / 未闭合 / 空子类 /
  子类含标记字符等近似文本一律 `null`（不误伤普通气泡）；
- 卡片/恢复卡相关既有断言逐字保留。

### 3) 断言强度说明

- c-manual-flow：**没有删除用例、没有放宽判据**；每条 manual 用例从「1 张卡 + judgeNotice 文案 +
  审计人工」升级为「0 卡 + 精确拒绝理由 + 无结果行 + 审计完整 manual 事实」；并新增 allow/deny/开关关闭
  三条对照，覆盖改造可能波及的边界。
- u1-renderer：旧钉只覆盖 `[系统·<子类>]` 单一路径；新钉同时覆盖 `classifySystemNotice` 单一来源、
  实时/回放同解、`.sys-notice` 徽标与正文分离，并新增纯函数行为用例——强度只增不减。

## 验证（本角色独立执行，全部离线）

| 命令 | 结果 |
| --- | --- |
| `node --test "test/测试/shell-judge-verify/c-manual-flow.test.ts"` | **13 计 / 13 过 / 0 红** |
| `node --test "test/测试/g2-verify/u1-renderer.test.ts"` | **6 计 / 6 过 / 0 红** |
| `node --test "test/测试/shell-judge-verify/*.test.ts"` | **38 计 / 38 过 / 0 红** |
| `node --test "test/测试/g2-verify/*.test.ts"` | **60 计 / 60 过 / 0 红** |
| `node --test "test/测试/**/*.test.ts"` | **785 计 / 783 过 / 2 红 / 0 skip**（改前 782/768/14） |
| `node --test "test/**/*.test.ts"`（全仓） | **3174 计 / 3169 过 / 3 红 / 2 skip**（skip 为 Windows 平台条件） |
| `npm run typecheck` | **0**（无错误输出） |

### 逐红结论（修复后）

| 红 | 结论 |
| --- | --- |
| `test/测试/g5-reasoning-verify/g-desktop.test.ts:65`（G3 choices⇒select） | **HEAD 既有红**，与本批无关。`git show HEAD:app/renderer/renderer.js` 已无旧钉的 `choices.map(...)` 片段；属推理强度控件改版（`ff6dcbf`/`6d40eee`）后的测试漂移，归桌面UI 属主另批同步，本角色未改。 |
| `test/测试/t29-pi-config-roundtrip.test.ts:273`（G-5 choices 错误值域） | **HEAD 既有红**，与本批无关。产品 `app/desktop/runtime-config.ts` 使用注册表中的中文档位名（关 / 低 / 中 / 高 / 极高），测试仍期待英文值域；工作树未修改该产品文件（`git status` 无此文件）。归桌面UI 属主另批同步，本角色未改。 |
| `test/桌面应用/runtime-ui.test.ts:65` | **既有红**，位于别的角色目录（明确不归本角色改）。HEAD 的 `renderer.js` 已含侧栏 `localStorage` 持久化，与「renderer 无持久化」旧断言冲突。 |

本批修复的目标红（c-manual-flow 11 条 + u1-renderer 1 条）**全部转绿**；本批新增红 **0**。

## 产品侧观察（只登记，未改产品代码）

1. **审计类型未含 `manualAsDeny`**：`app/desktop/operator-channel.ts` 的 `ShellJudgeAuditWithManual`
   在运行时写入 `manualAsDeny:true`，但编排 `src/common/编排/shell-audit.ts` 的
   `ShellJudgeAuditRecord` / 契约家 `ShellJudgeAudit` 均未声明该字段。落盘 JSON 里字段真实存在，
   但按类型读取审计的消费方看不到这个「非模型主动 deny」标记（`modelVerdict` / `reasonCode` / `reason`
   已带类型）。建议由编排/桌面属主评估是否把该可选字段收进审计记录类型（或改由 `modelVerdict:"manual"`
   作为唯一判据）。
2. **旧 manual 卡片文案仍保留导出**：`manualJudgeNotice` 与 `ui-labels.js::shellJudgeNoticeText`
   在开关开启路径已不再使用（`#sc-judge-notice` 仅兼容旧调用方/回放）。当前不是缺陷，登记为后续清理候选。
3. **G3/T29 的红属推理强度 UI 改版的测试漂移**（详见上表），不在本角色本批任务范围；未改。

## 边界与提交

- 改动仅限 `test/测试/**` 与 `角色卡/测试/**`；产品源码（src/app）零改动。
- 未提交 git，未 push。
