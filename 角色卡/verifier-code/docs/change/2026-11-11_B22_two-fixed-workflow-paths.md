# verifier-code B22 记录：fixed 验收报告 evidence 纯路径口径（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「verifier-code」（独立固定上下文；B22 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 **B22**（RR16 失败修复）
- 基线 HEAD：`364ca98`（RR16 记录提交）

## 实施

`src/common/roles/verifier/index.ts` `FIXED_REVIEW_ROLE_SECTION`：

- 增加：「**报告证据格式**：`submit_report` 的 `evidence[]` 每项必须是纯项目相对文件路径（A12a `docs/quality/<flowId>-criteria-vN.md`、A12b `docs/quality/<flowId>-report-vN.md`、附件 `docs/verification/...`）；描述、结论与 hash 引用写在 summary 正文。收口按纯路径核验文件字节，描述文本不计为证据（应用缺失时按质量路径回退核验，但不得依赖回退）」。
- legacy 段/fixed 其它段未改；测试 `test/roles/verifier/verifier-fixed.test.ts` 保留通过。
- 应用侧回退由桌面窗口实现（`角色卡/桌面窗口/docs/change/2026-11-11_B21-B22_two-fixed-workflow-paths.md`）。

## 验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| verifier fixed 测试 | 含在受影响集 **221/222**（唯一 b31 merge 批跑抖动，隔离 9/9） | `角色卡/编排/docs/change/2026-11-11_B21-B22_two-fixed-workflow-paths_evidence/b2122-02-affected.tap` |
| `npm run typecheck` | exit 0 | 同目录 `b2122-01-typecheck.txt` |

## 候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/roles/verifier/index.ts` | M | 29,643 / 476 | `658cd9d1d1fc95f298c084fec1037c03e9ca4c12ac98d7d3e06302f0cd4f2bce` | +1/−0 |

## 限制

- 只改 fixed 静态文本；未运行真实模型/Electron，不声称 RR/B2 通过。
