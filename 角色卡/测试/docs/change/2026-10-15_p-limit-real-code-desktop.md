# p-limit 真实代码修改与桌面流程验证

日期：2026-10-14 至 2026-10-15。生产者：固定测试角色 root。状态：真实修改、红绿测试、独立验证和回交完成；未向 p-limit 上游提交。

在 ANS 桌面导入真实 p-limit 7.3.3 本地副本后，主入口先交项目管理审查，再派维护修改、测试独立复核。基础提交为 `a8a6fbec4e0e866d6d779b10889bb4f5567e70eb`。原副本是 `/private/tmp/ans-real-p-limit-20261014`，后续不含旧会话的新副本是 `/private/tmp/ans-real-p-limit-20261015-duplicate-retest`。

这次修复 `pLimit(null)` 提前在对象解构处抛错、错误文本不一致的问题。[index.js](/private/tmp/ans-real-p-limit-20261014/index.js:6) 增加 `concurrency !== null`，让 null 进入既有参数校验；[test.js](/private/tmp/ans-real-p-limit-20261014/test.js:497) 新增一条同时检查 TypeError 类型与精确错误消息的 AVA 用例。实际源码差异仅两个文件，9 行新增、1 行删除，未改类型声明或包配置。详见 [patch](2026-10-14-p-limit-real-code-evidence/patch.diff)。

## 实际结果

| 阶段 | 实际操作及证据 | 结果 |
| --- | --- | --- |
| 方案与授权 | 桌面预览具体 index.js/test.js 临时范围，由测试操作者在本地隔离验证中确认 | 仅这两条源码授权 |
| 维护红阶段 | 新增断言后精确运行 npm test | 退出 1，新增消息断言失败，原 30 项通过 |
| 维护绿阶段 | 最小修复后精确运行 npm test | 退出 0，31 项通过 |
| 测试独立验证 | 独立读取 diff、源码并精确运行 npm test | 退出 0，31 项通过 |
| root 红阶段复现 | 原始 index.js + 新 test.js 的独立夹具执行 AVA | 退出 1，只有目标断言失败 |
| 正式回交 | 主入口收到项目管理、维护、测试报告 | 三条实际输入各一次 |
| 修复后新会话复测 | 桌面一次 dispatch_task；测试实际执行两次 node -v、分次 git、npm test、写报告、submit_report；主入口核对 | 31 项通过、退出 0，派发/回交各一条，重载历史仍各一条 |

环境为 Node v24.14.0、npm 11.9.0。XO 既有 TODO warning 一条，未增加；精确 npm test 包含 `xo && ava && tsd`，整体退出 0。维护曾把 `git status && git diff --stat` 交给单程序工具，实际退出 129；拆成两个调用后成功。运行时核心已明确工具不支持 shell 操作符的说明，未改变执行权限或启用 shell。

临时源码授权已经通过桌面确认撤销。最后重新走真实 resolveRole/resolveWrite：两副本 index.js/test.js 均拒写，维护自己的 memo 仍可写，四个边界 pin 全部匹配。[最终门禁记录](2026-10-14-p-limit-real-code-evidence/final-gates.json)。

## 证据与限制

[维护工具原始结果](2026-10-14-p-limit-real-code-evidence/maintenance-tool-results.json)、[独立验证结果](2026-10-14-p-limit-real-code-evidence/independent-tool-results.json)、[root 红阶段复现](2026-10-14-p-limit-real-code-evidence/independent-red-replay.txt)、[三份报告输入](2026-10-14-p-limit-real-code-evidence/su-received-reports.json)、[最新派发原生与重放证据](../fix/2026-10-15-duplicate-event-evidence/fresh3-native-replay.json)。

原长 su 会话在后续重复显示复测期间触发上下文压缩，并在 120 秒超时中止；这一轮未计为成功。保留原历史与修改，使用不含会话历史的新副本完成剩余派发/回交复测，未放宽超时或门禁。源码实际修改在原副本完成，新副本复测的是相同哈希候选。未测试 Node 20 或 Claude/Codex 在线执行。

相关功能：[运行时核心](../../../运行时核心/docs/feature/runtime-core.md)、[桌面会话引擎](../../../桌面UI/docs/feature/runtime-choice.md)。
