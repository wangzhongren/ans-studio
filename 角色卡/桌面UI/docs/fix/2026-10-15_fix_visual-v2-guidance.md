---
id: desktop-visual-v2-guidance
type: fix
created: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 让空态指路与V2实际入口一致

root在真实新单进程V2、尚未导入/未发模型时复现index bb5c29a5空态仍说“右上角设置”，但V2设置已位于左下。root要求同类窄校正并独占GUI，因此只改三处指路字符串，不改业务或样式，不再启动Electron。

先只改index设置指路为“引擎配置可在左下角设置中查看。”，index阶段3b17ef96、renderer仍b5cf95d7。只读排查另有index与renderer的泛指“点右上角图标展示对应面板”，root随后明确同类校正两句并保先选角色条件；现为“先在左侧选择角色，再从会话头部的‘角色资料’或‘工作概览’打开对应面板；内容跟随当前角色。”实际源码为中文引号，不增流程/字段。剩余右上角命中仅历史注释，按root指令未改。

最终index SHA256 7beda47c504c81ba8a7748b407eb60efc27ec531e936d93868a9480528514f00；renderer 5b80a72796e4e8cff369a378deb96ca1c5bc6d1dcabe92adf6bef1dc0f8b3b13；styles56d2ff9e保持冻结。原生首红AX保于本轮evidence/native-before-import-guidance-red-ax.txt；当前node --check、原静态unit67/67、git diff --check均0。原完整受控回归与截图保持其bb5/b5结构候选hash，不冒记为新7b/5b重跑。root获两次明确hash后reload复验，最终native结论归root。

关联功能：[桌面会话与V2资料层](../feature/runtime-choice.md)；[V2实现及证据](../change/2026-10-15_change_visual-v2-implementation.md)。
