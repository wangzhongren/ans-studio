---
id: enterprise-stability-review
type: design
title: 企业级稳定感 A1+A2——项目管理实施前评审与拆发
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: approved
revision: 1
related: [enterprise-stability-uiux, visual-convergence-v3-uiux]
events:
  - date: "2026-10-17"
    kind: reviewed
    summary: 客户批准「按推荐来，A1+A2 实施」；PM 确认 D1/D4–D8 默认，限定仅改 styles.css（禁止顺手改 index.html/renderer.js、桌面窗口零改动），把框/网格/重量/贴底/稳定映射为可测断言，并区分已知基线红
---

# 企业级稳定感 A1+A2——项目管理实施前评审与拆发

**审查对象**：UIUX 设计稿 [enterprise-stability](../../../UIUX设计师/docs/design/2026-10-17_design_enterprise-stability.md) 与[可检查原型](../../../UIUX设计师/docs/design/2026-10-17_design_enterprise-stability-prototype.html)。
**客户裁定（逐字，2026-10-17）**：「按推荐来，A1+A2 实施。」即方案 A 轻量加固，先 A1（结构）＋A2（重量）；默认 D1=900、D4=`#8A968B`、D5=浅底 `#FAFBF8`、D6=加 2px 选中竖条、D7=正文保持 15/27、D8=本轮只保证 960–1440。
**本轮性质**：实施前评审与拆发，**不写代码**。本文是范围、验收与派发口径；代码尚未改动。

## 一、结论

**批准按 A1+A2 实施。** 设计稿的结构诊断（无框、无网格、无贴底、重量不足）与当前 `styles.css` 的实测基线一致；A1/A2 可在**不改 IA、不改交互契约、不改 HTML/JS**的前提下完成。**A3（密度）与 B（企业化重构）不在本轮**；A3 的间距刻度、左树 52px、标签收紧等不得顺手带入。

**确认 D1/D4–D8 默认**：内容列 900；控件边框 `#8A968B`；输入区浅底 `#FAFBF8`；左树选中 2px 竖条；正文 15/27 不动；本轮窗口范围 960–1440。**这是一次经客户确认的 V2/v3 基线修订**：v3 明确「阅读列 800px、圆角 10/7 不动」的条目被本轮 D1 与 A2 圆角收敛取代；旧截图/断言不再作为当前基线，须同批更新（见 §四）。

**没有必须返工的方案级问题。** 需钉死的实施口径见 §七（尤其是：禁止改 HTML/JS、阴影只用于浮层、选中类名是 `.active`、表格外框实现方式）。

## 二、实施范围

### 2.1 允许改动

| 文件 | 归属 | 改动 |
| --- | --- | --- |
| `app/renderer/styles.css` | 桌面UI | **唯一生产文件**。A1/A2 的 token、布局、边框、表格、圆角、阴影、选中条 |
| `test/桌面应用/renderer.test.ts` | 桌面UI | 更新/新增视觉 token 与结构断言（单文件边界，只可扩展） |
| `test/桌面应用/e2e/uiux-v2.mjs` | 桌面UI | 真实 Electron 几何/滚动/表格/窗口档位断言（单文件边界，只可扩展） |
| `test/测试/`（如需） | 测试 | 独立验证与证据；不得改桌面UI 的测试文件 |

### 2.2 明确禁止

- **禁止改 `app/renderer/index.html` 与 `app/renderer/renderer.js`**。A1 的同列、贴底、分隔线均可由现有 DOM + CSS 完成；原型里的 `.head-inner`/`.notice-inner`/`.composer-inner` 是原型自用包装，**不要照搬**。若实施中发现非改 HTML 不可，**停手回报 PM**，不得静默扩大范围。
- **桌面窗口零改动**：`app/main.ts`、`app/desktop/**`、preload、IPC 一律不动；窗口最小尺寸保持 960×620，不开放 640–959。
- 不改 `role-status.js`、虚拟窗口/行模型、确认卡结构、抽屉 424px、focus/fail-closed 语义。
- 不跑 A3/B；不改间距刻度、左树 52px、标签字号、正文 15/27。
- 不读 `.env`、不跑凭据/网络、不 git 提交（提交由客户决定）。

