# 2026-10-19 变更：shell 判断路径增加确定性前置封堵（长内联命令 / 无界递归搜索）

## 问题

客户反馈（原话）：

> 「grep/长内联命令 这个应该让判断AI 做好封堵。」

真机证据：

- test-engineer 用超长内联 `node -e` 脚本，判断路径最终报 `manual/context-too-large`（先浪费一次判断，再由客户手批/拒绝）；
- 前端因大目录/挂住的 `grep` 卡了 17 分钟；
- 既有 (c) 规则集把 `grep`/`rg` 列入只读白名单（`classifyShell` 直接 `allow`），这类无界搜索**根本不进判断 agent**——只靠任务文本叮嘱或客户手批兜不住。

客户要求：判断 agent **直接封堵**这类命令，而不是靠叮嘱或客户逐条批准。

## 改动

### 1. 新增确定性纯函数 `src/common/编排/shell-command-guard.ts`

`guardShellCommand({ command, argv, cwd, projectRoot })` → `{ verdict:"allow" }` 或
`{ verdict:"deny", reasonCode, reason }`。不读盘、不调模型、不抛错；覆盖：

**长内联命令（`inline-too-large`）**——识别 `node -e/--eval|--print`、`python|python3 -c`、
`bash|sh|zsh|dash|ksh|fish -c`、`perl -e/-E`、`ruby -e`、`php -r`、`osascript -e`、`lua -e`、
`pwsh|powershell -Command`、`deno eval` 等（含 `-lc`/`-ne` 字符簇与 `-e<code>` 附着形态）。
判据（任一命中即拒绝）：

| 判据 | 阈值 |
| --- | --- |
| 命令字节长度（命令原文与 argv 拼接取大） | > **2048B** |
| 内联代码行数 | > **10 行** |
| 内联代码单行长度 | > **1024B** |

短内联（如 `bash -c "echo ok"`）不拦——只拦无法安全审查的长代码。嵌套形态（`bash -c 'node -e …'`）
与 `$()`/反引号命令替换递归检查（深度上限 3）。

理由（逐字，客户要求的落盘脚本出路）：

> 长内联命令无法安全审查，已拒绝；请把代码写入落盘脚本，自行管理启停、显式超时退出后重试。

**无界/递归搜索（`unbounded-search`）**——识别：

- `grep -r/-R/--recursive`（含 `-rn` 等字符簇）且未给具体文件/受限目录：无路径、`.`/`./`/`..`、
  项目根/cwd、`/`、`~`、`$HOME`/`$PWD`、顶层 `*`/`**`、项目根的祖先目录；
- `rg`/`ripgrep`：无路径（默认全项目扫描；**被管道喂入 stdin 时不算**）、`--files` 无路径、宽范围路径；
- `find`：起始路径为宽范围（`/`、`~`、`.`、项目根等）；显式 `-maxdepth N` 视为有界，放行；
- 路径中的命令替换（`$(pwd)`、反引号）无法静态确认范围，按宽范围处理（fail-closed）；
- 通过常见包装器调用同样生效：`sudo`/`doas`/`env`/`command`/`timeout`/`nice`/`ionice`/`xargs`/
  `nohup`/`stdbuf`/`setsid` 等会被剥离后再判定；
- 限定到具体文件/小目录且有界的 `grep`（如 `grep -rn pattern src/specific-dir --include=*.js`）、
  具体文件列表、`find src …` **放行**——不一刀切禁 grep/find。

理由（逐字）：

> 无界递归搜索可能挂起，已拒绝；请限定具体文件/目录、加超时，或改用落盘脚本。

### 2. 接线：两条入口都在模型/客户通道之前

- **`src/common/编排/shell-gate.ts`（真正的卡点）**：`decide()` 在规则集加载与 argv 规范化之后、
  **(c) 分类之前**调用 guard。命中即 `deny`，不调 `classifyShell`、不调 `pmAsk`、不调
  `operatorChannel`、不弹卡；审计 `branch`/`by` 记为
  `preblock:inline-too-large` / `preblock:unbounded-search`，并写 `shell.preblock` 诊断。
  因为这层在 (c) 之前，**只读白名单里的 `grep`/`rg` 也会被拦下**（真机卡死来源），
  `readonlyOnly` / `operatorOnly` / `advisoryRuleset` 各档同样生效。
