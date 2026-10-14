---
id: runtime-missing-config-entry
type: fix
title: 导入后选择引擎的缺配置提示与设置入口
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: implemented-unverified
revision: 1
---

# 导入文件夹后，缺配置可直接进入设置

用户报告选择 Claude 时没有缺配置提示，希望缺配置处有按钮打开设置。root 测试角色已真实 UI 复现，PM 另行独立源码审查：未导入项目选择 Claude，主工作区没有提醒；打开右上 Claude 设置后才看到 `ANTHROPIC_API_KEY` 未设置。用户随后明确：未导入文件夹不允许选择引擎，导入后才允许选择。本稿已合并该要求，撤销“未导入项目也展示缺项”的初始假设。相关当前功能：[桌面引擎选择](../feature/runtime-choice.md)。本稿 revision 1 已经 PM 审核、客户确认并授意实施。当前本侧已实施及验证，独立真实主进程复测由 root 测试角色完成。

## 根因与现有契约

`renderer.js::selectRuntime` 无项目前置条件，且仅在 `state.rightTab === "pi"` 时调用 `loadPiConfig`。`renderPiConfigWarning` 只更新设置抽屉内的 `pi-status`；主工作区缺少配置状态与入口。`savePiConfigFromForm` 重读配置后无条件写成功状态，因此仍有缺项或重读失败时会被“已保存”覆盖。`runtime-ui.js::applicationLabel` 的“当前配置已应用”描述 profile 应用时点，并不证明必填项齐备。

窗口已有 `getRuntimeConfig(runtime)` 返回 `RuntimeConfigView.missingKeys`、字段 metadata、掩码与 application；`app/desktop/runtime-config.ts` 按 registry 必填字段和实际有效来源产生 missingKeys。UI 应消费该结果，不另写必填校验或读取密钥。此修复不需要新增 IPC、窗口或 registry 行为。

## 最小方案

1. 未导入有效文件夹时 `runtime-select` disabled，`selectRuntime` 同时守卫无项目调用；首次导入取消/失败仍禁用。已有项目时取消切换或新项目读取失败，保留原 projectRoot、原引擎选择与可选状态，不清掉已导入项目。导入成功或恢复已有项目后启用，并检查当前引擎配置；成功导入空文件夹也启用，条件只看已有 projectRoot，不依赖 hasRoles。原右上设置入口仍可使用，不新增其他访问限制。
2. 导入后每次切换 Pi/Codex/Claude 都读取配置，不依赖抽屉是否打开或是否选择了角色。主工作区在聊天头下、`#chat` 外增加简洁内联状态条；不进入聊天历史，不随角色空态隐藏。读取中明确“正在检查 Claude 配置…”；缺项时显示“Claude 配置不完整，缺：ANTHROPIC_API_KEY。”与“打开 Claude 设置”按钮。Pi/Codex 使用同一流程，字段名来自返回的 missingKeys，只显示字段名称，不显示值。
3. 按钮调用既有 `openPiPanel`，打开当前所选引擎的设置抽屉；沿用现有键盘、关闭与 Esc 行为。配置齐备时收起缺项条。读取失败显示“读取 Claude 配置失败，请打开设置检查或重试”及同一设置入口，不能显示齐备。未知或不完整返回视图按读取失败处理；仅确认获得对应引擎的有效配置视图后才能依据 missingKeys 为空收起告警。
4. 读取结果按 runtime、projectRoot 和请求版本核对，快切引擎、切换项目或后发请求完成后，旧结果不得覆盖当前提示、字段或标题；开始新检查即撤下旧引擎缺项。复用已有 configLoadVersion，并将成功/失败保护一致应用于主工作区状态及抽屉。
5. 保存成功后按新一轮读取结果更新缺项状态。仍缺配置时继续显示缺项；保存失败或重读失败如实显示错误，保留现有输入保真要求。将“文件保存结果”“必填完整性”“profile 应用时点”分别准确表达，保存成功不能覆盖缺项/读取错误。保存响应同样校验原 runtime/projectRoot 和操作版本，防切出再切回后的旧保存结果污染当前状态；不改变现有会话重建与后台任务语义。

没有可选增强项；不新增发送禁用策略，不改引擎配置字段、后台任务、写入授权或密钥协议。现有会话开通失败仍按窗口实际结果展示。

必填项齐备仅表示配置字段完整，不声称凭据有效、服务在线或模型调用成功。方案准备与测试不写用户 `.env` 或改变正在运行的前一轮配置；正式设置保存仍仅沿已有客户操作路径调用窗口。窗口属主已只读确认现有 metadata 与 missingKeys 足够，本侧无需解析 openSession 错误（Claude 缺密钥可能延迟到 prompt 才失败）。

## 范围与必测

拟实施仅本角色白名单：`app/renderer/renderer.js`（选择守卫、配置读取与状态）、`index.html`（disabled 初态与内联状态/按钮）、`styles.css`（沿用中性简洁样式）、必要时 `runtime-ui.js`（纯展示文案）；自有 `test/桌面应用/runtime-ui.test.ts`、`renderer.test.ts`、`e2e/uiux-v2.mjs`，及本记录和 `docs/feature/runtime-choice.md`。窗口/Model/registry/主进程只读。PM 审核后仅在客户确认并授意实施时修改代码测试。

