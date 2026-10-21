---
id: lettermark-logo
type: change
title: 站点品牌位与 favicon 替换为 ANS Studio 字标
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [project-site]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按客户 13:14 下发的字标替换品牌位、favicon 与 apple-touch-icon
  - date: "2026-10-21"
    kind: implemented
    summary: 本地截图、资产、结构与视口检查通过；未推送、未部署
---

# 站点品牌位与 favicon 替换为 ANS Studio 字标

客户 2026-10-21 再次更换图标（「图标又换了，重新换一下」）。站点品牌位从上一版几何 A 换成新的 **ANS STUDIO 字标**：桌面账本栏与页脚用 13:14 的完整横版字标，移动顶栏用 13:12 的紧凑 `ANS` 字标；favicon 与 apple-touch-icon 从紧凑字标中取 A 字形，继续「石墨底 + 薄荷 A」方案。上一版 `ans-a-mint.png` / `ans-a-graphite.png` 已删除；Role-first 印章括号与截图四角括号保持不变。

**仅本地完成**：线上仍是 `77c5143` 部署的几何 A 版本；本次字标改动**未推送、未部署**。角色文档此前已随 `2983402` / `77c5143` 入库，本轮字标变更记录与站点改动尚未提交。

## 源文件

| 组 | 源（只读） | SHA-256 前缀 | 说明 |
| --- | --- | --- | --- |
| 13:14 主标志 | `app/desktop/assets/ans-studio-lettermark-mint.png` | `15f34d64…` | ANS + 小字 STUDIO，1024×1024 透明底 |
| 13:14 | `ans-studio-lettermark-graphite.png` | `c3dc8c74…` | 同形石墨版 |
| 13:14 | `ans-studio-lettermark-white.png` | `d00ae2cf…` | 同形白色版 |
| 13:12 紧凑版 | `ans-lettermark-mint.png` | `de248877…` | 仅 ANS，紧凑场景与 favicon 取形来源 |

实测 alpha 边界（阈值 α>2）：完整字标 x 80–943、y 357–668（864×312，约 2.77:1），平均色 mint ≈ rgb(199,233,192)、graphite ≈ rgb(23,26,22)、white = 255；紧凑字标 x 80–943、y 395–627（864×233，约 3.71:1）。

## 裁切、产物与使用位置

- 完整字标：按 alpha 边界裁掉透明留白（加 6px 内边距），等比缩放到高 240 → `site/assets/ans-studio-lettermark-mint.png`（649×240，`c065a5fb…`）；石墨版 `ans-studio-lettermark-graphite.png`（`055e087e…`）与白色版 `ans-studio-lettermark-white.png`（`c166b7f4…`）同尺寸保留，站点未引用（见下）。
- 紧凑字标：裁切后缩放到高 160 → `site/assets/ans-lettermark-mint.png`（572×160，`73c4e933…`）。
- 使用位置：
  - 桌面账本栏 `.brand`：完整薄荷字标，CSS 高 **38px**（宽约 103px），替代此前「图标 + 独立 `ans` 文字」组合；`<span class="brand-word">` 已移除。
  - 移动顶栏：`<picture><source media="(max-width: 1023px)" srcset="…ans-lettermark-mint.png">`，同一品牌链接内自动切换为紧凑 ANS，CSS 高 **26px**（宽约 97px）。
  - 页脚 `.footer-brand`：完整字标，高 **42px**（宽约 114px）；文字从「ANS Studio · MIT 许可证」简化为「MIT 许可证」+ 原英文定位行，避免与字标重复。
- 未引用但保留：石墨版给浅色场景/未来使用（白底可见），白色版给深色横幅等未来场景；两者均已在文档说明，不参与当前页面。
- 图形不做拉伸，全部按原始比例缩放；字标宽度由高度与比例自然决定，CSS 加 `object-fit: contain` 兜底。

## favicon / apple-touch-icon 取形

1. 先按任务建议试裁 A 区域（x 60–400、y 350–650）：由于新字标中 **A 与 N 相连**（列投影只有 N/S 之间有明显空隙，连通域分析中 A+N 为同一组件），该裁法在右侧带入 N 的竖笔残片，64px 下呈「A|」，观感不合格。
2. 放大核对接缝后，把裁切右缘收到 A 本体右缘（x 70–381、y 385–636，312×252），得到干净的 A 字形；512 画布填 `#1b1b18`，A 缩放为 420px 宽（约 82%）居中，再高质量输出 **64×64** `favicon.png`（`d8466861…`）与 **180×180** `apple-touch-icon.png`（`26741063…`）。
3. 与「完整 ANS 字标缩到 tile 80–85%」方案对比：完整 ANS 在 512/64 下清晰，但 16px 时三字母糊成一块；A 字形在 16px 仍可辨，因此选 A 方案。取舍已用对比图验证并记录在证据中。

## CSS 调整

