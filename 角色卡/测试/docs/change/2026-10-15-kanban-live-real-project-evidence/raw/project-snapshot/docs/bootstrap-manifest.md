# Bootstrap 留痕（创世 finalize）

> 本文件由**代码**在 su 的治理会话 settle **之后**生成（su 不会算 hash，故 pin 只能事后算）。
> **pin 每轮 su settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——
> 对**外部**（非经 su 会话）的边界改动，**下一次 su settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。

- 生成时间：2026-10-15T13:57:17.614Z
- 目标项目：/Users/wangzhongren/code/vibeingcode/ans-testbed/kanban-live
- 授权来源：desktop-app:操作者导入空文件夹并开启 su 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）
- 角色（2）：测试者、实现者

## Pin 的边界文件（SHA-256）

| 路径 | SHA-256 |
| --- | --- |
| 角色卡/governance-boundary.yaml | a19ee561cac958c29ae4c1b4b8001f57303e17f48a83ab780bc87dde7f6fce93 |
| 角色卡/测试者/boundary.yaml | 07b084c003cd44e3dd5b7c6d586ac08cda5e3900f1905c878c41959b9cf56201 |
| 角色卡/实现者/boundary.yaml | 867520ece400642829ba31f45a83b0681de6af39cfe454b2b40f8a15ca879452 |

## 实际创建路径（逐条留痕）

- 角色卡/测试者/api-spec.md
- 角色卡/测试者/boundary.yaml
- 角色卡/测试者/changelog.md
- 角色卡/测试者/docs/design/测试设计.md
- 角色卡/测试者/docs/feature/用例说明.md
- 角色卡/测试者/docs/fix/KANBAN-DEF-001.md
- 角色卡/测试者/feature-map.md
- 角色卡/测试者/functional-description.md
- 角色卡/测试者/memo.md
- 角色卡/测试者/role-card.md
- 角色卡/实现者/api-spec.md
- 角色卡/实现者/boundary.yaml
- 角色卡/实现者/changelog.md
- 角色卡/实现者/docs/design/design.md
- 角色卡/实现者/feature-map.md
- 角色卡/实现者/functional-description.md
- 角色卡/实现者/memo.md
- 角色卡/实现者/role-card.md
- 角色卡/governance-boundary.yaml
- docs/audit/shell-gate.jsonl
- docs/su/changelog.md
- docs/su/memo.md
- .ans/project.json（本 finalize 写出）
- docs/bootstrap-manifest.md（本 finalize 写出）
