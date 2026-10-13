# 产品备忘录

记录本角色掌握的事实、待核实事项与续接线索。不写全局规则，不抄任务状态。

- 2026-10-13：角色由 ANS Governance 建立（客户裁定来源 2026-10-13：「创建一个产品角色，来思考一下这个（产品）如何改进」）。Section 1 只授本角色文档面（五文件 + docs 四目录）与 `temp/产品/` 暂存区；不含 `app/`、`src/`、`test/`、仓库 `docs/`——本角色不实现，产出为提案与评审，改进以提案文档交付，由客户拍板后经协调方派发实现角色执行。
- 2026-10-13：feature-map.md、functional-description.md、api-spec.md 尚未建立，由本角色首轮工作建立（先例：编排、桌面应用——验收后建立稳定功能文档）。
- 2026-10-13（首轮）：feature-map.md 已建立；**functional-description.md、api-spec.md 仍未建**——首轮证据链已全部落进提案文档（含代码行号），若后续要独立模块笔记再从提案提炼，不重复维护。
- 2026-10-13（首轮观察，重要）：**工作树的 `app/renderer/renderer.js` 是在飞实现上下文的中间态**（46 行残缺、末行有「被截断保护_不会出现的行」哨兵，10:06 仍在动）；产品评审以 HEAD 版本（2590 行）为基准。后续轮次开工先 `git status` 判工作树状态，别把在飞中间态当产品问题或评审基准。
- 2026-10-13（首轮核实，续接线索）：① 图片接线只差桌面链路——Pi 适配器契约已有 `PromptOptions.images` 并透传 SDK（`src/provider/pi/session.ts:50-62,428`），断点在 `session:send`(main.ts:296)→`SessionManager.send`(session.ts:766)→`RoleSessionHandle.send`(run-role.ts:191-201) 三层只收 text；② 「停」的能力面在适配器已有（`session.abort()`，real-adapter.ts:640 中止后仍发 settled），编排句柄未暴露；③ shell 确认卡 (a) 层仍有 120s 超时（operator-channel.ts:67）而 su 交互卡已 G-1 无超时——口径差异已列为 P2 观察项；④ Pi 每轮 120s 硬超时（timeout.ts:10）不在 Pi 设置面板（pi-config.ts:55 仅四键），真机实测曾需环境变量放宽——P0-3。
- 2026-10-13（口味五条，此后评审的裁判标准）：界面要干净；信息在对的上下文；常规提示不打扰（只有异常出声）；每样东西要有用（没用就删）；诚实呈现。推论：能力缺席就说缺席，别摆半成品（当前唯一例外=图片入口，P0-1）。
