# 独立验收复判报告：客户授权平面——两个标记 `@审批` / `@决策`（T3）——E2 Revision 1 / v2

- **任务 ID / flowId**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane`
- **风险档位**：**T3**（不降档）
- **性质**：本文件是 E2 的**复判（Revision 1）**，对应 V1 报告 v1（`docs/acceptance/customer-authorization-plane-report-v1.md`，237 行 / `b19a926c29bf474fd00c52744b6e6f629bf3d7a4267a82087bd69d7afea8690e`）在补证后的复判。**v1 原结论（证据不足：0 fail / 7 insufficient / 16 pass / 1 N/A）与逐项表保留为历史，不修改**；本报告是当前候选的唯一现行 B2 结论。
- **触发**：v1 §六 补证清单第 1/2 项已完成——D2 真实运行补证 + B1 原始账本样例补证；候选在产品/测试面**逐字未变**（54/54）。
- **判定依据**：V1 **1171 行 / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`**；P1.1 **1199 行 / `7875ad6a…`** + P1.2 **1209 行 / `1748ad2d…`**（V1 §1.2.1 等价映射，冲突以 P1.1 为准）；复核 **132 行 / `d2588445…`**；团队计划 **675 行 / `4545d3a5…`**（v1 653 / `37e6bd0d…` + §十三/§十四）；E1 **117 行 / `e3b3ca70…`**；沟通记录当前 **207 行 / `148485ea…`**。
- **候选**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` + **54 文件**；独立复算 **54/54 SHA-256 全匹配**（冻结清单 `09-candidate-identity-fix.txt` 134 / `49cfc38d…`）；`git status --porcelain -- src app test` 50 条（展开 54）、staged 空、HEAD 未变。
- **补证输入**：D2 补证记录 `角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-supplement-v1.md` **302 行 / `68e2fe2b30cbfeb47ca0915f52c9bf36cd10f623bce9a4949f171a2cedbffde7`**（证据目录 245 文件）；B1 账本样例记录 `角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-ledger-samples.md` **200 行 / `ed9076dde4edbdcb62244b363ddd7a876c8b49fbc645e2c3dc932f34d84a0876`**。
- **总体结论**：**通过（pass）**。最终逐项：**23 pass / 0 fail / 0 insufficient evidence / 1 not applicable**（AC-23 整体 N/A；AC-24 仅 O11 子句 N/A，披露子句 pass）。v1 的 7 项 insufficient（AC-1/2/3/6/8/11/16）经补证全部转为 pass；其余 16 项沿 v1 的 pass 不变。

---

## 一、补证原始证据独立核验

### 1.1 D2 真实运行补证（AC-1/2/3/8/11/16）

| 检查 | E2 独立核验结果 |
| --- | --- |
| 补证记录 | **302 行 / `68e2fe2b…`**（与协调者输入一致）；状态 `evidence-supplement`；未修改 `src/**`、`app/**`、`test/**`（含 D2 探针 `a7913e87…`） |
| 候选身份 | 补证前 `01-candidate-identity-before.txt` 122 / `78abac83…`、补证后 `12-candidate-identity-after.txt` 122 / `44d4f14b…`，均 **54/54、0 unexpected / 0 missing / 0 mismatch**；E2 另行复算 54/54 mismatch 0 |
| 检查总数 | **140 checks / 140 true / 0 false / 0 failures**：main 65、restart run1 18、restart run2 15、bad-ledger 20、shell-directive 15、bad-ledger-shell 7；全部 exit 0 |
| 截图 | **16 张 PNG，全部 1360×860**；`10-screenshot-hashes.txt` **23 行 / `555d185c…`**；E2 逐张复算 **16/16 哈希与字节匹配**；DEBUG/ANS_DEBUG/ELECTRON_ENABLE_LOGGING 均 unset；**未录屏** |
| 近失配/普通投递（AC-1/2） | main S1a–S1d：`@审批员`、正文中 `@审批`、全角 `＠审批`、`@边界` 均 **无指令面板、用户气泡出现、`res.directive` 缺省、无回执、账本不变**（全部 check true）；命中对照 S1E：面板打开、**无用户气泡**、账本仍不存在、取消返回 `directiveCancelled:true` |
| 空正文面板（AC-1/3） | S2：面板打开；原文 `@审批`；资源命令为空；`#directive-not-confirmable` 显示「指令解析不完整；请补齐或修改字段后再确认。」；**确认按钮 disabled=true**；取消未落账 |
| 带图拒绝（AC-1） | S3：真实 `pickImage()` 附加 1×1 PNG；`sendSession` 命中+有图 ⇒ 明确错误「指令输入不支持图片附件；请移除图片后重试。」；**未开面板、无用户气泡、无回执、账本不存在**；附件 chip 可见 |
| 未识别片段（AC-3） | S4B `@审批 允许 加急`：`#directive-unrecognized` 显示「未能识别的片段：加急」；命令空；`confirmable=false`；**确认禁用**；取消未落账 |
| shell 放行/审计（AC-8） | `shell-directive/result.json` 15/15：真实 B1 runtime + 真实 `createShellGate` + 真实文件审计；硬地板 `c-deny` 不消费；review 第一次 `by:"directive:d-1"`、`directive:{id:"d-1",scope:"once"}`、operator 0 次、账本 `directive.consumed d-1`；第二次回落 `pm:无会话 → operator:supplement-operator`、无第二次 consumed；**真实 shell 审计 JSONL 3 行 / `aef4541b…`**（证据 2 行 `by:"directive:d-1"` + `directive:{id:"d-1",scope:"once"}`，无 judge/customerGrant；其余硬地板/回落行无 directive 字段） |
| 真实重启（AC-11） | restart run1 18/18：创建 `d-1`（session）+ `d-2`（once），面板 active；run2 15/15：**同一 userData/项目重启**后两行 `expired`，`d-2` 显示「未使用，已失效」，`directive:list` `active:[]`、`expired:[d-1,d-2]`、`ledgerErrors:0`；账本追加 `expired d-1 app-restart`（seq 3）与 `expired d-2 unused-once`（seq 4）；无伪回执 |
| 真实坏账本（AC-16） | bad-ledger run 20/20：`.2`/`.1`/当前三段含 3 坏行；面板「指令账本不可用（**3 条坏行**）；客户指令未生效」；`directive:list` `ledgerErrors=3`、`approval/decision active=[]`；普通聊天走普通路径、决策卡呈现客户卡不代选、账本字节不变；bad-ledger-shell 7/7：真实 ShellGate `takeDirective → undefined`、回落正常链、审计无 directive、账本不变 |

### 1.2 B1 账本样例补证（AC-6）

| 检查 | E2 独立核验结果 |
| --- | --- |
| 补证记录 | **200 行 / `ed9076dd…`**；状态 `evidence-supplement`；未修改 `src/**`、`app/**`、`test/**` |
| 主样例账本 | 11 行；SHA-256 **`fbf56b487d1774c5b3b558a9d87beebdf7dbe65c0825c732e08685ab6ae30dbf`**（E2 复算一致）；事件：created ×6、consumed ×1、revoked ×1、expired ×3；`d-<seq>`、seq 1..11 严格单调、version 1、target approval+decision、sessionId、highRisk（forever / switch-off-project-recommended）齐全 |
| 全类样例 | `directive.created`（d-1/d-2/d-3/d-4/d-7/d-8）、`directive.consumed d-1`（via.toolCallId）、`directive.revoked d-3`、`directive.expired d-2 app-restart / d-7 app-restart / d-8 unused-once` |
| 坏行/轮转样例 | `.2`（未知 kind，155 B）、`.1`（截断坏 JSON，41 B）、当前（合法 `d-3`，611 B）；Provider/A2 读取 **旧→新**；`badLines=1`、`ignoredLines=1`、`errors=1`；`approvalFacts={ledgerErrors:1, active:[]}`；`takeDirective("npm run build")=undefined`；`list()` 仍 ok:true 且 `ledgerErrors=1`（不伪造空） |
| 独立复跑 | E2 直接重跑 `02-replay-ledgers.mjs`：**checks=22 passed=22 failed=0，exit 0**；坏行分类输出与记录一致 |
| 候选身份 | 生成前/后均 54/54、0/0/0；HEAD `4c3a6e4`；staged 空；E2 复算 54/54 |

### 1.3 复用边界

- 候选未变（54/54），故 v1 的 T3 全量（D2-fix：403 文件 / 3624 / 3597 / 9 / 18；新增确定性失败 0、新增 skip 0）与双端 typecheck 0/0、受影响套件、D1 集成、D2-fix E2E/探针证据**继续有效**；补证只新增真实运行/样例证据，不改产品/测试。
- 补证证据均绑定同一 HEAD/候选；补证未录屏、关闭 DEBUG、16 张截图 1360×860；无 commit/push。

---

## 二、受影响 AC 复判（V1 §3 逐条）

| ID | v1 判断 | v2 判断 | 补证后的判定依据（V1 标准原文要点） |
| --- | --- | --- | --- |
| AC-1 | insufficient | **pass** | §3.1 识别规则全部通过：近失配/正文中/全角/`@边界` 真实普通投递（S1a–S1d 全 check true）；命中对照 S1E；空正文面板 S2；带图拒绝 S3；未识别变体 S4B；解析器 27/27（v1 已核）。D2 四类真实运行证据已补齐 |
| AC-2 | insufficient | **pass** | 命中不调用 `SessionManager.send`/`handle.send`：S1E 无用户气泡、账本不存在；C1 22/22 证明 `sendCalls=0`、无 `session:events`、`lastUserText` 等未写；未命中普通消息 S1a–S1d 走普通路径、用户气泡出现、`res.directive` 缺省、无回执、账本不变 |
| AC-3 | insufficient | **pass**（附非阻断 UX 注记） | 面板显示原文/动作/范围/资源/期限；S2 空正文确认禁用；S4B 未识别片段「加急」列出且确认禁用；S4A 派发示例实际行为见 §三；C2 28/28 |
| AC-6 | insufficient | **pass** | 账本路径/schema/ID/seq/version/轮转/未知事件/坏行/幂等符合 §5：B1 原始账本 11 行四类全含；坏行/轮转样例 `badLines=1/ignoredLines=1/errors=1`；独立回放 22/22；B1 40/40 行为测试（v1 已核） |
| AC-8 | insufficient | **pass** | 精确命令在硬地板之后放行；`once` 消费一次后不再生效；第二次回落正常链；`by:"directive:d-1"`、`directive:{id,scope}` 审计与 judge/customerGrant 互斥；消费 durable 成功后不再放行；gate 40/40（v1 已核） |
| AC-11 | insufficient | **pass** | `session` 重启后 `expired(app-restart)`；未用 `once` `expired(unused-once)`；`forever` 保留（B1 单测）；面板 expired 分组/文案/无 active 行；无伪造回执；真实两次 Electron 启动 |
| AC-16 | insufficient | **pass** | 坏账本/坏行：面板如实显示 3 条坏行；消费者按无指令（approval/decision active=[]）；普通聊天/决策卡/ShellGate 主路径不受阻；不伪造回执；账本字节不被改写；真实坏账本 + B1 单测（v1 已核） |

**其余 16 项**：AC-4、AC-5、AC-7、AC-9、AC-10、AC-12、AC-13、AC-14、AC-15、AC-17、AC-18、AC-19、AC-20、AC-21、AC-22、AC-24 沿 v1 的 **pass** 不变（v1 §三/§五已列证据；补证未改候选，证据继续有效）。**AC-23** 沿 v1 **not applicable（O9 未选）**；AC-24 的 O11 子句 N/A、披露子句 pass。

**最终逐项汇总**：**pass 23 / fail 0 / insufficient evidence 0 / not applicable 1**（AC-23 整体；AC-24 仅 O11 子句 N/A）→ 按 V1「无 fail 且无 insufficient → 通过」：**总体通过（pass）**。

---

## 三、AC-3 派发示例披露的判定（`@审批 允许 shell "npm install" 加急`）

- **实际行为（补证如实记录）**：面板显示原文；资源显示 `shell 命令："npm install" 加急`；**未列出未识别片段**；**确认按钮可用**；取消未落账。另用 `@审批 允许 加急` 证明未识别片段路径：显示「未能识别的片段：加急」、命令空、`confirmable=false`、确认禁用。
- **对照 V1 AC-3 原文**：「面板显示原文、动作、范围、资源、期限；解析不确定时字段留空并列出未识别片段；确认禁用直到字段有效」。P1.1 §4.2 的预填规则明确允许「命令=引号内原文（**或 `shell` 后全部文本**）」；当前实现选择「`shell` 后全部文本」，把 `"npm install" 加急` 整体作为命令。该解析是**确定性**的（不是“解析不确定”），面板完整显示该命令，客户可编辑；命令按规范化文本精确匹配，**不会**误放行 `npm install`（只会匹配带「加急」的精确命令，属更窄、非更宽授权）。
- **判定**：**不构成 AC-3 fail 或 insufficient**。派发示例期望的“列出加急为未识别片段”是 §4.2 的另一可选口径；当前实现采用 §4.2 明示的“shell 后全部文本”口径，仍在确认版方案内。若客户/策划希望统一为“引号外尾词必须列为未识别片段”，属**方案/UX 澄清**（可能改产品行为并重取证），不是当前候选对 V1 AC-3 的失败。
- **非阻断 UX 注记**：面板不额外提示「加急」被并入命令；建议后续在面板/文案上提示客户核对命令全文（不改变本次 AC-3 pass，不影响总体通过）。

---

## 四、总体结论、复用与边界

- **v1 原结论（历史）**：证据不足（0 fail / 7 insufficient / 16 pass / 1 N/A），报告 v1 237/`b19a926c…` 保留不改。
- **v2 复判结论**：补证后 **23 pass / 0 fail / 0 insufficient / 1 N/A → 通过（pass）**。通过仅对当前候选（HEAD `4c3a6e4` + 54 文件逐文件哈希）有效。
- **证据复用**：候选未变，T3 全量（D2-fix 403/3624/3597/9/18；新增确定性失败 0、新增 skip 0）、双端 typecheck 0/0、受影响套件、D1 集成、D2-fix E2E/探针继续有效；补证新增 D2 真实运行 140/140、16 截图、shell 审计 3 行、B1 账本 11 行全类与坏行/轮转回放 22/22。
- **非阻断披露（不改变 pass）**：面板撤销回执依赖当前选中 roleId/runtime（无选中角色边界已披露）；A1 `api-spec.md:160` EOF 空行（非产品候选）；多引擎仅默认；`write-sequencing.test.ts` 排除未运行；D2 补证普通聊天未驱动真实模型（只证明走普通路径）；坏账本面板仍显示可解析的历史 revoked 行并同时显示错误横幅（不伪造空）；未录屏；无 task_ops；未 commit/push/merge/release。
- **授权边界**：本报告不是客户批准、不是发布授权；不授权提交、推送、合并、发布、打 tag。客户提交/合并预授权以 E2 通过 + E3 放行为前提；本报告仅给出 E2 结论，E3 由统筹/沟通执行。

---

**报告状态：E2 Revision 1（v2）；总体通过（23 pass / 0 fail / 0 insufficient / 1 N/A）；当前候选 HEAD `4c3a6e4` + 54 文件；未 commit/push；不授权提交、推送、合并、发布。**
