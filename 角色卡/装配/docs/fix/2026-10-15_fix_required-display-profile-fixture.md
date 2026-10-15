---
type: fix
created: 2026-10-15
status: verified
---

# 装配受控替身登记工具展示资料

CLI 两命令的离线装配测试通过真实 Interface、Pipeline 与 Service，但 `fakeProvider` 尚未履行 Core 新的 required-v1 展示资料登记契约，导致原成功断言失败。用户已批准 r2/A4/B2/C2.text_policy_revision1 实施及发现问题由 owner 修复；PM 的 ASSEMBLY-FIXTURE-1 窄维护包由固定测试 root 忠实转发，沿用同版授权。

仅修改 `test/装配/multi-runtime.test.ts` 的 `fakeProvider` factory：确认真实 `options.registerToolDisplayProfile` 存在，显式调用 `{ credentials: [] }`。替身没有运行时凭据，空列表准确表达实际情况。生产 required-v1、SDK 懒加载、运行时选择、context、门禁和 CLI 原断言全部保留。

验证先保留未修复专项首红，再跑原专项、全装配回归、strict TypeScript 与 scope diff。实际候选和日志记录在同目录 `2026-10-15-required-display-profile-fixture-evidence/`。本工作不构成真实模型或真实桌面完整验收。

实际仅增加“真实注册函数存在”的断言及显式空资料登记。首次专项 13 项中 8 通过、5 失败；修后 13/13，通过全装配 67/67、strict TypeScript 和 scoped diff 检查。Core 最新 manifest 的 14 项依赖及批准设计的 13 项指纹全部匹配；未改变批准材料。实际测试候选 SHA-256 为 `18329834063f41d9ec616fec726254a929a97addc102e04353bc52f5a31ff903`。详见[可复核证据](2026-10-15-required-display-profile-fixture-evidence/manifest.json)。

当前功能导航：[CLI 运行时接线](../feature/cli-runtime-assembly.md)。授权依据：[PM 实施记录](../../../项目管理/docs/change/2026-10-15_change_complete-flow-implementation.md)。
