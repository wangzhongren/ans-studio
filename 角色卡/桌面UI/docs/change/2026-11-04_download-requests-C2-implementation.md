---
id: download-requests-c2-implementation
type: change
title: 变更记录：下载文件申请 C2 实施（桌面UI：judge 下载标签 / 指令面板 consumer / confirm 卡复用）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: implemented-unverified
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: 按 C2 提案 Revision 2 实施（implemented-unverified）：judge 结果行 download 标签、指令面板 download/旧 domain consumer 消费、复用 confirm 卡；桌面UI 55 文件 408/408/0/0、typecheck:renderer 0、build:renderer 0、i18n-guard violations=0；未 commit/push
---

# 变更记录：下载文件申请 C2 实施（桌面UI）

- **任务 / flowId / 档位**：`2026-11-04-download-requests` / `download-requests` / **T3**。
- **角色 / 节点**：桌面UI（渲染层 `app/renderer/`）/ 团队计划 §5.3 **C2（渲染消费）**。
- **状态**：**`implemented-unverified`**。实现与 C2 可执行的验证已完成、证据已采集；**未验收、未 commit/push**；不替代 D1 跨层/T3 全量、D2 真实 Electron 截图、E1/E2。
- **基线 [事实]**：分支 `feat/download-requests`，HEAD `57b5ff28768e0e7116c26c6b354b67f38ad792f1`（C1 本地提交）；开工 `git status --porcelain -- src app test` **为空**；`git diff --stat c2f1630..HEAD -- app/renderer/` **为空**（C1/A1/A2/B1 均未触渲染面）。

## 一、输入与版本（只读实测，与派发哈希逐字一致）

| 输入 | 行数 | SHA-256 |
| --- | --- | --- |
| C2 P1 提案 Revision 2（实施依据） | 275 | `ea47756f65765e8cb2db987f511737b23b75825a009ce8c28620aff9fdb2cd4f` |
| A2 实施记录（37 key 冻结） | 162 | `2dc48070172c0c12ba22e5a5df16cd37175f9b6cdfd9743e8022e62971a9d7f2` |
| B1 实施记录（`list()` epoch 投影） | 153 | `d8f3c8163497dec15c308e128d0a633d5951615964ee64a3376477fd12eaee06` |
| C1 实施记录（卡片/面板形状） | 236 | `73535351fa7cab2c305a48bf78f94dfbff6c4f8106c05c3897bd11d1a1ae945a` |
| 闸门 2 写集增补 F4/F5/F13 + V1 确认 | 32 | `000022cd6b18d9d6e084ff3e6d792f246ce70c5a8e577c1a67bfa85055270310` |
| B0 基线 v3（对照） | 213 | `1242c51496f03560cdcbffe48956077873c9944b9566b1f7ae45af80e966c30b` |

- 环境：Node `v24.22.1` / npm `11.19.1` / Windows 11 Pro 10.0.26300（同 B0 v3）。
- 冻结口径：A2 **37 key**（main 35 + ui 2；`ui.directive.panel.consumer.download` / `downloadLegacyOff`；`downloadStartsNow` 不存在）；B1 `list()` 形状 A（旧 domain ⇒ `consumer:"none"`，新 domain ⇒ `"download"`）；C1 卡片 `kind:"confirm"` + `cardKind:"download"`（`title`/`preview`/`detail`/`judgeNotice` 由 A2 key 组装）。

## 二、写集与实现（仅 `app/renderer/**` + `test/桌面UI/**`）

