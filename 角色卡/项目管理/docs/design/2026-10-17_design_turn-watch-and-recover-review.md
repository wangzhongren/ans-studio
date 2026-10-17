---
id: turn-watch-and-recover-review
type: design
title: 整轮不设超时——到点看护检查与 1 小时最后兜底（评审与拆发）
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: approved
revision: 1
related: [role-watchdog-and-closure, reasoning-and-effort]
events:
  - date: "2026-10-17"
    kind: reviewed
    summary: 客户裁定去掉整轮到点硬中止，改为到点通知 su 检查（未卡死不动、卡死才 propose_recovery），保留 1 小时最后兜底；PM 批准并钉死检查/兜底两层时限、看护文案、设置元数据与跨运行时范围
---

# 整轮不设超时——到点看护检查与 1 小时最后兜底

**客户裁定（逐字，2026-10-17）**：「整轮不应该有超时，应该是到了时间，su 要去看下是否卡死了，如果卡死了，要想办法让他恢复。」；追加选择：「保留 1 小时兜底」；「如果没卡死，就不管他。」
**本轮性质**：评审与拆发，**不写代码**。本文是策略边界、契约与验收口径；代码尚未改动。

## 一、结论

**批准实施。** 把「整轮到点硬中止」拆成两层：

1. **到点检查（inspect）**：`ANS_PI_PROMPT_TIMEOUT_MS` 不再作为适配器中止整轮的时限，改为**看护检查时限**（默认 5 分钟，滑块 1/2/5/10/15/30 分钟）。到点由看护向 su 发一条「轮次到点检查」系统消息；su 用 `role_status`/`session_tail` 核对：**仍在推进 → 不动作；卡死 → `propose_recovery` 提议**（停止本轮/重建会话/重投任务），由客户确认、应用执行。**不自动中止、不自动恢复。**
2. **最后兜底（last resort）**：整轮**有效运行**到 **1 小时**仍未结束 ⇒ 适配器中止。这是唯一的自动整轮上限；文案与到点检查明确区分。常量 `DEFAULT_TURN_LAST_RESORT_MS = 3600000`。

**保留非整轮时限**：单条 shell 命令 10 分钟、shell 确认卡 120 秒、会话构造 120 秒不变。

**PM 决定（无需再问客户）**：1 小时兜底**不暴露 env**（固定常量 + 测试注入 `turnLastResortMs`；避免多一个可关闭安全网的旋钮）。若客户未来要求可调，另加。

## 二、现状（代码事实）

| 位置 | 事实 |
| --- | --- |
| `src/common/pi-adapter/timeout.ts` / `src/common/runtime-core/timeout.ts` | `DEFAULT_PROMPT_TIMEOUT_MS=120000`；`PROMPT_TIMEOUT_ENV="ANS_PI_PROMPT_TIMEOUT_MS"`；`timeoutError` 文案「…超时（Nms）…已中止」；`resolveRuntimeTimeouts` 返回 `{promptTimeoutMs, constructTimeoutMs}`（非 Pi 忽略 env，固定 120s）。 |
| `src/service/runtime/session.ts:289` | 整轮外层 `withPausableTimeout(..., provider.options.promptTimeoutMs ?? 120000, ...)`——到点即中止整轮。 |
| `src/common/pi-adapter/real-adapter.ts:1072/1084` | Pi 的 prompt 段再包一层 `withPausableTimeout(..., promptMs, ...)`；超时走失败/abort 路径（`timed_out`/`PROMPT_TIMEOUT`）。 |
| `src/provider/claude/session.ts:497` | `waitForTurn(..., options.promptTimeoutMs ?? 120000, ...)`——到点掐断。 |
| `src/provider/codex/session.ts:672` | `pausedDeadline(..., options.promptTimeoutMs ?? 0, () => stop(turn,"timed_out"))`——默认 0＝无整轮时限（跨运行时不一致）。 |
| `app/desktop/watchdog.ts:72` | `TURN_DEADLINE_RATIO=0.9`；信号 #1 在 90% 时发「轮次逼近超时」，事实行写「整轮硬超时」「剩余量」「尚未超时、系统未中止」。 |
| `app/desktop/watchdog.ts:340/486` | `turnTimeoutMs(runtime)` 用 `resolveRuntimeTimeouts(...).promptTimeoutMs`；每轮身份 `turnId/startedAt` 天然一次；有挂起确认卡排除；su 自身忙排除。 |
| `app/desktop/watchdog.ts:437-452` | 活跃期解除时，若告警投出过，会投一条「看护恢复」。 |
| `app/desktop/session.ts:2695-2706` | `role_status` 的当前轮行写「已耗 / 硬超时」；时限同样取 `promptTimeoutMs`。 |
| `src/common/编排/watchdog.ts:58/66` | 信号标签「轮次逼近超时」；建议「先用 role_status 核对…；正常完成会自动解除」。 |
| `src/common/门禁引擎/boundary-core.ts:80/249` | su 卡「看护职责」写「轮次逼近超时」；没有「到点检查/1 小时兜底」说明。 |
| `src/common/shared/runtime-settings.ts` | `ANS_PI_PROMPT_TIMEOUT_MS` 当前 label「整轮超时（ms）」、档位 1–30 分钟、help「拖动选择整轮超时；留空＝系统默认（120s）；单位 ms；下一次开启会话时应用。」 |
| `src/provider/runtime/schema.ts` | `run_shell` 描述无整轮超时限定；与本项无关。 |

