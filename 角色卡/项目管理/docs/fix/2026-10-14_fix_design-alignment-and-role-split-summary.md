# 设计对齐与角色拆分：实施、独立复核与提交（2026-10-14）

日期：2026-10-14，Asia/Shanghai。基线：提交 `7457da4` 之上的工作区。本文件为项目管理对本轮全链的收口记录；角色各自的实施与签署以各角色文档为准，本文只汇总与链接。

## 客户指令（本轮授权）

1. 「这个和设计还是有差别啊，你让桌面按照 UI设计来改，改完了让UI，和产品复核。」
2. 「桌面拆分成两个角色吧，一个UI，一个window 相关的」；名称经客户确认（原话「桌面UI/桌面窗口 这个可以」）。
3. 归档方案最终定案（原话「还是加一个已归档吧，归档是合理的」）：`角色卡/桌面应用/` 保留 `boundary.yaml` 原名并置顶层 `archived: true`（归档键约定），取代当日上午的 `.frozen` 改名过渡。

## 链路与证据

1. **按 UI/UX v2 设计对齐**：40 项差异（V1–V40）逐项对齐——骨架 36/272/66/100/360·top36·底边对齐 composer、760px 会话列（960 档 630）、色板与字阶（14px/1.9）、记录组（42px 时间列、'›' 收纳）、异常卡/未决卡形态、侧栏/抽屉/Pi/composer、统一焦点环；行为零改动。记录：`角色卡/桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md` ＋自查证据同目录 `2026-10-13-design-alignment-selfcheck/`（归档目录内，只读）。
2. **虚拟行锚点漂移修复**（独立回归发现、属主两轮修复）：①行占位口径统一（rect 高＋实读行距、小数保留）renderer.js `402e49a7…`；②脱离文档 pane 行距缓存加固 renderer.js **`47703d0b…`（最终候选）**。记录：`角色卡/桌面UI/docs/fix/2026-10-14_fix_virtual-row-anchor-drift.md`（§9 含 U1_WINDOWED 偶发定性：A/B 两侧 0/16、合并观测新侧 1/30、判既有偶发非本修复引入）。
3. **角色拆分**：桌面应用 → **桌面UI**（`app/renderer/**`＋8 渲染侧测试）＋**桌面窗口**（`app/main.ts`、`app/preload.cjs`、`app/desktop/**`＋22 测试）；逐文件路由 dup=0/missing=0；旧目录原位归档。设计：`角色卡/桌面UI/docs/design/2026-10-14_design_role-split-ui.md`、`角色卡/桌面窗口/docs/design/2026-10-14_design_role-split-window.md`；归档说明：`角色卡/桌面应用/归档说明.md`。
4. **归档键约定**（门禁引擎）：`archived: true` → 枚举静默跳过（零警告）、不可开启（`resolveRole` 拒绝）、边界不予采用（写全拒）；测试 `test/门禁引擎/archived-role.test.ts`（8/8）＋`list-project.test.ts` 真实仓库用例（严格零警告＋不出现守卫）。
5. **连带同步**：`main.mjs` 等 5 个桌面测试样例角色引用、抽屉/队列 6 处 log-only 检查对齐现行结构、README 角色表（7→10，补录产品/UIUX）、`architecture.md`／`project-rules.md` 角色引用、装配与门禁引擎记录。
6. **独立回归（测试角色）**：第一版候选 119/11/14 全绿（漂移红项转绿）；**第二版候选复测 119/11/14 全绿＋零漂移**，新增独立探针 `test/测试/uiux-rowgap-detached-probe.mjs`（detached 路径三轮确定性）＋U1 抽跑 60/60。记录：`角色卡/测试/docs/change/2026-10-14_change_uiux-design-alignment-regression.md`；证据 `2026-10-14-driftfix-recheck-evidence/`、`2026-10-14-recheck2-evidence/`。
7. **UI/UX 复核（设计面）**：通过＋第二版补签维持（视觉零变化：测量报告逐字节一致、十图 9 张逐字节一致、1 张差 1 个抗锯齿像素）；四项裁定（说话人行不需要／统一 16px 行距达成／焦点环 `#42745E` 入规范／抽屉小标题不需要）。签署：`角色卡/UIUX设计师/docs/design/2026-10-14_design_uiux-final-acceptance.md`。
8. **产品复核（产品面）**：通过＋第二版补签维持（无产品面受影响项；R1–R5 与「阅读保持」不回退；对齐后信息层次更好或持平）。签署：`角色卡/产品/docs/design/2026-10-14_design_product-design-alignment-final-signoff.md`。
9. **桌面总自检台（桌面窗口）**：main.mjs 多轮复跑内容级零新增差异；仍停在既有基线红 `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`（拆分前即红，列入遗留）。