## 三、验收映射（设计稿「框/网格/重量/贴底/稳定」→ 可测断言）

所有几何断言在真实 Electron（`uiux-v2.mjs`）中读取 `getBoundingClientRect`/`getComputedStyle`，静态部分在 `renderer.test.ts` 中钉 token/选择器。

### 3.1 A1 结构

| 设计项 | 可测断言 | 档位 |
| --- | --- | --- |
| 内容列 900（D1） | `:root` 有 `--content-max:900px`；`.chat-pane`、`.capsule`、`.attach-row`、`.compose-note` 的 `max-width` 为 `var(--content-max)`；1360/1440 档 `.chat-pane` 宽 900±2 | 1360、1440 |
| 标题/输入同列 | `.chat-head`、`.session-notice` 的 `padding-inline: max(32px, calc((100% - var(--content-max)) / 2))`（窄档 base 24）；实测会话头内容左缘、`.chat-pane` 左缘、胶囊左缘两两差 ≤1px | 1360、1280、960 |
| 左/中分隔 | `.col-left` 有 `border-right:1px solid var(--border)`；实测 1px | 全部 |
| 标题栏下边线 | `.titlebar` 的 `border-bottom` ≥1px（A1 保证存在；颜色加深在 A2） | 全部 |
| 会话头下边线 | `.chat-head` 的 `border-bottom` ≥1px | 全部 |
| 输入区上边线 + 实底贴底 | `.composer` 的 `border-top:1px solid var(--border)`、`background:#FAFBF8`（D5）；实测上边线 ≥1px 且背景 ≠ 消息区白 | 全部 |
| 输入区贴底/稳定 | 滚动 `#chat` 前后，`.chat-head`、`.composer` 的 top/bottom 位移 **0px**；不使用 `position:sticky/fixed` | 全部 |
| 胶囊/脚注同列 | 胶囊宽 = `.chat-pane` 宽 ±2px；脚注左缘与胶囊左缘 ≤1px | 1360、960 |
| chip 定位 | `#chat > .op-chip` 的 `margin-left` 公式改用 `var(--content-max)`；chip 左缘与 `.chat-pane` 左缘 ≤8px | 1360 |
| 不跳宽 | 追加/切换消息、输入框增高、`session-notice` 出现/消失时，`.chat-pane`、`.chat-head`、`.composer` 宽度不变；`document.documentElement.scrollWidth === innerWidth` | 960/1280/1360/1440 |
| 可访问性 | `.chat-head` 由固定 `height:72px` 改为 `min-height:72px`（200% 文字不裁切；高度可增长） | 静态 + 1360 |

### 3.2 A2 重量

