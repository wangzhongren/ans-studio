# 项目管理共享组件实现报告

本角色只维护 `src/common/shared/`；业务实现由各属主交付。现行复用目录见 [共享组件目录](docs/architecture/shared-components.md)。

## D3 轻量修复：原子写普通权限位

依据已获客户实施确认的 [D3](docs/design/2026-10-21_design_permission-boundary-repairs.md)。`AtomicWriteOptions.finalMode?: number` 已实现：只接受 0–0777 整数，非法值在创建临时文件前抛错。POSIX 在临时文件写完后用句柄 chmod 准确应用权限，再 fsync、关闭并 rename；中止或 chmod/fsync 失败不提交。Windows 不调用该 POSIX 权限操作；缺省 finalMode 的其他消费者行为保持。

运行时核心负责对已有普通文件读取 `mode & 0777` 并选择传入；共享原语不自行读取目标权限、不做角色判断，不复制特殊位、owner、ACL 或 xattr。原 `mode` 仍决定临时文件创建权限并受 umask 影响，`finalMode` 是显式的提交前权限。

2026-10-21 本机 Node v24.14.0 / Darwin arm64：atomic-write 与 env-file 合计 **53/53**，其中新增 6 项覆盖非法输入零副作用、真实 mode、严格 umask 子进程、chmod/fsync 失败及 chmod 后中止；初次类型检查通过。实际核心接入、合并候选与 Windows 原生验证分别记录，不以共享单测代替。详见 [实施记录](docs/fix/2026-10-21_fix_d3-lightweight-permission-repairs.md)。

## ANS-RUNTIME-V2 revision 1

依据 [已批准的多运行时对接设计](docs/design/2026-10-14_design_multi-runtime-integration.md)。

- `runtime-shared.ts` 的 `RUNTIME_KINDS` 已扩为 `demo/pi/codex/claude`；`RuntimeKind` 从此数组派生，`DEFAULT_RUNTIME` 保持 `demo`。
- 新增 `RUNTIME_LABELS`，为每个 runtime 提供同一显示名称；该表不推断 SDK 是否安装或认证是否可用。
- `runtime-settings.ts` 提供 `RUNTIME_SETTINGS`、`getRuntimeSettingsDefinition(runtime)`、`RuntimeSettingField` 与 `RuntimeSettingsDefinition`。每引擎的字段 `key/label/required/secret/fallbackKeys?/choices?/help?` 是设置视图单一元数据，不含值或登录状态。`choices?`（2026-10-16 G-5 增，客户批准）：有、非空则该字段值域即选项、应以致选择控件呈现，缺省/空＝自由文本——描述设置、不描述控件实现。Pi 必填 token/baseURL/model；Codex key/model 必填，key 支持明确的 OPENAI_API_KEY fallback；Claude API key 必填、model/baseURL 可留空用 SDK 默认。`demo` 没有生产凭据面板。G-5 推理强度三字段（label 逐字「推理强度」、可选、非机密）：pi `ANS_PI_REASONING_EFFORT`（off/low/medium/high/xhigh）、codex `ANS_CODEX_REASONING_EFFORT`（**无 off**——平台无该档，如实不假装）、claude `ANS_CLAUDE_REASONING_EFFORT`（off/low/medium/high/xhigh）；help 三平台逐字统一（留空＝维持平台默认；档位梯 关/低/中/高/极高；思考计入输出 tokens）。2026-10-14，`runtime-settings.test.ts` 2/2：所有秘密键/alias 被同一掩码名单覆盖，required/default 与属主实际选项一致；2026-10-16（G-5）**6/6**（+4：三字段逐键/label 逐字/可选非机密；choices 值域[Codex 无 off 反向守卫]；help 逐字统一；choices 纪律）；本组 114/114、全量 2002/2001/0红/1skip（基线 1998/1997/0/1）、typecheck 0。详见 [变更记录](docs/change/2026-10-16_change_reasoning-effort-metadata.md)。
- 原 `PI_CREDENTIAL_ENV_VARS` 与 `resolveSkillRoot` 行为不变。新增 `RUNTIME_CREDENTIAL_ENV_VARS` 为 Pi 旧名单加 `CODEX_API_KEY`（Codex 属主官方文档及 `@openai/codex-sdk@0.162.1` 实际 types 证据）、`CODEX_ACCESS_TOKEN`（[Codex 官方环境变量](https://developers.openai.com/codex/environment-variables) 的 CLI/app-server automation 秘密）和 `CLAUDE_CODE_OAUTH_TOKEN`（[Claude 官方 authentication](https://code.claude.com/docs/en/authentication) 的既有环境秘密）；公共 shell 剥离使用新名单。额外 token 只作为秘密保护目录，不表示产品支持账户登录或新增 API-key fallback；Claude 产品接入使用 API key，依据 [Agent SDK 官方 overview](https://code.claude.com/docs/en/agent-sdk/overview)。
- `env-file.ts::RUNTIME_CONFIG_SECRET_KEYS` 只读引用所有 runtime 秘密键，`isSecretKey` 改用该集合，所有 API key 都掩码；旧 `PI_CONFIG_SECRET_KEYS` 继续保留原 API。2026-10-14，Node `v24.14.0`，`node --test test/项目管理/shared/env-file.test.ts` 31 pass / 0 fail，使用临时假 env，真实 `.env` 没有触碰。
- 停止契约必要迁移：`AtomicWriteOptions.signal?: AbortSignal` 与 `renameReplacingExisting(from,to,signal?)` 在 temp open/write/fsync 与每次 rename 前检查中止，失败清理 temp，旧调用兼容。2026-10-14，`node --test test/项目管理/shared/atomic-write.test.ts` 16 pass / 0 fail，覆盖 fsync 完成时实际 signal 中止后旧目标保留及 temp 清理；操作系统已完成的 rename 不声称可回滚。核心调用者需转发 signal 后重新验证。
- 2026-10-14，Node `v24.14.0` 跑 `node --test test/项目管理/shared/runtime-shared.test.ts`：5 pass / 1 fail。失败准确定位为编排 `src/common/编排/args.ts` 仍维护 `demo/pi` 第二枚举；已交编排 O1 迁移。此共享候选尚未通过消费方验收，不写已完成。

O1 迁移后共享全目录首次回归109项中108通过，runtime枚举一致性已通过；唯一旧失败为Mac临时根 `/var` 的词法测试预期未解析 `/private/var`。本角色用独立OS realpath修正自己的精确测试预期，target21/21通过，详见[原修复与验证](docs/fix/2026-10-14_fix_realpath-fixture-canonical-root.md)。生产路径模块没有变化；最终全目录/全仓组合仍待独立验证。

2026-10-14 当前共享全目录再次执行 `node --test 'test/项目管理/shared/**/*.test.ts'`，**109/109，0失败/0跳过**。包括新 runtime 枚举/设置秘密目录、原子写停止与全部旧共享行为；Pi/O1真实消费迁移后的现有等价性检查通过。全项目与桌面最终候选仍需独立 T1 验证。

实际源码主属和权限不由本报告扩张。最终验证将使用合并候选重新记录。