## PM 验收证据

`角色卡/项目管理/docs/fix/2026-10-14-design-alignment-evidence/`：两档（1360×860 / 960×620）A/B/C 截图与全量读数 `report.json`；PM 在冻结候选上运行属主只读测量夹具采集，UIUX 独立重跑逐字节复现。

## 提交门禁（PM 亲跑，最终树）

- 全量单测：**1054 计 / 1051 过 / 2 红 / 1 skipped**——2 红均为**已知基线红**（`test/桌面应用/pi-config.test.ts` 检出目录名 `ans-cli`；`test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接），本轮零新增红。
- 最终候选指纹：renderer.js `47703d0b…`、styles.css `69b2ea02…`、index.html `9b542de1…`、tool-rows.js `9ffda4bf…`、ui-labels.js `9f344ebf…`（与两角色签署绑定一致）。
- 提交：本轮提交（基线 `7457da4` 之上；哈希见 git log 同刻）。

## 遗留（不阻塞，另行安排）

1. `main.mjs` 尾部既有基线红 `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`（工具行瘦身后 S-1 段不再产生 ≥150 行窗口化 pane）——属主修复待派。
2. `main.mjs` 同族 5 行「文案/格式面」log-only 脱节（`SU_WRITE_NOTE_SAYS_PI` 等，拆分前即 false）待同步。
3. 测试头注/夹具字符串中的旧角色名与 `app/desktop/project.ts:224` 陈旧样例路径清扫。
4. `角色卡/装配/feature-map.md` 缺失（其 role-card 链接为死链，属治理工件）。
5. `U1_WINDOWED_TO_BOTTOM` 偶发（合并观测 1/30，定性既有、非本修复引入；再复现时加长等待复验）。
6. su 角色卡未含归档约定文本（如需 su 主动归档角色，另立任务；留意 J-1 守卫措辞）。

## 补记（2026-10-14，同日维护批）

客户指示「把侧栏两个建议也做了吧，先让产品看一下」——产品先评审（价值/口径/逐项处置/禁止换绿六种：`角色卡/产品/docs/design/2026-10-14_design_maintenance-review-diagnostics-and-residues.md`），属主随后实施：

- **遗留 1 已修复**：main.mjs 尾部诊断检查按**真实场景**修复（S-1 段改生产形状事件＋唯一 `turnId` → 组行逐条成行 → 真窗口化 → `renderer.viewport` 真发出；`S1_WINDOWED_ACTIVE` 重锚行模型事实；五事件期望集合未动、六种换绿一条未犯）。尾部 mac 重开×2 与 `E2E_DONE=1` 共 13 行场景**自 `9e50aac` 以来首次恢复运行**；连跑 6 轮全绿、与修复前留档对照为纯预期位移、零新增回归。证据：`角色卡/桌面窗口/docs/change/2026-10-14_diagnostics-fix-runs/`。
- **遗留 2、3 已完成**：5 行 log-only 检查按现行口径重锚（2 行改名、严重级不变）；旧角色名残留 14 处清扫（桌面窗口：11 头注＋app/desktop 4 文件注释＋project.ts 样例路径；桌面UI：markdown 头注＋audit 夹具改中性名；Pi适配器：夹具 4 行）。产品评审勿动名录项未动。
- **遗留 5 更新**：真窗口化修复后 `U1` 新观察（13577/655 不稳定态）6 轮未复现，新增 `U1_PANE_HEIGHT` 常驻采样；未放松断言。
- **新增遗留 7**：main.mjs L1438 的 450 条无 `turnId` 旧形状事件（评审列为可选、本批范围外）——已加注，待下一批决定。
- `src/` 两处历史叙述注释（`provider-config.ts`、`session.ts`）经产品口径裁定**保留**（历史留痕）。
