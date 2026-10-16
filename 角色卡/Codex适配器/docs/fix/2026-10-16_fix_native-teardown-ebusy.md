# 原生进程收尾删除 workRoot 的 Windows 瞬时 EBUSY 修复

2026-10-16，Codex适配器固定角色。派发自 CI 实证：v1.2.0 发布 CI Windows runner 全量回归仅 1 红——`test/codex-adapter/session.test.ts` 用例 actual native process JSON-RPC parser 收尾报 `EBUSY: resource busy or locked, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\ans-codex-…\work'`。定性：测试健壮性问题、非产品缺陷；darwin 不复现（POSIX 允许删除任意进程 cwd 的目录），本机全量绿。

## 定位：清理逻辑不在测试本地 helper

报错路径形状 `ans-codex-<随机>\work` 唯一匹配生产 `src/provider/codex/session.ts`：`nativeEngine` 用 `workRoot/work` 作真实原生进程 cwd（session.ts:247-248），收尾在 `cleanup()` 内 `rm(workRoot)`（原 session.ts:288）。该文件在本角色 `boundary.yaml` 白名单内，故修复落在彼处。`test/codex-adapter/session.test.ts` **零改动**（SHA256 `1347467a9395da49ae9635b7b9e8005bea2dc1b29f9b49be9dd0fec48e177078`，与上次夹具修复记录逐字节相同）；断言零放松、零 skip。

## 根因

Windows 上被 `taskkill /T /F` 终止的原生进程（cwd=`workRoot/work`）其 `exit` 事件到达后，内核/索引器/实时防护对该进程在途句柄的释放仍未完成（与 `src/common/shared/atomic-write.ts` 记录的 rename 瞬时 `EPERM` 同类现象）；此时 `rm -r` 走到 rmdir `work` 即 `EBUSY`。

## 修法（两点，均在 session.ts）

a) **收尾顺序**：`nativeEngine` 新增 `stdioClosed` deferred（`child` 的 `'close'` 事件——语义为「进程已退出且全部 stdio 管道关闭」，蕴含 `'exit'`）；Windows 分支在 `exit` 等待之后追加 `await bounded(stdioClosed.promise, 80, "Windows stdio close")`，POSIX 分支在进程组消失后同序追加。`cleanup()` 先 `allSettled(engine.close…)` 再删目录——即「等进程完全退出（`exit` 与 `close`/管道关闭）之后才删目录」。
b) **目录删除有界重试**：`rm(workRoot, {recursive, force})` 包 `retryOnTransient`（导入 `src/common/shared/atomic-write.ts` 单一来源原语，工程法案 §一.5 不复制第二份实现）：仅 `EBUSY`/`EPERM`/`EACCES` 重试、上界 200、次数间仅 `setImmediate` 让出事件循环；非瞬时错误立即抛、上界耗尽照抛（不吞、不伪装成功）。

## 复跑

- `node --test test/codex-adapter/*.test.ts`：**25/25** 通过、0 fail、0 skip、exit 0（[tests.log](2026-10-16-native-teardown-ebusy-evidence/tests.log)）。
- 两个原生进程用例（363 行实际原生用例、402 行进程组用例）定向复跑 5 轮：每轮 2/2。
- `npm run typecheck`：exit 0（[typecheck.log](2026-10-16-native-teardown-ebusy-evidence/typecheck.log)）。
- 依赖原语自测 `test/项目管理/shared/atomic-write.test.ts`：16/16。
- `git diff --check` 通过；未提交。

## 未验边界（如实）

- darwin 无 EBUSY 语义（POSIX 可删任意进程 cwd 目录），本次新增的瞬时重试路径**无法在本机被真实触发**；Windows 侧以修复后的 CI 复跑为准。
- 「内核/索引器/AV 释放在途」是与 atomic-write 同类的推断（CI 证据＝错误码＋路径形状＋事件时序），未在 Windows 实机单独隔离归因；wait close 后仍失败的兜底即 b) 的有界重试（200×setImmediate）。
- stdio close 等待上限 80ms：若未来出现持有管道不放的进程（脱离进程组的孙进程），dispose 会显式超时抛错（此前该场景静默成功）——属有意收紧，当前任何环境未观测到该场景。

精确变更 SHA256：`src/provider/codex/session.ts` = `fb62d26f166d387e4f4ff25859f17608cf7a9e248a2312c889e51c493466c92a`（15 行增 / 1 行删）；测试文件 SHA256 未变（见上）。

关联：[受治理会话](../feature/codex-governed-session.md)、先例 `src/common/shared/atomic-write.ts`（共享组件 6）。
