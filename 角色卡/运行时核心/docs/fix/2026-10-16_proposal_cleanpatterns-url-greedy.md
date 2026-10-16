---
id: core-cleanpatterns-url-boundary
type: fix
title: cleanPatterns URL 贪婪吞文本——最小修复提案（收窄匹配边界；症状＝Pi 搜索行第 2 条起标题被吞）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [g3-search-and-fold-independent-verification, kanban-fixes-pm-review, pi-server-side-tools-proposal]
---

# cleanPatterns URL 贪婪吞文本（呈现面缺陷候选①）——最小修复提案

**实施登记（2026-10-16，客户「都按推荐批准」后实施轮）**：本提案已按 **A-base** 实施——`tool-display.ts` 单文件一行正则收窄（未决点 1 取 A-base，不做纯非贪婪/方案 B/方案 C）；未决点 4 的 Codex 诊断 redact 经**同批检查**判定「确为同类贪婪模式且收窄只紧不松」⇒ **同批修**（同一 A-base 排除集）；未决点 2 的「无分隔符紧贴 CJK」残余**维持不解决**；未决点 3 的 loopback L255 断言翻转**仍归测试角色**（本批实测恰一处红＝该断言，如实登记、未触碰 `test/测试/**`）；未决点 5（方案 B 加空格）**不做**。实施细节、测试计数与 Codex 同批判断见 [实施记录](2026-10-16_fix_cleanpatterns-url-greedy.md)。

**状态：提案（待 PM 评审、客户批准后实施）。** 本任务只产本文档：**零代码改动、零 git 提交**；下文所有复跑均为只读运行（自带 node 片段，未落盘仓内文件）。

**来源**：测试角色 G-3 独立验证报告备注①（`角色卡/测试/docs/change/2026-10-16_change_g3-search-and-fold-independent-verification.md` §⑥-1）＋最小复现证据 `角色卡/测试/docs/change/2026-10-16-g3-verification-evidence/raw/cleanpatterns-url-greedy-repro.txt`。属主＝运行时核心（`src/common/runtime-core/tool-display.ts`，该文件本批未改）。属性：**丢文本、不泄文本**。

## 一、逐行定位与调用链

### 1. 缺陷行

`src/common/runtime-core/tool-display.ts` `cleanPatterns`（L33-43），URL 段 L38-41：

```ts
.replace(/https?:\/\/[^\s<>"']+/gi, value => {
  try { const url = new URL(value); url.username=''; url.password=''; url.search=''; url.hash=''; return url.toString(); }
  catch { return '[URL]'; }
})
```

排除集 `[^\s<>"']` **不含全角「；」等 CJK 标点**。URL 紧贴此类字符（无 ASCII 空白）时，正则把其后文本一并吞入匹配；`new URL()` 把吞入部分解析为 path / search / hash 后归一：落入 **search/hash** 者被清空 → **丢文本**；落入 **path** 者被 `toString()` percent-encode → **mojibake**（如全角「；」→ `%EF%BC%9B`）。两种后果同因（贪婪匹配 + 排除集不含 CJK 标点）。

### 2. 调用链（谁在用、用途）

- `cleanPatterns` 为模块私有，唯一调用点＝同文件 `protectText`（L70-78）的 **L74**；`protectText` 又被：
  - `projectToolEvent` 内部使用（L123 summary、L144 resultText、L147 error、L149 stdout/stderr/signal、L107/L116-117 target.value）；
  - `projectLegacyHistory` 使用（全部文本字段，L180-195）；
  - 从 `createToolDisplayContext()` 返回值**导出**（L202）。
- **生产唯一消费方＝`src/service/runtime/session.ts`**（全仓 grep：该模块外无其它实例化点）：
  - L56-66 历史读取（用户文本 L60、工具事件 L62 经 `routeRuntimeDisplayEvent`、普通 summary L65、报告 L58）；
  - L71 legacy 历史投影；L76 实时报告投影；L103 实时会话 display（`requireProfile:true`）；
  - L169 实时事件路由 `routeRuntimeDisplayEvent(...,'projected-event')` → L45 `projectToolEvent`；L405 报告快照、L467 展示校验、L468 回交输入。
