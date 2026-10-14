---
id: runtime-config-entry-review
type: fix
title: 导入后引擎选择与缺配置入口方案审核
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
revision: 1
related: [runtime-missing-config-entry, runtime-config-entry-independent-verification]
events:
  - date: "2026-10-14"
    kind: designed
    summary: 审核现有配置摘要复用与未导入项目选择前提，推荐最小 renderer 修复
  - date: "2026-10-14"
    kind: verified
    summary: 当前候选哈希一致，属主行为测试与独立原生桌面复测通过，配置未变化
---

# 导入文件夹后才能选引擎，缺配置时直接进入设置

审核对象为[桌面UI方案 revision 1](../../../桌面UI/docs/fix/2026-10-14_fix_runtime-missing-config-entry.md)，验证范围见[测试角色方案](../../../测试/docs/fix/2026-10-14_fix_runtime-config-entry-verification.md)。用户已明确确认本次 revision 1 并授意相关角色实施与桌面测试。桌面UI在原固定角色上下文实施，测试角色独立复测，项目管理只读核对当前候选并更新本记录；实现与最终验证证据待交付。

测试角色真实桌面复现未导入仍可选 Claude，主界面没有缺项提示，右上设置抽屉才显示缺 ANTHROPIC_API_KEY。项目管理独立读源码确认 `selectRuntime` 无项目前置守卫，切引擎仅在设置抽屉打开时读配置，缺项文案只在抽屉中呈现。这与最新用户要求不符。

## 推荐与跨角色判断

结论 **recommend approval**：用 renderer 的已导入 projectRoot 控制下拉框及函数入口，在导入成功、恢复成功和切换引擎后，读取既有 `getRuntimeConfig(runtime)`，在工作区聊天头下、聊天历史外显示缺项与打开当前引擎设置的按钮。不依赖角色存在，成功导入空文件夹也能选引擎。无项目时导入取消/失败不解锁；已有项目的切换取消/失败保留原项目及可选状态。

主进程 `runtime-config.ts` 已依据共享 registry 和实际来源产生 `missingKeys`。窗口固定角色独立确认该摘要覆盖 Pi、Codex 的凭据 fallback 及 Claude 的必填/可选字段；secret value 恒空，URL 凭据净化，查询仅只读配置与环境，不写 .env。现有 preload → runtime-config:get → DesktopInterface 路径足够，无窗口、Model、registry 或 IPC 变更必要。UI 只消费 missingKeys 名称，不复制必填规则、不读取或显示凭据。

缺配时按钮复用现有设置抽屉；齐备仅表示返回摘要未列必填缺项，不宣称网络或模型可用。读取失败或不完整返回如实显示读取失败及设置入口，不当作齐备。runtime/projectRoot/请求版本隔离迟到结果，不能串当前提示与抽屉字段。保存后的同源重读必须保持缺项或读取错误，不能被无条件成功状态覆盖；文件保存结果、完整性和 profile 应用时点分别表达，这是已有状态显示失真的必要修复。

相比新增窗口预检或复制 Claude 专用判定，现有摘要能完成目标，保持单一真相源与现有受限通道，改动和维护成本更小。引擎选择只在导入后发生，右上设置入口保留原能力；不新增发送限制或后台任务政策，无可选增强项。

## 精确批准范围与回归

生产仅桌面UI白名单内的 `app/renderer/renderer.js`、`app/renderer/index.html`、`app/renderer/styles.css`；若展示纯函数确有必要，可用同角色既有 `app/renderer/runtime-ui.js`。测试仅 `test/桌面应用/runtime-ui.test.ts`、`test/桌面应用/renderer.test.ts`、`test/桌面应用/e2e/uiux-v2.mjs`，同步本角色修复记录与 `docs/feature/runtime-choice.md`。测试角色在自身文档范围记录独立真实桌面结果；项目管理只维护本审核。不得改 .env、真实凭据、主进程配置规则或前轮聊天回交成果。

