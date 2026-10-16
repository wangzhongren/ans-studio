---
id: core-cleanpatterns-url-boundary-fix
type: fix
title: "cleanPatterns URL 边界收窄（A-base）实施：tool-display 一行正则 + Codex 诊断 redact 同批修"
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [core-cleanpatterns-url-boundary, g3-search-and-fold-independent-verification, kanban-fixes-pm-review]
---

# cleanPatterns URL 贪婪吞文本——实施方案记录（提案转已实施）

**状态：已实施待验证（未部署）。** 依据：客户 2026-10-16「都按推荐批准」＋PM 派发（口径＝**A-base**：`　-〿`＋`＀-￯` 两块，不做纯非贪婪、不做正向 ASCII 集、不加上游空格）；提案＝[core-cleanpatterns-url-boundary](2026-10-16_proposal_cleanpatterns-url-greedy.md)（状态已转 implemented-pending-verification）。

## 改动文件清单（全部在本角色边界/本批授权内）

| 文件 | 实施内容 |
|---|---|
| `src/common/runtime-core/tool-display.ts` | `cleanPatterns` URL 段**一行正则收窄**（L43）：`[^\s<>"']+` → `[^\s<>"'　-〿＀-￯]+`（＝追加 CJK 标点块 `　-〿`＋全角形式块 `＀-￯` 之排除）＋注释说明口径与不放松面；**匹配后归一处理、control-char 替换、显示预算逐字未动** |
| `src/common/codex-adapter/config.ts` | 诊断 `redact` 同类贪婪模式**同批修**（见下节判断）：URL 正则同口径收窄＋注释；剥 userinfo/query 的归一逐字未动（hash 照旧保留） |
| `test/runtime-core/tool-display.test.ts` | 新增 3 用例（§测试面 ①全项：复现转正／后缀与括号后文／对抗 battery／ASCII `;` 不回归／标记不变） |
| `test/codex-adapter/web-search.test.ts` | 新增 1 用例：redact 同口径收窄的钉子（全角标点后文本不再被吞；剥除语义不回归）——「对应测试」随同批修 |
| 本记录 + `changelog.md` + `memo.md` | dated 记录 |

## Codex 诊断 redact 同批判断（任务口径：确为同类且收窄只紧不松 ⇒ 同批修；有疑 ⇒ 只回交分析）

**判定：确为同类且收窄只紧不松 ⇒ 已同批修。** 依据（逐条）：

1. **同类**：两处均为同一贪婪模式类 `https?:\/\/[^\s<>"']+`（逐字符相同；codex 少 `i` flag，非本缺陷面）；同一后果类——URL 紧贴全角标点（无 ASCII 空白）时把其后文本吞入 `new URL()` 归一：落 search 者被清空（丢文本）、落 path/hash 者 `toString()` percent-encode（mojibake；codex 保留 hash ⇒ 表现为 mojibake 而非丢文本，丢/变形同属本缺陷类）。
2. **收窄只紧不松**：改动＝排除集**只增**两块（匹配范围严格收缩，任何新匹配都是旧匹配的子串）；替换函数逐字不变。已知凭据值剥除（split/join）发生在 URL 处理**之前**，主脱敏目标不受影响。
3. **同口径权衡**（与提案 §三权衡点 1 完全同形，客户已按 A-base 批准）：查询值内含被排除标点时的尾部可见——触发面近零（token 类值惯例 ASCII）；已在下方「如实标注」登记。

## 验证口径与实测（本机 macOS arm64 / Node v24.14.0）

**症状消（复现转正，逐字）**：提案 §二复现行经真实 `protectText` 全链输出＝`查询「独立对抗查询-ZX9」 → 2 条结果：独立标题-ALPHA — https://verify.test/entry；独立标题-BETA — https://verify.test/beta`（`truncated:false, redacted:true`——URL 归一仍在发生）——与提案 §三模拟表逐字一致；后缀 `；…（共 20 条）` 与 `（URL）后文` 完整；REPRO 端到端（真实装配链）＝`test/测试/g3-search-verify/pi-loopback-verify.test.ts` L255 **恰一处红**（其断言仍钉旧行为——**预期红，归测试角色同轮翻转**；本批未触碰 `test/测试/**`）。

**本职不放松**：CJK 查询值对抗 battery（`；）。（，：`五种全角分隔符紧贴 → 秘密既不以原文也不以 percent-encoded 形式出现）×5 全过；既有 `tool-display.test.ts` 全部用例（含 L44-51 零泄漏断言）逐条照跑不变；`redacted/truncated` 标记与 `[URL]` fallback 语义不变。

**计数**：`test/runtime-core/**` **107/107**（基线 104＋新增 3）；`test/codex-adapter/web-search.test.ts` **9/9**（＋1）；`test/pi-adapter/**＋claude＋codex` 全目录 **330/330** 不回归；`npm run typecheck` **0 错**。全量 `test/**/*.test.ts`（与并行角色在途改动同工作树）：**1799 计 / 1794 过 / 4 红 / 1 skip**——4 红逐条归属：①上述 loopback 预期红（本批，已声明）；②-④ `test/测试/g1-verify/g1-copy-and-nails.test.ts` 三条（su 预授权写目录恰两棵／卡文本「不在预置两目录内」等短语在场与否）＝**编排与门禁引擎并行在途改动**（`run-role.ts` 增 `docs/skills` 预授权、`boundary-core.ts` su 卡文本改「三棵目录」）对旧钉子的红——非本批改动面，归其同轮收口/测试角色翻转，本批未触碰其文件。

## 如实标注（残余与权衡）

1. **权衡点 1（登记不解决）**：URL 查询值**内含**被排除标点（如 `?k=abc：def`）时其尾部会可见（`https://a.test/x：def 后文`）；触发需「值内出现全角标点」，token 类值惯例 ASCII——与提案 §六-1 同口径保留。
2. **残余（登记不解决）**：无分隔符紧贴 CJK（`url中文说明`）仍并入 URL/percent-encode（`见 https://a.test/x%E4%B8%AD...`）——原样，见提案 §六-2。
3. **Codex redact 特有面**（同批修附带如实登记）：收窄后「被吞入 search 的后续文本」会从「已清空」变为「可见」——仅当诊断文本含「URL 查询串内出现全角标点且其后还有内容」才触发；已知凭据值（env 全量）在 URL 处理之前已剥，不受影响。
4. **未验边界**：未做真机桌面观感复跑（提案 §五判定为非必需——显示文本＝投影文本，已由 loopback 端到端断言覆盖）；未部署、未 git 提交；`test/测试/**` 未触碰。
