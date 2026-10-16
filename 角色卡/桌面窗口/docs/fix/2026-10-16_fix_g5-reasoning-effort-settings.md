---
id: fix-g5-reasoning-effort-settings
type: fix
title: G-5 wave 2（桌面窗口）：设置保存链接受推理强度三新键（choices 值域校验）＋旧 Pi 面板键集核实与对齐
created: "2026-10-16"
updated: "2026-10-16"
status: 已实施待验证（本域单测全绿；独立验证与真机 E2E 待测试/root）
---

# G-5 wave 2（推理强度设置保存链）桌面窗口实施记录

依据：客户批准 G-5（推理强度）分批实施；PM 派发桌面窗口＝**设置保存链接受三新键**（`ANS_PI_REASONING_EFFORT` / `ANS_CODEX_REASONING_EFFORT` / `ANS_CLAUDE_REASONING_EFFORT`）。契约与元数据已落盘（**他方属主，只读消费**）：注册表 `src/common/shared/runtime-settings.ts`（`RuntimeSettingField.choices` 值域元数据；三运行时字段含 `推理强度`，`choices` 分别为 pi/claude＝`off/low/medium/high/xhigh`、codex＝`low/medium/high/xhigh`——**Codex 无 off 档**）；读取/归一单一来源 `src/common/runtime-core/reasoning.ts`（trim＋忽略大小写＝读取态归；未设/空＝平台默认；**绝不猜档**）；`RuntimeProviderOptions.reasoningEffort`（契约家，三适配器并行消费中）。

---

## 一、改动总表（全部在边界内）

| 项 | 落点（本角色文件） | 要点 |
|---|---|---|
| choices 值域校验 | `app/desktop/runtime-config.ts::saveRuntimeConfig` | 键过滤由 `.some()` 改为取 `field` 引用；**封闭值域字段（`choices` 非空）按值域校验**：trim 后非空且不在 `choices` ⇒ **如实拒绝**（`{ok:false, error:"<label>取值无效：仅接受 a / b / …（或留空维持平台默认）。"}`）、**不落盘、零副作用**（revision 保留、pendingProfiles 不动）；空串/纯空白 ⇒ **清除该键**（合法：留空＝平台默认）；合法值按 trim 后的**规范形**写盘。错误**不回显提交值原文**（沿凭据不回显纪律）。非 choices 字段行为**逐字不变** |
| 读取/往返 | 既有 `getRuntimeConfig`（逐字未改） | 遍历注册表字段 ⇒ 三新键自动入视图（值＋`choices`/`label`/`help` 元数据透传——渲染侧据 `choices` 呈现值域；**呈现控件属桌面UI**，本轮未动渲染面） |
| 生效语义 | 既有链（逐字未改） | 保存成功 ⇒ `profileRevision+1`＋`pendingProfiles.add(runtime)` ⇒ `application(runtime)` 判 `current`/`next-session`/`after-active-turn`（**在跑不打断**）；下一会话开启前 `prepareRuntimeProfile` → `applyRuntimeConfig`（逐字段搬 `.env`→env——新键照搬）——**新会话生效**，与派发口径一致 |
| 写盘 | 既有 `env-file.ts`（pm 属主，只读导入） | 三新键经既有原子写链；不新增写面 |
| 旧 Pi 面板 | `app/desktop/pi-config.ts::PI_PANEL_KEYS` | **结论（核实＋处理，见 §二）**：纳入 `ANS_PI_REASONING_EFFORT`（4→5 键），使**旧路径不静默失去写入面**；值域校验**不**在旧路径复制（单一来源＝注册表保存链） |
| 漂移守卫 | `test/桌面应用/pi-config.test.ts` | 面板键集与 `RUNTIME_SETTINGS.pi` 字段集**逐键对齐**断言——防「注册表新增字段、旧面板静默不可写」再现 |

## 二、旧 Pi 面板结论（核实：`PI_PANEL_KEYS` 的角色与处置）

