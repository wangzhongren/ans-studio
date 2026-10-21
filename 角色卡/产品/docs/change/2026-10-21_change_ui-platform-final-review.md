---
id: change-ui-platform-final-review
type: change
title: UI 平台 Phase 5 产品面最终轻量复核——治理可见原则保持、生产方式升级完成，IA/视觉/交互语义未变
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: reviewed
related: [ui-platform-round, ui-platform-round-review, change-ui-platform-phase5-acceptance, ui-platform-phase5b-final-audit, change-ui-platform-phase5b-final-verification, ui-platform-phase5b-renderer-entry-20261021, post-v1-product-roadmap]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按独立验收 AC8/F3 补产品面最终轻量复核：只读核对 5B 唯一生产入口、测试 5B 最终验证、UIUX 生产入口终审、装配最终包与独立验收 AC1–AC8；结论为产品方向在本轮证据范围内兑现、生产方式升级完成、IA/视觉/交互语义未变，未覆盖项与证据限制逐条列明
  - date: "2026-10-21"
    kind: reviewed
    summary: 复核记录落盘；同步提案 status→implemented、feature-map、memo、changelog（随后独立验收重判 pass，见下条事件）
  - date: "2026-10-21"
    kind: verified
    summary: 独立验收已重判 AC1–AC8 全部 pass（报告 status 为 verified；AC3/AC8 补正已收口）；本文件时点措辞更新为「已补正 / 独立验收 pass」，结论与未覆盖边界不变
---

# UI 平台 Phase 5 产品面最终轻量复核

**范围**：客户 2026-10-21 已确认的「UI 平台化」方向（[提案 revision 3](../design/2026-10-21_design_ui-platform-round.md)，[post-v1 路线图](../design/2026-10-15_design_post-v1-product-roadmap.md)）在 Phase 5 交付后的产品面复核（轻量）。PM 评审 §16.4 要求「产品：最终产品面复核（轻量）；不新增功能」；独立验收 [AC1–AC8 报告](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md) 的 AC8/F3 曾指出本记录缺失，本文件即为该补正；补正后独立验收已重判 **AC1–AC8 全部 pass**（status: verified）。

**标准与依据**：独立验收固定标准 [A1](../../../独立验收/docs/design/2026-10-21_design_ui-platform-phase5-acceptance.md)；[测试 5B 最终验证](../../../测试/docs/change/2026-10-21_change_phase5b-final-verification.md)；[UIUX 生产入口终审 revision 4](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md)；[装配 5B 记录](../../../装配/docs/change/2026-10-21_change_ui-platform-phase5b-renderer-entry.md)；[独立验收判定](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)；PM [评审 revision 17](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md) §十六–§二十。

**权限声明**：本复核只写 `角色卡/产品/`。不授予提交、推送、合并、部署或发布；发布决定属客户。不重跑测试/e2e/打包，不连接真实模型/网络，未读 `.env`，未改产品、测试、他人报告或调度状态。

## 一、候选身份独立核对（只读复算，未重跑产品门）

