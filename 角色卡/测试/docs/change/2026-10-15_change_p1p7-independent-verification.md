# P1–P7 独立验证记录（验收完成）

用户已批准总方案 r2 和取舍，要求先精确边界更新，再实现并真实桌面验收。固定测试角色只修改自己的测试和证据，生产问题交原属主。验收依据为[三接口独立方案](../design/2026-10-15_three-interface-verification-plan.md)，本记录不修改冻结设计。

## 当前已实测的范围

- B 通过真实 Pipeline → Service → Provider：原生选择资格、引用与路径拒绝、UTF-8/BOM、256 KiB 边界及只读副作用。发现新项目导入失败撤销旧项目资格的真实错误，Window 修复后，保留原断言复测通过。见[原失败](2026-10-15-p1p7-implementation-evidence/b-failed-import-red.json)、[同断言通过](2026-10-15-p1p7-implementation-evidence/b-failed-import-green.json)。
- C 真实 Core 与文件存储：安全输入副本、SDK 原文/图片保持、源报告重复保存、真实目标回执与无重复 prompt。发现 Provider 已执行后的存储错误被同 attempt 前置检查退为“未执行”，Core 已修复；[原失败](2026-10-15-p1p7-implementation-evidence/c-after-provider-independent.json)和[复测通过](2026-10-15-p1p7-implementation-evidence/c-after-provider-green.json)均保留。注入源报告保存故障后的并发重试仅保存一次，不重跑模型，见[实测](2026-10-15-p1p7-implementation-evidence/c-report-storage-retry.json)。
- 编排接线后，三个既有独立测试文件 11/11 通过：普通聊天不自动回交、正式派发回交、关闭持久化仍保 live 且不创建目录、输入身份隔离、停止与迟到决定、终态保真。见[候选哈希与输出](2026-10-15-p1p7-implementation-evidence/pipeline-after-orchestration.json)。
- A 真实 shell 执行两次、退出 7、stderr、文件副作用和 ENOENT 已穿过 Core；安全投影不改模型工具返回。Window 的新详情映射尚待接线，三个 runtime 的相关断言保持失败等待依赖，未列为集成通过。

## 当前问题及待测

A 把没有工具身份的普通 engine denied 事件加成空 toolName、blocked 阶段，经 PM 路由 Core 已修复。[复现证据](2026-10-15-p1p7-implementation-evidence/a-non-tool-routing-red.json)以原事件事实和不编造工具字段为断言；早期要求任意 source 自定义字段保留的过宽 oracle 已单独说明，未用其代替当前复现。root 在 Service SHA `991146051f429ef26b46b21154a574086b312233047b29c99a9d522c01280f02` 上保同断言[独验 1/1 通过](2026-10-15-p1p7-implementation-evidence/a-non-tool-routing-green.json)，Core 自有 77/77。调用方最终仍须按该实际依赖重验。

C 的 delivery boundary/receipt 当前仍被旧 Window 映射为 assistant，三个 runtime 保持失败待 Window A/C 实现。它们不是模型助手正文，不应靠删断言通过。

各运行时的受控引擎接线不等于在线模型实测，接口层测试也不等于真实桌面。完整候选、全仓测试、真实 Electron 的 P1–P7 以及修改后受影响调用方复测尚未完成。桌面使用独立 p-limit 临时副本，不覆盖原项目或真实配置；夹具见[准备清单](2026-10-15-p1p7-implementation-evidence/desktop-fixture-before.json)。最终结果将在实际完成后补充，旧 1258 通过不能作为本轮结果。

## 实现在途的首轮全仓检查

`node --test 'test/**/*.test.ts'`：1346 总计、1322 通过、23 失败、1 跳过，实际退出 1；[原始完整输出](2026-10-15-p1p7-implementation-evidence/first-full-in-progress.json)保留。当前不是最终候选，失败不可改称通过：

- 1 项 Pi 本地超时服务无法 listen 127.0.0.1（沙箱 EPERM），是环境限制，后续允许本地监听的执行另记结果。
- 8 项桌面窗口旧测试：新 required 协议下替身缺 profile 登记，及目标/请求锚点映射待 A/C 接线。原身份与锚点断言保持，不能通过放回 raw title 绕过投影。
- 7 项 root 三接口独验：6 项待 Window 新映射，1 项 Core 非工具路由真实错误。
- 2 项实际 CLI Codex 入口因尚未实现 profile 登记失败。
- 5 项装配旧 controlled factory 未登记 profile，由装配测试属主维护，不放松生产 required-v1。