## 三、新语义（钉死）

### 3.1 两层时限

| 层 | 值 | 谁用 | 到点行为 |
| --- | --- | --- | --- |
| **看护检查** `inspect` | `ANS_PI_PROMPT_TIMEOUT_MS`（默认 **300000**，滑块 1/2/5/10/15/30 分钟） | **仅看护**（`app/desktop/watchdog.ts`）与 `role_status` 事实行 | 发一条「轮次到点检查」；**不中止** |
| **最后兜底** `lastResort` | **固定 3600000**（`DEFAULT_TURN_LAST_RESORT_MS`；测试可注入） | 适配器/服务运行时的整轮包装 | **中止整轮**；文案/错误码与检查区分 |
| shell 命令 | 600000（不变） | 工具执行层 | 终止该命令、轮次继续（现状） |
| 确认卡 | 120000（不变） | 操作者通道 | 未获同意（现状） |
| 会话构造 | 120000（不变） | 适配器构造 | 构造失败（现状） |

- **字段名保留**：`RuntimeSessionOptions.promptTimeoutMs` / `RuntimeProviderOptions.promptTimeoutMs` 继续存在，但语义改为**看护检查时限**（历史名；为避免跨运行时契约大改）。**新增** `turnLastResortMs?: number`（缺省 3600000）。
- `resolveRuntimeTimeouts` 返回 `{ promptTimeoutMs, turnLastResortMs, constructTimeoutMs }`：
  - `promptTimeoutMs`：**所有运行时**都读 `ANS_PI_PROMPT_TIMEOUT_MS`（历史键名），缺省 **300000**（不再是非 Pi 固定 120000）。
  - `turnLastResortMs`：固定 3600000（无 env）。
  - `constructTimeoutMs`：120000（不变）。
- **`promptTimeoutMs` 不再用于任何 abort**：四处整轮/段时限改为 `turnLastResortMs`：
  1. `src/service/runtime/session.ts` 整轮包装；
  2. `src/common/pi-adapter/real-adapter.ts` 主 prompt（及 G-5 重发）；
  3. `src/provider/claude/session.ts` 的 `waitForTurn`；
  4. `src/provider/codex/session.ts` 的 `pausedDeadline`（缺省从 0 改为 3600000）。
- **可暂停语义不变**：1 小时兜底按**有效运行时间**计，客户确认卡挂起期间暂停（`InteractionGate` / `withPausableTimeout` / `pausedDeadline` 沿用）。**等待客户 2 小时不会触发 1 小时兜底。**
- **F-3-a 截断收尾补发**：主 prompt 用 `lastResort`；补发段用**检查时限**（或 `LengthFollowupOptions.timeoutMs` 显式值），不继承 1 小时，避免已完成的轮次被补发拖住。外层 1 小时仍是总上限。
- **错误面区分**：1 小时兜底使用独立错误标记（建议 `name:"TimeoutError"` + `label:"本轮最后兜底"` + `code:"TURN_LAST_RESORT"`；`outcome` 仍为既有 `timed_out`，不改契约枚举），`timeoutError` 文案改为「本轮运行超过最后兜底（3600000ms），已中止以免无限挂起。」；服务层 settled 摘要改为「本轮超过 1 小时最后兜底，已中止」（与到点检查/普通失败区分）。**不得**继续复用「prompt 超时（120000ms）」的旧文案。

### 3.2 看护到点检查

