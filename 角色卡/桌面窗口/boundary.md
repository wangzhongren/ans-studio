# 桌面窗口边界文档

本表与运行时读取的 `boundary.yaml` 条目一一对应；两者表达同一个 Section 1，不产生额外权限。未列路径默认只读。`role-card.md`、`boundary.md`、`boundary.yaml` 仅由 ANS Governance 维护。新增目录、改动归属或增删逐条列出的路径必须交 Governance 处理并取得客户授权。

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `app/main.ts` | Electron 主进程入口：建窗与窗口生命周期、IPC 注册、诊断与恢复接线 |
| 单文件 | `app/preload.cjs` | 受限 IPC 桥（contextBridge 白名单） |
| 目录 | `app/desktop/` | 桌面 Interface（主进程侧纯逻辑）：会话、项目装配、历史、交互、引擎配置、图片、批推与诊断 |
| 单文件 | `src/model/project-document.ts` | B 专属 Model 唯一主属：版本、文档引用、可信导入类型、请求/结果与错误类型；不含 IO |
| 单文件 | `src/pipeline/project-document/read-project-document.ts` | B Pipeline 公开入口：编排文档 reader 创建、scope 更新、读取与关闭 |
| 单文件 | `src/service/project-document/abstract/document-reader.ts` | B Service 抽象：受限文档服务接口与 Provider 所需读取条件 |
| 单文件 | `src/service/project-document/public/read-project-document.ts` | B Service 公开入口：创建/调用受限文档服务 |
| 单文件 | `src/service/project-document/impl/read-project-document.ts` | B Service 实现：唯一 scope registry、清单资格、预算/格式/编码政策与错误映射 |
| 单文件 | `src/provider/project-document/abstract/file-reader.ts` | B Provider 抽象：文件句柄事实与受限有界 IO 接口 |
| 单文件 | `src/provider/project-document/public/file-reader.ts` | B Provider 公开入口：平台文件读取能力工厂 |
| 单文件 | `src/provider/project-document/impl/file-reader.ts` | B Provider 实现：lstat/realpath/open/fstat、有界 read/close 与平台能力检查 |
| 单文件 | `test/桌面应用/ans-wiring.test.ts` | 主进程侧测试：`.ans` 生效配置接线 |
| 单文件 | `test/桌面应用/boundary-refresh.test.ts` | 主进程侧测试：边界陈旧重建 |
| 单文件 | `test/桌面应用/composer-images.test.ts` | 主进程侧测试：图片校验与 Interface 接线 |
| 单文件 | `test/桌面应用/diagnostics.test.ts` | 主进程侧测试：诊断与交互通道 |
| 单文件 | `test/桌面应用/dispatch-delivery.test.ts` | 主进程侧测试：派发投递机 |
| 单文件 | `test/桌面应用/dispatch-fresh-enum.test.ts` | 主进程侧测试：派发前新鲜枚举 |
| 单文件 | `test/桌面应用/genesis-bootstrap.test.ts` | 主进程侧测试：创世态配置 |
| 单文件 | `test/桌面应用/handback-delivery.test.ts` | 主进程侧测试：回交自动投递 |
| 单文件 | `test/桌面应用/hot-path.test.ts` | 主进程侧测试：合帧批推/状态去抖 |
| 单文件 | `test/桌面应用/interface.test.ts` | 主进程侧测试：Interface 处理器 |
| 单文件 | `test/桌面应用/message-queue.test.ts` | 主进程侧测试：消息队列与状态快照 |
| 单文件 | `test/桌面应用/operator-channel.test.ts` | 主进程侧测试：操作者确认通道与 arm 分发 |
| 单文件 | `test/桌面应用/operator-wiring.test.ts` | 主进程侧测试：交互通道与锚点键 |
| 单文件 | `test/桌面应用/p0-halt-and-images.test.ts` | 主进程侧测试：停止/图片端到端 |
| 单文件 | `test/桌面应用/pi-config.test.ts` | 主进程侧测试：Pi 配置读写纪律 |
| 单文件 | `test/桌面应用/project.test.ts` | 主进程侧测试：枚举构造 ProjectConfig |
| 单文件 | `test/桌面应用/queue-withdraw-lru.test.ts` | 主进程侧测试：撤回与 LRU |
| 单文件 | `test/桌面应用/session-history.test.ts` | 主进程侧测试：JSONL 解析与锚点 |
| 单文件 | `test/桌面应用/session-rebuild-race.test.ts` | 主进程侧测试：并发重建竞态 |
| 单文件 | `test/桌面应用/session.test.ts` | 主进程侧测试：会话开启/多轮/保活 |
| 单文件 | `test/桌面应用/su-effective-boundary.test.ts` | 主进程侧测试：su 生效边界 |
| 单文件 | `test/桌面应用/e2e/main.mjs` | 桌面端到端总自检台（真实 Electron） |
| 单文件 | `test/桌面应用/multi-runtime.test.ts` | 多引擎会话隔离、路由、设置及恢复契约测试 |
| 单文件 | `test/桌面应用/project-document.test.ts` | B 专属测试：服务/Provider 预算、编码、句柄竞态、grant/scope 与引用失效 |
| 单文件 | `角色卡/桌面窗口/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/桌面窗口/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/桌面窗口/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/桌面窗口/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/桌面窗口/api-spec.md` | 实现报告（IPC 通道与导出） |
| 目录 | `角色卡/桌面窗口/docs/design/` | 设计记录 |
| 目录 | `角色卡/桌面窗口/docs/feature/` | 本角色功能的稳定说明与流程图 |
| 目录 | `角色卡/桌面窗口/docs/change/` | 变更记录 |
| 目录 | `角色卡/桌面窗口/docs/fix/` | 修复记录 |

边界纪律（与 boundary.yaml 顶部注记同义）：

- 写资格判定一律调门禁引擎，Pi 调用一律经 Pi 适配器；本角色不得出现第二份写门禁。B 的阅读清单与句柄校验不授予写权。
- B 仅含上述 8 个 Model/lowerlayer 单文件与 1 个新增测试单文件；不授权整个 `src/`、各层目录或 `common/`。B 的唯一 Model 主属、各层职责和必读合同见本角色卡及 functional-description。
- preload 不暴露任何 Node 能力；通道增改须同步 `preload.cjs`、`main.ts`、渲染消费面与 api-spec。
- `package.json`、`README.md`、`bin/`、`tsconfig.json` 属装配角色；`app/renderer/` 属「桌面UI」角色。
- `角色卡/桌面应用/`（已拆分冻结）为只读归档，不在任何角色的写入面内。
