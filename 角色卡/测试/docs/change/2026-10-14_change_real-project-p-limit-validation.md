---
id: real-project-p-limit-validation
type: change
title: p-limit 真实项目与在线 Pi 治理验证
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-14"
    kind: verified
    summary: 在线 Pi 完成真实项目读取、确认、角色落盘和自动 pin；记录终端退出限制
---

# 真实项目验证结果

本次用真实开源项目 p-limit 验证 ANS CLI 的在线治理流程。模型真实读取项目、提出角色边界、调用确认工具，测试操作者确认后写出治理文件并自动收尾。没有修改 ANS 产品代码，也没有改动 p-limit 已跟踪的文件。

验证对象为 https://github.com/sindresorhus/p-limit ，版本 `7.3.3`，提交 `a8a6fbec4e0e866d6d779b10889bb4f5567e70eb`。独立副本保留在 `/private/tmp/ans-real-p-limit-20261014`。ANS 提交为 `dd4b615c27215913c5089c5cb7b4618905416c42`，启动前工作区干净；环境为 macOS、Node v24.14.0。仅 Pi 已配置，本次未进行 Codex / Claude 在线验证。凭据未写入报告。

## 实际执行与结果

1. 下载：`git clone --depth 1 https://github.com/sindresorhus/p-limit.git /private/tmp/ans-real-p-limit-20261014`。沙箱首次 DNS 失败，允许联网后下载成功。
2. 真实入口：`node --env-file=.env bin/ans.js govern /private/tmp/ans-real-p-limit-20261014 --runtime pi --task '<下面记录的任务文本>' --role 维护 --role 测试`。任务文本为「真实项目测试：先读取p-limit的package.json、index.js、index.d.ts和test.js，说明实际职责和测试命令；为该现有项目提出最小角色边界方案，所有写入先预览请求确认，禁止修改现有源码。」沙箱首轮模型失败，联网重试成功。
3. 模型调用真实 `read_file` 读取上述四个文件，调用 `request_confirmation` 展示角色卡、边界 YAML 和 8 条具体写入路径。测试操作者在隔离副本输入 `y`，作为此次测试确认。
4. 8 次 `write_file` 全部获准：两个角色各自的 `role-card.md` / `boundary.yaml` / `memo.md`，以及 `docs/su/memo.md`、`docs/su/changelog.md`。
5. 自动收尾生成 `.ans/project.json`、`角色卡/governance-boundary.yaml` 和 `docs/bootstrap-manifest.md`。独立用 Node crypto 重算配置中 3 个 SHA-256，全部匹配；真实 `loadEffectiveConfig` 返回 `source.kind=ans`、`accepted=true`，`resolveRole("测试")` 返回 accepted 边界与 11 条条目。
6. 对新建测试角色使用真实 `resolveWrite` 判定：`index.js` 拒绝；`角色卡/测试/memo.md` 放行；`../outside.txt` 按 F7 拒绝。此项验证的是实际判定函数，未让在线模型尝试这些写入。
7. 在 p-limit 副本运行 `npm install --ignore-scripts --no-audit --no-fund`，然后 `npm test`：退出码 0，XO 一个上游 TODO 警告，AVA 30 项通过，tsd 通过。安装新增本地依赖/lockfile，未改动上游已跟踪文件，`git diff --exit-code` 通过。
8. ANS 既有回归命令：`node --test test/测试/t9-block1-bootstrap.test.ts test/测试/t9-block2-write-landing.test.ts test/测试/t9-block3-pin-shell.test.ts test/测试/t1-real-cli.test.ts`。47 项通过，0 失败、0 跳过。T1 使用既有外部引擎替身，不算三引擎在线模型证据。

## 真实使用暴露的问题与限制

- CLI 打印 `[settled] 会话结束` 后仍持续等待，后续两次轮询没有退出；在终端发送 EOF（Ctrl-D）后才以 0 退出。这是观察到的退出行为，尚未定位源码根因，不可把成功落盘等同于正常自动退出。
- 模型如实指出当前 CLI 工具没有 `dispatch_task`，没有派发任务、没有假称角色已开工。这与 README 的 CLI 已知差异一致，不能据此宣称完成了「治理→角色开发→回交」全流程。
- 模型生成了两个最小角色骨架，但卡片未包含当前技能要求的完整长期维护立场及组别信息；功能导航仅声明路径而未生成。本轮证明治理链路可运行，不代表生成的角色文档已通过完整技能合规验收。
- 桌面导入、队列、在线角色开发、自动回交、重启原生上下文恢复，以及 Codex / Claude 在线路径未验证。

此次结论仅支持：真实 p-limit 项目上的在线 Pi 读取、预览确认、受限治理写入和自动 pin 已运行成功，既有源码保持不变，上游基线通过。终端退出问题需要交编排/装配属主追查；本测试角色未修改产品代码。
