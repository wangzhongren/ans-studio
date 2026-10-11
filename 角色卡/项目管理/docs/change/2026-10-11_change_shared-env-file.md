# 项目管理 变更记录

## 2026-10-11 — 建共享 `.env` 读写模块 `env-file`（T26，设计 §11）

**来源**：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` **§11**（桌面 Pi 配置界面 → 保存 `.env`，客户 2026-10-11）与派发清单 **T26**（pm 建 shared；被 **T28/T29** 依赖）。背景：客户要求 Pi 配置在**页面**里设置并**保存到 `.env`**；而**桌面 pi 路径今天不可达**——`package.json` 的 `"app": "electron app/main.ts"` **无 `--env-file`**，Electron 进程 `process.env` 无 `ANS_PI_*`/token，且桌面**无通道**把配置交给适配器。⇒ 本模块是让桌面 pi 可用的**前提**。

**归属（设计 §11.2，G-2 已记档）**：`.env`（仓库根，装配 Section 1 已列、`.gitignore` 忽略）**仍归装配**，归属**不变**；本模块是它的**指定写入者**（与 `docs/scheduling/` 同形：目录归 pm、内容由指定写入者写）。写入逻辑落 `src/common/shared/`（pm 边界），故**无需 Section 1 授权**，但该指定写入者安排须经 **Governance 记档（G-2）**。

**做了什么**
- 新增 `src/common/shared/env-file.ts`（**全仓唯一**的 `.env` 读写实现）。导出：`parseEnvFile` / `mergeEnvText` / `atomicWriteText` / `readEnvFile` / `saveEnvFile` / `loadEnvFileInto` / `parseEnvValue` / `renderEnvValue` / `PI_CONFIG_SECRET_KEYS` / `isSecretKey`；类型 `EnvMap` / `EnvTarget` / `LoadEnvResult`。**设计 §11/T26 所称 `parse`/`merge`/`atomicWrite`/`loadEnvFileInto` 即对应本模块的 `parseEnvFile`/`mergeEnvText`/`atomicWriteText`/`loadEnvFileInto`**（同义名，已在模块抬头注明，供 T28 对接）。
- 登记 `docs/architecture/shared-components.md` 新增**组件 5（env-file）** + 本文件变更段。
- 更新工程法案 `docs/project-rules.md` §一.5：共享组件清单补为现行**五个**；补记 env-file 消费方动作（桌面 **T28/T29**）。
- 新增测试 `test/项目管理/shared/env-file.test.ts`（**30 例**）。

**写入纪律的实现（设计 §11.4，客户红线，逐条）**
1. **只改相关键**：`mergeEnvText(original, updates)` **逐行**解析——`classifyLine` 把每行判为「赋值行」或「其它」；命中更新键的赋值行**只替换其值 token**（**保留**键、`=` 与两侧空白、`export ` 前缀、原引号风格、**内联注释**）；**未命中**的行（注释、空行、未知键、其它已有键）与其**顺序**均**逐字节不变**；更新中未出现的键**追加**到末尾（对齐原行尾符）。**绝不重写整份**——未命中行是原文本子串的直接拼接，无任何规范化。更新为空**恒等返回原文**。
   - **逐字节保留的保证**：实现按「逻辑行 = body + 行尾符」切分，未命中行直接 `body+ending` 回拼（不 trim、不改行尾符、不折叠空白）；CRLF 原样保留（有测试钉死）。
2. **credential 不回显**：`loadEnvFileInto` **只回报键名**（`LoadEnvResult.applied: string[]`，无值）；所有错误经 `envError(action, path, err, secrets)` 构造，**只含动作/路径/错误码**，并把传入的更新值（`Object.values(updates)`）经 `redactSecrets` 兜底替换——**即便底层错误文本意外带值也不泄漏**。`PI_CONFIG_SECRET_KEYS=["ANTHROPIC_AUTH_TOKEN"]` + `isSecretKey` 供界面掩码（单一来源）。
3. **原子写**：`atomicWriteText` 在**同目录**创建临时文件（`.{name}.tmp-{pid}-{ts}-{rand}`）→ 写 → `fsync` → `rename` 覆盖目标。同目录规避跨设备 `EXDEV`；`rename` 覆盖是原子的；**失败即清理 temp 并抛错，目标文件在 `rename` 成功前不被触碰**（半写不可能）。有「无残留」测试钉死。
4. **失败显式**：`readEnvFile` 任何读取失败**抛错**；`saveEnvFile` 读取（非 ENOENT）或写入失败**抛错**，不静默。`loadEnvFileInto` 仅把**文件不存在**（ENOENT）视为「无 `.env`」无操作，其余读取失败**抛错**。
5. **单一来源**：本模块是**全仓唯一**的 `.env` 读写实现；全仓检索无任何既有 `.env` 解析/写入代码（此前只有 `bin/ans.js`/各处 `process.env` **读取**，无文件读写），故**不存在第二份**。

**接口（供 T28 对接）**
- `parseEnvFile(text: string): EnvMap` —— `.env` 文本 → 键值对（宽松、绝不抛错；重复后者胜）。
- `mergeEnvText(original: string, updates: EnvMap): string` —— **只改相关键**地合并（纯函数；不落盘）。
- `atomicWriteText(filePath: string, text: string): Promise<void>` —— 同目录 temp + `fsync` + `rename`。
- `readEnvFile(envPath: string): Promise<EnvMap>` —— 读并解析（失败抛错）。
- `saveEnvFile(envPath: string, updates: EnvMap): Promise<void>` —— **组合**：读（缺则新建）→ `mergeEnvText` → `atomicWriteText`。
- `loadEnvFileInto(env: EnvTarget, envPath?: string): Promise<LoadEnvResult>` —— 读 `.env` 应用到给定 env（缺省路径 `.env`）；**同名键以 `.env` 覆盖**（保存后重载即生效，§11.3）；文件不存在无操作；回报只含键名。
- `PI_CONFIG_SECRET_KEYS: readonly string[]` / `isSecretKey(key: string): boolean` —— 机密键名单（供界面掩码）。
- 类型：`EnvMap = Record<string, string>`、`EnvTarget = Record<string, string | undefined>`、`LoadEnvResult = { path, applied: string[] }`。

**T28 对接要点**：启动时 `await loadEnvFileInto(process.env, <仓库根 .env 绝对路径>)`（补 `--env-file`）；保存 Pi 配置时 `await saveEnvFile(<同一路径>, { ANTHROPIC_AUTH_TOKEN, ANS_PI_BASE_URL, ANS_PI_MODEL, ANS_PI_PROVIDER, ANS_PI_CONTEXT_WINDOW, … })`，成功后**重新** `loadEnvFileInto(process.env, …)` 使下一会话用新值。掩码用 `isSecretKey`。**不改** `createPiAdapterFactory` / `resolvePiProviderConfig`（§11.3 裁定）。

**验证（项目管理独立执行）**
- 本组：`node --test "test/项目管理/**/*.test.ts"` → **81 pass / 0 fail**（51 既有 + **30 新增** env-file）。
- 全量：`node --test "test/**/*.test.ts"`（**带引号**，走 Node glob）→ **522 pass / 0 fail**（基线 492 + 30 新增）。
- `npm run typecheck`（`tsc --noEmit`）→ **零错误**。
- 注：任务文字 `node --test test/项目管理/*.test.ts` 为**单层** glob，测试实位于 `test/项目管理/shared/` 一层之下，故按**递归** `test/项目管理/**/*.test.ts` 执行本组（同 T23 记录）。

**测试覆盖（重点在纪律，不在 happy path）**：只改相关键（注释/空行/未知键/无关键/顺序/`export`/两侧空白逐字节保留，`assertOnlyLineChanged` 逐行比对）；追加 vs 就地替换（含无尾随换行、空文件、同键多行）；特殊字符（`=`/空格/引号/`#`/反斜杠/tab/首尾空白/空值）**写后读回逐字一致**，含保留原引号风格与内联注释；CRLF 保留；原子写（内容完整 + **无 temp 残留**，新建/覆盖）；**失败路径**（目标目录不存在 → 抛错且不建任何文件、原 `.env` 不变；目标是目录 → 抛错且目录不受损；`readEnvFile` 不存在 → 抛错）；**不回显**（哨兵值 `sk-SENTINEL-…` 不出现在写入失败的错误文本里、`loadEnvFileInto` 回报不含值、`JSON.stringify(result)` 不含值）；`loadEnvFileInto` 语义（不存在→无操作/不抛、同名键覆盖）；机密键名单；读→改→写→读端到端往返。**全部用系统临时目录，不留文件于仓库，用完递归清理；不指向仓库根真实 `.env`。**

**边界与合规**：仅写 pm Section 1 内路径（`src/common/shared/`、`test/项目管理/shared/`、`角色卡/项目管理/docs/`、`角色卡/项目管理/memo.md`）。**未读** `.env` 本身及其任何值、未发网络请求、未打印凭据；未改任何其他角色文件（`app/` 与 `.env` 归属装配，本任务**不改**）。

**记录更新**：本文件 + `memo.md` 追加一行 + `docs/architecture/shared-components.md` 组件 5 与变更段 + `docs/project-rules.md` §一.5 与变更记录段。
