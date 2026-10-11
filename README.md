# ANS CLI（v1 原型）

受治理会话链路命令行：解析角色与边界 → 建立受治理工具集 → **在写入之前**拦截越界写入，
并给出可读的拒绝信息（按根分组列出允许路径）。

实现契约：`角色卡/项目管理/docs/design/2026-10-11_design_ans-cli-v1-prototype.md`（冻结对接设计）。

## 运行环境

- Node **v24.11.1**（须 ≥ 23.6，使用 Node 原生 TypeScript 类型擦除）。
- **免 `npm install`、免构建**：`bin/ans.js` 直接 `import('../src/index.ts')`，由 Node 原地擦除类型运行。
- 本机验证版本：Node v24.11.1 / npm 11.6.2。

## 快速开始

```bash
# 演示：受治理会话链路（等价于 ans role run 编排 --task T-1）
npm run demo

# 装配自检：打印内嵌演示配置与环境（无需其余层即可运行）
npm run doctor

# 装配自测（Node 内置测试运行器，直接跑 .ts）
npm run test:assembly
```

直接调用：

```bash
node bin/ans.js role run 编排 --task T-1
node bin/ans.js doctor
node bin/ans.js --help
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `ans role run <角色> --task <任务>` | 运行一个受治理角色会话（默认 demo 假 runtime；可 `--runtime pi` 用真实 Pi 适配器） |
| `ans govern [...]` | 治理 bootstrap 会话（本版最小占位链路） |
| `ans doctor` | 安装配自检与内嵌演示配置（含当前运行时） |
| `ans help` | 用法（含当前运行时） |

## 运行时选择

`ans` 支持两种运行时，**默认 `demo`**：

| 运行时 | 含义 |
| --- | --- |
| `demo` | 装配自有的演示假 runtime（`src/common/装配/demo-runtime.ts`），脚本化发起写入并经门禁判定；不调用真实 Pi SDK。 |
| `pi` | 编排导出的真实 Pi 适配器工厂 `createPiAdapterFactory`（`src/pipeline/orchestration/run-role.ts`）。需 Pi 凭据。 |

选择方式（优先级：命令行 > 环境变量 > 默认）：

```bash
node bin/ans.js role run 编排 --task T-1 --runtime demo   # 显式 demo（默认）
node bin/ans.js role run 编排 --task T-1 --runtime pi     # 真实 Pi 适配器
ANS_RUNTIME=pi node bin/ans.js role run 编排 --task T-1   # 经环境变量
```

**无凭据时不静默降级**：选 `pi` 但未检测到任一凭据环境变量
（`ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / OPENAI_API_KEY / GEMINI_API_KEY / PI_API_KEY`）时，
`ans` **以非 0 退出并如实报错**，绝不悄悄退回 `demo`、绝不假装成功。
`doctor` 与 `--help` 会显示当前运行时及其来源。


## 桌面应用（Electron）

Interface 层新增 Electron 桌面应用能力（源码在 `app/**`，归**桌面应用**角色，装配只负责包与脚本这一侧）。

- **依赖**：`electron` 列在 **devDependencies**（`44.7.0`，以实际安装的
  `node_modules/electron/package.json` 版本为准）。置于 devDependencies 的理由：桌面应用是**选用**能力，
  部署 CLI 不需要它；`npm ci --omit=dev` 时不会拉取约 100 MB 的 Electron 二进制；这也是 Electron 应用
  （electron-builder/forge）的通行约定。
- **脚本**：`npm run app` → `electron app/main.ts`。
- **`main` 字段**：`"main": "app/main.ts"`，供 Electron / `require` 定位主进程入口。
  **`bin` 字段未改动**，`ans` 命令与零构建 CLI 路径不受影响（`main` 只影响 Electron/`require`）。
- **零构建不受影响**：CLI 仍 `node bin/ans.js ...` 直接跑，`npm run demo` 仍 exit 0。

**`.ts` 直接运行核实（2026-10实测）**：Electron `44.7.0` 内置 **Node `24.21.0`**，原生支持无 flag 的
TypeScript 类型擦除。实测：

```
# 内置 Node 版本
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe -e "console.log(process.versions.node)"
# → 24.21.0

# 真实 Electron 应用加载 .ts 主进程入口（ESM，type:module），无 flag、无构建
electron .            # main = main.ts
# → electron-main-ts-ok 2 24.21.0 / ready / exit 0
```

结论：**桌面应用可直接写 `.ts` 主进程入口，无需构建步骤或加载器**——栈对 Node 24 原生擦除的依赖，
在 Electron 44 上同样成立（其内置 Node 已是 24.x，`--experimental-strip-types` 亦被接受，但非必需）。

## 演示应看到什么（契约 §7）

`npm run demo` 输出的关键节点：

1. 解析出角色与边界来源；
2. 受治理工具集建立；
3. 假 runtime 脚本化发起写入——一笔越界（`src/evil.ts`）、一笔在边界内但不在任务写集内（`src/common/编排/output.ts`）；
4. 两笔都在**写入之前被拒**，拒绝信息中**按根分组**列出允许路径（`skill:` / `project:`）；
5. 进程以 `settled` 结束；**不产生** `docs/scheduling/` 记录（F3 偏离）。

## 目录与职责

| 路径 | 归属 |
| --- | --- |
| `src/index.ts`、`bin/ans.js`、`package.json`、`tsconfig.json`、`README.md` | 装配（入口与配置） |
| `src/common/装配/` | 装配私有：argv 解析、运行时选择（`runtime.ts`）、演示假 runtime |
| `test/装配/` | 装配自测：解析、配置、假 runtime、入口分发 |

层间调用方向：`Interface → Pipeline → Service → Provider`，`Model` 由各层共享；仅相邻层可调用。
`src/index.ts` 只持有 **Interface 层句柄**（`runRoleCommand` / `governCommand`），
不导入 Service/Provider 对象，也不建立导入全部层的中央工厂。

## 接线说明（装配）

- **接线通道**：`main` 先解析运行时选择与 `argv`，再**动态导入** Interface 命令并调用。
  - `runRoleCommand(argv, deps)`：`argv` 为 `role run` 之后的剩余参数；`deps.createAdapter` 由装配注入——
    默认注入**装配自有的演示假 runtime**（`src/common/装配/demo-runtime.ts`）；
    选 `--runtime pi` 时注入编排导出的 `createPiAdapterFactory(project)`（真实 Pi 适配器）。
    两者的写入判定都完全经由 Pipeline 注入的 `gate`（绑定 `resolveWrite`）。
  - `deps` 还携带 `project` / `scope` 纯值（内嵌演示配置，**唯一来源**）；编排优先使用注入的
    `project`/`scope`，缺失时以清晰错误结束，不再自持第二份演示数据。
- **内嵌默认演示配置**：`src/index.ts` 内嵌六角色 `{card, boundary}` 映射、仓库根 `projectRoot`、
  以及 `skillRoot`（取 `ANS_SKILL_ROOT`，否则默认技能目录）。演示任务 `T-1` 的 `writeSet`
  取演示角色“编排”边界的**真子集**。
- **入口收敛与兜底超时**：`bin/ans.js` 的顶层 `await main(...)` 必须真正 resolve 后按真实退出码结束；
  若 `main()` 因未释放资源迟迟不收敛，入口以**兜底超时**（默认 5 分钟，环境变量
  `ANS_ENTRY_TIMEOUT_MS` 可覆盖）强制以非 0 退出并打印“入口超时”，绝不无限等待或以默认 0 静默退出。
  该超时与编排层给 `prompt` 加的超时是**两层**，互不冲突。
- **边界接受证据（F6）**：演示配置给出如实标注为演示来源的 `Acceptance`
  （`demo:embedded-config (无客户 pin，已知偏离)`）；`accepted` 由配置提供，程序不自行判定。
- **依赖**：`package.json` 声明 `@earendil-works/pi-coding-agent@1.1.0`（真实 Pi 适配器使用）。
  纯单元测试与演示用假 runtime 不依赖该包。

## 已知偏离（v1 原型）

- 无客户 pin 的 `.ans/project.json`：`acceptance` 仅带演示来源；不建立调度记录（F3）。
- 真实 Pi 适配器已有 CLI 端到端路径（`--runtime pi`），但**尚未真实跑通**：无 Pi 凭据时
  入口如实报错并非 0 退出；有凭据下的真实端到端运行未在本机验证（见“已知偏离”报告）。
- 演示配置**单一来源**：`src/index.ts` 注入的 `project`（六角色 `card`/`boundary` 路径 +
  `acceptance`）与 `scope`（`writeSet` + `conditions`）为唯一来源；编排优先消费注入值，
  缺失时以清晰错误结束。`ProjectConfig` 的 `roles` 仅 `{card, boundary}`，无 `acceptance`
  槽位，故装配仍以结构超集 `RoleLocation & { acceptance }` 携带 acceptance——该模型收敛
  待门禁引擎决定是否放宽 `RoleLocation`。
