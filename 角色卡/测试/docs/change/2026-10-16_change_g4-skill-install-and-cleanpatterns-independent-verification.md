---
id: g4-skill-install-and-cleanpatterns-independent-verification
type: change
title: G-4 V1（su 技能安装全链）＋ cleanPatterns 轻修——独立验证报告
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: verified
related: [kanban-fixes-pm-review, role-capability-install, core-cleanpatterns-url-boundary, g3-search-and-fold-independent-verification]
events:
  - date: "2026-10-16"
    kind: verified
    summary: 测试角色独立验证：G-4 V1 全链（工具面/渲染/预授权/卡文本/桌面 handler/裁定④⑤/拼接×3/范围审计）＋ cleanPatterns A-base 轻修——**整体通过（0 不通过、5 备注）**；自建 51 例全绿；冻结绑定 26 条目开工/收工逐字节一致；全量 1880/1879/0/1（含本批 51 例）＋typecheck 0
---

# G-4 V1＋cleanPatterns 轻修——独立验证报告

**结论：整体通过（0 不通过、5 备注）。** 独立自建 51 例全绿（`test/测试/g4-skill-verify/`，自包含夹具，不复用实施方断言）；冻结绑定 26 条目开工/收工逐字节一致；全量 1880 计 / 1879 过 / 0 红 / 1 skip（＝基线 1829 ＋ 本批自建 51；1 skip＝既有「仅 Windows」项）；`npm run typecheck` 0 错。

方法：对抗性独立构造、逐项取证（自建夹具＝真实临时项目盘＋可控 SessionManager 假件＋独立重打金文本/冻结句），只写 `test/测试/**` 与 `角色卡/测试/**`；未改任何产品文件；未 git 提交；零真实网关请求（本批全部离线）。

---

## 一、结论逐项（A–K）