- `TURN_DEADLINE_RATIO` **0.9 → 1.0**（到点即检查；不再有 90% 预警）。
- 信号标签/摘要：「轮次到点检查」（`SIGNAL_LABELS`、`SIGNAL_SHORT`、summary）；**不得**出现「逼近超时 / 已超时 / 硬超时 / 剩余量」。
- 事实行（建议逐字）：
  - `本轮已运行约 <X>（看护检查时限 <Y>，到点检查）`
  - `到点检查不会中止本轮；若该轮仍在推进，不动作`
  - `若确认卡死，用 propose_recovery 提议（停止本轮/重建会话/重投任务），需客户确认后由应用执行`
  - `1 小时为最后兜底；到点检查与此兜底是两件事`
  - `该角色有挂起确认卡时不触发本信号（正确等待不报）`
- 建议：「先用 `role_status`（必要时 `session_tail`）核对是否仍在推进；仍在推进 → 不动作；确认卡死 → `propose_recovery`（需客户一键确认后由应用执行）。到点检查仅告知，不会中止本轮。」
- **每轮一次**：沿用每轮身份 `turnId ?? t<startedAt>` + `cooldownMs:0` + 活跃期 `alerted` 去重；同一轮只投一条。**不重复检查**（客户「没卡死就不管他」）。
- **排除**：有挂起确认卡的角色；su 自身忙时关于 su 的信号（su 不能检查自己）。项目角色在 su 忙时照常触发，消息经投递机排队（su 空闲后处理）。
- **解除**：轮次结束（settled/abort）后活跃期解除。**建议 `turn-deadline` 解除时不投「看护恢复」**（检查不是故障；客户「没卡死就不管他」），只清状态。若实现保留恢复行，文案须为「到点检查已解除（本轮已结束）」，不得写成故障恢复。
- **角色状态**：`role_status` 当前轮行改为「进行中（已耗 <X> / 看护检查时限 <Y>；turnId=…；1 小时为最后兜底）」。可保留队列/上一轮/近 15 分钟失败计数，供 su 判断「是否卡死」。

### 3.3 设置元数据（PM 属主）

`ANS_PI_PROMPT_TIMEOUT_MS`（键名不变）：

- `label: "看护检查时限"`
- `choices: ["", "60000", "120000", "300000", "600000", "900000", "1800000"]`（1/2/5/10/15/30 分钟）
- `choiceLabels: ["系统默认（5 分钟）", "1 分钟", "2 分钟", "5 分钟", "10 分钟", "15 分钟", "30 分钟"]`
- `control: "range"`，`integer: { min: 1000 }`（保留）
- `help: "到点只通知 su 检查是否卡死，不中止本轮；若仍在推进则不动作；1 小时为最后兜底。留空＝系统默认（5 分钟）；下一次开启会话时应用。"`
- 该字段仍是 Pi 面板字段；看护对 Claude/Codex 也读同一 env（历史键名），缺省 5 分钟。**1 小时兜底不暴露**。

### 3.4 内置角色卡「看护职责」（门禁引擎）

把「轮次逼近超时」改为「轮次到点检查」，并补：

```text
到点检查不是超时：系统不会因此中止本轮。收到后先用 role_status（必要时 session_tail）核对：
若该轮仍在推进，不动作；若确认卡死，用 propose_recovery 提议（停止本轮/重建会话/重投任务），
由客户确认、应用执行。1 小时为最后兜底：整轮有效运行到 1 小时仍未结束，适配器会中止该轮
（唯一自动整轮上限），其文案与到点检查明确区分。su 自身轮次无到点检查（不能检查自己），仅有 1 小时兜底。
```

- 全仓 `轮次逼近超时 / 硬超时` 的**文案/注释**同步清扫（`watchdog.ts`、`session.ts`、`customer-input.ts`、`operator-channel.ts`、`real-adapter.ts` 注释等）；历史 dated 文档不追改。

## 四、文件归属与派发

