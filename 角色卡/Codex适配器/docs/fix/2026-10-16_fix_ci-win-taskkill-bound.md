# CI Windows 红修复：原生进程 taskkill 上界 120ms 过紧（平台真值）

2026-10-16，Codex适配器固定角色。派发自 v1.3.0 发布 CI（run `38924209553`，headSha `74a34c9`，冻结源 tag v1.3.0＝`16963ee`）Windows job 全量回归：本角色仅 1 红——`test/codex-adapter/web-search.test.ts` 用例「actual native process fixture accepts the web search on-posture and completes a governed turn」在 `session.dispose()`（:189）抛 `Codex Windows process cleanup timed out`。定性：**测试暴露的平台真值问题（产品侧等待上界过紧），非产品功能缺口**——杀树动作本身未失败，是等待上限误伤；本测试（G-3 批）**首次上 Windows CI**（此前冻结源未含此用例）。

## 判别（证据行）

- 错误串 `Codex Windows process cleanup timed out` 在仓内唯一来源＝`src/provider/codex/session.ts` win32 分支 `bounded(…, 120, "Windows process cleanup")`（冻结源 :242）——即 **taskkill.exe 的 spawn+kill+exit 超过 120ms**。
- 堆栈 `session.ts:388:27 ← session.ts:712:19 ← web-search.test.ts:189`：:388＝`cleanup()` 的 `throw new Error(config.redact(failed.reason))`（redact 重建错误、丢失原始栈）；:712＝`dispose()` 的 `await cleanup()`；:189＝`await session.dispose()`。⇒ 原始错＝`engine.close()` 在 taskkill 上界处拒绝，经 `Promise.allSettled` 收集后由 cleanup 如实上抛（错误传递链无缺陷，属定位信息损耗）。
- **同 CI、同 close 路径、同一夹具**的姊妹用例（`session.test.ts`「actual native process JSON-RPC parser…」，:15:29:28.059 **✔** 212ms）与失败用例（:15:29:28.195 **✖**）在同一秒并发运行——全量套件峰值并行（约 4 文件进程并发、多个真进程夹具在飞）下，taskkill 一个 <120ms、一个 >120ms。⇒ **120ms 上界在峰值负载下随机超出**（windows-2025 冷 spawn＋实时防护扫描的现实延迟），与夹具/参数/产品路径无关。
- 平台真值面：darwin 走 POSIX 分支（信号组）不涉 taskkill——本机全绿；本测试 macOS 两个 job 均 ✔。同批 CI 其余 Windows 红（Pi env/transport 键集、键面审计等）均不在本角色文件（如 J3 env 收窄测试属 Pi 侧）。

## 修法（仅 1 文件；只做平台真值分支、断言零放宽）

`src/provider/codex/session.ts`（win32 分支）：taskkill 上界 **120ms → 2000ms**（注释登记 CI 证据与理由）；仍为**有界**（真挂起 2s 内照限如实失败，语义不变：taskkill 拒/超时 ⇒ close 照抛）。其后 80/80ms 等待为 EBUSY 修复的有意收紧、沿用不动。**测试文件零改动**（`web-search.test.ts` 与全部断言逐字不变；姊妹用例与其它原生/夹具用例均未触及）。

## 复跑

- `node --test test/codex-adapter/*.test.ts`：**54/54** 通过、0 fail、0 skip。
- `npm run typecheck`：exit 0（全仓）。
- 全量 `node --test "test/**/*.test.ts"`：2036 计 / 2033 过 / 1 skip / 2 红——两红均在本批改动之前既有、且在**他方在飞文件**（`test/测试/g3-search-verify` 审计④读 Pi real-adapter 门文本；`test/测试/t29-pi-config-roundtrip` Pi env 夹具键表）——本角色文件零红。
- git diff --check 通过；未提交。

## 未验边界（如实）

- darwin 无法进入 win32 分支（无法触发 taskkill 路径），**本修复无法在本机被真实复验**；Windows 侧以修复后的 CI 复跑为准（沿 EBUSY 修复先例）。
- 上界取值 2000ms 为「平台现实值」判定（证据＝单次 >120ms 观测＋峰值负载形态）；若未来出现 >2s 的真实 taskkill 延迟，应按同样口径升级或改为「taskkill 尽力＋以进程实际退出为成功判据」的重设计（届时另行评审，本轮不做）。
- taskkill 超时时后续收尾（stdin.destroy/exit 等待）不会执行（语义不变、如实失败）——极端情形下可能短时遗留被挂进程至 CI job 结束；未观测、未处理（登记）。