- **`src/common/编排/shell-judge.ts`（防御纵深）**：判断函数入口在引擎矩阵/上下文检查之后、
  命令大小上限/防循环/并发排队/建会话之前调用 guard。命中直接返回
  `{ verdict:"deny", reasonCode, reason }`（理由已是人话，不再重复合成 customerMessage），
  **不建判断会话、不调模型、不排队、不计防循环**，并写 `shell-judge.preblock` 诊断。返回的是确定性 `deny`，不是 `manual`——
  与 2026-10-19「manual⇒deny」的新语义同向且更强，不依赖客户手批。

### 3. 提示词同步（`shell-judge-prompt.ts`）

系统提示新增【长内联与无界搜索——必须 deny（客户 2026-10-19 明确要求）】：

- 长内联（`node -e`/`python -c`/`bash -c` 等，命令 >2KB、代码 >10 行或单行超长）属卡死/上下文风险，
  必须 deny 并建议落盘脚本、自行管理启停、显式超时退出；
- 无界递归搜索（`grep -r` 无受限路径、`find /`、`rg` 全项目扫描）可能挂起，必须 deny 并建议限定
  具体文件/小目录、加超时或改用落盘脚本；
- 限定到具体文件/小目录且有界的搜索不算无界，不得因此 deny。

提示词仍是稳定单一来源；确定性封堵已先行拦截，提示用于未被解析器识别的变体（防御纵深）。

## 测试

新增 `test/编排/shell-command-guard.test.ts`（16 例，离线）：

- 阈值常量 2048/10/1024；
- 长 `node -e`（>2KB）→ `deny/inline-too-large`，理由逐字含「落盘脚本」；判断入口模型零调用
  （`binds=0`）、不是 `manual`；
- 多行 `sh -c`（11 行）→ deny；10 行以内/短 `bash -c` 放行；`python -c` 单行 >1KB → deny；
  嵌套 `bash -c "node -e …"` → deny；
- `grep -r`：无路径 / `.` / `./` / 项目根 / `/` / `~` / `$PWD` / `..` / `*` → deny；
  具体目录 + `--include`、具体文件列表、`./src` → 放行；
- `find /`、`find .`、`find ~` → deny；`find src …`、`find . -maxdepth 1` → 放行；
- `rg` 无路径 / `.` / 项目根 / `--files` 无路径 → deny；具体路径、`-g` 限定、管道喂入、`--version` → 放行；
- 包装器 `sudo`/`timeout`/`xargs` 后的无界 grep → deny；`bash -c` 短内联里的无界 grep → deny；
- 普通命令 `npm test` / `node script.js` / `ls -la` / `git status` / `node --test` → 放行；
- shell-gate：`classifyShell`/`pmAsk`/`operatorChannel` **全部零调用**，审计分支可辨识；
  有界 grep 照常进入 (c)；只读档同样被封堵；
- 系统提示包含本批文案。

既有风险审查（`shell-judge-risk-scope`）、读取纪律（`shell-judge-read-discipline`）、读取预算、
manual 语义、并发池、审计透传等断言**未修改、未放宽**。

## 验证（真实输出）

- `node --test "test/编排/**/*.test.ts"` → **635 计 / 635 过 / 0 红 / 0 skipped**（上一基线 619，+16 即本批新增）。
- `npm run typecheck` → **exit 0**（仅 npm 镜像配置既有 warning）。
- 补充全量 `node --test "test/**/*.test.ts"` → 3190 计 / 3185 过 / **3 红** / 2 skipped。
  3 红均为**其他角色工作树在改**的渲染/推理强度用例（`test/桌面应用/runtime-ui.test.ts`、
  `test/测试/g5-reasoning-verify/g-desktop.test.ts`、`test/测试/t29-pi-config-roundtrip.test.ts`），
  不导入本批任何模块，与本批无关；本角色 `test/编排/**` 全绿。

## 边界与残余风险

- 只写 `src/common/编排/**`、`test/编排/**` 与本角色文档；未改 `app/**`、其他角色文件、运行时核心、
  适配器与 git 历史；未提交 git。
- 本模块**不是完整 shell 解析器**：变量间接（`$CMD`、`eval "$x"`）、别名、heredoc/`<<`、更深的
  动态求值、未列入的解释器/包装器可能绕过确定性规则；这些由判断 agent rubric 与 (b)/(a) 兜底。
- 阈值是经验值（2048B/10 行/1024B）：超长但安全的代码、以及恰好低于阈值的多行代码仍可能进入判断路径；
  调整阈值只需改 `shell-command-guard.ts` 的三个导出常量。
- `grep` 非递归且无文件（等待 stdin）不在本规则内（既有 rubric 的「等待 stdin」仍由判断 agent 审查）；
  `find`/`rg` 的 `-maxdepth` 只按字面识别，若用变量传入则不视为有界（fail-closed 方向）。