| 设计项 | 可测断言 | 档位 |
| --- | --- | --- |
| token | `--border:#D7DDD4`、`--border-strong:#C4CEC2`、`--border-control:#8A968B`、`--text-2:#55625B`、`--text-3:#6A756E`、`--radius:8px`、`--radius-sm:6px`；`--success/#2D634E`、`--danger/#A1433C`、`--amber/#8A5B23` 保持既有 | 静态 |
| 对比度 | 正文 ≥7:1、次级 ≥5:1、三级 ≥4.5:1、控件边框 ≥3:1、焦点环 ≥3:1；静态测试用白底计算（文字/边框），e2e 用 `getComputedStyle` 复核 | 静态 + 1360 |
| 控件边框 | `#runtime-select`、`.capsule` 的边框为 1px `--border-control`；胶囊 `:focus-within` 仍用 `--success` + 焦点环 | 静态 + 1360 |
| 标题栏下边线 | `.titlebar` 的 `border-bottom-color` 为 `--border-strong` | 静态 |
| 圆角收敛 | 容器 10/12 → 8（`--radius` 及硬编码 10/12 的可见容器：胶囊、用户气泡、报告/交付卡、任务请求）；控件 7 → 6（按钮、引擎选择器、菜单项等）；用户气泡保持右下 3px（`8px 8px 3px 8px`） | 静态 + 1360 |
| 表格 | `.msg table` 表头实底 `--bg-soft`、表头下边线 `--border-strong`、单元格 1px `--border`、字号 13/20、内边距 6×10；外框 1px `--border-strong`（用 `outline` 或 border，**不改** `display:block/overflow-x:auto`）；宽表容器内横向滚动、页面无横向溢出 | 静态 + 1360/960 |
| 极轻阴影 | 仅**浮层**：`.composer` 上阴影 `0 -6px 18px rgba(21,31,26,.035)`；菜单/抽屉/确认卡沿用或增强既有阴影；**不给普通助手消息/报告卡新增阴影**（避免卡片海） | 静态 + 1360 |
| 选中竖条（D6） | `.tree-item.active` 加 2px 内侧 `--success` 竖条（建议 `box-shadow: inset 2px 0 0 var(--success)`，不改布局）；选中背景、焦点环保留 | 静态 + 1360 |
| 正文不收紧（D7） | `.msg` 计算 `font-size:15px`、`line-height:27px`；不改行距/段距 | 静态 + e2e |
| 焦点/状态 | 2px `--focus-ring` + offset 3px 不变；忙碌/错误/等待确认仍以文字+形状表达，不靠颜色单独传意 | 静态 + 键盘用例 |

### 3.3 窗口范围（D8）

- 正式范围 **960–1440**；e2e 至少覆盖 **960×620、1280×800、1360×860、1440×900**。
- 每档断言：`document.documentElement.scrollWidth === innerWidth`；无页面横向/纵向额外溢出；内容列 ≤900；960 档内容列约 736（流式收缩），不要求 900。
- 640–959 仅记录、不作为本轮通过条件；窗口最小尺寸不改。

## 四、测试与回归

### 4.1 `test/桌面应用/renderer.test.ts`（桌面UI，单文件扩展）

**必须更新的既有精确断言**（旧基线会红，且不能靠追加覆盖把旧值留在源码里造成双来源）：

- `:1274` 的 `max-width:800px` → 900/`var(--content-max)`。
- `:1516` `.chat-pane { max-width:800px; gap:16px; }` → 新有效规则。
- `:1519` `.msg-user ... border-radius:10px ...` → 8（含右下 3px）。
- `:1520` `.composer { padding:14px 32px 12px; min-height:0; border-top:0; }` → 新上边线/浅底；**保留** W4 的垂直 padding（14/12）与 min-height:0，不改输入区高度契约。
- `:1522` 胶囊 `border-color:#ccd6cb` → `--border-control`。
- `:1524` `.compose-note { max-width:800px; ... }` → `var(--content-max)`。
- `:1532` `#chat > .op-chip` 的 `min(800px, 100%)` → `var(--content-max)`。

**新增断言**：A1 的 `--content-max`、`.chat-pane/.capsule/.attach-row/.compose-note` 同列、`.chat-head/.session-notice` 的 `max()` padding、`.col-left` 右分隔、`.composer` 上边线/浅底、`.chat-head` `min-height`、无 `position:sticky/fixed`；A2 的 token 值、对比度、表格规则、选中竖条、composer 阴影、15/27。建议把 token 对比度做成纯函数断言（白底计算），避免只断言十六进制字符串。

### 4.2 `test/桌面应用/e2e/uiux-v2.mjs`（桌面UI，真实 Electron）

- 现有 `:261` `p.width<=800` 改为：1360/1440 档 `Math.abs(p.width-900)<2`；960 档 `p.width<=900` 且 `p.width>700`；胶囊宽与 pane 宽差 <2 保留。
- 增加/扩展档位循环到 `[1440,1360,1280,960]`（高度 900/860/800/620），断言 §三的几何、贴底 0px、无页面溢出。
- 增加宽表夹具：注入 8 列宽表，断言 `table.scrollWidth > table.clientWidth`、`document.documentElement.scrollWidth === innerWidth`、单元格边框完整。
- 增加输入框增高/追加消息后的宽度不跳、`session-notice` 出现/消失后 head/composer y 不变。
- 增加 `prefers-reduced-motion` 与焦点环的既有用例回归；确认卡默认焦点仍为拒绝/取消。