| 路径 | 动作 | 行数 | 内容 |
| --- | --- | --- | --- |
| `app/renderer/src/chat/judge.ts` | 改（+4/-0） | 995 | `governanceJudgeResultView()` 增加 `cardKind === "download"` 分支：headline 复用既有 `ui.judge.headline.autoApproved`；组标签/`badge` 沿用 `judgeGroupLabel()`（A2 复用 `ui.judge.mode.approval`）；`kindClass` 保持 `generic`；**不新增 key、不拼原始 token** |
| `app/renderer/src/stores/directive-store.ts` | 改（+22/-4） | 1098 | ① `DirectiveConsumer` 增加 `"download"`；② `asDirectiveConsumer()` 接受 `"download"`（避免条目被静默丢弃）；③ `CONSUMER_KEYS` 增加 `download: "ui.directive.panel.consumer.download"`；④ `directiveRowView()` 经 `consumerKeyOf()` 把 `consumer:"none"` + domain 映射 `ui.directive.panel.consumer.downloadLegacyOff`（形状 A）；⑤ `resourceView()` 去掉 domain 的 `main.directive.receipt.noConsumerSuffix`（path 保留） |
| `test/桌面UI/download-card.test.ts` | **新增** | 210 | 3 例：judge download 标签 zh/en（无 raw token）；consumer 映射（含严格解析保留、旧 domain、path、shell/decision 不变）；下载卡 confirm 渲染字段逐字保留 + `decisionCardView` 不产生 decision 卡面 |
| `test/桌面UI/directive-dialog.test.ts` | 改（+2/-2） | 396 | domain `resourceNoteKey` 由 `main.directive.receipt.noConsumerSuffix` 改为 `null`；path 断言保留；测试标题同步 |

- **未改**（静态实测无需改）：`app/renderer/src/chat/decision-dialog.ts`（blob/sha 与基线一致；`download` 走既有通用 confirm 路径：`DECISION_KINDS` 无 download ⇒ 优先级 3；`kind !== "choice"` ⇒ confirm）、`app/renderer/src/chat/decision-card.ts`（仅认 `cardKind:"decision"`）、`DecisionDialog.tsx`/`ConfirmCard.tsx`/`ChatRow.tsx`/样式（零改动）。
- **未写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`package.json`/`tsconfig*`/`vite.config.ts`、角色卡/边界/changelog、`docs/scheduling|acceptance|communication`、其他角色文档。
- **无新 IPC/通道/事件/组件/依赖**；不实现 IPC、不判 URL/路径、不调用判断器、不读 `.ans`、不比较 `createdAt`/不计算 epoch；`downloadStartsNow` 不消费。
- 实现顺序：测试（先写失败用例）→ `judge.ts` → `directive-store.ts` → 既有测试更新 → 静态门/套件/构建 → 候选哈希。

## 三、验证（原始日志见 `...-C2-evidence/`）

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `node --test --test-concurrency=1 test/桌面UI/download-card.test.ts` | **exit 0**；tests 3 / pass 3 / fail 0 / skipped 0 | `03a-new-test.log` |
| `node --test --test-concurrency=1 "test/桌面UI/**/*.test.ts"` | **exit 0**；**55 文件 / tests 408 / pass 408 / fail 0 / cancelled 0 / skipped 0 / todo 0**（duration 5308.17ms） | `03-desktop-ui-suite.log`；文件清单 `08-desktop-ui-test-files.txt` |
| `npm run typecheck:renderer` | **exit 0**（无输出） | `01-typecheck-renderer.log` |
| `npm run build:renderer` | **exit 0**（built in 336ms；仅 chunk-size/动态导入既有提示；`app/renderer/dist/` 忽略产物、非候选） | `02-build-renderer.log` |
| `node --test --test-concurrency=1 test/项目管理/shared/i18n-guard.test.ts` | **exit 0**；6 tests / 6 pass；`[i18n-guard] scanned=137 allowlisted=22 violations=0` | `04-i18n-guard.log` |
| `git status --porcelain -- src app test`（收尾） | 恰为本角色写集 4 项（2 M + 1 M 测试 + 1 ?? 新测试） | `07-status-src-app-test.log` |
| `git diff --cached --name-only` | 空（未暂存） | `00-staged.log` |

