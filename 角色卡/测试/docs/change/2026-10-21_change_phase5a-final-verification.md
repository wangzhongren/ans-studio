---
id: change-ui-platform-phase5a-final-verification
type: change
title: Phase 5A 冻结候选最终独立验证——全量双端/密度/S0/重锚/台账；5A 门 pass
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [design-ui-platform-phase5-test-plan, change-ui-platform-phase5a-independent-verification, change-ui-platform-phase5a-ledger-regroup-final]
events:
  - date: "2026-10-21"
    kind: verified
    summary: 冻结候选（JS index-sSLXHl7e.f568e2aa / CSS index-CM2A97v3.57d9575c / HTML c9d13918）clean rebuild；main 旧/新、uiux 全 23 段、design audit 12 条、5A smoke 24/24、密度 12/11/8、S0 9/9、200% 3/3、bench 3 轮、C1 Δ=20；G1–G5 无未批准行/MATCH-FAIL=0；5A 门 pass（S0 官方 main 名缺失已说明等价）
  - date: "2026-10-21"
    kind: corrected
    summary: 独立验收 AC3/AC8 补正——OPEN_CARD_AT_ARRIVAL 207→206 补列 G3（PM §19.3 索引归一化）；G3 25→26，75 条值差异全登记；统一旧基线计数 683（679+4）与 5B 504 口径；记录旧 uiux 套件版本限制
---

# Phase 5A 冻结候选最终独立验证

**候选**：HEAD `224cf83`；dist 资产与桌面UI 冻结值逐字节一致：JS `index-T1im4gOp.js`=`f568e2aa…`、CSS `index-DbPZU_Oj.css`=`b52cfca1…`、HTML=`f372e111…`。clean rebuild；本角色 gzip 扫描 **289,120B**（桌面UI 冻结摘要 288,552B，均 ≤307,200B），CSP 严格。证据：[final3](2026-10-21-phase5a-new-entry-evidence/final3/index.md)。

## 一、结论

**5A 门：pass。** 全量官方套件通过；G1–G5 / NEW-ONLY / OLD-ONLY 无未批准行，`MATCH-FAIL=0`。唯一命名说明：main.mjs 尚无 `BOOTSTRAP_S0_*` 六个官方 check 名，S0 行为由官方 5A smoke 24/24 中的 3 项 S0 检查 + 独立 S0 探针 9/9 覆盖，建议 PM 接受等价或在 5B 前补名；不改变行为结论。旧端仅 C 类红。

## 二、门禁

- typecheck/build/CSP：exit 0；clean rebuild 资产哈希与冻结值一致。
- 单测 **142/142**；旧基线 **683/683**（raw：[raw/node/baseline.txt](2026-10-21-phase5a-old-baseline-evidence/raw/node/baseline.txt)；计数口径见下）；IME **24 基线**（26 true/0 false）；懒挂载 **10/10**。

**旧基线计数口径（2026-10-21 统一）**：679 → **683** → **504**。679 为 5A 前 `test/桌面应用` 基线；桌面窗口在 5A 新增 4 项检查（入口接线、dev 回退、导航兜底、导航守卫）后 raw 为 **683/683**；5B 删除 178 项旧四测试（桌面UI）与 1 个 hot-path ④ 段（桌面窗口）后为 **504/504**（683−178−1；见 [桌面窗口 5A 记录 §十一](../../../桌面窗口/docs/change/2026-10-21_change_ui-platform-phase5a-entry.md)）。此前文字中的 679/681 为时点过期记录，raw 证据与最终报告以 683 为准。
- 5A 冒烟（`phase5a-electron-smoke.mjs`）**36/36，0 failures**；含 S0、P7、锚点、200%、mirror/delivery、遮挡、零 console/CSP。
- bench（旧/新交替 3 轮，旧基线 old.json/2/3）：stormA maxGap 新 23.7/17.7/17.6（中位 17.7，旧 21.5，阈 25）、stormB 17.5/22/18.7（中位 18.7，阈 25）、handler 0.7、batch 1.5、replay 10.4、scroll 1.8；新端 `histDirect=true` 3/3；单轮最大 23.7 ≤50。
- C1：TOOLFOLD `fold anchor offsets` **150→170，Δ=20**（目标≤20，硬门≤32）。

## 三、main 旧/新

| 项 | 结果 |
| --- | --- |
| 旧端 | 391 名；`E2E_PASS=false`；唯一 `E2E_FAILURES=RECOVERY_SAME_PENDING_CARD_ONCE`（C 类同因） |
| 新端 | 397 名；`E2E_PASS=true`；`E2E_FAILURES` 空 |
| 差异 | common 390；only-old 1（`P13_NEW_SEMANTICS`）；only-new 7（P13_*）；值差异 75 |
| 关键新检查 | SESSION_REPAIR×5 true、PENDING true、RECOVERY×3 true、DIAGNOSTICS `DIAGNOSTIC_EVENTS_COVER_OLD=true`、RESTORE 成功无分隔行 true、P1_*（除 second card 等价）true、`REPLAY_DEDUP_REBUILD_UNIQUE_TEXT=true`、`ANCHOR_*`/`OPEN_CARD_STABLE_AT_ANCHOR` true、`HAS_DENIED_INLINE_ANY=1`/`DENIED_REASON_VISIBLE=true`、`INJECTED_CHIP_DELIVERY_LABEL=true` |

