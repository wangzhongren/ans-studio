# v1.4.0 第二轮 CI（overlay-3）上下文

- 第二轮 CI：run `39391972925`，仅 Windows job 新红一条。
- 失败定位：`test/装配/multi-runtime.test.ts:154`「actual bin missing SDK errors are honest and masked without starting model requests」——10.5s 后 `actual signal 'SIGTERM' / expected null`。该用例对 codex 的 `spawnSync` 设了 `timeout: 10000`；Windows 原生 runner 本次 codex 启动/模块解析在负载下超过 10s，被夹具自身超时杀掉，并非产品错误（同文件 mac arm64 2.7s、mac x64 3.9s 通过，首轮 Windows 未红），属负载敏感夹具超时。
- 处置（仅测试夹具）：新增平台常量 `SPAWN_TIMEOUT_MS = process.platform === "win32" ? 30_000 : 10_000`，同文件 4 处 `spawnSync`（missing-config 默认 runtime、SDK lazy import/help/doctor、missing SDK）统一使用；**有界**，真挂起照限失败，未取消超时。断言本体（signal null / status 1 / 错误文案 / 密钥不泄漏）一律未改。
- 本地验证：`node --test test/装配/multi-runtime.test.ts` → 13/13；`node --test "test/装配/**/*.test.ts"` → 82/82。
- **后续已复跑通过**：最终 CI run `39393657089` 三平台 build + release 全绿（2026-10-20T08:41:32Z 发布）。