| 域 | 结论 | 要点 |
| --- | --- | --- |
| A. 工具面 | ✅ | 注入才注册四组合矩阵（两能力互不搭车）；回执冻形逐字段（digest 前 12 位、rebuilt/next-session 文案、卸载二分「效果已撤；文件保留」）；契约外回执（action 不符/缺 digest/effective 非法/null/抛错/预中止）全 fail-closed，绝不称已装/已卸；schema 冻结句**独立重打锚点**逐字对齐；零写盘＝源码切片核对（无任何写盘原语）＋真实盘快照前后逐字节一致（成功与失败两路） |
| B. 渲染单一来源 | ✅ | 金文本独立构造（排序/编号/digest 独立复算）；**双向核**＝坏件集 ⟺ 读取器 undefined 集 ⟺ 渲染器诊断集（逐条同口径）；digest＝原始字节（BOM＋非法 UTF-8 对抗：不解码、不剥 BOM）；坏件防御（缺件/解析失败/未知状态/控制字符名）跳过＋诊断；穿越名/分隔符/空白根 ⇒ `readSkillRegistration` undefined 绝不抛；零技能 ∅；onDiagnostic 抛错被吞 |
| C. 预授权 | ✅ | **经 `openRoleSession` 真实装配**捕获 gate：docs/skills 树内（相对/子路径/绝对）免确认直写、全程客户通道零调用；树外确认前 F4 拒、经确认发行后放行（逐条确认语义未变）；前缀负例（docs/skills2、docs/skill）与「..」归一穿越均不覆盖；docs/mcp 未预授权；非 su 角色不变（X 写自己边界可、写 docs/skills 拒）；重建后仍有效 |
| D. 卡文本 | ✅ | 安装纪律四要点＋三棵树话术以自建清单在场核验；J-1 守卫**全文小句级**零违规（含守卫词必带否定标记）；安装纪律段段级零命中守卫三词；非空洞验证（内存变异必被谓词捕获） |
| E. 桌面 handler | ✅ | 护栏对抗矩阵：无轮次/回交轮/系统轮/派发轮（私有面直注，真实装配下 su 不可为派发目标）⇒ `not-customer-turn` 逐字＋零副作用；直聊轮与**排队客户消息轮**（active kind=message）放行；拒绝全分支 reason 映射＋文案逐字＋盘快照/零重建/无系统行三重零副作用；三态（rebuilt：dispose+重开+digest 独立复算；next-session：在跑不打断/无会话不自动开＋note；rebuild-failed：如实「未假装已生效」）；`[系统·安装]` 系统行 kind=system 真投递（忙时排队→settle 后送达）且 withdraw 拒绝（不可撤回）；诊断 `skill.installed/skill.refused` 落盘 |
| F. 裁定⑤指纹 | ✅ | 三触发（新增/内容编辑/移除）逐触发重建并如实点名（技能措辞与边界措辞分开）；零技能负例零重建；坏登记（解析失败/未知状态/空目录）不误重建（可重复稳定）；SKILL.md 缺失不触发、补齐即触发（与「补好即注入」收敛一致）；别角色技能变化不误伤 |
| G. 拼接 ×3 | ✅ | Claude/Codex/Pi 真实外壳/假适配器四路：零技能＝逐字基线；有技能＝基线＋**恰一段**（独立重打节文本、digest 独立复算、只追加不改写）；多技能排序编号；坏件跳过且不拒会话（假适配器真开轮 settled） |
| H. 范围审计 | ✅ | `docs/mcp` 未预授权（源码字面量＋C 域行为互证）；MCP V2 **零产品实施**（`install_mcp/uninstall_mcp` 全仓 src/app 零命中；schema 层未知工具拒绝；`docs/mcp` 仅一处注释）；安装链**零 `request_confirmation`**（两处源码切片＋真实装配行为：install_skill 全链执行且客户通道零调用＝无二次卡）；**无删除原语**（工具面集合恰为既有七名、无删除类；卸载链切片无 unlink/rm；E 域实测文件保留）；能力位**仅 su**（桌面 `role.builtIn===true`／编排 `suppressHandback` 判据逐字；项目角色误给零注册——真实装配行为侧）；探针脚本纯本地（4 个 `.probe.ts` 全在 test/ 下、不被 `test/**/*.test.ts` 匹配、零被引用、CI 零执行、端点仅 127.0.0.1/.invalid） |
| I. cleanPatterns 轻修 | ✅ | **复现转正**（G-3 备注①最小复现升级为正向钉：第 2 条起标题完整、秘密剥净、flags 如实）；后缀/括号变体 mojibake 消除（`；…（共 N 条）`、`（URL）后文` 逐字保真）；零泄漏 battery（CJK 值＋全角标点紧贴全矩阵，`userinfo` 一并剥净）；ASCII `;` 路径参数不回归；redacted/truncated 语义与显示预算不变；控制字符清洗不变；Codex 诊断 redact 同口径收窄（只紧不松，环境秘密值替换不吞尾） |
| J. 冻结绑定 | ✅ | 26 条目开工/收工/终次三份 sha256 逐字节一致（见 §四） |
| K. 全量 | ✅ | `node --test "test/**/*.test.ts"` → **1880 计 / 1879 过 / 0 红 / 1 skip**（1829 基线＋本批 51；skip＝既有「仅 Windows」）；`npm run typecheck` 0 错 |

---

## 二、范围审计明细

1. **预授权面**：`SU_PREAUTHORIZED_WRITE_DIRS` 字面量恰为 `["docs/su","docs/contracts","docs/skills"]`（抽取核）；`docs/mcp` 在源码中仅被一处注释提及（「未扩——V2 另议」），无任何代码路径使用。
2. **MCP V2 零实施**：`install_mcp|uninstall_mcp` 于 `src/`＋`app/` 全量零命中；`describeTool("install_mcp")` 抛「未知 ANS 工具」（结构性零注册）；三适配器名下 mcp-surface 探针＝scratch 评估物：`test/claude-adapter/{mcp-fake-stdio-server,mcp-surface-loopback}.probe.ts`、`test/pi-adapter/{mcp-probe-server,mcp-surface}.probe.ts`——不被 test 全局匹配、零被 `*.test.ts` 引用、CI（release.yml）零执行、端点仅回环/`.invalid`。
3. **无二次卡**：`applySkillChange` 与 `makeSkillReceiptTool` 两源码切片零 `request_confirmation`/零客户通道字样；行为侧真实装配下一轮 install_skill 全链执行成功而 `customerInput` 恰 0 次调用（确认工具在场但不被触及＝结构上没有可弹的卡）。
4. **无删除原语**：`buildGovernedTools` 全集（注入两能力＋客户通道时）＝〔write_file, edit_file, read_file, install_skill, uninstall_skill, request_confirmation, request_choice〕，无任何删除类名；卸载链切片无删除调用；卸载成功实测 SKILL.md 与 install.md 均保留（「效果已撤」≠「字节已清」二分成立）。
5. **能力位仅 su**：桌面注入判据 `role.builtIn === true`、编排透传判据 `suppressHandback ? input.installSkill : undefined`（均逐字核）；行为侧 su 注册、项目角色即便误给零注册。