完整 G1–G5 台账：[FINAL-G1-G5.md](2026-10-21-phase5a-new-entry-evidence/final3/main-diff/FINAL-G1-G5.md)。
- G1 19 整组批准；G2 12 逐名批准（§19.2）；G3 26 逐名精确新检查名/路径且新值 true/pass（含 2026-10-21 补正的 `OPEN_CARD_AT_ARRIVAL` 207→206，索引归一化，PM §19.3，`OPEN_CARD_STABLE_AT_ANCHOR=true`）；G4 21 逐项关闭/批准/重锚（§19.4），无未批准；G4-RESOLVED 1（`RECOVERY_SAME_PENDING_CARD_ONCE false→true`）；G5 2 派生行；NEW-ONLY 7 批准；OLD-ONLY 1 退役。`MATCH-FAIL=0`；final3 的 75 条值差异全部登记。

## 四、uiux 全段

全部 23 段 exit 0：DEFAULT **110/110**、MERGE **12/12**（重锚语义身份）、COMPLETE_FLOW **41/41**（P7 + role reading 真滚动）、VISUAL **54/54**、TOOLFOLD **19/19**（C1 Δ=20）、FRESH 4/4、ROLE_FOCUS 11 条、TERMINAL 22/22、SEND_FACTS 8/8、TERMINAL_MERGE 12/12、DELIVERY_NOTE 9/9、PROJECT_RESET 7/7、DUP 32/32、SELECTOR 27/27、CONFIG 21/21、RUNTIME 17/17、MIRROR 8/8、G2 5/5、GOV 7/7、JUDGE 33/33、NOTICE 6/6、BLANK 6/6、QUEUE_VIEW 4/4。

**design audit**：exit 0；`v3.results` 31 项全 true（含 12 条旧 DOM 重锚目标、`6-可见行≥9`/`6-可见行≥4-960`、S2 右缘 `diffRight=0`、S1 超长目标 `rows=1/truncated=true`、Motion 转轮 `motion=true`/`spinDuration=0.9`/reduced-motion true）。

## 五、密度规范化夹具

固定 12 条单行 assistant 行，隔离上一场景 pending；独立探针结果：

| 场景 | fullyVisibleRows | 阈值 | 正文 |
| --- | --- | --- | --- |
| 1360 无提示条 | **12** | ≥9 | 15px/27px |
| 1360 有提示条（`#runtime-config-notice` 37px） | **11** | ≥8 | 15px/27px |
| 960 | **8** | ≥4 | 15px/27px |

阈值未降；正文未压。证据：[raw/density/report.json](2026-10-21-phase5a-new-entry-evidence/final3/raw/density/report.json)。

## 六、S0 / 200% / 其他探针

- **S0 独立探针 9/9**：标题「项目尚未 bootstrap」、说明含主入口、CTA「开始与 A 对话」、`#btn-governance-empty-action` 不存在、单一提及/无左栏 notice/hint 空、点击开 session、Enter 键盘开 session（outline 2px ring）、1360/960/680@200% 均 CTA 可见且无横溢。证据：[raw/s0/report.json](2026-10-21-phase5a-new-entry-evidence/final3/raw/s0/report.json)。
- **200% operator 长会话失败态 + mirror/delivery 3/3**：`#chat/.col-mid` 零横溢、operator 卡可见、mirror/delivery 存在且零横溢；截图 `raw/zoom200/200-operator-long-error.png`、`raw/zoom200/200-mirror-delivery.png`。
- 5A smoke 24/24 另覆盖 sidebar identity、P7、full replay、200% composer、mirror/delivery。

## 六之二、200% 遮挡断言（12 项 + console）

独立探针 [occlusion/report.json](2026-10-21-phase5a-new-entry-evidence/final3/occlusion/report.json)：480/680 两档，report card、report details、governance preview、mirror actions、delivery facts、S0 CTA 的目标 `bottom ≤ composer.top` 全部成立；composer 高 **95≤96**；预览 `position=static`；内容列宽 480 档 **232≥200**、680 档 432；`#chat scroll-padding-bottom=104px`；零 console/CSP。截图 `occlusion/out/480-*.png`、`680-*.png`。

## 七、边界与最终判定

- 候选冻结后无代码变更；旧入口/旧套件快照保留，5A 不删旧渲染器；未改产品/测试断言/配置；未读 `.env`；未 commit/push。
- **5A 门结论：pass。** S0 官方 main 名缺失作为唯一命名说明，行为已由官方 5A smoke S0 3 项 + 独立 S0 9/9 覆盖；建议 PM 接受等价或在 5B 前补名。批准后进入 5B；本报告不代表最终验收。
