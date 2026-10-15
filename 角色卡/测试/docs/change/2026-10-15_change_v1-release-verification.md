---
type: change
created: "2026-10-15"
status: in-progress
---

# v1.0.0 跨平台运行包独立验证

用户已授权配置打包、基于不可移动的 v1.0.0 构建 macOS / Windows 运行包、测试通过后发布 GitHub Release。root 固定测试角色；装配维护构建/CI，窗口和适配器维护自身必要 packaged 修复，Governance 精确新增配置边界，PM审查发布门槛。

验证基线见 [baseline](2026-10-15-v1-release-evidence/baseline.json)。最终证据必须记录源 tag / 源提交、构建 overlay 提交和实际差异、依赖 lock、平台架构、CI run、产物 SHA-256。原生开发启动与跨架构交叉构建不能充当实际包启动通过。

计划检查：白名单资源且没有真实 .env / 会话 / 凭据；bundled 引擎依赖完整；没有本机 Node / 开发源码依赖；可写配置位于用户数据目录并可重启读取；真实 window/preload/IPC、导入前引擎禁选、缺配置入口、设置可用；macOS arm64本机包实际桌面检查，其他平台由对应 native CI 实际启动验证。未签名/未公证明确声明，不关闭系统安全保护。所有平台 gate 通过后才正式发布。

当前未构建，不以之前 1384 项开发测试替代运行包测试。

## CI 前开发候选检查

最终全仓 Node 1395 total / 1394 pass / 0 fail / 1 既有 Windows-only skip，exit0；typecheck0。首次沙箱运行唯一失败为监听 127.0.0.1 EPERM，保留首红；同断言在允许本机回环环境重跑通过，未改测试以掩盖失败。真实 .env 与 accepted V2 两件哈希未变。此处仍仅为代码候选，不作为最终各平台安装包通过。