已向 PM 交逐项路径及错误。当前 `.env` SHA-256 与原基线一致，Node v24.14.0 / darwin arm64；未读取凭据内容到输出。

Core 非工具路由修复后，root 只读执行 Pi、Claude、编排属主测试，允许正常本地回环监听：**501/501、0 失败、0 跳过**，先前本地超时测试的 EPERM 环境阻碍已解除。该结果及 8 件实际依赖哈希见[修后调用方回归](2026-10-15-p1p7-implementation-evidence/callers-after-non-tool-core-fix.json)。这是 root 执行现有测试的结果，未代改同伴测试，也不等于在线引擎或桌面验收。

## 窗口第一版接线后的独立结果

原 A/C 两文件 10/10 通过：此前六项窗口映射失败已按原断言转绿。普通聊天/正式派发测试随公开安全合同将内部 raw handback 读取改为 `report/liveReport`，原 status 与 actual source turn 断言保留并增加“IPC 无 raw handback”守卫，三个 runtime 3/3 通过。[阶段证据](2026-10-15-p1p7-implementation-evidence/window-stage-independent-green.json)明确尚非冻结完整候选。

新增真实 Window → Pipeline → Core 保存恢复独验 **3/3**：初次源保存成功及订阅/事件归并只投一次；源保存失败期间不投递，并发补存只真实保存一次、只继续一次原回交；目标最终 receipt append 故障后并发补历史只修已知记录，不再调用 Provider。均计实际模型调用，保原模型输入，核对 envelope、队列 full、运行中 full 与通知不带假凭据。见[命令与结果](2026-10-15-p1p7-implementation-evidence/window-save-recovery-green.json)。

Codex 属主接线后，root 只读执行实际 CLI 六入口与 Codex 自有测试，共 **28/28**，首轮 Codex 两项缺 profile 已转绿。[实际候选与日志](2026-10-15-p1p7-implementation-evidence/codex-independent-green.json)区分受控 SDK 与属主固定 CLI 本地回环；均不代表在线 Codex 或真实桌面。最新全仓 typecheck 退出 0。后续仍需 UI、装配旧夹具与完整桌面验收。

## 最终候选阶段：真实桌面与问题闭环

以上“待接线/待测试”为保留的阶段记录。后续 Window、各适配器、编排、装配与 UI 已接线完成；root 当前独立全仓在 renderer `efd2e33c45e587c2784a5e98528a035f08f9bca8e4c55b62d52dbe8f1f84e92c` 上为 **1379 总计、1378 通过、0 失败、1 平台跳过**。原始输出 `/private/tmp/ans-p1p7-final-full-efd.log`，此结果先于最后嵌套阅读位置修复，不冒充该后续候选的结果。

边界顺序符合用户要求：治理角色先将 Window 明确文件白名单从 35 扩至 44（8 件新源码及 1 件对应测试），root 核对生产改动尚为空后才派发实现。冻结 r2 的 13 件设计内容未变。实现及修复始终交原属主，测试角色只改自己的测试和证据。

真实 Electron 使用独立 p-limit 副本，实际原生文件选择、键鼠操作和已配置的在线 Pi 模型完成：

| 范围 | 真实桌面结果 |
| --- | --- |
| P1 工具详情 | 两次 node -v 为不同真实 call；npm test 实际退出 0、stdout 为 31 tests passed、stderr 可查看；ENOENT 明确显示；长结果显示截断且安全详情为 16 KiB，SDK 日志仍保原完整结果。 |
| P2 回交事实 | 正式任务 dispatch/worker 输入/源报告/目标回交输入/最终 receipt 各 1 次；目标历史 saved、outcome completed。报告自述与独立验收区分，普通聊天无自动报告。 |
| P3 来源资料 | 报告入口进入真实来源角色清单，再明确选择 9799 字节报告；BOM/中文/emoji 正常；262145 字节超限与非法 UTF-8 明确拒读；脚本、图片、危险链接只作文本。返回清单焦点、角色资料外层滚动和展开状态通过；最后发现内层 card-text 阅读位置重置，已交 UI 原属主修复，待最终原生复测。 |
| P4 待处理与队列 | 1 项确认与 2 项排队分别计数；撤回一项后只有保留项真正进入 Core；定位待处理卡并关闭侧栏、焦点回到卡。 |
| P5 上下文 | 原生重启后从本地恢复上下文；未使用角色首次发送仍为新会话，修复旧 UI 对本会话正常消息误报“模型未恢复”。 |
| P6 引擎与配置 | 导入前禁选；导入后键盘 Home/End/Return 切换；Claude 缺 ANTHROPIC_API_KEY 有明确提示和设置入口；Escape 回到真实发起按钮；角色/引擎草稿隔离并保留。未写入真实凭据。 |
| P7 决定与停止 | 单选无默认决定，键盘选择并确认；停止后旧选择全部禁用；排队消息随后只执行一次。修复显式停止误当通用失败及回滚输入、同一 actual turn 双“本轮已中止”；修后新增一轮原生停止仅新增一个中止终态，随后无需重新点击角色即可正常发送。 |

