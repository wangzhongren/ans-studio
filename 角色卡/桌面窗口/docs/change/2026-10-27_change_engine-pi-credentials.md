# 变更记录：Claude/Codex 经 Pi 网关的引擎可用性与适配器接线（2026-10-27）——**已撤销**

- **最终状态**：**reverted**（客户 2026-10-27 纠正：Pi 只应作为**临时测试桥接**，不能把 Claude/Codex 自动复用 Pi 配置做成长期产品行为。本批桌面侧 Pi bridge 改动已**全部逆向撤销**；下文保留实现过程作为历史事实，不再代表现行行为。）
- **现行行为**：Claude/Codex 需各自配置（`ANTHROPIC_API_KEY` / `CODEX_API_KEY` 或 `OPENAI_API_KEY` + `ANS_CODEX_MODEL`）；Pi 配置**不会**自动使 Claude/Codex 可用，也不会改变设置摘要、菜单可用性或自动派发解析。适配器/探针/测试中的临时 Pi 用法保留（属测试能力，非产品自动回退）。

## 客户纠正与撤销明细（2026-10-27，最终结论）

- **删除**：`app/desktop/runtime-pi-bridge.ts`（本批新增的适配器 options 翻译层）。
- **逆向撤销**（逐段回退，非整文件 checkout；保留工作区其他角色/既有未提交改动）：
  - `app/desktop/runtime-config.ts`：`piGateway` 视图字段、缺失必填键由 Pi 承接的可用性逻辑、`PiGatewayNotice`/`PiGatewayEffectiveSettings`/`resolvePiGatewayEffectiveSettings` 及相关辅助解析全部移除，恢复原「各引擎按专属必填键判缺」实现（与改动前逐字一致）。
  - `app/desktop/interface.ts`：移除 Pi bridge import、`prepareRuntimeProfile` 内的 bridge 重算与诊断、会话工厂 options 合并包装；恢复原 `prepareRuntimeProfile`（仅在 pending profile 时应用 `.env`）。
  - `app/desktop/runtime-resolution.ts`：移除 Pi bridge 相关注释，恢复原说明。
  - `test/桌面应用/multi-runtime.test.ts`：恢复原 D1 断言（Claude 缺 `ANTHROPIC_API_KEY`=不可用、Codex 缺 `ANS_CODEX_MODEL`=不可用），删除新增 Pi 网关用例。
  - `test/桌面应用/runtime-resolution.test.ts`：恢复原用例「无 Claude key 时不选 Claude：活跃会话/磁盘证据指向 claude 也跳到有凭据的 Pi」及其断言。
- **保留**：各适配器既有的临时 Pi 兼容能力、探针与测试夹具（属测试/验证面）；未改 `src/provider/**`、运行时核心、Service/Pipeline、`runtime-settings.ts`（PM）、i18n、UI、门禁。
- **验证**：`node --test "test/桌面应用/*.test.ts"` 与 `npm run typecheck` 见文末「撤销后验证」；`rg` 确认 `app/desktop`/`test/桌面应用` 无 `piGateway|PiGateway|resolvePiGateway|runtime-pi-bridge|PI_GATEWAY|经 Pi 网关` 残留。

---

以下为撤销前的实现记录（历史事实，非现行行为）。

- **历史状态**：implemented-unverified（桌面单元/集成测试 + 全仓 `tsc --noEmit` 通过；真实窗口 + 真实模型端到端未跑；未 commit、未重启应用）
- **依据**：客户 2026-10-27 明确「其他引擎也要实现，并且 Claude/Codex 使用 Pi 的凭据/配置（重复利用现有 `.env` 的 `ANS_PI_BASE_URL` / `ANS_PI_MODEL` / `ANTHROPIC_AUTH_TOKEN`），Codex 走 Chat Completions 兼容」。适配器层已由对应角色完成并探针通过（Claude 真实 Pi 网关探针；Codex Chat Completions 最小传输 + 逐字段 Pi 回退）。本批只做**桌面窗口边界内的可用性判定与适配器 options 接线**。
- **范围**：`app/desktop/runtime-config.ts`（可用性/标记 + host-only 有效配置解析）、`app/desktop/runtime-pi-bridge.ts`（新增：options 翻译层）、`app/desktop/interface.ts`（会话工厂合并 + 开会话前重算）、`app/desktop/runtime-resolution.ts`（注释同步）、`test/桌面应用/multi-runtime.test.ts`、`test/桌面应用/runtime-resolution.test.ts`。**未改** `src/provider/**`、`src/service/**`、`src/pipeline/**`、运行时核心、`src/common/shared/runtime-settings.ts`（PM 属主）、`app/renderer/**`、i18n、门禁与治理账本；**未读写真实 `.env` 值**（测试全部使用假环境变量）。

## 以前怎样、现在怎样