| 项 | 值 | 核对方式 |
| --- | --- | --- |
| 唯一生产入口 | `app/renderer/dist/index.html`（581 B） | 本角色 `ls`/`cat` 与 `shasum -a 256` 独立复算 |
| 入口哈希 | HTML `3c4da2a2a4f99f6ffffdb737ccf854b3320bf2605a8d2b53190e5017ad33b301`；JS `f568e2aa…`（`index-BVLfGR_D.js`，825,985 B）；CSS `76fad7ce…`（`index-DUBNk8-R.css`，108,501 B） | 本机 `shasum -a 256` 三个值与测试/UIUX/装配/独立验收记录逐位一致 |
| 旧渲染器下线 | `app/renderer/` 顶层只剩 `index.html`（Vite dev 源入口）、`src/`、`dist/`、`tsconfig.json`、`components.json`；旧 `renderer.js`/`styles.css`/7 个经典脚本/`vendor/` 不在 | 目录列举；与独立验收 AC1 pass 一致 |
| 入口唯一接线 | `app/desktop/renderer-entry.ts` 只导出 `RENDERER_RELATIVE = ["renderer","dist","index.html"]` 与 `resolveRendererEntry`；`app/main.ts` 生产 `loadFile` 经它解析；`main.mjs` 默认同源 | 源码只读核对；与 AC1 记录一致 |
| 严格 CSP | `dist/index.html` meta：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`；单外链 module script + 单外链 stylesheet，无内联/unsafe | 直接读取产物 |
| 本地包（非发布件） | `release-output/local/ANS-Studio-1.4.0-mac-arm64.zip`，406,507,281 B，sha256 `edeeef19…` | 引用装配记录与独立验收复算，不重打包 |

**说明**：本角色只做入口/产物级复核与证据阅读；完整候选身份（HEAD `224cf83` + 冻结工作树、四份证据 manifest、128 张 UIUX PNG 哈希）由独立验收独立复算，见其报告 §一。本复核不重复判断 AC1–AC8。

## 二、产品方向「让治理可见 / 一眼三问」兑现情况

**结论：在本轮证据范围内兑现（作为呈现契约，不是新功能）。** 三个问题对应的既有界面行为在 5B 唯一生产入口上都有官方套件/审计证据，没有发现为「好看」隐藏治理事实或把能力缺席说成可用的证据。

| 问题 | 界面对应（已有行为） | 5B 证据（引用，不重跑） | 判断 |
| --- | --- | --- | --- |
| 1. 现在谁在干活？ | 左树五角色/工作角色、忙碌/空闲、当前轮次、引擎选择、工作概览队列 | UIUX A–L：B 左树 1360/960/200 通过（含 200% 左树可见/可滚动，旧端 `h=0` 已 closed）；H 工作概览/队列通过；main 397 名 `E2E_PASS=true`；DELIVERY_NOTE 9/9（身份在 data/aria，无第三行可见徽标）；5B uiux 23/23（含 MIRROR 五角色） | **保持**；200% 下比旧端更如实可读 |
| 2. 什么在等我决定？ | shell/写盘确认卡、恢复卡、治理卡（提案/任命/排期/验收）、P7「待选择」聚合、队列角标、「替我审批/替我决策」开关与 judge 代批标注 | COMPLETE_FLOW 41/41（P7 未决 choice 聚合「待选择」）；4B 治理三权/镜像/记录/报告与 JUDGE 33/33；5B uiux 23/23 全绿；UIUX E/F/I/J 通过（200% 遮挡门全过） | **保持并更明确**；镜像卡动作 200% 可读 |
| 3. 为什么被拦住、为什么不能做？ | 门禁拒绝（越界路径）、F6/未接受边界、缺配提示与设置恢复入口、恢复空态、失败态 | main 397 名含 denied/recovery/missing-config 检查；UIUX 缺配条/失败态 480/680 无横滚；S0 空态 1360/960/680 true 与 480 补充 25/25；`RESTORE_*`/`BOOTSTRAP_*` 等价覆盖经 PM §19/§20 批准 | **保持**；缺配恢复路径可见 |

**限定**：①「一眼三问」是产品方向与呈现契约，本轮未新增任何问题/功能；②最窄 480 CSS（200%）仍有 5 条 P2（镜像 chip 压动作带、报告/交付完整卡标题在视口外、缺配条下半被 composer 覆盖、截图命名、harness 标记）——UIUX 判定不阻塞 5A/5B 门，但会局部削弱「一眼」体验，登记为后续打磨项，不写成已解决；③上述判断依赖 UIUX/测试报告证据，未做产品亲操作走查（本轮范围是轻量复核，不重跑）。

## 三、用户可感知变化（生产方式升级的结果，非新功能）

本轮承诺「产品行为不变、生产方式换一套」；下列变化客户可感知，但都属于质量/一致性/诚实呈现，信息架构、深色石墨视觉、整页等宽、900 列/15-27 等交互语义未变：

1. **单一生产入口与严格 CSP**：生产只加载 `dist/index.html`（单 JS+单 CSS，`script-src 'self'`），旧 8 个渲染文件与 `vendor/` 下线；packaged smoke 14/14（entry/rootMounted/driver/csp/…/load）。
2. **200% 缩放旧缺陷关闭**：左树在 200% 可见/可滚动（旧端 `#role-tree h=0`）；头部/输入区 480/680 CSS 无横向溢出；治理预览 1360=900/960=654/200≤width 且 Esc 可回；报告/完整摘要/治理预览/镜像动作/交付 facts 的 `bottom <= composer.top` 遮挡门全过；长历史 composer 可达（chat 内部滚动）。
3. **阅读密度与状态呈现**：1360 无提示 ≥9、带提示 ≥8（8/576.4）、960 ≥4；忙碌转轮统一 `motion/react` 0.9s + reduced-motion；注入盒行高 1.6；侧栏身份进 `data`/`aria`，不靠重复第三行徽标。
4. **聊天流关键行为**：`full replay preserves content identity`（offset `-607`→`-607`，差 0<2px）；P7「待选择」；Markdown 链接点击外开且窗口 URL 不变（双层修复）；懒挂载 10/10；C1 `Δ=20`（目标≤20）。
5. **忙时切换项目（P1-3）语义**：切换立即生效、旧会话仍 live/可返回、队列存活（7 项 `P13_*` 新检查全 true，PM §17.4 批准新增）；旧确认条按 OLD-ONLY/REMOVED 退役，**确认条本身留 Phase 6 产品待办**（见 §五）。
6. **质量底线可执行**：gzip 288,530 B（UIUX/装配，含 HTML）/289,095 B（测试，入口 JS+CSS）≤307,200 B；typecheck 0；新单测 142/142；旧基线 504/504；IME 26 true；bench 六指标全过护栏；design audit 31/31；UIUX A–L 1360/960/200 全通过。

