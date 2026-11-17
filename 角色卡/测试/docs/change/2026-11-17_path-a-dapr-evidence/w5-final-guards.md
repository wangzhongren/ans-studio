# 角色准入、旧裁决与返工上限补测

产品冻结于 `4c6efec34182563e3fa8b1ef6ef6372fe282d220`。每个用例使用独立临时项目、产品桌面接口、真实新 Windows ZIP 的 Dapr 资产和 SQLite。客户响应经现有应用通道，确定性角色脚本替代模型服务。主进程及渲染层类型检查通过。[W5 主报告](../2026-11-17_path-a-dapr-evidence.md)

- A3 过期文档快照 1/1。真实客户卡呈现后，夹具更改 A2 产品意图文档，再从原卡选择确认。应用返回 `A document changed after this card was prepared.` 及过期状态。实例仍停在 A3，没有决定事实、客户确认记录或 Git 仓。TAP SHA-256 `13ebf7d23d9a5c1b1ce7fa1d0e0a6611a01e7418fb3816e954e96186006acb9a`。[A3 旧快照](w5-final-4c6efec-intent-stale-snapshot.tap)
- A3 冲突与有界返工 1/1。原卡第一次选返工后，再提交确认而被拒绝，返回 `同一事实键已绑定其他内容。`。新卡发出后复用旧卡也被拒绝。原定义 `maxVisits: 2` 下，实际形成三次独立卡决议和两次后续起草，第三次要求返工后实例 `dw-f2465ce6adb5d03b56544e4ee0a2d2f7233f` 进入 `stopped`，始终没有 Git 仓。TAP SHA-256 `871df096374d021b9085f034ecc362778d8373540504072827edc71b89a915d2`。[A3 冲突决定及返工上限](w5-final-4c6efec-intent-revision-limit.tap)
- A12a 三项准入与合法后续 1/1。在第一个真实幕僚回合中，标准任务尚未派发时请求推进 A11 返回 `stage-request-invalid`。改派实施属主承担独立标准被同一入口拒绝，说明须使用名单指定的独立验收角色。两个请求均未产生任务。合法的 `verifier` 只收到一个标准任务 `dw-8a2cd37e31a3943b5ece8a5360dda633`，尝试在验收范围外写入 `src/core/unauthorized-standard.ts` 被真实文件工具拒绝，目标未创建。标准正常回交，合法 A11、A12b、归档与 A13 最终交付均通过。TAP SHA-256 `6834ef5335945951d5dd0e39bf64f89dd123ed6e40fb16d1f98814d53b6f5964`。[A12a 三项门禁和完整后续](w5-final-4c6efec-acceptance-guard.tap)

本次测试文件 `desktop-path-a.test.ts` 的 SHA-256 为 `affcddd32181eb0fbc2301195777b8c335809319d7e2a526b865e430bfc56aa9`。错误基线和失效委托仍缺原生组合证据。