### 4.3 已知基线红（如实区分，不得掩盖）

本轮评审时点实测：

- `renderer.test.ts`：**60/64**，4 红——`N-1`、`data-state 修复`、`P1-3`、`G-5/wave2`。这 4 条为**既有基线红**，与 A1/A2 无关；A1/A2 不得以修它们来换绿，也不得把它们计入本轮新增失败。
- `uiux-v2.mjs`：`virtual visible nonempty`（`:1044`）为**已知基线红**；真实 Electron 运行的其余失败须逐条标注「既有/新增」，不得用总数掩盖。
- 若实施后出现新的红，先判断是否为 900 列/圆角/断言旧值导致；属旧断言的同批更新，属行为回归的必须修复。

### 4.4 独立验证与客户真机

- 桌面UI 每步自测并交证据（1360/960/1280/1440 截图 + 实测几何/计算样式 JSON）。
- 测试角色独立跑真实 Electron（不改桌面UI 测试文件；如需新脚本放 `test/测试/`），核对 A1/A2 两步分别可验收。
- 客户真机确认「框/网格/重量/贴底」观感；A1 与 A2 分两步看，避免一次性过重。

## 五、风险与回滚

1. **CSS 覆盖层叠**：`styles.css` 历史规则多、末尾已有 V2 与治理覆盖。**缓解**：A1/A2 各自一个带日期注释的覆盖块放在文件末尾（治理块之后），只覆盖目标属性；用计算样式验收，不以源码里存在某字符串为准。**回滚**：删除对应覆盖块。
2. **既有 800px 断言**：`renderer.test.ts` 5 处精确字符串 + `uiux-v2.mjs` `<=800` 会把 900 判红或留下旧基线。**缓解**：同批更新（§4.1/§4.2），不保留双来源。**回滚**：随覆盖块一起回退断言。
3. **滚动锚定/虚拟窗口**：列宽 800→900 改变换行与行高，虚拟窗口按实测高度工作，但长转录/底部跟随需真跑。**缓解**：保留 `scrollbar-gutter:stable`、`overflow-anchor`、`flex` 结构；不做 sticky；跑长转录/追加/增高用例。**残留风险**：极端长行/代码块的换行高度变化需客户真机确认。
4. **宽表**：`display:block + border-collapse` 下表外框可能只包住滚动容器。**缓解**：用 `outline`（不改布局）或 border，先以 8 列宽表夹具验证；不改 `display:block/overflow-x:auto`；`.card-md` 表格只随 token 变化，不改变其布局。
5. **确认卡/抽屉**：全局 `--radius` 10→8 会影响确认卡、抽屉内卡片、报告卡。**缓解**：424px 宽度、fail-closed 默认焦点、逐字证据不变；圆角只做视觉收敛，不改结构；e2e 的抽屉/确认卡用例回归。
6. **A3 未做**：容易在 A2 顺手改间距/字号/左树高度。**缓解**：A2 只动颜色/边框/圆角/表格/阴影/选中条；15/27 与间距刻度不动；代码审查拒收 A3 内容。
7. **观感「更硬」**：D4 3:1 控件边框、D2 结构线加深会牺牲一点轻。**缓解**：A1→A2 分步验收；A2 的 token 是默认值，可按客户观感单独回退某几项（如 D4 折中 `#9AA69B`），不回退 A1 结构。
8. **已知基线红被误当新增**：见 §4.3；报告中逐条列名。

**回滚总述**：仅回退 `styles.css` 的 A2/A1 覆盖块与对应测试断言；无 HTML/JS/数据/契约变更。A1、A2 分开提交/验收，可分别回滚。

## 六、派发顺序