## 四、未覆盖与证据边界（不能写成已通过）

**六类 missing-evidence（独立验收 §五，按原样继承）**：

| 项 | 本轮状态 |
| --- | --- |
| 真实模型/网络/`.env` 生产验证 | 未判；离线夹具/替身只证明离线行为 |
| Windows 原生路径、OS DPI 缩放、屏读 | 未判；macOS 与 zoom factor 200% 不能代替 OS/DPI 200% |
| 签名、公证、安装器、自动更新 | 未判；本地未签名 ZIP 只作 packaged smoke |
| 发布流水线与 CI（`release.yml`/`release-policy.mjs`） | 未判（M1：本轮不改；两文件零 diff，未接入） |
| Linux/其他平台 | 未判 |
| 真实主进程卡通道/真实引擎会话（非替身） | 未判；套件使用离线 IPC 替身/夹具 |

**证据限制与已收口的补正（独立验收 AC3/AC8 已 pass）**：①旧端 uiux 快照套件 `d568bf82` ≠ 最终 `fa3f74d4`，旧端已删不可补跑，按「实质等价 + 版本限制」记录——424 个旧通过名在新端全部存在且 true、0 个旧通过→新失败；②design audit 旧端不可运行（exit 1，无 report），只按「旧端不适用 + 新端全过」记录；③`OPEN_CARD_AT_ARRIVAL` 207→206 已补列 G3（PM §19.3 索引归一化），独立机器核对 380 行、值不匹配 0；④候选同期无关的 `src/common`/`provider`/`model`/`service`/adapter 测试改动已分离说明；⑤5B CSS 差异归因与 probe 相对资产口径已修正；⑥`test/测试` 唯一红为环境缺真实 `rg` 二进制（未改断言/未 skip，非产品回归）；⑦契约面与产品复核文档已收口（本文件即产品侧一项）。以上均为文档/台账问题，不是产品行为回归；补正后独立验收已重判 AC1–AC8 全部 pass。

**UIUX 终审 P2 ×5（登记、不阻塞）**：480 镜像 chip 与动作带重叠；480 报告/交付完整卡标题在视口上缘外；480 缺配条下半/「打开 Pi 设置」被 composer 覆盖（header/设置入口仍可恢复）；main 3× 200% 截图位/命名；smoke/4B「窗口控制不可用」harness 标记（非产品）。