---

## 三、用例计数与关键对抗

- **本批自建**：`test/测试/g4-skill-verify/` 9 个测试文件（a–i）＋自包含夹具 `fixture.ts`/`h-harness.ts`，**51 例全绿**（g4-verify-dir.log）。
- 复跑证据（各自独立日志）：翻转钉子＋g1 复核 **12/12**；实施方 G-4 四文件 **46/46**；冻结清单其余产品测试 **202/202**；全量 **1880/1879/0/1**；typecheck 0。
- 关键对抗原始回执（证据 `handler-guard-matrix.json`）：无轮次/系统轮 ⇒ `{ok:false, reason:"not-customer-turn", message:"本动作仅可在客户消息发起的轮次执行——未执行。"}`；客户轮 ⇒ `{ok:true, action:"installed", …effective:"rebuilt"}`。
- cleanPatterns 复现转正原始输出（证据 `cleanpatterns-repro-after.txt`）：`…独立标题-ALPHA — https://verify.test/entry；独立标题-BETA — https://verify.test/beta`；`flags={"redacted":true,"truncated":false}`；包内秘密零命中。

### 备注（5 条，均非不通过）

1. **rebuild 支事件文案**：安装成功（rebuilt）复用 `rebuildSession` 的既有定格行「已按要求（**客户确认的恢复动作**）重建…」——安装场景并无「客户确认的恢复动作」，措辞属既有单一来源复用（G-2/W4 面），非本批改动面；呈现面小观察，供 PM 参。
2. **Codex 诊断 redact 的 hash 口径**：本轮收窄为「只紧不松」，其 hash（`#frag`）**原样保留**（与 tool-display 的 hash 剥除口径不同——原即如此，未动）。已如实登记，非回归。
3. **「无分隔符紧贴 CJK」残余**：`https://a.test/x中文说明` 仍并入 URL（percent-encode）——客户裁定口径保留现状（提案 §六-2），非缺陷。
4. **登记由好转坏的过渡语义**：初次即坏（parse-fail/未知状态）⇒ 不触发重建（已核）；曾有效后被改坏 ⇒ 集合差触发**一次**重建，随后收敛稳定——如实登记该语义细节（设计未禁止）。
5. **派发轮护栏分支**：真实装配下 su 不可能作为派发目标（`routeDispatch` 拒内置角色）——该矩阵格以私有面直注检验判据代码本身（`active.kind === "message"`），代码行为正确。

---

## 四、冻结绑定（开工清单＝报告内）

开工（=收工=终次复算）对下列 26 条目 sha256 逐字节一致（证据 `freeze-start.sha256` / `freeze-end.sha256` / `freeze-end2.sha256`，diff 为空）：