| 属主 | 文件 | 改动 | 测试 |
| --- | --- | --- | --- |
| 运行时核心 | `src/common/runtime-core/timeout.ts` | `DEFAULT_TURN_INSPECT_MS=300000`、`DEFAULT_TURN_LAST_RESORT_MS=3600000`、`resolveRuntimeTimeouts` 增 `turnLastResortMs`、检查/兜底错误标记 | `test/runtime-core/effective-timeouts.test.ts`、`session.test.ts` |
| 运行时核心 | `src/model/runtime.ts` | `RuntimeProviderOptions` 增 `turnLastResortMs?`；`promptTimeoutMs` 注释改为「看护检查时限（历史名，不用于 abort）」 | 同上 |
| 运行时核心 | `src/service/runtime/session.ts` | 整轮包装改用 `turnLastResortMs`；`RuntimeSessionOptions` 增字段；settled 摘要区分最后兜底 | `test/runtime-core/session.test.ts` |
| Pi适配器 | `src/common/pi-adapter/timeout.ts` | 常量/文案与 runtime-core 同步（两份镜像） | `test/pi-adapter/timeout.test.ts` |
| Pi适配器 | `src/common/pi-adapter/real-adapter.ts` | 主 prompt/重发用 `turnLastResortMs`；补发段用检查时限；注释改「最后兜底」 | `test/pi-adapter/real-adapter.timeout.test.ts`、`interaction-gate.test.ts`、`customer-wait-end-to-end.test.ts` |
| Pi适配器 | `src/provider/pi/session.ts` | 选项增 `turnLastResortMs?` | 同上 |
| Claude适配器 | `src/provider/claude/session.ts` | `waitForTurn` 用 `turnLastResortMs`（缺省 1h） | `test/claude-adapter/session.test.ts` |
| Codex适配器 | `src/provider/codex/session.ts` | `pausedDeadline` 用 `turnLastResortMs`（缺省 0→1h） | `test/codex-adapter/session.test.ts` |
| 桌面窗口 | `app/desktop/watchdog.ts` | 阈值 1.0；标签/事实/建议文案；每轮一次；检查信号解除不投恢复（建议）；`turnTimeoutMs`→检查时限 | `test/桌面应用/session.test.ts`、`dispatch-delivery.test.ts`、`hot-path.test.ts`（相关） |
| 桌面窗口 | `app/desktop/session.ts` | `role_status` 当前轮行改「看护检查时限 / 1 小时兜底」；必要时透传 `turnLastResortMs` | 同上 |
| 编排 | `src/common/编排/watchdog.ts` | `SIGNAL_LABELS`/`SIGNAL_SUGGESTIONS` 改「轮次到点检查」与检查指引 | `test/编排/watchdog.test.ts` |
| 门禁引擎 | `src/common/门禁引擎/boundary-core.ts` | su 卡「看护职责」到点检查/不动作/卡死才提议/1 小时兜底 | `test/门禁引擎/`（新增或扩展）、`test/测试/g2-verify/`（相关） |
| 项目管理 | `src/common/shared/runtime-settings.ts` | label/help/choiceLabels 按 §3.3 | `test/项目管理/shared/runtime-settings.test.ts` |
| 桌面UI | `app/renderer/**` | **预期零改动**（面板从 `RUNTIME_SETTINGS` 读 label/help/choices）；实施时核实无硬编码旧文案 | `test/桌面应用/renderer.test.ts`（如改） |
| 测试 | `test/测试/turn-watch-verify/`（新目录） | 独立端到端（缩短检查/兜底、看护消息、1h 兜底、非整轮时限不变） | — |

## 五、验收

1. **到点不中止**：检查时限到（测试注入小值，如 200ms）→ 整轮**继续**；只投 **1 条**「轮次到点检查」；文案不含「已超时 / 逼近超时 / 硬超时」；含 `role_status`/`session_tail` 指引。
2. **每轮一次**：同一轮继续超过 2× 检查时限 → 仍只有 1 条；下一轮独立再检查一次。
3. **没卡死不动作**：su 在测试桩里收到消息后不调用 `propose_recovery`；系统不自动中止。
4. **卡死才提议**：模拟卡死（`busy=true` 且无活动）→ su 调 `propose_recovery`；提议需客户确认，应用执行；**无自动执行**。
5. **1 小时兜底**：注入 `turnLastResortMs` 小值（如 300ms）→ 到点中止；错误标记/摘要是「最后兜底」，与检查文案可区分；无检查时限的提前中止。
6. **非整轮时限不变**：shell 命令 600000、确认卡 120000、构造 120000；对应测试全绿。
7. **设置**：label「看护检查时限」、档位 1/2/5/10/15/30、默认标签「系统默认（5 分钟）」、help 逐字；1 小时不暴露。
8. **看护排除**：有挂起确认卡的角色不触发；su 自身忙时关于 su 不触发；项目角色在 su 忙时消息排队。
9. **跨运行时**：Pi/Claude/Codex 都用检查时限（看护）与 1h 兜底（适配器）；Codex 不再无整轮上限。
10. **回归**：全量 `node --test "test/**/*.test.ts"`；记录基线红（当前 renderer 4 条、`virtual visible nonempty` 等），**不新增红**。
11. **真机**：客户把检查时限设 1 分钟，跑一个长轮次，观察：到点 1 条检查消息、轮次继续、无中止；su 按指引核对；1 小时兜底用确定性测试验证（不要求客户等 1 小时）。

## 六、风险与回滚