- **B0 v3 对照**：`test/桌面UI/**` **54 文件 / 405 tests / 405 pass / 0 fail / 0 skip** → 本候选 **55 文件 / 408 / 408 / 0 / 0**；增量恰为新测试 3 例；**新增确定性失败 = 0、新增 skip = 0**。
- i18n 守卫 `scanned` 由 B0 时期 136 变为 137（C1 新增 `app/desktop/download-request.ts` 进入扫描面；`allowlisted=22` 不变）；本 C2 文件零违规。

## 四、候选哈希（写盘后实测）

| 路径 | 行数 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| `app/renderer/src/chat/judge.ts` | 995 | `b91a2243e390fbb2578383da33bb0aa15501262c` | `7c36040fba2dba8f5a091e60a73fcf3996c9e56530e81f34b787533e11af9d51` |
| `app/renderer/src/stores/directive-store.ts` | 1098 | `135cab786256c8dd788863fead22f4fa03bf8e0f` | `fde4d42234b1924e5683a0c6c0bd9980c441f85c87848e4e3635ed04ec2e8fac` |
| `test/桌面UI/download-card.test.ts`（新） | 210 | `a28aa6e1cd8b7c43a21164ce346e43150c9ccd2d` | `b2afaac90e8072de5db7fbddcaaa98a4c87652ad73abc29ea922040b8b84e23a` |
| `test/桌面UI/directive-dialog.test.ts` | 396 | `f44241e3036bd6da6f1546b51935caa04a174a9e` | `3b89841ba15d845925d922c2dd9413e2d034f0437aca305bea175ba27fc7a5c0` |
| `app/renderer/src/chat/decision-dialog.ts`（未改） | 231 | `1548f1d452ce84b2796687afe974e4280f2730fc` | `c62d44b4e34308255ed8217539a4ec3f238429512cfd556c223f7f6c3b4d1679` |
| `app/renderer/src/chat/decision-card.ts`（未改） | 82 | `9c1d36b4aa561981b48e58a0a6fe9aff6fba76c8` | `6ff3f120b5efcf4bfca8e299d7fbee5df4a4d85bbca8e8458736c85c00f11753` |

- `git diff --stat`：3 个已跟踪文件 `+28/-6`（judge +4/0、directive-store +22/-4、directive-dialog.test +2/-2）；新增测试未跟踪。
- `app/renderer/dist/` 为构建产物/忽略文件，非候选。

## 五、冻结声明（C2 退出，`implemented-unverified`）

```text
C2-download-requests-renderer freeze v1 (C2 proposal Revision 2)
| baseline HEAD: 57b5ff28768e0e7116c26c6b354b67f38ad792f1
| role/node: 桌面UI / C2（Interface 层渲染消费：结果行标签 + 指令面板 consumer + confirm 卡复用）
| input contract consumed (frozen, read-only):
|   A2 37 keys = main 35 + ui 2 (ui.directive.panel.consumer.download / downloadLegacyOff);
|     downloadStartsNow absent, not consumed; judge reuse ui.judge.mode.approval / ui.judge.headline.autoApproved
|   B1 list() shape A: old domain => consumer:"none"; new domain => "download"
|   C1 card: kind=confirm, cardKind=download; title/preview/detail/judgeNotice mainT(A2); no unavailableReason
| renderer changes:
|   judge.governanceJudgeResultView: cardKind=download => headline ui.judge.headline.autoApproved;
|     groupLabel/badge unchanged (ui.judge.mode.approval); kindClass generic
|   directive-store: DirectiveConsumer + "download"; asDirectiveConsumer accepts it;
|     CONSUMER_KEYS download => ui.directive.panel.consumer.download;
|     directiveRowView: none+domain => ui.directive.panel.consumer.downloadLegacyOff; path keeps none
|     resourceView: domain no longer emits main.directive.receipt.noConsumerSuffix (path keeps)
|   decision-dialog.ts / decision-card.ts / DecisionDialog.tsx / ConfirmCard.tsx / styles: unchanged
| boundaries: no IPC/preload/main/src/desktop change; no new key/component/dependency;
|   no URL/path/epoch judgment, no .ans read, no judge invocation, no createdAt comparison
| checks: typecheck:renderer exit 0; build:renderer exit 0 (336ms);
|   test/桌面UI 55 files / 408 tests / 408 pass / 0 fail / 0 skip (B0 v3 54/405/405/0/0; +3 new);
|   i18n-guard scanned=137 allowlisted=22 violations=0; staged empty
| status: implemented-unverified (D1/D2/E1/E2 pending; independent acceptance pending)
| change rule: 结果行标签/consumer 映射/confirm 卡复用变化回桌面UI C2 并重跑本记录检查
```