- `.brand`：`min-height: 44px`、`padding: 0 10px`（与导航文字左对齐），去掉旧的方形图标尺寸与圆角规则；`.brand picture` 为块级，`.brand img` 用 `height/width:auto/max-width/object-fit`。
- 移动断点：紧凑字标高 26px、最大宽 112px；360px 顶栏（字标 + 语言切换 + `v1.4.0` + GitHub）实测不溢出。
- `.footer-brand img`：高 42px、宽 auto、最大宽 150px、无圆角；页脚文字块保留英文定位行。

## 验证（真实执行）

```bash
python3 -m http.server 8765 --directory site
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/                          # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/en/                       # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/assets/ans-studio-lettermark-mint.png  # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/assets/ans-lettermark-mint.png         # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/assets/favicon.png         # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/assets/apple-touch-icon.png # 200
```

截图（均已用 Read 实看；入档 `2026-10-21_lettermark-evidence/`）：

| 截图 | 观察 |
| --- | --- |
| [desktop-hero-zh-1440x1000.png](2026-10-21_lettermark-evidence/desktop-hero-zh-1440x1000.png) | 完整字标在 168px 账本栏内留足呼吸；ANS 清晰、STUDIO 在 38px 下可辨（5 倍放大图 `brand-zoom-5x.png` 确认）；与导航文字左对齐。 |
| [desktop-hero-en-1440x1000.png](2026-10-21_lettermark-evidence/desktop-hero-en-1440x1000.png) | 英文页同样成立；语言切换/导航未受影响。 |
| [mobile-hero-zh-360x1000.png](2026-10-21_lettermark-evidence/mobile-hero-zh-360x1000.png) | 紧凑 ANS 字标 + 中文/English + v1.4.0 + GitHub 一行放下。 |
| [mobile-hero-en-360x1000.png](2026-10-21_lettermark-evidence/mobile-hero-en-360x1000.png) | 英文页同上。 |
| [favicon-light-dark-test.png](2026-10-21_lettermark-evidence/favicon-light-dark-test.png) | 64/32/16px 在白色与 #202124 上都可见，16px 仍能认出 A；64 石墨字标/白色字标的保留观感也一并展示。 |
| [desktop-footer-brand-zh.png](2026-10-21_lettermark-evidence/desktop-footer-brand-zh.png) / [desktop-footer-brand-en.png](2026-10-21_lettermark-evidence/desktop-footer-brand-en.png) | 42px 字标与 MIT/英文定位行层级清楚，不再重复 ANS Studio 文案。 |
| [brand-zoom-5x.png](2026-10-21_lettermark-evidence/brand-zoom-5x.png) | 桌面品牌位 5 倍放大：STUDIO 字母可辨，未糊成块。 |

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 结构 | 两页扫描 | 无缺失本地引用；无重复 id；图片均有 alt；20 个外链 `rel="noopener"` 无遗漏；各 1 个 `<picture>` |
| 资产尺寸 | `sips` | 完整字标 649×240、紧凑 572×160、favicon 64、apple-touch 180；截图仍 1360×980 |
| 引用清理 | 对照目录与引用 | 旧 `ans-a-mint.png` / `ans-a-graphite.png` 已删除；仅石墨/白色完整字标未引用（有意保留） |
| 横向溢出 | CDP 1440/390/360 两页 | `scrollWidth == innerWidth`，越界元素 0 |
| 移动切换 | 360 截图 | `<picture>` 生效：桌面完整字标、移动仅 ANS |

## 自我批评与修正

1. A 取形第一次按建议范围裁切带入 N 竖笔残片（“A|”），64px 下明显；放大接缝后把右缘收到 A 本体，得到干净字形，并在文档记录原因。
2. 完整字标含 STUDIO 小字，一度担心 38px 下糊掉；5 倍放大确认字母仍可辨，保留完整字标不降级为紧凑版；移动端才用紧凑 ANS。
3. 品牌位最初左缘比导航文字靠左 4px，补 `padding: 0 10px` 对齐；页脚去掉重复的“ANS Studio”文字，改为 MIT + 定位行，层级更干净。
4. 新字标是横版，旧规则里的方形 `border-radius` 与固定 34/28/40px 尺寸全部移除，改为高度 + 等比宽度 + `object-fit: contain`。

## 未做与限制

- **未推送、未部署**：线上仍为 `77c5143` 的几何 A 图标；本轮字标变更与文档未提交。部署由客户/协调方执行。
- favicon 未在真实浏览器标签栏/iOS 主屏实测；浅/深底与 16/32/64px 为本地模拟图检查。
- 品牌位尺寸（38/26/42px）为视觉判断；STUDIO 在 1x 屏幕上较小但可辨，2x 屏幕更清晰。
- favicon 的 A 是从 ANS 字标中裁出的字形（字标中 A/N 相连），不是独立提供的 A 图标；裁切范围与取舍已记录。
- 外链、事实链接、版本号未动；Role-first 印章与截图四角括号未替换。
