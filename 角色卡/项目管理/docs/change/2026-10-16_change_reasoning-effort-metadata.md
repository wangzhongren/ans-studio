---
id: reasoning-effort-metadata
type: change
title: G-5 推理强度设置元数据注册（choices 值域面 + 三平台字段）
created: "2026-10-16"
status: implemented
---

# G-5 推理强度设置元数据（项目管理切片）

依据：客户 2026-10-16「按推荐批准，开始实施」＝ G-5（推理与推理强度）实施（批准记录见 [kanban 修复审批件](2026-10-15_change_kanban-fixes-pm-review.md)「客户批准（2026-10-16）」节）。Wave 1 中本角色承接「`RUNTIME_SETTINGS` 增 `choices?` 元数据面＋三字段注册」。本切片**只登记设置元数据**；适配器读取/接线（wave 2）与桌面控件呈现不在本切片，不声称已接线。

## 改动

`src/common/shared/runtime-settings.ts`：

1. `RuntimeSettingField` 增可选 `choices?: readonly string[]`：有（非空）则该字段值域即选项、应以致选择控件呈现；缺省或空＝自由文本。接口注释明示沿「描述设置、非控件实现」的元数据纪律。
2. 三平台各增一字段（label 逐字「推理强度」、`required:false`、`secret:false`），键名取自 G-5 冻结符号 `ANS_CLAUDE_REASONING_EFFORT`/`ANS_CODEX_REASONING_EFFORT`/`ANS_PI_REASONING_EFFORT`：

| runtime | key | choices（值域＝平台真实档位） |
|---|---|---|
| pi | `ANS_PI_REASONING_EFFORT` | `off` / `low` / `medium` / `high` / `xhigh` |
| codex | `ANS_CODEX_REASONING_EFFORT` | `low` / `medium` / `high` / `xhigh`（**无 off**——平台无该档，如实不假装；字段上方注释说明） |
| claude | `ANS_CLAUDE_REASONING_EFFORT` | `off` / `low` / `medium` / `high` / `xhigh` |

3. help 三平台统一口径（逐字，单一常量 `REASONING_EFFORT_HELP`）：「留空＝维持平台默认（现状零变化）；档位依次为 关/低/中/高/极高（缺省档语义见平台）；思考计入输出 tokens。」——「留空＝未设＝逐字现状」为批准裁定的默认口径；档位名称梯 关/低/中/高/极高（Codex 无「关」由 choices 如实表达）；计费如实。

## 测试

`test/项目管理/shared/runtime-settings.test.ts` 2 → 6（+4，本角色边界内）：

- 三平台逐键在场、label 逐字「推理强度」、可选、非机密；
- choices 值域逐值相等，且 codex 不含 `off`（反向守卫）；
- help 三平台逐字统一；
- choices 元数据纪律：非空值域、选项为逐字非空字符串、机密字段不得挂 choices。

## 验证（2026-10-16，本机 macOS / Node v24.14.0）

- `npm run typecheck` → 0 错（`TSC_EXIT=0`）。
- `test/项目管理/**/*.test.ts` → **114/114**（含本件 +4）。
- 全量 `node --test "test/**/*.test.ts"` → **2002 tests / 2001 pass / 0 fail / 1 skip**（基线 1998/1997/0/1；+4＝本件新增，零新红）。
- 未 git 提交。

## 边界与消费方

- 只动 pm 边界内文件：`src/common/shared/runtime-settings.ts`＋专属测试＋pm docs。
- 消费方（桌面窗口 `app/desktop/runtime-config.ts` 只读透传字段元数据、桌面UI 设置面板 wave 2 接 `select` 控件、三适配器 wave 2 读取 env 键）须在各自落地时重测；本切片不代替。
- 桌面 v1 旧 Pi 面板（`app/desktop/pi-config.ts` 的 `PI_PANEL_KEYS`）不经本注册表，未动。