- **Pi 搜索行的产生点**：`src/common/pi-adapter/server-tools.ts` `renderResultMessage`（L290-308）——条目内 `title — url`，条目间 **`join("；")`（L305）**，超 5 条追加后缀 `；…（共 N 条）`（同 L305）；经 `src/common/pi-adapter/real-adapter.ts` L635-640（call-result 分支）进入 `projectToolEvent`（origin `native-result`，message → `resultText`）→ 再经 session.ts L169 二次投影 → 桌面渲染层**只显示投影结果**（`app/renderer` 无独立净化；全仓 `https?:` 净化正则清点：本文件 L38、`src/common/codex-adapter/config.ts` L44〔诊断 redact〕、`src/provider/claude/session.ts` L60 与 `src/common/shared/diagnostics.ts` L45〔均仅剥 userinfo、以 `@` 定界，非本缺陷类〕）。

### 3. 本职（修复不得放松的两条）

- **防泄漏**：userinfo/query/hash 剥除 + 已知机密串整串替换（L73）+ Bearer/key 模式替换（L36-37）——修复只收窄「匹配范围」，匹配后的归一处理一行不改；
- **显示预算**：`utf8Prefix` 截断与 `redacted/truncated` 标记（L75-77）——不受影响。

## 二、最小复现（本角色只读复跑）

node v24.14.0，直接 import 真实 `src/common/runtime-core/tool-display.ts` 调 `protectText`：

```
raw  = 查询「独立对抗查询-ZX9」 → 2 条结果：独立标题-ALPHA — https://verify.test/entry?token=对抗参数-绝不外泄#frag；独立标题-BETA — https://verify.test/beta
out  = 查询「独立对抗查询-ZX9」 → 2 条结果：独立标题-ALPHA — https://verify.test/entry — https://verify.test/beta
flags= {"redacted":true,"truncated":false}
```

与测试角色 `raw/cleanpatterns-url-greedy-repro.txt` **逐字一致**：`；独立标题-BETA` 整段被吞（落入 hash 被清空）。对照组：裸串 `https://verify.test/entry?token=对抗参数-绝不外泄#frag` → `https://verify.test/entry`（无紧贴文本时本职正常，secret/#frag 均剥除）。

**同类病象（同因，模拟复跑补充）**：

- 后缀变体：`T2 — https://verify.test/b；…（共 20 条）` → `…/b%EF%BC%9B%E2%80%A6%EF%BC%88%E5%85%B1 20 条）`（后缀被吞入 path 并 percent-encode——第 2 类后果）；
- 括号变体：`（https://a.test/x）后文` → `（https://a.test/x%EF%BC%89%E5%90%8E%E6%96%87`。

## 三、修复方案对比（模拟证据：同一替换管线，仅换正则；只读运行）

**先排除一条伪路径**：纯「非贪婪」（`+?`）不可行——无后继锚点时逐 1 字符出匹配，剥除整体失效（实测：`?token=x#frag` 原样保留）。必须走**边界字符集**。

### 方案 A（推荐）：核心收窄排除集

```diff
-    .replace(/https?:\/\/[^\s<>"']+/gi, value => {
+    .replace(/https?:\/\/[^\s<>"'\u3000-\u303F\uFF00-\uFFEF]+/gi, value => {
```

A-base ＝ 追加 CJK 标点块（`\u3000-\u303F`：、。〈〉「」…）＋全角形式块（`\uFF00-\uFFEF`：；：，（）？！…）。A-ext（可选参数，PM 定）＝ 再加通用标点 `\u2010-\u2027`（—…等）；本 battery 上与 A-base 无差异，仅覆盖更宽。

模拟逐字输出（三条修复、两处权衡、一处残余）：

