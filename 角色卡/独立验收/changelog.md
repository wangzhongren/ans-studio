# 独立验收治理变更记录

## 2026-10-21 建立 D3 最小独立验收角色（ANS Team Formation）

依据用户“按 D3 轻量方案，用 ANS 技能安排各角色实施，改完测试一下”的实施授权及必要治理前置，建立独立固定角色。只授自身 feature-map、memo、functional-description 及 docs/design、docs/change、docs/fix；产品与测试源码、他人证据、治理和调度状态均不在执行写区。根 changelog 由 ANS Team Formation 维护。无软件导出/共享或装配接口，api-spec 不适用。

初始交接：复用 ANS-PERMISSION-REPAIR D3 AC1–AC10，实施前写标准，再核对实际候选与独立测试证据并作三态判断。工作文档由验收角色接手创建，本次仅交付定义，不将其缺少初始内容误记为缺权或验收完成。

Markdown 为权限源；同步 YAML 保留现有 role/entries schema 供产品读取。本轮未建立 task_ops 配置或凭据，不声称完成全项目角色迁移或机器预检。

定义检查：产品严格 YAML 解析通过，6 条与 Markdown 解析逐项全等，与其他实际角色 YAML 无写区交集；既有边界解析回归 21/21 通过。真实 task_ops 只读预检返回 exit 2 / rejected，原因是 `.ans/project.json` 不存在，故未宣称该预检通过。验收标准与产品交付结论仍由独立验收接手。
