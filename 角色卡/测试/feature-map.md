# 测试功能导航

本角色**没有直接负责的用户可操作业务功能**：交付物是独立测试与回归证据链（跨角色联调、完整流程、受影响回归、最小复现夹具）。下表按「名称 / 一句话用途 / 当前状态 / 文档」导航；测试设计与报告**链接受测角色的功能文档**，不复制它们的流程图。命令、参数与复跑方法写在对应 change 记录内。

| 交付物 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 到点检查 + 1 小时兜底（整轮不设超时） | 检查时限到点只提示不中止；每轮一次；1h 兜底可区分；非整轮时限不变；设置/su 卡/role_status；恢复需客户确认 | verified（2026-10-17，套件 15/15；全量 2246/2150/94/2；三项偏差修复后复审通过） | [用例](../../test/测试/turn-watch-verify/)、[报告](docs/change/2026-10-17_change_turn-watch-recover-verify.md)、[证据](docs/change/2026-10-17-turn-watch-recover-verify-evidence/) |
| su 命令审批策略（run_shell） | 只读免审批、risky/review/deny 逐条客户批准；分支/审计、su-only 与构造守卫、桌面注入、SU 卡、零执行哨兵 | verified（2026-10-17，套件 36/36＋卡片探针 9/9；全量 2215/2120/93/2） | [用例](../../test/测试/su-shell-approval-verify/)、[报告](docs/change/2026-10-17_change_su-shell-approval-verify.md)、[证据](docs/change/2026-10-17-su-shell-approval-verify-evidence/) |
| 已有角色但无治理记录兼容（B+C V1） | S1 状态/预览/建立、su 解卡（确定性 gate）、角色不受影响、零副作用/V6b、幂等、并发、F6 恢复指引、确认卡不被误用、权限审计 | verified（2026-10-17，独立套件 42/42；0 不通过/7 备注；文案修正后复审仍 42/42） | [用例](../../test/测试/existing-project-compat-verify/)、[报告](docs/change/2026-10-17_change_existing-project-compat-verify.md)、[证据](docs/change/2026-10-17-existing-project-compat-verify-evidence/) |
| 助手消息即时 Markdown（渲染轮复审） | `appendAssistant` 恒 `mdReady:true`；未 settled 即 `<h2>/<table>`；旧行安全网在位；e2e 剩余红经 HEAD A/B 证明既有 | verified（2026-10-17，Electron 探针 6/6；全量 2153/2058/93/2） | [探针](../../test/测试/render-md-ready-probe.mjs)、[摘要](docs/change/2026-10-17-existing-project-compat-verify-evidence/renderer-round-summary.md)、[报告 §⑧](docs/change/2026-10-17_change_existing-project-compat-verify.md) |
| 三运行时独立入口验证（T1） | 真CLI/Pipeline/实际Electron主入口的选择、门禁、取消、隔离与回归证据 | verified：独立11、实际main23、旧UI119、锚点14通过；全仓1225通过/0失败/1旧Windows skip | [方案](docs/design/2026-10-14_design_multi-runtime-independent-verification.md)、[报告](docs/change/2026-10-14_change_multi-runtime-independent-verification.md)、[重复问题](docs/fix/2026-10-14_fix_actual-main-live-history-duplication.md) |
| 跨角色联调（CLI 真入口与治理链） | 真实命令入口的行为与失败面：未知命令/用法错误码、`govern` 缺 provider 配置、创世边界恰 3 条、越界写零副作用 | 现行（2026-10-12 全绿） | [real-entry](../../test/测试/real-entry.test.ts)、[cli-genesis-boundary](../../test/测试/cli-genesis-boundary.test.ts)、[runCli 凭据擦洗问题记录](docs/fix/2026-10-12_fix_runcli-credential-leak-and-govern-cli-cases.md) |
| 完整流程（su 建角色 → 写落盘 → pin/shell 闸） | bootstrap 全链：三件套字节相等落盘、写前拒越界、F4/F6、shell 闸 (a)/(b)/(c) 次序与 fail-closed | 现行 | [t9-block1](../../test/测试/t9-block1-bootstrap.test.ts)、[t9-block2](../../test/测试/t9-block2-write-landing.test.ts)、[t9-block3](../../test/测试/t9-block3-pin-shell.test.ts) |
| Pi 配置往返与写入纪律 | 面板载入→适配器构造→保存重载；只改相关键、原子无残留、哨兵不回显 | 现行 | [roundtrip](../../test/测试/t29-pi-config-roundtrip.test.ts)、[write-discipline](../../test/测试/t29-write-discipline.test.ts) |
| 桌面交互独立回归（R1–R5 等） | 真实 renderer/preload + 受控 IPC：单份说明、队列全文/位次/撤回、异常默认目标、未决优先与定位作答、IME、回交、停止、图片/草稿 | 现行（2026-10-14 复测 119 条全过） | [脚本](../../test/测试/ui-reacceptance-renderer-regression.mjs)、[方案](docs/design/2026-10-13_design_ui-reacceptance-regression.md)、[首轮结果](docs/change/2026-10-13_change_ui-reacceptance-regression.md)、[同日三版候选复测](docs/change/2026-10-14_change_uiux-design-alignment-regression.md) |
| 回放解析与展示映射回归 | 内存 JSONL→真实解析/映射/回放计划：未知不冒充成功、交错 callId、交互锚点、shell 首行 | 现行（11/11） | [脚本](../../test/测试/uiux-v2-replay-regression.test.ts)、[方案](docs/design/2026-10-13_design_uiux-v2-offline-regression.md)、[结果](docs/change/2026-10-13_change_uiux-v2-offline-regression.md) |
| 虚拟行锚点交付回归 | 150+ 行窗口化：追加/重建/前插锚点、开合零漂移、已决卡双锚、跨角色未决 | 现行（14/14；2026-10-14 修复后收起/展开 before=after=11.1875） | [脚本](../../test/测试/uiux-v2-renderer-regression.mjs)、[复测记录](docs/change/2026-10-14_change_uiux-design-alignment-regression.md) |
| 最小复现与诊断探针 | 锚点漂移最小复现（固定元素+首可见行双读数）、全域诊断副本（APP 可切旧候选 A/B）、行距缓存 detached 路径探针（含 U1 抽跑点角色到底） | 现行（2026-10-14，三轮确定性） | [drift-probe](../../test/测试/uiux-anchor-drift-probe.mjs)、[anchor-probe](../../test/测试/uiux-anchor-probe.mjs)、[rowgap-detached](../../test/测试/uiux-rowgap-detached-probe.mjs) |
| 回归证据存档 | 各轮独立报告 JSON 与运行起止指纹（renderer/anchors/replay/探针） | 存档（只读） | [2026-10-13 证据](docs/change/2026-10-13-ui-reacceptance-evidence/)、[设计对齐证据](docs/change/2026-10-14-uiux-design-alignment-evidence/)、[漂移修复复测证据](docs/change/2026-10-14-driftfix-recheck-evidence/)、[第二版复测证据](docs/change/2026-10-14-recheck2-evidence/) |
| 其余稳定性小件 | 边界矩阵、失败关闭、接线冒烟、F5 条件、F7 符号链接（本机符号链接限制见记录） | 现行（随 `test/测试/*.test.ts` 全绿） | [boundary-matrix](../../test/测试/boundary-matrix.test.ts)、[fail-closed](../../test/测试/fail-closed.test.ts)、[wiring](../../test/测试/wiring.test.ts)、[conditions-f5](../../test/测试/conditions-f5.test.ts)、[f7-symlink](../../test/测试/f7-symlink.test.ts) |