| 输入 | 现状 V0 | 方案 A |
|---|---|---|
| 复现行（上） | `…entry — https://…/beta`（TITLE_B 丢失） | `…entry；独立标题-BETA — https://…/beta`（**修复**） |
| `…b；…（共 20 条）` | `…/b%EF%BC%9B%E2%80%A6…（共 20 条）`（mojibake） | `…/b；…（共 20 条）`（**修复**） |
| `（https://a.test/x）后文` | `（https://a.test/x%EF%BC%89%E5%90%8E%E6%96%87` | `（https://a.test/x）后文`（**修复**） |
| 裸 URL CJK 查询（零泄漏对照） | `https://verify.test/entry`（剥净） | `https://verify.test/entry`（**不变**） |
| `https://a.test/p;jsessionid=abc`（ASCII 分号路径参数） | 整体保留在 URL 内 | **不变**（ASCII `;` 显式不排除） |
| `https://a.test/x?k=abc：def 后文`（权衡） | `https://a.test/x 后文`（`：def` 被吞） | `https://a.test/x：def 后文`（`：def` 可见——值内全角标点需显式列出） |
| `见 https://a.test/x中文说明`（残余，固有歧义） | `…/x%E4%B8%AD%E6%96%87%E8%AF%B4%E6%98%8E` | **同现状**（无分隔符紧贴 CJK 不解决，见 §六-2） |

**零泄漏判定（模拟硬证据）**：复现行与裸串在 A 下 `URL_SECRET`（`对抗参数-绝不外泄`）均不存在；对抗 battery（CJK 值 + `；`/`）`/`。`紧贴）泄漏全部＝false。原理：被排除标点**之前**的文本仍在匹配内、照常归一剥除；只有「首个被排除标点及其后」被判定为显示文本。

**影响面（谁依赖现行为）**：

- 生产消费方仅 `session.ts`（§一.2 全列）——全部按「投影后文本」消费，**无一处预期 URL 吞后续文本**；
- 测试面唯一显式钉住现行为处＝`test/测试/g3-search-verify/pi-loopback-verify.test.ts` **L255**（`assert.equal(resultText.includes(TITLE_B), false, "（备注）…")`）——**须翻转**（测试角色文件，PM 路由）；
- 不回归：`test/pi-adapter/server-tools-wire.test.ts` L288-292 只断言 `TITLE-ALPHA` 存在与 `BAIT_URL_QUERY`/`#frag` 不存在——不受影响；`test/runtime-core/tool-display.test.ts` L44-51 的 URL 相关输出逐字不变（模拟：`node x --password "two words" https://u:p@host/path?q=secret#frag` 两口径同输出）；全仓无测试钉住 mojibake（`%EF%BC`/`%E2%80%A6` 零命中）。

**回归风险：低。** 权衡点 1 处（查询值内含被排除标点时的尾部可见——需「URL 值内出现全角标点」才触发；token 类值惯例为 ASCII，触发面近零）；残余 1 处（见上表）。

### 方案 B（上游绕行）：Pi 观察者连接符加空格

`server-tools.ts` L305 同一行有两处 `；`（`parts.join("；")` 与后缀 `；…（共 N 条）`）——绕行＝两处都改为带空格（`； `）。

- 影响面：只覆盖 Pi 搜索成功行；历史回放、用户文本、回交输入、报告、stdout、其它运行时、未来新调用方沿用旧口径——**同类缺陷仍存**（如 `（URL）后文`、后缀 mojibake、非 Pi 行）；
- 回归风险：文案可见变化（全角分号后多一空格）；loopback L255 仍需翻转；`server-tools-wire.test.ts` L288-292 不受影响（includes 断言）；
- 结论：**不建议单用**（治标不治本）；若 PM 判定期 1 不宜动核心，可作 train 内回退，届时同时排期方案 A。

### 方案 C（否决）：正向 ASCII URL 字符集