| 文件 | sha256 |
| --- | --- |
| src/model/runtime.ts | 0f40d48d8164ef526382b088b2edce5dfafaedcdfbe2d33209f246bbaca5055b |
| src/provider/runtime/schema.ts | 4d759bd3842d302f26f5514da0e15c3d095ddd28e7641307962a3d506e39c649 |
| src/provider/runtime/tools.ts | fe54ce9df7556845eacf411fed46e90fb57a07532a77588131c3f838cea74e03 |
| src/common/编排/installed-skills.ts | c78dd2891d8f193b08132543b8deb661db48ed29db0cbafe6b5802017483d5c1 |
| src/pipeline/orchestration/run-role.ts | 23ae2d6f588b49f97f8319701e7840d615fc13b363a696bd5a3ea0dec408b85f |
| src/common/门禁引擎/boundary-core.ts | 86883373c95a145992142808cbd5efe3cb3accecc8c1ac0f3f3ddf58b0c8eda0 |
| src/common/runtime-core/tool-display.ts | b13e14e3b9a15e76d713cac792532aa47d6f41b4b827505bfd3d5887d50d8ea1 |
| src/common/codex-adapter/config.ts | fa227145abc40a957c958a48a1798f603040f1ed2224f1118429642428127ea3 |
| app/desktop/session.ts | 08931fb1dc731a16a4245761c53d7a35ddfb4fa2b500d64ea06918ed76888c5e |
| app/desktop/interface.ts | 5f6174c500c4cdafc4804510a522db50439d636355a08234c3ba4d4d394ddd45 |
| src/provider/claude/session.ts | 387be2722910bf03b2133fc7bb26df81149b4ad1da6d8732fa983e63d8a19711 |
| src/provider/codex/session.ts | e988bbb443d072c7f8766439c41c004014ae4259af5ded277b83b30f055f25fd |
| src/provider/pi/session.ts | f778dd236f4771309872b6c7dd1df097b16fddd9f22333da1c04fb9be2782ae6 |
| src/common/pi-adapter/real-adapter.ts | c4da4d153eb41efb99363c2d30283865a3420c18a014fc042108cc013a8d5326 |
| test/runtime-core/install-skill-tools.test.ts | 631056ec79e2fe6d6e3eb654f06920818e1c1aa3acf0c575e8e24f03f1d43867 |
| test/runtime-core/tools.test.ts | 43e1164c896b53a5b70b352f617f0983272eae444a26c1b6aab22a526290d55d |
| test/runtime-core/tool-display.test.ts | fe7735e56fa3355e61a92361fe88df3cdf4df5ee675bf492fbec0433888afdfb |
| test/编排/installed-skills.test.ts | 3df3093c360ddadbbbdca6fe82e399ba81d4af9ca636ed22fc320ff3f8c5b33b |
| test/门禁引擎/su-doc-surface-convention.test.ts | fe784d94489df157286b7b54bef07b1b06de3d451a2ad97d3698c0e4155b1418 |
| test/桌面应用/dispatch-delivery.test.ts | 8156473be097149e4ae550d6ae5c55624731a7dbea5b71b6d8cf04888e797ec0 |
| test/桌面应用/boundary-refresh.test.ts | 6e7ddb41042d39f71df9591ff279d8a009d7842ffc38ade965e0116c9b741c69 |
| test/桌面应用/tool-rows.test.ts | 52c2c4e7ec03e63828d0cadf75b940e52d511b21d45afe571a95f2858c2b23b8 |
| test/桌面应用/renderer.test.ts | 3bce42fb007bf608f39e0e16d9ed5bc059aef3beacd37769df78bdf059a72722 |
| test/claude-adapter/session.test.ts | 032edffdbd5b33ab5fbd741444854419acb7829eddb2305f52e0e1237bd3a996 |
| test/codex-adapter/session.test.ts | 2ae467fa7dc05be6440fb547094e7fa9b9e87d903d6dc7f75c006f8e7af16a7d |
| test/pi-adapter/installed-skills-injection.test.ts | e6e5421611e15a4d3b4793c96a3312d9f29a4b4691b4a8fc1a796caa351ea6ff |

本次验证仅写 `test/测试/g4-skill-verify/**`（9 测试文件＋2 夹具）与 `角色卡/测试/docs/change/**`（本报告＋证据）；产品文件 mtime 早于本会话，零触碰（git status 核对）。测试角色既有钉子同步（loopback L255 翻转、g1 三棵措辞）已复跑复核（12/12 绿）。

---

## 五、未验边界（如实留白）

1. **Electron 真机 E2E 未跑**：安装行/`[系统·安装]` 系统行的真渲染、真 rebuildSession 于实机界面——本轮为 harness 级（SessionManager 依赖注入）＋产品测试复跑；真机断点观测项沿设计 §十 留待下轮（如需）。
2. **SDK 级会话路径**：Claude/Codex 的系统提示真进入引擎、Pi faux 会话的 resourceLoader——由实施方测试覆盖（本角色复跑绿 202/202），本角色未独立构造 SDK 级探针。
3. **卸载×在跑组合**：uninstall＋busy ⇒ next-session 未单独构造（与安装侧同 code path；安装侧三态已逐一钉住）。
4. **桌面窗口 `interface.ts` 改动面**：未独立跑真渲染链路（frozen 清单中 renderer/tool-rows 产品测试复跑绿）。
5. **探针脚本行为**：按约束「不碰探针脚本」，其本地性为**静态审计**（端点/引用/CI/命名），未执行。

## 六、证据索引

`角色卡/测试/docs/change/2026-10-16-g4-verification-evidence/`：

- `freeze-start.sha256` / `freeze-end.sha256` / `freeze-end2.sha256`（26 条目三份一致）
- `g4-verify-dir.log`（自建 51/51）/ `pinned-loopback-and-g1.log`（12/12）/ `implementer-g4-files.log`（46/46）/ `frozen-product-tests.log`（202/202）/ `full-suite.log`（1880/1879/0/1）/ `typecheck.log`（0 错）
- `handler-guard-matrix.json`（护栏矩阵原始回执）/ `cleanpatterns-repro-after.txt`（复现转正原始输出）
