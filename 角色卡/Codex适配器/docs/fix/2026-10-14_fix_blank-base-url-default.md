---
id: codex-blank-base-url-default-fix
type: fix
title: Codex API 地址留空时使用官方默认值
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [codex-governed-session, codex-governed-session-implementation]
events:
  - date: "2026-10-14"
    kind: created
    summary: 记录可选 API 地址留空却报无效 URL 的实际设置回归
  - date: "2026-10-14"
    kind: verified
    summary: 空白地址与环境快照回归完成，自有 16 项及全仓类型检查通过
---

# Codex API 地址留空时使用官方默认值

设置面板把 API 地址作为可选项，提示留空使用 OpenAI API；但 `.env` 的 `ANS_CODEX_BASE_URL=` 或空白值会被当前解析器当成 URL，启动角色时报“invalid API base URL”。问题在 `src/common/codex-adapter/config.ts::settings`：空值合并只处理 undefined，没有处理用户留空的字符串。

本修复沿用项目管理授权的 X1S 同范围任务。现在先按 `options.baseUrl` 优先于 `ANS_CODEX_BASE_URL` 选择值，再 trim；选中值为空就使用 `https://api.openai.com/v1`。显式空值同样表示官方默认，不再继续读取环境地址；显式非空值继续优先。模型、key 必需，HTTP(S)/无 userinfo 检查和凭据脱敏保持原约定。

设置在 bindRole 进入时同步读取，模型、key、base URL 与用于错误脱敏的秘密值在同一次 settings 调用中捕获；后续运输使用这个结果，未发现 base/model/key 在异步阶段重新取值的分叉。本次不新增认证模式或环境变化行为。

写集只包含本角色 config、原有测试/API/功能资料与本修复记录，没有改 package/shared/其他角色或真实 `.env`。实际工厂和 fake RPC 已验证环境空/空白、显式空/空白、显式非空覆盖环境、环境非空及错误不泄密；还验证异步运输开始后修改注入环境不会混淆已捕获的 model/base/key 或旧 key 的脱敏。运输没有变化，已由装配验证的稳定 CLI 探针没有重复运行，原证据保持在[装配记录](../../../装配/docs/change/2026-10-14_change_multi-runtime-assembly.md)。

`node --test 'test/codex-adapter/**/*.test.ts'`：**16 passed / 0 failed / 0 skipped**，exit 0，直接使用已安装 MCP `1.32.1`，没有临时 harness。`npm run typecheck`：exit 0。环境为 Node `v24.14.0`、macOS arm64、TypeScript `7.0.2`；测试仅假 key、fake RPC 与临时目录，没有模型/网络/认证请求。本次源码只改一条可选地址解析表达式；原 14 项与 alpha/stable 探针证据仍保留在各自原记录，没有重写成这次结果。

候选源码/测试组合 SHA-256 为 `a1c40099de0496efa8452aacf3f944fc462bdb90ac3c185421b88161bc642ede`（按原实施记录同一排序和 NUL 规则）；本次 `config.ts` 为 `77dc8267225f24db27e42147dfc3e1a8c2cfe8e3884ac7c40f90135767eb192f`，`session.test.ts` 为 `540f90aa9015f47f5a9926d0decd4d52154c1627980a644db7843e75ee18266f`。其他运输源码没有变化。功能导航见[Codex 受治理会话](../feature/codex-governed-session.md)。