**核实链（只读）**：
1. **生产面已被注册表面取代**：`pi-config:*` IPC 的两个 handler（`app/desktop/interface.ts:670-690`）在**未注入** `deps.getPiConfigFn`/`deps.savePiConfigFn` 时**委托注册表路径**（`getRuntimeConfig("pi")`/`saveRuntimeConfig({runtime:"pi"})`——读取/校验/生效全在彼处）；`app/main.ts:439-440` 的**生产接线不注入**这两个替身；渲染侧（`renderer.js:2636/2799`）同样**优先** `getRuntimeConfig`/`saveRuntimeConfig`、`getPiConfig`/`savePiConfig` 仅作旧 preload 回退。⇒ **用户可见的 Pi 面板路径上，三新键（至少 Pi 键）经注册表面已经可达**（读带 `choices` 元数据、写经本批新增的值域校验）。
2. **旧模块仍在本仓可导入**：`pi-config.ts` 的 `getPiConfig`/`savePiConfig` 仍是导出面（注入替身路径、直接导入者、历史测试使用），其 `PI_PANEL_KEYS` 是**旧路径的写入白名单**——若不加键，旧路径对 `ANS_PI_REASONING_EFFORT` **静默拒写**（过滤丢弃、appliedKeys 为空），正是「注册表已扩、旧面板静默不可达」类漂移。

**处置（纳入，非取代说明）**：`ANS_PI_REASONING_EFFORT` 纳入 `PI_PANEL_KEYS`（旧路径可读写该键；`missingPiKeys`/`PI_REQUIRED_KEYS` 不受影响——它是可选键）；**值域控件与校验不复制到旧路径**（单一来源＝注册表保存链；旧路径的视图形状 `PiConfigField` 本就不含 `choices`/`label` 元数据）。测试侧加**面板键集 ⇔ 注册表字段集逐键对齐**漂移守卫（不等即须显式评审）。

## 三、测试与证据（本机实测，2026-10-16）

- `test/桌面应用/multi-runtime.test.ts` 新增 1 例（G-5 推理强度设置）：**合法往返**（pi 提交 `" off "` ⇒ 规范形 `off` 写盘；读侧 `value=off`、`source=file`、`choices` 元数据透传、`required=false`；未设 claude 键 `source=default`）；**非法拒**（`max` ⇒ `ok:false`＋「推理强度取值无效：仅接受 off / low / medium / high / xhigh（或留空维持平台默认）。」＋revision 保留＋文件逐字节未动＋**错误不含提交值原文**）；**大小写**（`HIGH` 拒——写侧只收规范形，读侧宽松归一不借道写盘）；**值域按运行时**（codex `off` 拒〔无 off 档〕、`high` 收）；**空串清除**（纯空白 ⇒ `ok:true`、读侧 `isSet=false`）。
- `test/桌面应用/pi-config.test.ts`：面板键钉更新为 **3+2**＋**注册表对齐漂移守卫**＋反向守卫（provider 仍在外面、两个可选键均不入必填列）；新增 1 例旧路径读写 `ANS_PI_REASONING_EFFORT`（保存应用/重载/视图回填/缺项判定不受影响）。
- `test/桌面应用/` 全目录 **384/384**（382→384，净增 2）。
- `npm run typecheck` 全仓 **0 错**（复跑时点；期间 Claude适配器在飞探针曾短暂 9 错——其已自行修复，非本批）。
- 全量 `node --test "test/**/*.test.ts"` **2021 计 / 2019 过 / 1 红 / 1 skip**（skip＝既有 Windows 用例）。**唯一红**＝`test/测试/t29-pi-config-roundtrip.test.ts`「T29 往返：临时 .env 载入后…」:88——**test/测试 域旧钉**：该例断言 `[...PI_PANEL_KEYS].sort()` **恰为旧 4 键**，本批面板键 4→5（PM 派发的「纳入」选项，见 §二）即该钉的**正式移位点**——**待测试角色翻新（钉随面板键集更新）、按 PM 口径不处理**；本批范围行为零回归（其余 2019 项含全部桌面域、V2 批次既有钉、G-4 独立验证域行为钉均绿）。

## 四、未验边界与登记（如实）