**以前**：桌面设置/可用性只看引擎专属必填键——Claude 缺 `ANTHROPIC_API_KEY`、Codex 缺 `CODEX_API_KEY`（或 `OPENAI_API_KEY`）/`ANS_CODEX_MODEL` 即判不可用；`getRuntimeConfig().missingKeys` 非空，设置菜单摘要显示「缺配」，自动验收派发的引擎解析也会跳过它们。适配器虽已支持 Pi 复用（Claude `apiKeyEnvVar`；Codex chat 模式的逐字段 Pi 回退），但桌面运行配置从未把引擎接到这条路径。

**现在**：当**引擎专属必填配置缺失**且**Pi 三项必填配置完整**（`ANTHROPIC_AUTH_TOKEN` + `ANS_PI_BASE_URL` + `ANS_PI_MODEL`，键集仍单一来源＝共享注册表 `RUNTIME_SETTINGS.pi`）时：

1. **可用性**：`getRuntimeConfig(claude|codex)` 的 `missingKeys` 中被 Pi 承接的必填键移除（视图可视为「已配置」）；新增可选字段 `piGateway: { replacedKeys: string[], piKeys: string[] }`——**只含键名**，Pi token 的值绝不进入视图/日志/诊断。Pi 配置不完整、或引擎专属配置齐全时，行为与旧版逐字一致。
2. **Claude 适配器 options**（`src/provider/claude/session.ts` 已支持，无需 Provider 新契约）：
   - `apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN"`（适配器按名从环境读值，并把该值作为 SDK 子进程的 `ANTHROPIC_API_KEY`）；
   - `baseUrl: ANS_PI_BASE_URL`、`modelId: ANS_PI_MODEL`（显式 options 覆盖 `ANTHROPIC_BASE_URL` / `ANS_CLAUDE_MODEL`，保证 token 与端点/模型同属 Pi 配置，避免 Pi token 被发往别的端点）。
3. **Codex 适配器 options**：共享 `RuntimeSessionOptions`/`RuntimeProviderOptions` **没有** `wireApi` 字段（该字段属 Codex 适配器自己的 options），桌面经既有 `providerFactories.codex` 缝隙注入一个**懒加载** Provider 工厂，强制 `wireApi: "chat"` → 走已探针验证的 Chat Completions 传输；key/model/base 的逐字段回退由 `src/common/codex-adapter/config.ts` 既有实现承担（专属值优先，缺哪项补哪项）。**不写 `.env`、不改进程环境 `ANS_CODEX_WIRE_API`、不加载 Codex SDK/CLI 直到该引擎真正开会话。**
4. **接线时机**：`SessionManager.open()` 每次开会话前都会 `await prepareRuntimeProfile(runtime)`；桌面在此按当前 `.env`/环境重算 bridge options 并缓存，同步的会话工厂包装层再把它们合并进该引擎的构造 options。**显式注入的 options 优先**（bridge 只补缺，`extraCredentialEnvVars` 取并集，`providerFactories` 显式项优先）。解析失败只记诊断（runtime + 错误名，无任何配置值），引擎按既有缺配如实报错。
5. **可用性消费者自动跟随**：`runtime-resolution.ts::runtimeCredentialsAvailable` 复用 `missingKeys`，故自动验收派发/冷启动补齐的引擎解析会把「经 Pi 网关」的 Claude/Codex 视为有凭据；解析优先级不变（活跃会话 → 已选/持久化 → `.ans/sessions` 证据 → 凭据顺序 pi→codex→claude）。

## 行为与纪律

| 项 | 契约 |
| --- | --- |
| 触发条件 | 引擎专属必填键缺失 **且** Pi 三项必填键完整；否则逐字沿用旧行为 |
| Claude options | `apiKeyEnvVar=ANTHROPIC_AUTH_TOKEN`、`baseUrl=ANS_PI_BASE_URL`、`modelId=ANS_PI_MODEL` |
| Codex 传输 | `providerFactories.codex` → `createCodexRuntimeAdapter({...options, wireApi:"chat"})`（懒加载） |
| 凭据纪律 | 视图/标记/日志只含**键名**；token 值仅由适配器按名从环境读取；不写 `.env`、不改进程全局 env |
| 显式优先 | 宿主/测试注入的 `runtimeOptions` 字段优先于 bridge 推导值 |
| 失效回退 | 专属配置补齐或 Pi 不完整 ⇒ 下次开会话不再合并 bridge options；失败只诊断、不改会话开放语义 |
| 边界 | 只改 `app/desktop/**` 与两个已列桌面测试文件；未触 Provider/Service/Pipeline/运行时核心/渲染器 |

## 兼容性影响（既有测试口径的必要更新）