## 五、与 post-v1 路线图的关系

- **本轮完成的是生产方式升级，不是产品阶段推进**：Phase 0–5 的六阶段路线全部落地（设计门→工具链→骨架→聊天流→资料与设置→切换与审计），5A/5B 门通过、唯一生产入口切换完成；信息架构、深色石墨、整页等宽、交互语义与业务功能均未变（提案 §十、§十二；UIUX 终审已批准差异按旧→新登记，不作回归）。
- **路线图 A/B 不因本提案改变**：[post-v1 路线图](../design/2026-10-15_design_post-v1-product-roadmap.md)的阶段、目标与未决项不变；本轮的「同一套 e2e 双端逐 check 名对照等价」是路线图 A「用发布包真实走通」的前置质量保证之一，不是 A 本身。
- **发布仍是客户决定**：当前公开版本仍为 v1.4.0；本轮产物是本地包，未接发布流水线、未签名/公证。下一次冻结源/新发布轮由客户决定（M1）；届时才谈发布说明与 README 更新。
- **留到后续的产品待办**：①忙时切换项目的确认条（PM §17.4：安全语义已由 7 项检查证明，确认条作为 Phase 6 产品待办，由产品/客户决定）；②UIUX P2 ×5 的打磨/处置记录。独立验收 AC3/AC8 文档补正已收口（测试/PM/桌面UI 主责，产品侧本文件已补齐）。

## 六、与 README 当前产品描述的关系

[README](../../../../README.md) 仍描述已发布的 **v1.4.0** 产品（五角色、流程工具、判断 agent、下载与限制）。本轮 UI 平台化不改变 README 描述的产品能力、首用流程与限制口径；已批准的设计差异不改变这些描述。README 对本轮**保持准确**，无需修订；发布说明与 README 更新留到下一次冻结源/新发布轮（客户决定）。本复核不把本地包写成已发布版本。

## 七、结论与边界

**产品面轻量复核结论：通过（限产品方向与产品面，限本轮证据范围）。** 具体口径：

1. 「让治理可见 / 一眼三问」作为呈现契约在本轮证据范围内保持并有官方检查覆盖（§二）；没有发现为视觉效果牺牲诚实呈现的证据。
2. 「行为不变、生产方式换一套」兑现：单一生产入口、严格 CSP、双端逐名对照、本地打包 smoke 与 UIUX A–L 终审通过；客户可感知变化集中在质量与一致性（§三）。
3. **本结论限产品面，不代替独立验收**：独立验收已按 AC1–AC8 重判 **全部 pass**（[报告](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)，status: verified；AC3/AC8 补正已收口）；范围限 macOS 本机离线夹具/本地构建/本地打包，验收通过不授予提交/发布，发布决定属客户。
4. 未覆盖项按 §四 原样保留，不写成已通过；若候选、构建或入口发生变化（如下一次冻结源/发布轮），本复核相关结论失效并按新证据重判。

## 八、核对方式与状态声明

**已执行的只读核对**：`ls`/`cat` 检查 `app/renderer/` 与 `app/renderer/dist/`；`shasum -a 256` 复算 `dist/index.html` 与 `assets/*` 三个哈希（与冻结值一致）；只读阅读 `app/desktop/renderer-entry.ts`、`app/main.ts` 的入口解析与 `loadFile` 接线、`app/renderer/dist/index.html` 的 CSP；只读阅读测试 5B 最终验证、UIUX 生产入口终审 revision 4、装配 5B 记录、独立验收报告、PM 评审 §十六–§二十与 README。**未运行** e2e/单测/打包/构建，**未连接**真实模型/网络，**未读** `.env`，**未改**产品、测试、他人报告或调度状态。所有测试/审计数值均引自上述报告原文，未重算。

**状态**：本文件是产品面复核记录（change，status: reviewed），只覆盖产品方向与产品面判断；不构成实施、测试、验收或发布记录。角色卡/边界见 [role-card](../../role-card.md) 与 [boundary.yaml](../../boundary.yaml)。