## 六、AC 映射（C2 交付）

| AC | C2 证据 |
| --- | --- |
| AC-3（卡面可读） | 复用既有 confirm 渲染（未改 `decision-dialog.ts`/`DecisionDialog.tsx`）：`title`/`preview`/`detail`/`judgeNotice` 逐字保留；单测 `download-card.test.ts`；D2 真实截图仍由测试/D2 执行 |
| AC-14（标签） | `consumerLabelKey("download")`/`directiveRowView().consumerKey` = `ui.directive.panel.consumer.download`；条目严格解析保留；单测 + D2 面板截图 |
| AC-19（i18n） | 零硬编码；`ui.judge.mode.approval`/`ui.judge.headline.autoApproved` 复用与两个 ui key 消费；zh/en 断言；i18n-guard violations=0；D2 语言切换截图 |
| AC-27（旧指令标注） | `consumer:"none"` + domain ⇒ `ui.directive.panel.consumer.downloadLegacyOff`；`downloadStartsNow` 不消费；单测 + D2 面板截图 |
| AC-18/20 | 写集仅 `app/renderer/**`+`test/桌面UI/**`；无新 IPC/依赖/构建改动；候选哈希/命令/计数/status 已留证；全量 T3 归 D1 |

## 七、未完成 / 风险 / 交接

- **未做（按团队计划归后续节点）**：D1 跨层集成与 T3 全量、D2 真实 Electron 运行/截图（下载卡、judge 结果行、manual 转卡、面板 consumer/旧指令标注、语言切换）、E1/E2；C2 不声称整体完成。
- **D2 视觉证据**：卡面/结果行/面板的实际渲染与语言切换需真实运行截图；本实现只提供纯逻辑与静态门证据。
- **依赖事实**：A2 37 key、B1 `list()` 形状 A、C1 卡片形状均为只读冻结输入；任一变化使本 C2 证据失效并须重跑。
- **未改文件证明**：`decision-dialog.ts`/`decision-card.ts` 的 blob/SHA-256 与基线一致（§四）；`DecisionDialog.tsx`/`ConfirmCard.tsx`/样式无 diff。
- **风险**：旧 domain 标注的语义完全依赖 B1 `list()` 投影（`consumer:"none"`）；若 B1 改变投影，C2 会显示错误标签，需按冻结变更回 B1/C2 重跑。
- **交接**：D1 以本记录 §三/§四为对照（B0 v3 54/405/405/0/0 → 55/408/408/0/0）；D2 需真实运行验证卡片/结果行/面板；E1 披露 F5 写集增补使用与无新 key/组件事实。

## 八、证据索引

- 目录：`角色卡/桌面UI/docs/change/2026-11-04_download-requests-C2-evidence/`。
- 文件：`00-opening-state.log`、`00-status-src-app-test.log`、`00-staged.log`、`01-typecheck-renderer.log`、`02-build-renderer.log`、`03a-new-test.log`、`03-desktop-ui-suite.log`、`04-i18n-guard.log`、`05-hash-object.txt`、`05-sha256.txt`、`05-lines.txt`、`06-diff-stat.log`、`06-numstat.log`、`07-status-src-app-test.log`、`08-desktop-ui-test-files.txt`、`INDEX.sha256`（索引自身不入索引）。
- 状态：`implemented-unverified`；未 commit/push。
