# 2026-10-19 深色主题正文提亮（客户「白的有点发灰」）

客户补充：深色主题下正文「白的有点发灰」。本批**只改 `--text` 一个令牌**：
`#E7E9EB` → **`#F2F4F6`**（近白，非纯白）。布局、字号、`--text-2` / `--text-3` 灰阶层次与其他令牌**零改动**。

## 改动

- `app/renderer/styles.css`：三处 `--text` 定义同步改为 `#F2F4F6`（`styles.css` 里存在三个 `:root`
  覆盖块——首层主题、v2 布局令牌块、A2 重量块；后者会覆盖前者，必须同时改，避免后层把提亮覆盖回旧值）。
- 未改 `--text-2 #A7ADB5` / `--text-3 #949BA4`：次级/三级灰阶保持原样，层次不被拉平；
  不使用 `#FFFFFF`（避免大面积纯白刺眼）。

## 对比度（WCAG 相对亮度，实测）

| 前景 | 背景 | 改前 #E7E9EB | 改后 #F2F4F6 |
| --- | --- | --- | --- |
| 正文 | `--bg #14171A` | 14.78:1 | **16.32:1** |
| 正文 | `--bg-side #1A1E22` | 13.77:1 | 15.20:1 |
| 正文 | `--bg-drawer #171B1F` | 14.22:1 | 15.70:1 |
| 正文 | `--bg-soft #1E2328` | 13.01:1 | 14.36:1 |
| 正文 | `--bg-hover #252A30` | 11.88:1 | 13.11:1 |
| 正文 | `--bg-selected #2A3037` | 10.94:1 | 12.08:1 |

参考：纯白 `#FFFFFF` 在主底为 17.99:1（未采用）。

## 测试（真实输出）

| 命令 | 结果 |
| --- | --- |
| `node --test test/桌面应用/renderer.test.ts test/桌面应用/tool-rows.test.ts` | **159 计 / 159 过 / 0 红**（A2 对比度断言改用 `#F2F4F6`，并新增「正文亮于次级文字」层次断言；阈值未放宽） |
| `ANS_VISUAL_V2_UI_ONLY=1`（改前，`#E7E9EB`） | **VISUAL_V2_PASS 54** |
| `ANS_VISUAL_V2_UI_ONLY=1`（改后，`#F2F4F6`） | **VISUAL_V2_PASS 54**（暗色表面扫描无回归） |
| `ANS_NOTICE_UI_ONLY=1`（证据刷新） | **SYSTEM_NOTICE_UI_PASS 6**（含同期「无文件目标」工具行检查；截图按新文本色刷新） |
| `node --test test/桌面应用/runtime-ui.test.ts` | 12 计 / 11 过 / 1 红＝既有基线（`localStorage` 源码守卫，HEAD 即红） |
| `npm run typecheck` | 0 错 |

## 改前 / 改后截图

- [before-visual-v2-1360.png](2026-10-19-text-brightness-evidence/before-visual-v2-1360.png) /
  [after-visual-v2-1360.png](2026-10-19-text-brightness-evidence/after-visual-v2-1360.png)
- [before-visual-v2-960.png](2026-10-19-text-brightness-evidence/before-visual-v2-960.png) /
  [after-visual-v2-960.png](2026-10-19-text-brightness-evidence/after-visual-v2-960.png)
- 报告：[before-report.json](2026-10-19-text-brightness-evidence/before-report.json) /
  [after-report.json](2026-10-19-text-brightness-evidence/after-report.json)
- 运行目录：`/private/tmp/ans-text-brightness-before`、`/private/tmp/ans-text-brightness-after`（隔离 user-data）。

两次运行使用**同一工作树、同一夹具与同一状态**，仅 `--text` 不同（改前 `#E7E9EB` / 改后 `#F2F4F6`）。

## 残余风险

- 近白正文在长时间阅读时对比度更高；如客户仍觉偏灰/偏亮，可只在 `#F2F4F6`–`#FAFBFC` 间微调，
  不影响其他令牌与灰阶层次。
- 主题块仍有三处重复 `--text` 定义（历史分层遗留）；本批只同步数值，未做令牌去重（避免超出「只改一个令牌」范围）。

## 改动文件

- `app/renderer/styles.css`
- `test/桌面应用/renderer.test.ts`
- 本文件、`changelog.md`、`docs/change/2026-10-19-text-brightness-evidence/`

未提交 git。