## 说明

- 受测对象与所属功能文档**链接受测角色**，不复制其流程图：主入口为[桌面三栏会话](../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)（桌面角色拆分重组中，按现路径引用）；CLI/治理链与 Pi 的受测实现见编排、门禁引擎、Pi适配器等角色目录。
- `test/测试/` 下另有 `parseerr-probe.mjs`、`pi-probe.mjs`、`pi-turn-probe.mjs` 三个历史排查用一次性探针，保留原位。
- 证据目录是快照存档；重新执行以脚本 + 对应 change 记录中的命令为准。职责与写入边界见[角色卡](role-card.md)与[边界](boundary.yaml)；工作线索见 [memo](memo.md)、治理记录见 [changelog](changelog.md)。
- 本角色不建 `docs/feature/`：无用户可操作业务功能，交付物即上表清单；受测功能的当前说明归受测角色维护。


- 2026-10-15：V2 严格落地独立验证 verified：真实原生双宽、导入/键盘/缺配/选择/停止/来源阅读、p-limit 正式派发和回交通过；最终 Node 1384 pass / 0 fail / 1 Windows-only skip。5 个生产文件变化由各属主维护；测试仅补 own fake IPC，原断言不放松。详见 [独立验证](docs/change/2026-10-15_change_visual-v2-independent-verification.md) 与 [最终证据](docs/change/2026-10-15-visual-v2-implementation-evidence/final-verification.json)，首红与修复历史保留，未 commit/push。

- 2026-10-15：v1.0.0三原生运行包独立验收与公开发布verified。CI3每平台1401项，mac两各1400pass0fail1skip、Windows1399pass0fail2skip；实际ZIP启动/依赖、同source+overlay树、GitHub服务器digest和匿名下载核对通过。原tag、真实.env、acceptedV2不变。首红及跨平台/时钟夹具订正全部保留，详见[发布独立验证](docs/change/2026-10-15_change_v1-release-verification.md)。
