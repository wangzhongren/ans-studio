# uiux-design-audit 新端 12 条 v3 失配（旧 DOM 夹具）

**运行**：`ANS_RENDERER_ENTRY=app/renderer/dist/src/index.html ANS_UIUX_OUTDIR=raw/design-audit electron test/桌面应用/e2e/uiux-design-audit.mjs`；exit 1；`error.txt` / stdout 记录 12 条 v3 断言失败。旧端同一套件在 S1 夹具 `#chat .tool-records` 为 null（script eval）即停，未见完整 v3 结果。

| v3 检查名 | 新端观测摘要 | 建议 |
| --- | --- | --- |
| `1-W1-行距16±1` | paneGap=0px | 重锚到新 `.chat-pane/.chat-row` 行距载体，或退役由新端几何检查覆盖 |
| `6-可见行≥9` | fullyVisibleRows=6 viewportH=576.4 | 阈值/视口重锚需 UIUX/PM；不得直接放宽 |
| `S3-无chip时尾行兜底` | chip 仍可见、current=null | 重锚到新 chip/tail 组件或退役 |
| `W6b-系统正文去前缀` | chip/body 未取到 | 重锚到新系统通知 DOM，或退役 |
| `W6-注入盒行高1.6` | mi-body lineHeight=undefined | 重锚到新注入盒类；不得改为存在性 |
| `S2-chip对齐阅读列≤8` | chipX 1088 / paneX 354 / diff 734 | 重锚到新阅读列；旧数据不适用 |
| `S1-截断目标仍可见` | rows=2、truncated=false | 重锚到新截断载体；不得弱化 |
| `11-W11-loading同款转轮` | null | 重锚到新 loading/转轮类，或退役 |
| `9-W9-徽标12pxSVG` | hasSvg=false, boxW=16.7, svgCssW/H=null | 重锚到新徽标 DOM |
| `9-W9-转轮0.9±0.2s` | anim 空 | 重锚/退役；动画阈值不得放宽 |
| `10-W10-尾行含转轮` | anim=null | 重锚到新尾行；不得删 |
| `12-reduced-motion静止弧` | null | 重锚到新 reduced-motion 实现 |

**处置建议**：由桌面UI/UIUX 提供新 DOM 等价锚点或明确退役并由新端 e2e 覆盖；测试不自行改产品断言。PM 批准前，这 12 条计入 5A NEW-FAIL/旧夹具缺口，不得视为通过。
