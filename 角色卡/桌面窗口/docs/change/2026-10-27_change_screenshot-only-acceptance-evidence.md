# 桌面窗口：验收/复核任务文案改为「最多截图、不得要求录屏」

- 日期：2026-10-27
- 角色：桌面窗口
- 触发：客户 ANS 规则——**验收标准/证据最多截图，不得要求或提供录屏；缺录屏不得判失败**。编排标准提示
  已由对应角色改好；桌面 `buildAcceptanceTaskMessage` / 自动验收任务与 gate 复核任务仍写「截图或录屏」，
  本次在桌面边界内收尾。
- 状态：实现与断言更新完成，typecheck 与桌面全量测试通过；未 commit、未重启应用、未独立验收。

## 改动

### 1. 验收/自动验收任务（`app/desktop/governance-advance.ts::buildAcceptanceTaskMessage`）

硬要求 ② 由：

> 附截图或录屏（你已有审批档 shell…）

改为：

> 附**真实运行截图（最多截图；不得要求录屏；缺录屏不判失败）**（你已有审批档 shell…）

保留：必须真实启动应用并向客户演示、启动命令/访问地址、审批档 shell、未演示或无证据不得建议 accept、
日志/校验输出/哈希/报告路径等既有要求。

### 2. gate 复核任务（`app/desktop/governance-advance.ts::buildGateReviewTaskMessage`）

visual gate 要求由「关闭 DEBUG 覆盖层后截图/录屏」改为：

> 关闭 DEBUG 覆盖层后截图（真实运行截图；最多截图；不得要求录屏；缺录屏不判失败）

保留：关闭 DEBUG、旧截图/DEBUG 覆盖层 ⇒ insufficient evidence、真实运行/演示、不得用旧证据冒充新候选。
同文件头部注释同步措辞（无行为变化）。

### 3. 测试断言

- `test/桌面应用/acceptance-dispatch.test.ts`：
  - 自动验收任务：断言含「真实运行截图 / 最多截图 / 不得要求录屏 / 缺录屏不判失败」，并用
    `doesNotMatch(/截图或录屏|截图\/录屏/)` 固定「录屏不得作为要求/选项」；
  - visual gate 任务：同上（同时保留关闭 DEBUG 覆盖层、insufficient evidence 断言）。
- `test/桌面应用/operator-wiring.test.ts`：
  - 任务消息断言更新为截图-only 四项 + 反向断言；
  - 硬要求逐字断言列表中的 ② 同步为新文案。
- 其他 fixture 中的「截图」（落盘截图、持久截图等）均为证据说明，不含录屏要求，保持原样。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | exit 0 |
| 受影响套件 | `node --test "test/桌面应用/acceptance-dispatch.test.ts" "test/桌面应用/operator-wiring.test.ts"` | **181/181 通过** |
| 全部桌面测试 | `node --test "test/桌面应用/*.test.ts"` | **708/708 通过** |

## 边界与跨角色

- 本角色只改 `app/desktop/governance-advance.ts` 与上述测试；未改角色卡/编排/运行时/工具/PM/skill/游戏项目。
- `app/desktop` 与 `test/桌面应用` 内已无「截图或录屏 / 截图/录屏」的**要求性**措辞；剩余「录屏」字样只出现在
  禁止句中（「不得要求录屏」「缺录屏不判失败」）与反向断言中。
- 门禁引擎/编排侧的截图-only 规则由其属主角色修改（`test/门禁引擎/screenshot-only-evidence.test.ts` 等），
  本角色只读复核，不代改。
- 未跑真实 Electron e2e；未 commit/push、未重启应用。
