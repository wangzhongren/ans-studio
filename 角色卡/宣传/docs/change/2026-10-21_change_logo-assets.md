---
id: logo-assets
type: change
title: 站点品牌图标替换为几何 A 标志
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [project-site]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按客户提供的新 logo 替换站点品牌位、favicon 与 apple-touch-icon
  - date: "2026-10-21"
    kind: implemented
    summary: 本地截图、资产与结构检查通过；未推送、未部署
---

# 站点品牌图标替换为几何 A 标志

客户 2026-10-21 提供两个新 logo 并要求替换站点现有图标。站点品牌位（账本栏与页脚）从旧的白底「括号-横杠」方块换成透明底的薄荷绿几何 A；favicon 改为石墨底 + 薄荷绿 A 的小方图标；新增 180×180 apple-touch-icon；不再被引用的 `ans-seal.png` 已删除。Role-first 印章里的括号符号与截图四角括号是“边界”的结构符号，未改动。

**仅本地完成**：线上仍是 `b00bc74` 部署的版本（旧图标）；本次改动**未推送、未部署**，角色文档仍在工作树未提交。

## 源文件与裁切

| 源（只读） | SHA-256 | 用途 |
| --- | --- | --- |
| `app/desktop/assets/ans-geometric-a-mint.png`（1254×1254，透明底） | `f76eca96…` | 深色界面品牌位、favicon 前景 |
| `app/desktop/assets/ans-geometric-a-graphite.png`（1254×1254，透明底，与 `output/branding/ans-studio-icon-graphite.png` 字节相同） | `479cc3ec…` | 保留给浅色场景/未来使用 |

- 实测 alpha 边界：x 110–1144、y 282–1039（图形约 1034×757），平均色 mint ≈ rgb(199,233,192)、graphite ≈ rgb(23,27,22)，与任务描述一致。
- 裁切：以图形中心裁 **1100×1100**，offset **(x=77, y=110)**，去掉多余透明留白，不拉伸；随后等比缩放到 512×512。方法为 Swift + CoreGraphics/ImageIO（`CGImage.cropping` + 高质量缩放），未修改源文件。

## 产物与使用位置

| 产物 | 尺寸 | 使用位置 |
| --- | --- | --- |
| `site/assets/ans-a-mint.png` | 512×512（33.6 KB） | 两页账本栏 `.brand img` 与页脚 `.footer-brand img` |
| `site/assets/ans-a-graphite.png` | 512×512（117.8 KB） | **未被站点引用**，保留给浅色场景/未来使用（石墨 A 不能在深底上辨认）；已在 feature 文档说明 |
| `site/assets/favicon.png` | 64×64（2.4 KB） | 两页 `<link rel="icon">`；**石墨底 + 薄荷绿 A** |
| `site/assets/apple-touch-icon.png` | 180×180（7.8 KB） | 两页 `<link rel="apple-touch-icon" sizes="180x180">` |
| `site/assets/ans-seal.png` | — | 已删除（无引用） |

favicon 方案：512×512 画布填充站点 token `#1b1b18`，薄荷绿 A 以 420×420 居中（四周约 46px ≈ 9% 内边距），再高质量缩放为 64 与 180。选石墨底而不是透明石墨 A：浏览器标签栏明暗不定，自带石墨底的图标在浅色与深色栏上都保持“薄荷 A + 深底”的同一观感。

## CSS 调整

- `.brand img`：桌面 30px → **34px**，移动 26px → **28px**，去掉 `border-radius`（新图形本身透明、无白色方块）。
- `.footer-brand img`：36px → **40px**，去掉 `border-radius`。
- 账本栏宽度、品牌字标与导航间距未变；360px 顶栏实测仍一行放得下。

## 验证（真实执行）

```bash
python3 -m http.server 8765 --directory site
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/                    # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/en/                 # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/assets/favicon.png  # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/assets/apple-touch-icon.png  # 200
```

截图（均已用 Read 实看）：

| 截图 | 入档副本 | 观察 |
| --- | --- | --- |
| 中文桌面首屏 1440×1000 | [desktop-hero-zh-1440x1000.png](2026-10-21_logo-evidence/desktop-hero-zh-1440x1000.png) | 薄荷 A 与 `ans` 字标基线协调；透明图形不再有白方块；印章与截图角标保持 |
| 英文桌面首屏 1440×1000 | [desktop-hero-en-1440x1000.png](2026-10-21_logo-evidence/desktop-hero-en-1440x1000.png) | 同上，英文导航下品牌位不拥挤 |
| 中文移动首屏 360×1000 | [mobile-hero-zh-360x1000.png](2026-10-21_logo-evidence/mobile-hero-zh-360x1000.png) | 28px A 与顶栏语言/版本/GitHub 一行放下 |
| 英文移动首屏 360×1000 | [mobile-hero-en-360x1000.png](2026-10-21_logo-evidence/mobile-hero-en-360x1000.png) | 同上 |
| favicon 浅/深底测试 | [favicon-light-dark-test.png](2026-10-21_logo-evidence/favicon-light-dark-test.png) | 64/32/16px 在白色与 #202124 上均清晰；16px 仍可辨认；石墨 A 在白底作为备选观感正常 |
| 中文页脚品牌位 1440 | [desktop-footer-brand-zh.png](2026-10-21_logo-evidence/desktop-footer-brand-zh.png) | 40px A 与页脚文字块平衡，不压过标题 |

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 结构 | 两页扫描 | 无缺失本地引用；无重复 id；外链 20 个且 `rel="noopener"` 无遗漏；图片均有 alt |
| 引用清理 | 对照 `site/assets/` 与两页引用 | 仅 `ans-a-graphite.png` 未引用（有意保留）；`ans-seal.png` 已删除 |
| 尺寸 | `sips -g pixelWidth -g pixelHeight` | 512/512、512/512、64、180，截图仍为 1360×980 |
| 横向溢出 | CDP 1440/390/360 两页 | `scrollWidth == innerWidth`，越界元素 0 |
| 线上状态 | curl 线上资源 | 线上 favicon 仍为旧文件（Content-Length 3623）、`ans-seal.png` 仍 200、`ans-a-mint.png` 404，证明本次未部署 |

## 自我批评与修正

1. 新图形没有白色底板，原来的 `border-radius` 会把透明图形裁出圆角缺口——已移除，并只靠尺寸与间距控制视觉重量。
2. 透明 A 的上下留白比旧方块多，30px 时视觉偏小；桌面调到 34px、移动 28px、页脚 40px 后与字标平衡。
3. favicon 若用透明石墨 A，在深色标签栏会几乎不可见；改为自带 `#1b1b18` 底的合成图标，浅/深背景都有稳定对比，并用 16/32/64px 测试图确认 16px 仍可辨认。
4. `ans-seal.png` 删除前先确认两页与 CSS 均无引用；`ans-a-graphite.png` 虽未引用但按客户意图保留，并在 feature 文档写明原因。

## 未做与限制

- **未推送、未部署**：线上仍显示旧图标（curl 已核对）；角色文档未提交。部署由客户/协调方执行。
- 未在真实浏览器标签栏/桌面快捷方式上验证 favicon 的最终渲染，只有自建的浅/深底对比图与 16/32/64px 观感检查；未做 iOS 主屏书签实测。
- 品牌位尺寸为视觉判断（34/28/40px），未做眼动或品牌测量；如需更精细的视觉平衡可再调 CSS。
- 两页仍无横向溢出；外链、事实链接与版本号未动；Role-first 印章与截图角标未替换。