1. **渲染侧 choices 控件不在本批**（`app/renderer/**` 属桌面UI）：当前视图已携带 `choices` 元数据；控件呈现（下拉/标签映射）与帮助文案随桌面UI 批次；本批为**服务端值域校验**（任何输入通道的最后防线）。
2. **test/测试 旧钉（预期红，待测试角色翻新）**：`test/测试/t29-pi-config-roundtrip.test.ts:88` 断言 `PI_PANEL_KEYS` 恰为旧 4 键——本批「纳入」处理（§二）使其转红；该文件仍钉「面板键恰 4/含 PROVIDER 反向守卫」旧口径，须由属主随 G-5 更新（选「说明取代」则此钉回到 4 键口径——两选项的钉子去向交 PM 与测试角色定）。**如实标注不处理**。
3. **旧路径无值域校验（有意）**：`pi-config.ts` 不复制 `choices` 判定（单一来源纪律）；其直接导入者（测试/历史）若写入非法值，读取侧归一为 `invalid`⇒按未设处理＋诊断（运行时核心已落，**绝不猜档、绝不毁会话**）。
4. 未碰 `src/**`（只读消费注册表/契约）、三适配器、`app/renderer/**`、`test/测试/**`；未 git 提交；未跑真实网关。

## 五、回滚

单点回滚：`runtime-config.ts` 的 choices 校验块（`field.choices` 分支）删除 ⇒ 保存恢复「只做键过滤＋URL 校验」旧语义（三新键仍可读写，仅失去值域拒收）；`PI_PANEL_KEYS` 还原 4 键 ⇒ 旧路径对推理键静默拒写（回到「注册表面单可达」）。测试两例可按批删除。

## 六、收尾件（PM 补派）：推理行**回放载体**落树

**背景**：桌面UI 的推理折叠行实时面已完成（`ev.detail.source==="reasoning"` → 折叠行）；**回放面**此前无结构化载体——`row.reasoning` 未落，回放回落「已思考」assistant 文本行。渲染侧（`renderer.js:3440-3443`）已按**行有 `row.reasoning`（对象）⇒ 推理折叠行**接入并有守卫钉，等待产出方补字段。

**改动（最小面，只增不改）**：
- `app/desktop/session-history.ts::ReplayRow` 增可选字段 `reasoning?: RuntimeReasoningDisplayDetailV1["reasoning"]`（逐字 `{text: DisplayTextV1, status, durationMs?}`；`model/runtime.ts` 冻结形；注释即契约）。
- `app/desktop/runtime-history.ts`（ANS 回放组织处）：行构造后，若 `event.kind==="message"` 且 `detail.source==="reasoning"` 且 `detail.reasoning` 为对象 ⇒ `row.reasoning = detail.reasoning`（**逐字透传**——脱敏/预算已在 Service 投影单点发生〔`src/service/runtime/session.ts:67-70` 读取侧同一投影单点、幂等归一〕，本层**不重投影、不碰内容**）；**其余行字段（kind/text/at/turnId/eventKind…）逐字不变**。旧数据/坏件（Service 读取侧把坏 `reasoning` 归投影为 `reasoning-diagnostic`）⇒ 无该字段 ⇒ 下落既有文本行路径逐字回落。旧 Pi JSONL 路径（`session-history.ts` legacy）不涉推理通道，零改动。

**测试**：`test/桌面应用/multi-runtime.test.ts` +1 例——seed 真实 `replay.jsonl`（投影形 reasoning 行＋坏件行＋普通行）过 `getSessionHistory`：①投影形**逐字** deepEqual（含 DisplayTextV1/status/durationMs——顺带钉住 Service 读取侧「存量投影形再投影幂等」）；②`kind/text/turnId` 保留；③坏件行与普通行**不带** `reasoning` 键（`Object.hasOwn` 负例）；④「已思考」摘要文本在投影行与坏件行都保留（旧渲染面回落面）。

**证据**：`test/桌面应用/multi-runtime.test.ts` **37/37**；`test/桌面应用/` 全目录 **389/389**；`npm run typecheck` 全仓 **0 错**；全量快照 **2045 计 / 2043 过 / 1 红 / 1 skip**——唯一红＝`test/测试/t29-pi-config-roundtrip.test.ts`（**test/测试 旧钉**：`PI_PANEL_KEYS` 恰 4 键断言，随 §二「纳入」处理移位、待属主翻新——与 PM 口径「test/测试 旧钉待翻新、非目标」一致；工作树多方并行，以复跑时点为准）。

**未验边界**：诊断形（`reasoning-diagnostic`）的**结构化回放载体**未建（渲染侧回放分支只读 `row.reasoning`；诊断行回放仍走文本摘要行——如需结构化诊断行，属另派）；渲染侧折叠交互属桌面UI（本轮零触碰）。