必测：未导入禁用且程序化调用不切引擎；导入失败维持禁用、导入/恢复成功启用；不选角色且抽屉关闭时三引擎缺项可见、按钮打开对应设置；完整配置不显示缺项；缺项仅来自返回 missingKeys 且不泄密；快切 Pi→Claude→Codex 的延迟成功/失败不串提示；切项目和切出再切回不接受旧响应；保存仍缺项、保存补齐、保存失败与成功后重读失败各自如实呈现；应用时点文案不冒充完整性。960/1360 两档无溢出，Tab/Enter 可操作，缺项条不进入消息、回放或角色 pane。

预定自有验证：`node --test test/桌面应用/renderer.test.ts test/桌面应用/runtime-ui.test.ts`，以及 `ANS_RUNTIME_UI_ONLY=1 node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs --user-data-dir=<独立临时目录>`（输出目录使用夹具现有 ANS_UIUX_OUTDIR 配置）。独立测试角色最终以真实主进程在隔离配置环境复测“导入前不可选择 → 导入后缺配 → 按钮打开 Claude 设置 → 保存后刷新”；不得改用户真实密钥或用离线结果声称在线验证。实际命令与结果实施后记录。


## 实施及当前证据

实际产品修改仅 `renderer.js`、`index.html`、`styles.css`；`runtime-ui.js` 未改。`applyListing` 在成功导入/恢复后触发配置读取，`updateControls` 与 HTML 初态控制 selector disabled，`selectRuntime` 保留无项目守卫。主条复用 `renderPiConfigWarning` 返回的 missing 摘要；新通道缺 missingKeys 或 runtime 不匹配视为读取失败，沿用旧 Pi 替身的既有展示兼容，不新增另一份必填判断。设置按钮用原 `openPiPanel` 并聚焦抽屉关闭键。保存版本在切引擎/成功导入时失效，读取沿 runtime/projectRoot/configLoadVersion 核对；保存成功重读后的缺项/读取失败不被成功文案覆盖。

测试修改仅 `renderer.test.ts`（既有 N-1 导入守卫允许赋值前记录 projectChanged，仍严格验证赋值后立即刷新按钮；前轮图片调用方断言保留）与 `e2e/uiux-v2.mjs`（配置专用模式及受控 IPC 输入）。单测 `node --test test/桌面应用/renderer.test.ts test/桌面应用/runtime-ui.test.ts` **50/50 pass**，exit 0；`npm run typecheck` exit 0（仅 npm 用户配置警告）；限定 `git diff --check` exit 0。

真实 Electron 44.7.0 / Node 24.21.0 使用离线 IPC，最终 `ANS_CONFIG_UI_ONLY=1 ANS_UIUX_OUTDIR=/private/tmp/ans-config-ui-r1 node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` **CONFIG_UI_PASS 20**、exit 0；涵盖初始禁选/程序化守卫、导入取消/失败与已有项目保留、空文件夹解锁、未选角色缺项、键盘按钮、双宽、旧引擎/项目/同引擎旧请求、不完整摘要、保存仍缺/失败/重读失败/补齐及旧保存响应。日志中的 fixture listing/config failed 是主动模拟异常场景，断言全部通过。原 `ANS_RUNTIME_UI_ONLY=1` 多引擎回归 **RUNTIME_UI_PASS 16**、exit 0，包含恢复项目、后台引擎隔离、真实 bridge 目标与机密输入保存纪律。

首轮环境沙箱中止 Electron（SIGABRT），允许桌面运行环境后完成验证；两轮初期配置夹具硬编码旧项目路径且未消费 preload 的 `{projectRoot}` 参数，导致“切换项目”断言失败，已按真实契约修正，最终当前候选全部通过。未删除或放宽对应行为断言。产品代码自首个 18 项通过后保持冻结；最后两项仅补同引擎请求顺序与缺失摘要测试。

[配置 20 项原始报告](2026-10-14-runtime-config-entry-evidence/config-report.json)、[既有 16 项回归](2026-10-14-runtime-config-entry-evidence/runtime-regression-report.json)、[单测原始输出](2026-10-14-runtime-config-entry-evidence/unit-tests.txt)、[候选 SHA-256](2026-10-14-runtime-config-entry-evidence/manifest.txt)、[960 宽截图](2026-10-14-runtime-config-entry-evidence/config-notice-960.png)、[1360 宽截图](2026-10-14-runtime-config-entry-evidence/config-notice-1360.png)。已查看 960 截图，缺项文字与按钮清楚且不溢出。此证据覆盖实际 renderer/preload 和受控摘要，不冒称真实主进程配置读取或在线模型成功；独立验证见[测试角色计划](../../../测试/docs/fix/2026-10-14_fix_runtime-config-entry-verification.md)。本次未写用户 .env、主进程/Model/registry 或前轮编排/窗口源码。
