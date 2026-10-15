# ANS Studio

**让 AI 按角色分工，在明确的文件边界内完成代码任务。**

ANS Studio 面向希望在真实项目中使用多个 AI 角色协作的开发者：从需求与授权开始，经过派发、修改和测试，再把执行证据交回检查。提供桌面应用与 CLI，支持 Pi、Codex 和 Claude。

## ANS 是什么与学术来源

**ANS Skill** 是一套受 Role-First Software Governance（RFSG）论文启发的角色优先 AI 开发技能；ANS 是名称，不作缩写展开。本仓库的 **ANS Studio** 将这套思路落成可运行的桌面应用与 CLI。

它强调三件事：

- 先明确业务责任，再确定模块和代码归属。
- 按需广泛阅读，在授权范围内修改。
- 发现跨模块问题，交给对应角色处理；理解问题不会自动带来修改权限。

学术来源：Wang, Zhongren. 2026. *Role-First Software Governance: Asymmetric Authority Boundaries for AI-Native Agent Systems*. [DOI: 10.5281/zenodo.22824700](https://zenodo.org/records/22824700)。

![ANS Studio 真实桌面：角色导航、任务回交与执行证据](角色卡/测试/docs/change/2026-10-15-visual-v2-implementation-evidence/native-final-target-report-1360.png)

## 下载与运行

当前版本：[v1.0.0](https://github.com/wangzhongren/ans-studio/releases/tag/v1.0.0)。运行包自带运行环境，启动应用无需另装 Node.js；执行项目的 `npm test`、Git 等命令，仍需安装该项目所需的开发工具链。

| 系统 | 下载 | 启动方式 |
| --- | --- | --- |
| macOS 13+ · Apple Silicon | [mac-arm64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.0.0/ANS-Studio-1.0.0-mac-arm64.zip) | 完整解压，打开 `ANS Studio.app` |
| macOS 13+ · Intel | [mac-x64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.0.0/ANS-Studio-1.0.0-mac-x64.zip) | 完整解压，打开 `ANS Studio.app` |
| Windows 10/11 · x64 | [win-x64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.0.0/ANS-Studio-1.0.0-win-x64.zip) | 完整解压，打开 `ANS Studio.exe`，保留同目录资源文件 |

运行包尚未签名或公证，系统可能提示来源未验证。请从上述 Release 下载，并核对页面中的 `SHA256SUMS-*.txt`。

## 第一次使用

1. **导入项目文件夹。** 点击左下角「导入项目」。导入前引擎选择不可用；也可以选择一个空文件夹，从建立角色与边界开始。
2. **选择并配置引擎。** 在会话顶部选择 Pi、Codex 或 Claude。缺少配置时，点击提示中的「打开设置」按钮；日后也可从左下角「设置」进入。保存成功只表示配置已保存，连接是否可用仍需实际请求验证。
3. **与 su 说明需求。** su 是内置治理角色，负责协助建立角色与权限边界。空项目中，先看清拟写入的路径和预览，再决定是否确认。
4. **确认范围后开始任务。** 普通聊天不会自动产生「未报告」回交；正式任务由 su 派发到对应角色，忙碌时进入队列。「工作概览」可查看待确认项、排队消息与最近回交。
5. **检查结果与证据。** 阅读报告摘要，展开工具详情查看实际输出、错误和退出码，再检查项目中的改动。报告声明「已完成」不等于独立验收通过。

输入区使用 **Enter 发送，Shift + Enter 换行**。忙碌时可停止本轮或撤回尚未执行的排队消息；角色和引擎各自保留草稿。详情抽屉支持 Esc 关闭并回到原入口。

### 引擎配置

每个引擎使用独立配置，不会在缺配置时自动切换到其他引擎。

| 引擎 | 必填配置 | 可选配置 |
| --- | --- | --- |
| Pi | `ANTHROPIC_AUTH_TOKEN`、`ANS_PI_BASE_URL`、`ANS_PI_MODEL` | `ANS_PI_CONTEXT_WINDOW`，默认 32768 |
| Codex | `CODEX_API_KEY`（或 `OPENAI_API_KEY`）、`ANS_CODEX_MODEL` | `ANS_CODEX_BASE_URL`，默认 `https://api.openai.com/v1`；自定义端点须兼容 Responses API |
| Claude | `ANTHROPIC_API_KEY` | `ANS_CLAUDE_MODEL`、`ANTHROPIC_BASE_URL`，留空使用 SDK 默认 |

Codex 与 Claude 使用 API key，不使用订阅或 OAuth 登录回退。更多变量说明见 [`.env.example`](.env.example)。

运行包将配置保存在**用户数据目录的 `.env`**，开发启动使用**仓库根 `.env`**，设置面板会显示实际路径。秘密值不回显、不进入运行包，也不应提交到 Git。会话记录保存在项目的 `.ans/sessions/`，本仓库已将其加入忽略规则。

## 角色协作怎样约束修改

- **先分工，再授权。** 角色卡说明职责，`boundary.yaml` 的 Section 1 列出可修改路径；存在已生效的任务写集时，再按任务范围收窄。
- **写入前检查。** ANS 文件写入工具在产生副作用前检查边界和任务授权，无法确认权限时拒绝执行。su 的治理写入需要先展示路径与预览，得到确认后才能写入。
- **派发与验收分开。** 派发任务不会增加目标角色的写权限。任务报告、历史保存、回交投递和接收方处理分别显示实际状态；失败不会被当成成功。

技术结构与跨角色接口见[项目架构](角色卡/项目管理/docs/architecture.md)。

## 从源码开发

需要 **Node.js 23.6+** 与 npm。

```bash
git clone https://github.com/wangzhongren/ans-studio.git
cd ans-studio
npm ci
npm run app
```

桌面启动后按上面的首次使用流程配置即可。若使用 CLI，可先将 `.env.example` 复制为 `.env`，填写所选引擎配置。

### 常用 CLI 命令

在仓库根目录执行：

```bash
# 自检与帮助
node bin/ans.js doctor
node bin/ans.js --help

# 不调用模型的演示会话
node bin/ans.js role run 编排 --task T-1

# 对已有目录发起治理会话；确认通过终端问答完成
node --env-file=.env bin/ans.js govern /path/to/project --runtime pi

# 运行项目中已登记的角色；替换角色 ID 与任务内容
node --env-file=.env bin/ans.js role run "角色ID" --task "任务内容" --runtime pi
```

`--runtime` 支持 `demo|pi|codex|claude`，优先于 `ANS_RUNTIME` 环境变量。未指定时，`role run` 默认 demo，`govern` 默认 Pi。`govern` 的目标目录必须已存在；不提供目录时使用当前工具项目。`ans init` 已移除。

### 检查与打包

```bash
node --test "test/**/*.test.ts"
npm run typecheck
```

测试路径需保留引号，确保覆盖多层目录。部分集成测试需要监听本地回环地址。

发布构建使用 [GitHub Actions 工作流](.github/workflows/release.yml)，在各目标系统与架构上构建、解压并验证实际运行包。维护者的来源核验、构建命令与发布步骤见[桌面打包说明](角色卡/装配/docs/feature/desktop-release-packaging.md)。

## 当前限制

- **请仅打开可信项目。** shell 命令有规则检查与审读流程，但没有操作系统沙箱；获准命令的文件副作用不受 ANS 文件写入门禁约束。CLI 当前未启用 shell 工具。
- **Windows 暂不支持内置来源文档阅读。** 可查看完整摘要和执行记录，来源文件请通过系统编辑器打开。
- **CLI 与桌面能力有差异。** CLI 使用终端确认，暂不提供桌面式任务派发与回交投递、队列界面。多任务依赖的自动调度尚未实现。
- **ZIP 分发暂无安装器和自动更新。** 更新时需自行下载新版本。
- **验证范围有限。** 三平台运行包已通过原生构建、回归和解压启动检查，这些包测试未调用在线模型；真实在线代码任务的既有验证为 Pi。Codex、Claude 的受控测试不等于在线模型全链路验收。

## 深入了解

- [v1.0.0 发布与三平台验收](角色卡/测试/docs/change/2026-10-15_change_v1-release-verification.md)：实际产物、来源与测试证据。
- [真实桌面与 Pi 项目验证](角色卡/测试/docs/change/2026-10-15_change_visual-v2-independent-verification.md)：普通聊天、正式任务、工具输出与回交流程。
- [桌面交互设计](角色卡/UIUX设计师/docs/design/2026-10-15_design_visual-convergence.md)：页面结构与交互规范。
- [CLI 接线与行为说明](角色卡/装配/docs/feature/cli-runtime-assembly.md)：运行时选择、配置与命令细节。
- [工程规则](角色卡/项目管理/docs/project-rules.md)：分层、角色边界与协作约束。

本项目采用 [MIT 许可证](LICENSE)。