1. **真正卡死且 su/客户都不处理 → 挂到 1 小时**：客户已选「保留 1 小时兜底」；这是接受的权衡。检查消息只是提醒，不自动恢复。
2. **检查依赖 su 可投递**：su 忙/未开/投递失败 → 检查消息排队或延迟；1 小时兜底仍是唯一硬保护。若 su 会话本身卡死，su 无法检查自己（仅 1 小时兜底）。
3. **su 自身轮次无检查**：这是结构限制（不能检查自己）；客户知悉。若要 su 自检，需要外部看护，另项。
4. **dispatch 排队/积压**：仍由既有 `queue-stuck` 信号覆盖；到点检查不替代它。
5. **错误面从「120s 超时」变为「1h 兜底」**：既有日志/测试/用户预期需同步；`timed_out` 的语义现在是「最后兜底」而非「2 分钟超时」。文档/诊断码必须区分。
6. **跨运行时不一致的历史**：Codex 原默认无整轮上限，现加 1h；Pi/Claude 原 120s，现 1h。三平台统一为新策略，但旧行为/测试会变。
7. **检查按墙钟、兜底按有效时间**：`turnStartedAt` 是墙钟；确认卡挂起期间检查被排除，但解除后可能立即到点（墙钟已超）。1 小时兜底按有效运行时间（可暂停）。差异如实登记；若客户要求检查也按有效时间，需会话侧累计暂停时长，另项。
8. **过期检查消息**：轮次在消息投递前结束 → su 收到时 `role_status` 显示不忙；按文案「仍在推进不动作」应忽略。可接受；不做消息撤回。
9. **1 小时上限可能误杀合法长任务**：客户已选 1h；超过 1h 的合法任务会被中止。若未来需要，另议（不暴露 env 是当前决定）。
10. **`ANS_PI_PROMPT_TIMEOUT_MS` 语义变更**：旧用户设 120000 期待 2 分钟中止，现在变成 2 分钟检查 + 1h 兜底；需在 help/变更记录中如实说明。

**回滚**：把 `turnLastResortMs` 恢复为 `promptTimeoutMs`（或旧 120s）并恢复看护 0.9/「逼近超时」文案；设置 label/help 恢复；卡片文案恢复。代码改动集中在时限接线与文案，无数据/契约迁移。两步（检查、兜底）可分别回滚。

## 七、待客户决策项与建议默认

| # | 决策 | 建议默认 |
| --- | --- | --- |
| 1 | 到点检查是否重复（每次超过检查时限再检查） | **否，每轮一次**（客户「没卡死就不管他」） |
| 2 | 检查解除是否投「看护恢复」 | **不投**（检查不是故障；只清状态） |
| 3 | 1 小时兜底是否暴露 env | **不暴露**（固定常量 + 测试注入） |
| 4 | 检查时限是否也按有效运行时间（扣除确认等待） | **否，墙钟**（确认挂起期间排除；解除后可能立即到点）；如需一致，另项 |
| 5 | Claude/Codex 是否同策略 | **是**（三平台统一：检查 5min/1h 兜底）；设置面板仍 Pi-only |
| 6 | 1h 兜底文案 | 「本轮超过 1 小时最后兜底，已中止」；`outcome` 仍 `timed_out`，诊断码 `TURN_LAST_RESORT` |

## 八、派发顺序

| 步 | 角色 | 内容 | 依赖 |
| --- | --- | --- | --- |
| 1 | 运行时核心 | 常量/resolver/`turnLastResortMs`/服务整轮包装/错误标记 | 本评审 |
| 2 | Pi适配器、Claude适配器、Codex适配器 | 各自整轮包装改用 `turnLastResortMs`；补发段用检查时限；测试 | 步 1（并行） |
| 3 | 桌面窗口 | 看护 1.0/文案/每轮一次/解除；`role_status` 文案 | 步 1（可与步 2 并行） |
| 4 | 编排 | 看护文案单一来源（label/suggestion） | 与步 3 并行 |
| 5 | 门禁引擎 | su 卡看护职责 | 与步 2–4 并行 |
| 6 | 项目管理 | 设置 label/help/choiceLabels + 测试 | 与步 2–5 并行 |
| 7 | 桌面UI | 核实面板零改动（metadata 驱动）；如硬编码则同步 | 步 6 |
| 8 | 测试 | `test/测试/turn-watch-verify/` 独立端到端与真机清单 | 步 1–7 |
| 9 | 客户 | 真机设置 1 分钟检查、观察长轮次；1h 兜底由确定性测试证据 | 步 8 |

**同角色串行**；不同角色不并发写同一文件。真机不读凭据、不跑网络；测试用注入小值，不让客户等 1 小时。