| 步 | 角色 | 内容 | 验收 |
| --- | --- | --- | --- |
| 0 | 项目管理 | 本评审 + `memo.md`/`changelog.md` | 本文 |
| 1 | 桌面UI | **A1 结构**：`--content-max:900`、同列 padding/max-width、左/中分隔、输入区上边线+浅底 D5、标题栏/会话头线、`op-chip` 公式、`chat-head` min-height；更新 `renderer.test.ts` 与 `uiux-v2.mjs` 的旧 800 断言并加 A1 断言 | A1 自测 + 1360/960/1280/1440 证据；产品/UIUX 看结构 |
| 2 | 桌面UI | **A2 重量**：token（D4）、圆角收敛、表格、极轻阴影、选中竖条 D6；补 A2 断言 | A2 自测 + 对比度/几何证据；客户确认重量 |
| 3 | 测试 | 独立真实 Electron 验证（A1/A2 两步、960–1440、宽表、滚动/虚拟窗口、确认卡/抽屉；已知基线红单列） | 独立证据；不改桌面UI 测试文件 |
| 4 | 客户 | 真机确认 A1/A2 观感 | 客户签署 |

**同一角色串行**：桌面UI A1 → A2；A2 不在 A1 验收前动工。**桌面窗口零改动**，不派发。A3/B 不派发。

## 七、与设计稿/原型不一致或需钉死的口径

1. **HTML 零改动**：设计稿 §九已说 A 不需要改结构；原型使用 `.head-inner`/`.notice-inner`/`.composer-inner` 包装，**真实应用不要照搬**——用 `.chat-head`/`.session-notice` 的 `padding-inline: max(...)` 与 `.capsule/.compose-note` 的 `max-width` 达成同列。`renderer.js` 零改动。
2. **`--scrollbar-w` 不存在于正式 CSS**：现有 `.chat` 用 `padding-right:22px`（窄档 14px）＋`scrollbar-gutter:stable`，等效 32/24 与 10px 滚动条。A1 **保留**该关系即可；不强制新增变量。若新增，只允许 `.chat` 的右内边距使用它，别给 head/composer 加滚动条宽度（会反向错位）。
3. **选中类名是 `.tree-item.active`**（原型里是 `.role.selected`）。D6 必须落在 `.active`；建议 `box-shadow: inset 2px 0 0 var(--success)`，不改 padding/布局。
4. **阴影范围**：设计稿 4.4 的「卡片阴影」与原则 6「仅浮层」有张力。本轮按原则 6：**只给输入区/菜单/抽屉/确认卡等浮层**；不给普通助手消息、报告卡、任务请求新增阴影（A 方案不是卡片化）。
5. **表格外框**：`display:block` + `border-collapse` 下建议用 `outline:1px solid var(--border-strong); outline-offset:-1px`（不改布局）或 border；实施后必须用宽表夹具验证，不改 `display:block/overflow-x:auto`。`.card-md` 表格只随 token 变化，不改变布局。
6. **A1/A2 分界**：A1 只做结构与贴底（线用现有 `--border`、浅底 D5）；A2 才改 `--border/--border-strong/--border-control/--text-2/--text-3/--radius*`、表格、阴影、选中条。A1 验收不要求 A2 的对比度；A2 验收必须达到 §3.2 的对比度。
7. **基线修订**：v3 的「阅读列 800px、圆角 10/7 不动」已被本轮 D1/A2 取代；旧截图与精确字符串断言必须同批更新，不得以「旧断言还在」冒充兼容。
8. **尺寸口径**：设计稿原型用 1362×862；正式窗口默认 1360×860、e2e 历史用 1360/960。验收按 **1360/1280/960/1440** 实测，1362 仅原型画布，不作为正式断言尺寸。
9. **已知基线红**：`renderer.test.ts` 的 N-1/data-state/P1-3/G-5，`uiux-v2.mjs` 的 `virtual visible nonempty`；本轮不得修、不得掩盖、不得计入新增失败。
10. **CSS 顶部注释**：现写「最大800阅读列」，A1 应同步改为 900（当前状态注释，不是历史记录）。