[真实派发与执行事实](2026-10-15-p1p7-implementation-evidence/native-real-dispatch-verified.json)、[SDK 原文保持](2026-10-15-p1p7-implementation-evidence/native-sdk-original-content-preserved.json)、[同轮终态归并原生复测](2026-10-15-p1p7-implementation-evidence/desktop-terminal-merge-fixed.json)、[最终只读审计](2026-10-15-p1p7-implementation-evidence/native-final-readonly-audit.json)均保留。

最终只读审计：su 真实 Core user 10、测试 1、维护 1；源报告数量分别 0、1、0。13 件冻结设计、真实 .env、p-limit 四件业务文件及四件只读文档夹具哈希均与基线一致。实际在线测试未再次改 p-limit 业务源代码，工作角色在其获准报告文档内写入测试记录。

### 本轮发现并由属主修复

除前文的失败导入资格、Provider 已执行后事实退回、无工具身份误造工具行外，还修复旧日志映射丢既有 provenance、装配旧替身缺 required profile、首次消息上下文误标、过期卡仍可编辑、队列提示过期、停止被泛化为发送失败、同 turn 双终态、报告加载错误空列表分支吞提示、资料返回焦点与阅读状态。每一处生产修复由原属主维护对应 docs/fix 或 docs/change，保留原失败与严格复测；最后嵌套滚动仍待完成，未列通过。

### 验证边界

在线模型实测为 macOS Electron / Pi。Claude 与 Codex 验证为固定真实 CLI 加本地受控协议服务及适配器/集成测试，不能称在线模型测试。磁盘保存失败/补存并发、身份与字节预算等故障由实际 Core/Window/Pipeline 的受控故障注入验证，不冒充桌面手动制造全部故障。B 保留 r2 接受的可信本地文件系统边界，未宣称防恶意本地并发写者或 Windows 支持；未增加全局 DLP 或自动重放。

## 最终验收结论

最后嵌套阅读位置问题已由 UI 修复，最终 renderer SHA-256 为 `394a7abb0af61fa3f7a5ee0652238e70883d17d798235c37954cdf41086a5252`。root 原生重载最终候选，使用真实可见的“查看已列文档”入口往返：角色卡仍停在“6. 协作”，外层滚动和展开状态保持，实际焦点为等效原入口按钮。证据：[修后进入前](2026-10-15-p1p7-implementation-evidence/desktop-nested-fixed-before.png)、[修后返回](2026-10-15-p1p7-implementation-evidence/desktop-nested-fixed-after.png)、[焦点记录](2026-10-15-p1p7-implementation-evidence/desktop-nested-fixed-after-ax.txt)。前文嵌套问题待测状态至此关闭。

实际将原生窗口拖至 **960×860** 后，资料侧栏、关闭与文档入口、输入区均可用；Escape 返回角色资料入口。窄窗口内再次用键盘 End/Return 选 Claude，缺配置按钮打开真实设置，Escape 焦点回到原按钮，再 Home/Return 返回 Pi；未保存任何配置，窗口最终恢复 1360×860。见[960 原生截图](2026-10-15-p1p7-implementation-evidence/desktop-final-960-drawer.png)。

最终候选全仓 **1379 项：1378 通过、0 失败、1 平台跳过**，实际退出 0；`npm run typecheck` 与 `git diff --check` 均退出 0。root 复算 UI 的 6 件源码、5 件测试、48 件实际依赖全部匹配属主最终 manifest，冻结 13 件设计及真实 .env 再次匹配。完整生产文件哈希、受影响原生复测及日志位于[最终验证清单](2026-10-15-p1p7-implementation-evidence/final-verification.json)和[最终全仓原始日志](2026-10-15-p1p7-implementation-evidence/final-full.log)。

结论：r2 三接口及 P1–P7 在上述明确验证范围内通过，发现问题均由对应角色修复并复测。各阶段使用其当时实际候选，最后窄修按受影响范围原生复测，完整全仓使用最后字节；未把历史桌面截图冒充最后候选全流程重跑。当前代码及记录留在工作区，未创建新提交或推送。