- `test/桌面应用/multi-runtime.test.ts` D1 共享注册表用例：Pi 完整环境下 Claude/Codex 的 `missingKeys` 由 `["ANTHROPIC_API_KEY"]` / `["ANS_CODEX_MODEL"]` 变为 `[]`（并断言 `piGateway` 键名与 token 不外泄）——这是本批**有意**的可用性变化。
- `test/桌面应用/runtime-resolution.test.ts`：原「无 Claude key 时不选 Claude（跳到 Pi）」改为「Pi 完整 ⇒ Claude 经 Pi 可用，活跃会话指向 claude 时仍选 claude；Pi 不完整时才如实跳过」；新增 Pi 不完整场景的跳过断言。

## 明确不做 / 跨角色缺口

1. **渲染层展示（属「桌面UI」）**：设置面板/引擎菜单的「经 Pi 网关」说明或徽标尚未实现。主进程已在 `RuntimeConfigView` 提供 `piGateway`（键名/布尔），但渲染侧 `validateRuntimeConfigView` 目前只拷贝既有字段、会丢弃它；且 Claude/Codex 的专属必填字段仍显示「未设置」而整体摘要显示「已配置」——需要桌面UI消费 `piGateway` 做说明，不要在主进程伪造字段值。
2. **共享契约的 `wireApi`（属 PM/编排/Service）**：若希望 Codex chat 成为共享 `RuntimeSessionOptions` 的一等字段（而非桌面经 `providerFactories` 注入），需跨角色在 `src/model/runtime.ts`/Service `providerOptions` 增加透传；本批未越界。
3. **注册表元数据（属 PM）**：`runtime-settings.ts` 仍只描述各引擎专属必填键；若设置面板要按字段展示「由 Pi 回退提供」的 `fallbackKey` 语义，需要 PM 决定是否在注册表层面表达该关系（当前降级由桌面可用性层承接，不复制 Pi 键集）。
4. **真实端到端**：未重启应用、未用真实 Pi 网关跑 Claude/Codex 窗口会话；未跑真实窗口验收。适配器层探针结果沿用对应角色既有证据。
5. **Pi 配置延后应用窗口（已知小缺口，未在本批改动）**：Pi 设置保存时若仍有 Pi 会话在跑，既有规则把 `.env → process.env` 的应用点延后到下次 Pi 开会话。若客户在这个窗口期立刻打开 Claude/Codex：base/model 由本批直接从 `.env` 读取（新值），而 token 值仍由适配器按名读 `process.env`（旧值），可能出现新旧混用；Pi 会话结束后下次开 Claude/Codex 会话即一致。未为了该边缘场景提前改动全局环境（会破坏既有 profile 应用点语义）。
6. **密钥保护边界**：视图与诊断只报键名；`getRuntimeConfig` 对机密值恒返回空串的既有纪律不变；Codex Chat 传输的请求体由适配器构造，桌面不接触。

## 验证

- `npm run typecheck`：通过（exit 0，两次：实现后与测试修改后）。
- `node --test "test/桌面应用/*.test.ts"`：**702/702 通过**（含本批新增/更新的用例）。
- 定向：
  - `node --test "test/桌面应用/multi-runtime.test.ts"`：40/40（新增 Pi 网关用例：可用性标记、Claude options、Codex chat 工厂、interface 开会话接线、显式 options 优先、专属补齐后失效）。
  - `node --test "test/桌面应用/runtime-resolution.test.ts"`：13/13（更新后的 Claude 经 Pi 解析语义）。
  - `node --test "test/桌面应用/pi-config.test.ts"`：17/17（设置读写/掩码回归）。
  - `node --test "test/codex-adapter/chat-transport.test.ts"`：9/9（Codex chat 传输与 Pi 逐字段回退契约）。
  - `node --test "test/claude-adapter/session.test.ts"`：54/55；唯一失败为 Windows 夹具 `EPERM: symlink`（`native symlink and storage runtime mismatch` 用例，属环境权限限制，与本批改动无关）。
- 未读取/打印任何真实 `.env` 值或密钥；全部测试使用假环境变量（哨兵 token 仅用于断言「不出现在视图/回执」）。
- 未 commit / 未 push / 未重启应用。

## 撤销后验证（现行状态，2026-10-27）

- `node --test "test/桌面应用/*.test.ts"`：**701/701 通过**（撤销新增 Pi 网关用例后恢复基线数量；0 失败）。
- `npm run typecheck`：通过（exit 0）。
- 残留检查：`rg -n "piGateway|PiGateway|resolvePiGateway|runtime-pi-bridge|PI_GATEWAY|经 Pi 网关" app/desktop test/桌面应用` → **无匹配**；`git diff` 确认 `app/desktop/runtime-config.ts`、`app/desktop/runtime-resolution.ts`、`test/桌面应用/multi-runtime.test.ts`、`test/桌面应用/runtime-resolution.test.ts` 相对 HEAD 零差异（其他角色既有未提交改动未触碰）。
- 未读取/打印任何真实 `.env` 值或密钥；未 commit / 未 push / 未重启应用。
