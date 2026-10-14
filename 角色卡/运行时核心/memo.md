# 运行时核心工作备忘录

2026-10-14：客户确认运行时接入组并指示新建角色、开发。职责与边界已由 ANS Governance 建立；当前尚未实现或验证。

2026-10-14 C1：Model/API 已冻结并获 PM 同范围评审；实际工具由 Service 注入，不得 Provider peer-import。存储新增 optional validateNativeDirectory/prepareNativeDirectory，前者不建目录，后者仅真持久化时调用。legacyDirectory 只给 Pi。适配器原生 UUID 与 Service 本轮 ID 不同，生产 adapter 使用注入 currentTurnId，原 handler signal 必须是本轮原始信号。shared atomicWrite 新增 optional signal 已由 PM 实施。核心工具迁移 helper 的 Pi 副本仅可临时并存，由 P1 属主 facade/删除；本角色不修改 Pi。C1 原证据与候选摘要在 change 文档。

2026-10-14 C1R：CustomerInputMetadata 可选第二参数冻结，包含原始 signal 与入口捕获 turnId/role/runtime。raceAbort 只中止工具等待，原 callback promise 的许可副作用必须 O1 在发行前依据原 signal 检查，D1 使旧卡失效。核心新增真实 handler+许可替身+下一轮 gate 拒绝测例；consumer 集成证据仍由测试角色提供。共享 CODEX_ACCESS_TOKEN 仅剥离/掩码键，不作为产品认证 fallback。旧 C1 21/21保留历史，Model/tools/shared输入变化后失效；当前证据见 C1R fix。

2026-10-14 C1H：历史读取的 Pipeline 指定入口在 Service session.ts，同名 operation 委托 Provider session-store.ts；只是返回 Model 值，不 reexport Provider 对象。Model/tools/存储实现与C1R保持原样。当前 evidence 在 service-history-entry fix；编排的新测试由其属主重跑。

2026-10-14 C1T：resolveRuntimeTimeouts 位于本角色 timeout.ts，沿 Pi opts??env 及 readTimeoutMs 规则；Provider composition 一次计算，同值传内外。显式0/负/NaN/Infinity原值不校验，环境finitepositive才floor（0.5→0为既有行为），其他runtime不读Pi env。原 AbortSignal.any([controller.signal, call.signal])仍组合原call信号，无provenance扩张。当前 core28/28与whole tsc exit0证据见 pi-effective-timeouts fix；原24/24留历史。

2026-10-14 C1P：P1 legacy五项文案断言失败根因是tools统一abort包装泛化已失败结果。入口按工具专属语义，postawait只改signalaborted且oktrue；okfalse原样保留。当前31/31、whole tsc0；原28/28 evidence历史保留。Pi185全部回归及loopback权限例由P1原属主提供，不用核心证据替代。

2026-10-14 C1O：P1实际内外同45ms时outer先timeout，inner abort cleanup后来发aborted改写结果。Turn.outcomeLocked在outercatch定结论后设true；pump settled/streamcatch尊重lock，cleanup错误仍emit，正常inner outcome依旧照实采纳。当前33/33与whole tsc0证据见 outer-terminal-outcome fix；Pi真实迁移race测试由P1属主重跑。

2026-10-14 C1A：PromptOptions.onTurnStarted(metadata:PromptTurnStartedMetadata) sync optional callback，在Core prechecks通过新UUID/active/providerturn设置后try首句，persist/native前恰一次。三个readonly字段turnId/roleId/runtime，无clientID/signal/权限/Store/SDK变化，原opts/images reference透传adapter且adapter不调用。callbackthrow未开始underlying则不调用idle native.abort，单failed释放active。Window原invocation闭包捕获ack，删FIFO/latest猜测；本角色不修改Pipeline/UI/Window。当前38/38 whole tsc0原证据/manifest见prompt-start-ack fix。

