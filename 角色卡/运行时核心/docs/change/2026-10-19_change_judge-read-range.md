---
id: judge-read-range-runtime-core
type: change
title: judge_read_file 支持按范围定点抽查（字节/行）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [governance-judge-p1-runtime-core, shell-judge]
---

# `judge_read_file` 按范围定点抽查

## 背景（客户原话）

> 「决策agent 应该是别人给摘要，他再去判断吧，不是说要所有文件给他。」

编排正在把判断输入改为「请求方陈述 + 系统生成的结构化证据包 + 定点抽查」。本角色负责让判断 agent 的只读读取支持**定点抽查**，而不是只能整文件读取。

## 改动在哪（位置 → 改动）

1. `src/common/runtime-core/shell-judge/policy.ts`
   - 新增 `parseJudgeReadRange`（范围参数硬校验）、`readAt`（定位读取）、`scanLineRange`（行定位扫描：逐块、内存恒定）。
   - `resolveJudgeRead` 增加可选 `range` 输入；**不带范围时**仍走原整文件路径（从 0 读到 cap、只看返回数据前 8KiB 的二进制探针），行为与文案逐字不变。
   - 带范围时仍先做完整路径策略（原始路径拒绝集 → 敏感段 → realpath → 项目根前缀 → 真实路径敏感复查 → lstat 常规文件），随后**先探测文件头 8KiB 的 NUL**，返回片段本身再查一次 NUL——`offset`/`startLine` 不能绕过二进制拒绝。
   - 成功结果新增 `totalBytes` 与结构化 `range`（字节 `{offset,end,totalBytes}`；行 `{startLine,endLine?,totalLines?,requestedEndLine?,clampedToEof?}`），旧读者忽略。
   - 预算：调用次数仍 8 次；单次返回仍受 64KiB 单文件 / 192KiB 总量约束；`readBytes` 只计**实际返回**字节；行定位扫描另有 `maxScanBytes`（默认 8MiB，宿主可注入）只约束「找行号」的 I/O，不计入 `readBytes`。
2. `src/model/runtime.ts`
   - `JudgeReadCode` 增 `range-invalid`（非法范围参数）与 `out-of-range`（越过文件末尾/扫描上限）。两者均为**信息性结果**（同 `not-found`）：不计入 `deniedReads`、不影响 damageCode，但仍写入 `deniedPaths` 诊断。
   - `ShellJudgeToolOptions` / `GovernanceJudgeToolOptions` 的 `budget` 增可选 `maxScanBytes`（加法；旧调用方逐字兼容）。
3. `src/common/runtime-core/shell-judge/tools.ts`
   - `REASON_TEXT` 补两条新原因码；新增 `judgeReadSuccess` 统一回执（如实标注实际范围与截断）。
4. `src/common/runtime-core/governance-judge/tools.ts`
   - 复用同一 `resolveJudgeRead` + `judgeReadSuccess`——**shell judge 与治理 judge 同时获得定点抽查能力**，不复制第二份读取策略。
5. `src/provider/runtime/schema.ts`
   - `judge_read_file` 增可选 `offset`/`limit`（字节模式）与 `startLine`/`endLine`（行模式）；`required` 仍只有 `path`。
   - 描述加入「**可按范围定点抽查**」「字节/行二选一」「非法参数/越界如实拒绝」「整文件超 64KiB 或请求范围超预算才截断；按范围恰好读完请求片段（即使文件更大）不算截断」「读取被拒/被截断/预算不足时不得猜测未返回内容」。
   - `promptGuidelines` 增「大文件先列目录、再用范围参数定点抽查；不得为判断把整文件灌入上下文」。
6. `test/runtime-core/judge-read-range.test.ts`（新增 10 例）：无参数回归、字节范围、行范围（含 EOF 收敛/无尾换行）、越界与非法参数、敏感/二进制/realpath/项目根不可绕过、calls/bytes/truncated 预算计数、治理 judge 复用、schema 同步。

## 以前怎样 → 现在怎样（触发场景）

- **以前**：判断 agent 要核对一个 300 行文档里的第 200–210 行，只能 `judge_read_file` 读整文件；文件超 64KiB 时后段直接拿不到，只能靠猜或交回 manual。
- **现在**：`judge_read_file { path: "docs/plan.md", startLine: 200, endLine: 210 }` 只返回该段并标注「（第 200–210 行）」；该片段完整即**不产生 truncatedReads**（不会把定点抽查误判成读取受损）。
- **仍然不变**：不带范围参数时回执与上限逐字不变；`judge_list_dir` 行为与可见面不变；敏感路径、二进制、根外/符号链接逃逸、8 次/64KiB/192KiB 预算全部照旧。

## 范围与兼容

- 纯加法：新参数可选、新原因码为联合类型新增值、`budget.maxScanBytes` 可选；旧调用方与旧回执不受影响。
- 工具名、工具数量、judge allowlist、装配方式（`shellJudge`/`governanceJudge` 互斥、judge 模式工具面恰三只）均未变。
- 未改门禁、编排、适配器、桌面或任何其他角色文件；未改 `judge_list_dir`。

## 验证（本机 macOS arm64 / Node v24.14.0）

- `node --test "test/runtime-core/**/*.test.ts"`：**214 计 / 213 过 / 0 红 / 1 skip**（基线 204 计 / 203 过 / 0 红 / 1 skip；本批新增 10 例全绿）。
- `npm run typecheck`：**0 错**。过程中并行编排上下文在途文件曾出现 2 条瞬时错误（`src/common/编排/governance-judge.ts` 引用其未完成的 `governance-judge-evidence.ts`），其完成后最终复跑 0 错；本批未触碰编排文件。
- 未跑真实模型/凭据/网络；未 git 提交。

## 残余风险与跨角色事项

- **编排诊断文案**：`src/common/编排/shell-judge.ts::DENIED_READ_CODE_LABELS` 是 `Partial<Record<JudgeReadCode, string>>`，新增的 `range-invalid`/`out-of-range` 会回落到 pathClass 标签「受限路径」。仅手动回落卡的诊断展示，建议编排后续补两条中文标签（本角色不越界修改）。
- **字节模式对齐**：从多字节 UTF-8 码点中间开始的字节范围会以替换字符开头（用户显式指定字节偏移；行模式按行边界对齐，不受影响）。
- **行定位上限**：超大文件中远离文件头（默认 >8MiB）的 `startLine` 会按 `out-of-range` 如实拒绝，而不是扫描整文件；`maxScanBytes` 是宿主侧预算，不由模型控制。
- **适配器透传**：新参数是标准 JSON Schema 属性、`additionalProperties` 保持 `true`；三适配器是否完整透传可选参数到工具调用，需端到端验证（本层无法单独证明）。
