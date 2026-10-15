---
id: restricted-document-boundary-20261015
type: change
title: 桌面窗口承接受限文档读取的精确分层文件
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
related: [complete-flow-interface-plan, restricted-document-read]
events:
  - date: "2026-10-15"
    kind: implemented
    summary: 按客户同版批准更新桌面窗口职责与 B 的 8+1 逐文件边界
  - date: "2026-10-15"
    kind: verified
    summary: 精确九新增、MD/YAML 镜像、全树唯一归属、真实枚举与 22 项门禁检查通过
---

# 让受限文档读取有明确的维护者

客户已明确确认“按 r2 方案实施，接受取舍，先完成精确边界更新，再相关角色实现 P1–P7，真实桌面测试”。本次固定身份为内置 ANS Governance，仅维护治理材料。批准依据是项目管理[总方案 revision 2](../../../项目管理/docs/design/2026-10-15_design_complete-flow-interface-plan.md)，SHA256 为 `0f3eac701c022a172d4b3546cb973f02779ea1a87bf7a016d705eb72911472e1`；对应 [B revision 2](../design/2026-10-15_design_restricted-document-read.md) 与[审核 manifest](../../../项目管理/docs/design/2026-10-15-complete-flow-interface-evidence/review-manifest.json)一致。设计中“待批准”的历史措辞保留，实际后续授权在此记录，不修改获批文件指纹。

以前桌面窗口只负责桌面 Interface，B 下层文件和专用测试不在白名单，不能创建。现在桌面窗口是 B 的唯一维护角色，按 [boundary.yaml](../../boundary.yaml) / [boundary.md](../../boundary.md) 逐文件增加以下权限；既有 app 接线范围保持原集合，仍是原固定角色实施。当前功能导航仍见 [feature-map](../../feature-map.md)，本次未把未实现的阅读流程写成可用功能。

| 新增单文件 | 归属职责 |
| --- | --- |
| `src/model/project-document.ts` | B Model 唯一主属；无 IO，其他角色只读消费 |
| `src/pipeline/project-document/read-project-document.ts` | B reader 创建、scope 更新、读取与关闭编排 |
| `src/service/project-document/abstract/document-reader.ts` | B 服务接口与读取条件 |
| `src/service/project-document/public/read-project-document.ts` | B 服务公开入口 |
| `src/service/project-document/impl/read-project-document.ts` | 唯一阅读 registry、资格/预算/格式/编码政策及错误映射 |
| `src/provider/project-document/abstract/file-reader.ts` | 句柄事实与有界 IO 接口 |
| `src/provider/project-document/public/file-reader.ts` | 平台文件读取能力公开工厂 |
| `src/provider/project-document/impl/file-reader.ts` | 路径/句柄校验、有界只读 IO、关闭与平台能力检查 |
| `test/桌面应用/project-document.test.ts` | B 预算、编码、句柄竞态、grant/scope 与引用测试 |

角色卡与模块说明同步上述职责和逐层必读资料。B 必须沿 Interface → Pipeline → Service → Provider 调用，Model 全层只读共享；新文件权限不扩展成任何目录权限。既有写门禁仍唯一由门禁引擎判定，B 的只读资格与句柄检查不能授予写权。共享原语仅只读复用，其他角色边界不扩张，不增加角色或改变组间权限。

治理前置已核实：项目未发现客户接受的本地 governance-boundary 覆盖，未设 `.ans/project.json` 或 `角色卡/governance-boundary.yaml`；`src/index.ts` 的演示 fallback 自标为无客户 pin 的已知偏离，不能据此替换本上下文明确接受的内置治理角色。本任务明确要求重构既有角色职责，适用内置 `built-in-boundary.md` 的角色目录条件权限。13 个有效角色（冻结桌面应用除外）的边界无相互覆盖；新增九路径此前均不存在、无现有主属。角色卡补齐技能要求的单角色组元数据，仅表示本角色协作身份，不增加调度权。

客户接受的 B/r2 取舍继续约束后续实现：仅可信本地 macOS/Linux 受测文件系统、UTF-8 md/txt 256KiB，Windows/能力不足拒读，重启后原生重选；不承诺恶意本地 writer 的严格隔离。P3 按来源角色文档列表显式选取，不从 evidence 文本猜文件。该责任分配不代表 B 已实现或通过真实窗口测试。

## 治理验证

在 macOS、Node v24.14.0 上对最终材料独立复算，并通过生产 `listProject`/`resolveWrite` 检查，结果如下；详细数据与定义文件 SHA256 见[治理证据](2026-10-15-restricted-document-boundary-evidence.json)。

1. Window YAML 从 35 条变为 44 条，精确九个新增 `file`，原 35 条完整保留；零删除、改属或目录扩张。MD 与 YAML 的条目数量、顺序、类型和路径逐一对应，九条新增用途也一致。
2. 13 个有效角色的所有白名单条目无相互覆盖；现有 `src/`、`app/`、`test/` 下 273 个文件全部各有且仅有一个属主；九个待建文件均只归桌面窗口。其他角色定义、批准 manifest 的 13 份设计文档及真实 `.env` 指纹未变。
3. 实际角色枚举无 warnings，桌面窗口读到 44 条与单角色组信息。门禁验证 22 项通过：九个新增精确路径允许；12 个相邻/其他角色路径即使列入任务写集仍拒绝；任务空写集继续拒绝边界内文件。验证中 accepted 仅为内存测试夹具，不写 `.ans`、不伪造项目授权。
4. 本次六份治理 Markdown/YAML 和本记录链接均有效，`git diff --check` 通过。九个业务/测试候选文件仍未创建；未改业务、测试、配置或批准设计。

治理前置已完成，可由项目管理在原授权与实际依赖检查后释放 Window 实施 B/r2。该结论只确认职责和权限；B 的功能代码、应用单测及真实桌面测试还没做，不属于此次治理通过声明。