`[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+`——原理上最贴 URL 语法、文字保全最广，但模拟显示 **URL 查询值含非 ASCII 时尾部泄漏**：`?token=对抗参数-绝不外泄#frag` → `https://verify.test/entry对抗参数-绝不外泄#frag`（复现行与裸串泄漏均＝true）。违反 G-3 批准口径「URL query 被剥除」与既有零泄漏断言，**不采用**。

**推荐：方案 A（A-base；A-ext 由 PM 选）。** 根治缺陷类、单行改动、零泄漏不回归（模拟证据）、既有测试全保、唯一翻转点是测试角色如实钉住的备注断言。

## 四、验证口径（实施后如何证明「症状消、本职不放松」）

1. **症状消（复现转正）**：
   - core 单测三用例：复现行断言含 `TITLE_A`＋`TITLE_B`＋两条归一 URL、不含 `URL_SECRET`；后缀 `；…（共 N 条）` 完整（并断言不含 `%EF%BC`）；`（URL）后文` 完整；
   - 「搜索行多条目完整可见」＝`pi-loopback-verify.test.ts` L255 翻转为 `includes(TITLE_B) === true`（真实装配链端到端，即用户可见文本）。
2. **本职不放松**：
   - 零泄漏对抗 battery（CJK 查询值 + 全角分隔符/括号/句号紧贴 → 泄漏=false）×N；
   - core 既有断言（L44-51）逐条照跑不变；`[URL]` fallback 不变；`redacted/truncated` 标记语义不变（repro 修复后仍 `redacted:true, truncated:false`——URL 归一仍在发生）；
   - 显示预算无改动面（`utf8Prefix`/`fit` 未动）。
3. **全量**：`node --test "test/**/*.test.ts"` 0 红（本机基线全绿）＋ `npm run typecheck` 0 错。
4. **不声称**：§六-2 残余（无分隔符紧贴 CJK）不解决；§三权衡点保留并登记。

## 五、分期与范围

- **期 1（推荐小批）**：单文件产品面——`src/common/runtime-core/tool-display.ts` 一行正则＋注释；`test/runtime-core/tool-display.test.ts` 增补 §四用例；协调测试角色翻转 loopback 断言（其文件、其归属）；全量回归＋typecheck。
- **桌面UI：零改动。** 渲染层只显示投影文本、无净化逻辑（§一.2 清点证据；显示文本=投影文本）。观感验收可选复跑既有 Electron 夹具（非必需——显示内容已被 loopback 端到端断言）。
- **期 2（可选，另立项）**：`src/common/codex-adapter/config.ts` L44 同类贪婪模式（诊断 redact；归属 Codex 适配器角色）同口径评估；A-ext 扩展——均需单独证据与批准。
- 本提案边界：未改任何产品文件、未 git 提交；实施须客户批准后由本角色另批进行。

## 六、未决点（提请 PM）

1. 排除集范围：A-base（两块）vs A-ext（加通用标点 `\u2010-\u2027`）——建议 A-base 起步。
2. 「无分隔符紧贴 CJK」（`url中文说明`：并入 URL/percent-encode）保留现状还是随批处理——需客户口径（无分隔符时 URL 与文本固有歧义，本提案不解决）。
3. loopback L255 断言翻转的归属与时点（测试角色文件；建议与期 1 同批，避免「登记过时」）。
4. Codex 诊断 redact 同类模式：并批（需跨角色批准）还是另立项。
5. 是否同时做方案 B 的连接符加空格（观感间距）——建议不做（避免无谓文案变动与双重改动）。

## 证据索引

- 本角色复跑（只读，逐字见 §二/§三）；模拟脚本运行于 /tmp、已清理，未改仓内任何文件（`git status` 干净）。
- 测试角色：`角色卡/测试/docs/change/2026-10-16-g3-verification-evidence/raw/cleanpatterns-url-greedy-repro.txt`；验证报告 §⑥-1；钉住断言 `test/测试/g3-search-verify/pi-loopback-verify.test.ts` L251-255。