必需验证覆盖：初始禁用和函数入口守卫、导入取消/失败、空文件夹及恢复成功、抽屉关闭且未选角色时的三引擎摘要、按钮直达对应设置、完整/读取失败状态、快切引擎/项目的迟到响应、保存仍缺/补齐/失败/重读失败，保留图片、队列、回交和后台引擎隔离。UI 行为测试用真实 renderer 加受控配置摘要，不靠静态字符串断言替代；检查两档宽度及键盘入口。独立真实 Electron 用隔离配置环境复测，不能修改用户真实密钥或用离线场景冒充在线配置结果。

审批简报：桌面UI revision 1 及本审核 revision 1 的上述最小 renderer 修复、必要属主测试和真实桌面复测已获客户明确确认实施。成功后未导入不能切引擎，导入后缺配置能看见提示并一键打开对应设置；不需要新增角色、权限或配置判定。当前没有未解决的架构分歧；实现与验证结果尚待当前候选证据。

## 当前实现对照

已只读检查三个 renderer 生产文件：初始 disabled 与 selectRuntime 无项目守卫、导入/恢复后的配置查询、不依抽屉的引擎切换查询、聊天历史外提示及现有抽屉入口、runtime/project/请求版本防迟到、保存成功后按新摘要保留缺项或读取失败，符合 revision 1。没有新增发送禁用、窗口或 .env 修改，也未改变前轮 handback 源码。

早期主条重复了一段 Pi 必填过滤，项目管理指出后属主已删除，改为复用既有 renderPiConfigWarning 的 missing 结果，实际 IPC 仍优先主进程 missingKeys；没有新增独立配置真相源。已有导入按钮测试仅允许赋值前计算 projectChanged，仍严格断言赋值后更新按钮，不弱化导入行为。UI 回报单测 50/50，真实 renderer 行为与测试角色真实桌面证据尚待最终交付，当前不标 verified。

## 最终当前候选验收

已核对[测试角色最终记录](../../../测试/docs/fix/2026-10-14_fix_runtime-config-entry-verification.md)、实施前后 SHA、全仓原始输出与[属主配置行为报告](../../../桌面UI/docs/fix/2026-10-14-runtime-config-entry-evidence/config-report.json)。当前三个生产文件哈希与两方候选清单一致：renderer.js `18a6906829b58b52ec22eb5b1fdf980123bb87bd105ef79196d0a55dc3de88f9`，index.html `a75bf1e8433d7fdb100b9a6122f49f559c4adb0fbd93edf77d70d500c8ad0b39`，styles.css `ce50fd057fdcaf59b094d950c2ab858eed10e553ce85c7b1a50b5bce50792fd0`。本次实际未修改 runtime-ui.js；现有样式与提示入口在批准范围内。

属主单测 50/50、真实 Electron renderer 配置夹具 20/20 与既有运行时回归 16 项通过。原始配置报告覆盖初始函数守卫、取消/失败、空文件夹启用、对应设置键盘入口、960/1360 布局、迟到响应及保存缺项/失败/补齐/重读失败。全仓允许既有本地回环的重测为 1238 项、1237 pass、0 fail、1 既有 Windows skip；测试角色记录最终 typecheck 通过，项目管理另查当前 diff --check 通过。

独立原生桌面实际证明：初始 disabled 点击不展开，系统目录选择器取消后仍禁用，导入 p-limit 后启用，选择 Claude 在关闭抽屉的主界面直接显示缺 ANTHROPIC_API_KEY 与打开设置按钮，按钮直达 Claude 配置，安全输入空值且未设置，布局正常。实施前后 .env SHA 相同，测试角色未输入、显示或保存密钥，目标跟踪文件未变。保存与竞态是受控配置响应下的真实 renderer 测试，不能冒充真实凭据写入；必填摘要齐备不证明密钥有效、服务可连通。本轮未对 Claude 发在线模型请求。

最终结论：**当前候选 verified**，用户要求的导入前不可选引擎、导入后缺配提醒及设置入口与真实桌面复测已闭合。没有新增发送禁用、窗口/配置规则修改或吸收前轮无关成果，未提交或发布。
