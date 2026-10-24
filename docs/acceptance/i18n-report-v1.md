**风险档位：T2（跨角色/接口/契约/shared 变更）｜判定依据：客户闸门 1 确认的 i18n 方案 v1 + 实施前冻结的验收标准 v1（P1–P12，691 行）+ 技能 `references/testing.md` + 闸门 0/2 沟通记录｜选定检查：98 个产品/测试候选哈希复算、shared/renderer/desktop 受影响套件、I9 跨层集成 8/8、真实 Electron（`main.mjs` 4 次 fresh userData、200% 布局 zh/en 各 4/4）、双端 typecheck/build、`src/common/shared` 消费者重测、验收定向补充检查（en-US/zh-CN 确认卡与聊天头几何）｜复用证据：同候选的 I9 最终复跑原始日志与真实 Electron 证据（`角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/rerun-final/`；manifest 304/304 校验通过）；设置面板内切换→重启时间线按同候选文件哈希复用上一轮真实 Electron 证据（边界见 §三.3）｜消费者重测结论：shared 181/176/0/5、桌面应用 558/558、test-domain 822/815/1/6（唯一红为既有 Windows symlink EPERM）、装配 84/84、编排 810/809/1（既有 EPERM）、双端 typecheck 0——无新增确定性失败｜全量回归：**N/A**（T2 默认不全量；本变更未触发治理/权限/shared 属主/枚举/IPC 契约扩张等升档条件，且受影响检查与消费者重测已覆盖，无需升 T3）**

# 验收报告：国际化（i18n，变更 A）

- 任务 ID：`2026-10-23-i18n`；产品 flowId：`i18n`
- 验收标准：`docs/acceptance/i18n-criteria-v1.md` **v1**（691 行；SHA-256 `0d91d179a175dbdad361335a276b5f7b8319539d9dfa0a28f18b409ee204dae9`；blob `8a706111aa4c61f0c57c67b5a284cc0b22d3c330`），实施前冻结
- 验收基线：客户闸门 1 确认的 i18n 方案 v1 `docs/planning/2026-10-23_design_i18n.md`（SHA-256 `844db4798033ba09d8a6c7d3d4eb49b6a90a37a7b803853e5771ed45e1146eac`；blob `04a2bc81fbd528fa2e6d285af507dd85cccc25e3`）
- 上位依据：`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`（闸门 0/1/2 与实施授权均已确认；现行 SHA-256 `7e1cf8dbd15463552f7b75d36b1bb70663d12ee1e65f439d862416b5371c83b7`；写标准时的快照 `f3098298…` 已被追加内容取代，授权事实以现行记录为准）
- 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md`（SHA-256 `5ccc758fef0f900cc113cd82b51d9cfb722f9da9bd67790d03eefc5211c6551f`；blob `26dd276d2f3157986fefbfbcf3614d5cd0dd5d6b`，与闸门 2 确认一致）
- 变更包：`docs/scheduling/i18n-change-v1.md`（311 行；SHA-256 `c095b30804782b53730fd13f98187cc3aa9bad291ab4f23bc7e6b846ac00a5a9`；blob `da82c8468baa279d8987764f1a101182e7520fda`）
- I9 记录：`角色卡/测试/docs/change/2026-10-23_change_i18n-integration.md`（164 行；SHA-256 `9cec733085ff524f6a344d98e3ac99bf21007d830aac0f9e14a9a066d61203b5`；blob `b62a521d8da86a65b56a354586968cca767a74ee`；状态 `verified-by-tests-only`，**不是验收通过**）
- 候选：HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（`main`）+ 工作区未提交/未暂存内容
- 判定日期：2026-10-23
- 结论：**通过（当前候选）**
- 报告性质：独立验收报告；不是客户确认记录；不授权提交、推送、合并、发布或对外操作；不为目录授权 v3、治理写卡闭环或其他并行变更背书。

---

## 一、判定结论与总体依据

### 1.1 结论

当前候选（HEAD `ee59296` + 工作区 98 个 i18n 产品/测试候选文件）满足客户闸门 1 确认的 i18n 方案 v1 与实施前冻结的验收标准 v1 的全部适用验收项（P1–P12），判定为 **通过**。

通过仅表示当前候选满足标准 v1；不表示已提交、已推送、已合并或已发布，也不表示客户已另行验收确认。标准 §八 明确：只有匹配当前候选的通过结论才可用于放行；候选任何变化都会使本结论失效。

### 1.2 为什么不是返工或证据不足

- 98 个候选文件 `git hash-object` + `sha256sum` 全部复算一致（98/98，mismatches=0）；另 1 个共享组件登记文档（§3.5）也复算一致，但按包内声明只作登记/证据，不计产品候选。HEAD、暂存区（空）、工作树身份可复算。
- I9 最终复跑与真实 Electron 证据均产生于候选最后修改时间（17:17:31）之后（17:22–17:41）；证据目录 304 个文件 SHA-256 全部校验通过；构建产物与当前 `app/renderer/dist` 逐文件一致（`build==dist`），当前 dist 哈希与记录一致。
- 选定检查、跨层集成、真实 Electron、双端 typecheck/build 与 `src/common/shared` 消费者重测全部在当前候选执行；唯一失败为基线既有 Windows symlink EPERM 与已隔离分类的测试时序偶发，未发现 i18n 新增确定性失败。
- 标准列出的关键容器中，最终 I9 证据未单独测量确认卡与聊天头；验收按任务授权做了**只读定向补充检查**（真实 Electron + 当前 dist/preload + 临时 userData + 桩 IPC），en-US/zh-CN 在 960×620 与 200% 下均满足几何与可操作性要求（§三.4）。该检查未修改任何仓库文件。

### 1.3 T2 档位与检查面

- 档位核对：变更触及渲染层、主进程、共享消息目录/设置元数据与新增 `preferences:*` IPC，属跨角色/接口契约/shared 变更，按 `testing.md` 为 T2；未改变 shared 属主、角色边界、治理/权限、机器枚举，未把系统行改 key+params、未追溯历史、未纳入 CLI，未超出方案 §5.2/§5.3 偏好/IPC 契约。未发现应触发标准 §2.4 升档的情形，T2 成立。
- 选定检查：受影响角色单测/层测试（`test/项目管理/shared/`、`test/桌面UI/`、`test/桌面应用/` 精确文件与既有套件、`test/测试/` 跨角色与消费者）+ 跨层集成（`test/测试/i18n-integration.test.ts`）+ 真实 Electron（切换/重启证据、`main.mjs`、200% 布局、验收定向补充检查）+ `npm run typecheck`、`typecheck:renderer`、`build:renderer` + shared 消费者重测。
- 全量回归：**N/A**。理由：T2 且无治理/权限变更；证据足以建立跨层结论，未触发升档；N/A 不用于跳过受影响检查与消费者重测（二者均已完成，见 §四 P9/P10）。

---

## 二、候选复算与候选隔离

### 2.1 复算结果

| 项 | 实测 |
| --- | --- |
| `git rev-parse HEAD` | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（与包一致） |
| `git diff --cached --name-only` | 空（0 行，与包一致） |
| `git status --short` | 验收写盘前 201 条（工作树未提交；含本变更包、统筹 memo、其他并行变更上下文；条目不等于候选数）；本报告与 `docs/acceptance/memo.md` 写盘后为 203 条 |
| §三候选表逐路径 `git hash-object` + `sha256sum` | **98/98 一致，mismatches=0**；新增 20、修改 78（与 §一 声明一致） |
| §3.5 登记文档 | `角色卡/项目管理/docs/architecture/shared-components.md` blob `dfba3f62…` / SHA-256 `bb447604…` 一致（登记/证据，不计产品候选） |
| 候选最后修改时间 | 2026-10-23 17:17:31（`test/桌面应用/e2e/main.mjs`），早于 I9 最终复跑开始 17:22:49 |
| 候选稳定性 | 包内生成前/后两次快照逐行一致；本次独立复算与包值逐项一致 |

复算命令（临时脚本，未写仓库）：逐行解析变更包 §3.1–3.4 的 blob/SHA-256/路径三元组，对每路径执行 `git hash-object -- <path>` 与 `sha256sum -- <path>` 比对；实际输出与包内 98 行逐项相同。

### 2.2 候选隔离

- 98 个候选全部为 i18n 产品/测试路径（`src/common/shared/i18n/**`、`runtime-settings.ts`、`runtime-shared.ts`、`app/renderer/**`、`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、对应测试），**不包含**目录 v3、治理写卡闭环、验收返工排期、塔防 demo（`demos/`）、`.claude/`、发布配方或管理记录。
- 对 98 个候选的 **新增行** 扫描目录 v3 标记（`teamPlanSchema|writeDirs|directory-conformance|DirectorySpec`）：仅 4 个已知混合文件命中——`app/desktop/interface.ts`（20）、`app/desktop/governance-advance.ts`（24）、`test/桌面应用/interface.test.ts`（14）、`test/桌面应用/operator-wiring.test.ts`（2）。其余 94 个候选无 v3 标记。
- 混合文件分类（本报告**只对 i18n 面判定**）：
  - `app/desktop/interface.ts`：i18n 面为 `preferences:get`/`set-locale` 注册、偏好服务接线、用户可见文本 `mainT(...)`；v3/治理面为团队计划解析/写集校验等 hunk，不属本报告判定。
  - `app/desktop/governance-advance.ts`：i18n 面为返回给用户的系统行/提示（11 处 `mainT("main.governance.*")`）；v3 面为发给 agent 的任务文案（保持中文，未翻译），不属本报告判定。
  - `test/桌面应用/interface.test.ts`：i18n 面为偏好 IPC/降级/历史不追溯/en-US 断言；v3/治理面测试不属本报告判定。
  - `test/桌面应用/operator-wiring.test.ts`：i18n 面为 en-US 结果行断言；另有一处 v3 `teamPlanSchema: 2` hunk，不属本报告判定。
  - `test/桌面应用/e2e/main.mjs`：i18n 面为 `preferences:get`/`set-locale` 桩（同形、内存值、不写盘）与 I9 有界等待修复；无 v3 标记。断言语义未改（仍要求 `.hb-head strong` 出现状态标签）。
- 非候选上下文（明确不纳入本报告）：目录 v3 的 `src/model/runtime.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/{flow-state,govern-session,run-role}.ts`、`test/编排/**`、`test/门禁引擎/**`、`test/测试/governance-e2e-auto/**` 等（逐文件扫描其新增行，**0 个 i18n 标记**）；`test/桌面应用/acceptance-dispatch.test.ts`（治理写卡）；`demos/`、`.claude/`；角色 `docs/change/**` 与管理记录。本报告不对上述内容作通过判断，也不以本结论为其背书。
- 角色卡面：唯一治理性改动为 `角色卡/桌面窗口/boundary.md` 新增两条精确单文件条目（`acceptance-dispatch.test.ts`、`runtime-resolution.test.ts`），与闸门 2 授权的人事漂移校正逐字一致；`角色卡/编排/boundary.md` 的 1 行新增属目录 v3（`flow-state.ts`），非 i18n。`角色卡/项目管理/docs/architecture/shared-components.md` 为 P1 要求的共享组件登记；各角色 `api-spec.md`/`memo.md`/证据目录为角色自身文档（团队计划 §4.3 写集「按需」），不计产品候选。
- `app/renderer/dist/` 为被忽略构建产物、非候选；I9 以临时 outDir 证明 `build==dist`，本地复算当前 dist 四文件哈希与记录一致（`index.html c416361b…`、`index-CxoKnRiy.js d5f18e39…`、`index-BEwoJaDj.css 75cae32d…`、icon `ff88e313…`）。

---

## 三、证据有效性与复用

### 3.1 证据身份与完整性

- I9 记录 SHA-256 `9cec7330…`、变更包声明一致；状态 `verified-by-tests-only`，明确不是验收通过。证据目录 manifest `角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/sha256.txt` 自身 SHA-256 `0fd0ab69e6508c81cbf878752c469c2e9f8999993c9e9da96ccd48db7504b9a0`，304 条记录从 `docs/change/` 根执行 `sha256sum -c` **304/304 OK，0 failure**（含 `rerun-final/` 158 条与 I9 记录自身）。
- 环境（`rerun-final/environment.txt`）：Node `v24.22.1` / npm `11.19.1`；Windows_NT MINGW64 10.0.26300；git 2.55.0.windows.5；cwd 仓库根；HEAD 与 staged 0 与本次一致。

### 3.2 最终复跑计数（当前候选；原始日志可复算）

| 检查 | 实测 | 原始日志 |
| --- | --- | --- |
| `test/测试/i18n-integration.test.ts` | **8 tests / 8 pass / 0 fail / 0 skip，exit 0** | `rerun-final/i18n-integration.log` |
| `test/项目管理/shared/**/*.test.ts` | **181 / 176 pass / 0 fail / 5 skipped，exit 0**；guard **6/6**，`scanned=107 allowlisted=18 violations=0`；5 skip 为既有 D3 平台跳过（基线同为 5） | `rerun-final/shared.log` |
| `test/桌面UI/**/*.test.ts` | **195/195 pass，exit 0** | `rerun-final/desktop-ui.log` |
| `test/桌面应用/**/*.test.ts`（串行最终 run2） | **558/558 pass，exit 0**；首轮 557/1 为「可重入门禁 readiness 恰一次派发」时序偶发，`interface.test.ts` 隔离 119/119、精确用例 1/1、复跑 558/558 | `desktop-app-serial-run2.log`、`desktop-app-isolate-interface.log`、`desktop-app-isolate-reentry-test.log` |
| `test/测试/**/*.test.ts`（串行最终 run2，PATH 含 Node） | **822 / 815 pass / 1 fail / 6 skipped，exit 1**；唯一红＝`g4-skill-verify` 既有 Windows symlink EPERM；首轮 `t9-block3` `spawn node ENOENT` 为环境调用问题，带 PATH 隔离 20/20 | `test-domain-serial-run2.log`、`test-domain-isolate-t9-block3.log` |
| `test/装配/**/*.test.ts` | **84/84 pass，exit 0** | `rerun-final/assembly.log` |
| `test/编排/**/*.test.ts` | **810 / 809 pass / 1 fail，exit 1**；唯一红＝既有 Windows symlink EPERM | `rerun-final/orchestration.log` |
| `npm run typecheck` / `typecheck:renderer` | 均 exit 0、0 错 | `typecheck*.log` |
| `npm run build:renderer -- --outDir <临时>` | exit 0；`build-hashes.txt` 与 `dist-hashes.txt` 逐行一致（`build==dist`） | `build-renderer.log` |
| `main.mjs`（真实主进程/preload/dist，fresh 临时 userData） | 4 次：run1/3/4 `E2E_PASS=true`、`E2E_FAILURES=` 空；4 次 `REPORT_STATUS_UNREPORTED/FAILED/ABORTED` 全 true；run2 仅 `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` 一次时序失败 | `e2e-main-fresh-{1,2,3,4}/report.txt` |
| 200% 布局冒烟（真实 dist/preload，临时 userData，桩 IPC） | zh/en 各 **4/4 checks、0 failure、零 console error**；960×620 保存按钮中心命中、侧栏 208、`doc.sw=cw`；480×310（200%，dpr2）保存按钮命中、面板可滚、保存条 sticky、滚到底仍命中 | `layout-200pct-{zh,en}.log`、`layout-200pct/{zh,en}/report.json` + 各 3 张截图 |

**失败分类**：唯一确定性失败为基线既有 Windows symlink EPERM（test-domain `g4-skill-verify`、编排各 1），与基线 9 条 EPERM 清单同类；`SESSION_REPAIR…NO_USER_BUBBLE` 与桌面应用 readiness 为已隔离复跑通过的测试时序偶发（后续行数四次运行一致收敛 34/35/36，无持久重复行），均非 i18n 产品回归。未把 `skip`/`todo` 计为通过。

### 3.3 真实 Electron 切换/重启证据的复用边界（P2）

- 上一轮 I9 真实 Electron 时间线（`e2e-i18n/`，16:51–16:54）记录了：首次启动 `lang=zh-CN`、无镜像、偏好文件不存在；切 en-US 后 `lang=en-US`、镜像 en-US、窗口标题 `ANS Desktop (Governed Sessions)`、偏好文件 `{version:1,locale:"en-US"}`（SHA-256 `e8639364…`）；同 userData 重启仍 en-US；项目切换仍 en-US；切回 zh-CN 后重启仍 zh-CN（偏好文件 SHA-256 `63b686fb…`）。
- 最终候选未重跑完整手工时间线。复用判定：该路径的产品文件与最终候选**逐文件哈希相同**（`app/desktop/preferences.ts`、`i18n.ts`、`runtime-config.ts`、`runtime-resolution.ts`、`interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/src/i18n/{index,locale-store}.ts`、`app/renderer/src/chat/runtime-config.ts`、`src/common/shared/i18n/**`、`runtime-settings.ts`、`runtime-shared.ts`）；最终 dist 的 JS 内容 SHA-256 与该轮记录相同（`d5f18e39…`）。唯一产品差异为 `app/renderer/src/shell/phase4a.css`（新增 `@media (max-height:480px)`，只影响 ≤480px 高的 200% 视口，不影响 960×620 的切换/重启行为与渲染）。因此同输入/同依赖/同命令的复用成立，复用边界写为：**切换/重启/项目切换结论来自同哈希文件与同内容 JS 的上一轮真实 Electron 证据；最终候选新补的 200% 布局证据与集成测试 #5 独立覆盖持久化与布局侧**。
- 首次启动“不写偏好文件”另有当前候选 `test/项目管理/shared/i18n.test.ts` 与 `i18n-integration.test.ts` #2 的直接文件存在性断言；损坏/非法 locale/不可写降级由 #2/#3/#4 的原始输出覆盖。

### 3.4 验收定向补充检查（确认卡 / 聊天头几何）

标准 P6 的关键容器含 `header` 与 `confirm card`，I9 最终证据只详细测量了设置面板/侧栏/标题栏/聊天区。验收以只读方式补充（未改代码）：

- 命令：真实 Electron（当前 `app/renderer/dist` + 真实 `app/preload.cjs`，临时 userData，桩 IPC），`INIT_LOCALE=en-US` 与 `zh-CN` 各一次；脚本与输出在系统临时目录（`C:/Users/51054/AppData/Local/Temp/ans_i18n_accept/confirm-layout-smoke.mjs`、`out-en/`、`out-zh/`）。
- en-US 960×620：确认卡 `640×350.5`、位于视口内；卡 `scrollWidth=638=clientWidth`；动作行 `602=602`；`#sc-allow`（"Approve and run"，136.27×32）与 `#sc-deny` 中心命中且文字未裁切；聊天头 `752=752`、`#right-tabs 335=335`；`doc.sw=cw=960`；零 console error。
- en-US 200%（CSS 480×310）：卡 `432×246` 位于视口内、`scrollWidth=420=clientWidth`、动作行 `384=384`；卡片为可滚动容器（`scrollMax=157`），**滚动到底后** Approve/Deny 均中心命中且可点；命令 `<pre>` 为 `overflow-x:auto` 的有意横向滚动容器（非 ellipsis 裁切）；标题 `scrollWidth=clientWidth` 未被截断；零 console error。
- zh-CN 对照：960×620 按钮直接命中（"放行执行"/"拒绝"）；200% 同样经卡片滚动后可达（`scrollMax=138`）；其余几何与 en 同构。
- 说明：补充脚本自身把“200% 首屏按钮在卡内折叠线以下”“命令 pre 横向滚动”“模态覆盖聊天头导致 header 命中测试为 false”计为失败，属脚本判定口径问题；按标准“允许有意的内部滚动容器，但须可见/可操作并记录”，确认卡滚动可达、命令块可横向滚动、模态打开时背景不可点是预期行为，均不构成产品缺陷。

---

## 四、P1–P12 逐项判定

| ID | 方案条目/标准摘要 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 实际观察 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | 单一消息目录/唯一实现；en-US 类型齐全；渲染层 facade 只再导出；项目管理唯一写入并登记共享组件；shared 纯模块 | 目录/文件清单、typecheck/build、parity/类型负例、facade diff、二次实现扫描、登记 diff | `src/common/shared/i18n/`（9 文件，§3.1 #1–8，blob/SHA 复算一致）；facade `app/renderer/src/i18n/index.ts`（`5fe20dd6…`）仅 `export … from` shared + store/`useT`；扫描：`new Intl.PluralRules(`、`i18n.missing-key`、`PRODUCTION_CATALOGS`、`export const zhCN/enUS` 均唯一（format/translate/messages）；`i18n.test.ts` `@ts-expect-error` 类型负例（`npm run typecheck` 含 test 目录）；`rerun-final/typecheck*.log` 0、`build-renderer.log` 0、`shared.log` guard 6/6；登记 `shared-components.md`（blob `dfba3f62…`/SHA `bb447604…`）组件 9 | 98 候选复算一致 | 项目管理、桌面UI | 单一目录/单一 resolver；facade 无第二份目录；en-US 缺/多 key 编译失败；shared 只含相对导入（无 Node/DOM/Electron）；共享组件已登记 | pass |
| P2 | 设置可切换并立即生效；`preferences.json` 权威、localStorage 镜像；重启/项目切换保持；原子写/损坏/非法值/不可写降级；首次启动不写文件 | store/preferences/IPC 单测、真实 Electron 时间线、偏好文件内容与哈希、镜像观察、临时 userData | `i18n-integration.test.ts` #2/#4/#5（8/8）；`interface.test.ts` 偏好 IPC 用例（558/558 内）；`e2e-i18n/` 时间线（`zh-settings.json`/`en-settings.json`/`restart-en-state.json`/`back-to-zh.json`/`restart-zh-state.json`/`project-switch-en.json`）；偏好文件 SHA-256 `e8639364…`（en）/`63b686fb…`（zh）；`layout-200pct` 复验设置视图 | 复用证据 + 当前候选集成测试 | 桌面窗口、桌面UI、测试 | 切换立即更新 store/lang/镜像/标题；文件形状 `{version:1,locale}`、原子写；首次启动无文件不写；损坏→zh+`preferences.read.invalid`；非法 locale→zh+`preferences.locale.invalid`；写失败 `ok:false` 不改内存；重启/项目切换保持；镜像以文件校正。复用边界见 §三.3 | pass |
| P3 | 默认 zh-CN 不跟随 OS；`document.documentElement.lang` 随 locale；渲染层经 facade 消费；AST 守卫与允许清单逐批收紧；范围外零误改 | resolveLocale 测试、OS 来源 grep、lang 观察、import 扫描、守卫/允许清单、diff | `i18n.test.ts` locale/resolveLocale 用例；`grep app src` 无 `app.getLocale`/`navigator.language`；`index.html` 静态 `lang="zh-CN"`；`e2e-i18n` 的 lang 四值（zh-CN→en-US→重启 en-US→切回 zh-CN/重启 zh-CN）；`grep` 渲染层仅 facade/locale-store 导入 shared；`shared.log` guard `scanned=107 allowlisted=18`、6/6；允许清单 62→20→18（记录 `allowlist-tighten.md`）；范围外 diff 见 P11 | 当前候选 | 桌面UI、项目管理 | 默认不跟随 OS；lang 随切换/重启正确；组件只经 `@/i18n` 消费；守卫落地、allowlist 无陈旧条目；未迁移文件均在 18 条允许清单内且有分类理由。注：设计 §4.9.4 的“重复文案自动扫描”未落为常驻测试；验收独立扫描当前目录：zh 重复组 0；en 16 组（多为通用短词，另 `ui.settings.language.saveFailed`/`preferences.error.saveFailed` 英文长句相同，源自两条不同中文，未合并）——记为过程残余，不改变 zh 参考目录与行为结论 | pass |
| P4 | `{param}` 插值；`Intl.PluralRules` 复数；en→zh→key 回退；缺失 key/参数诊断稳定不翻译；`Intl` 数字/日期薄封装 | 单元矩阵原始输出、诊断断言、parity、正常路径无缺失诊断 | `i18n.test.ts`（locale/parity/回退×4/插值×5/复数×5/诊断/Intl 封装等 25 例）；`i18n-integration.log` #1；目录 1236 key parity；`shared.log` 181/176/0/5；缺失参数用真实 key `main.runtimeConfig.integerBound` 触发；诊断码 `i18n.missing-key`/`i18n.missing-param` 为 ASCII | 当前候选 | 项目管理 | 插值 String()、缺参数保留 `{param}` + warning；复数 en one/other、zh other、缺变体回退 other、缺 other 返回 key+error；回退顺序正确；非法 locale 回退 zh；正常套件未出现缺失诊断（parity/类型/映射测试均绿） | pass |
| P5 | roleId/cardKind/GovernanceFunction/flow step id/事件/日志码/协议字段/测试标识不翻译 | 范围外 diff、grep、协议/IPC 清单、测试标识 diff、en-US roleId 观察 | 目录 key 全 ASCII（1236/1236，键内无中文/roleId）；`project-switch-en.json` roles `["su","B"]`（roleId 原样）；`preload.cjs` 仅新增三方法、`interface.ts` 仅新增两通道；`src/model`、`src/common/门禁引擎`、`src/pipeline`、`src/service`、`src/provider` 的 i18n 标注扫描 0；测试标题有 4 处随语义更新（F1/F2/C2 的 label→labelKey、source-guard 增加语言镜像），均为中文标题、无 fixture id 改动，无断言标识改名 | 当前候选 | 项目管理、桌面窗口、桌面UI | 机器标识与协议字段未翻译/未改名；en-US 下普通角色仍显示 roleId；仅新增约定的 3 个 preferences 通道；测试标识未导致旧断言失效 | pass |
| P6 | en-US 960×620、侧栏 208、标题栏 36、保存条 64、200% zoom 无关键溢出；截断有 title/aria；按钮可操作 | 真实 Electron 几何 JSON/截图、title/aria 清单、可点击性 | `layout-200pct-{zh,en}.log` 与 `report.json`（各 4/4）；`e2e-i18n/geometry-960-en.json`（`doc.sw=cw=960`、sidebar 208、截断项 `project-name/path` 均有 `title`、关闭/保存/语言选择中心命中）；`geometry-200pct-*.json`（聊天/主区无水平溢出）；验收定向补充检查（§三.4：确认卡/聊天头 en+zh，960/200%） | 当前候选 + 同哈希 UI 文件的历史几何 | 桌面UI + 验收补充 | 两种 zoom 下 doc 无水平滚动；标题栏/侧栏/主区/设置面板/保存条/确认卡/聊天头均无水平溢出；截断元素有 title；保存按钮与确认卡 Approve/Deny 可点（200% 时在卡内滚动后可达，卡为有意滚动容器）；零 console error | pass |
| P7 | zh-CN 输出逐字不变；旧中文断言不改且通过；默认参数 zh-CN；新 en 断言独立 | 旧测试原始输出、zh 文案对照、测试 diff、zh 等价证据 | `zh-equivalence.log`（294 checks / 0 fails，旧/新纯逻辑输出对照）；`shared.log` 的 **B4 零变化快照**、key 映射与 key 契约测试；`desktop-ui.log` 195/195（`status.test.ts`/`role-view.test.ts` 等未改文件仍绿）；测试 diff：`runtime-settings/multi-runtime/g5/t29/turn-watch` 均为 label→labelKey 等价迁移 + 新增 en 断言；`boundary-refresh.test.ts` 4+/3-、`b-establish.test.ts` 守卫改为 keyed translate + zh 逐字断言（均已记录、强度不降）；`main.session.rebuiltSkills/Boundary` 目录值与 HEAD 逐字一致 | 当前候选 | 项目管理、桌面UI、桌面窗口 | 旧 zh 断言未改写或仅作有记录的源码守卫迁移；目录 zh 值逐字保留；默认 zh-CN 输出不变；en 断言独立 | pass |
| P8 | preferences IPC/preload；窗口标题/对话框/启动错误框/系统行/应用错误按 locale；外部错误原文保留；历史不追溯；既有 IPC 载荷形状不变 | interface.test 原始输出、preload/main/platform diff、标题/对话框观察、历史切换、外部原文测试、载荷 diff | `interface.test.ts` 偏好 IPC 用例（5624–5760：get 形状、成功广播、非法/写失败、旧文本不追溯、desktopTexts zh/en 逐字、main.ts 接线源码断言）；`session.test.ts`/`operator-wiring.test.ts`/`multi-runtime.test.ts`/`pi-config.test.ts` en-US 生成点断言；`preload.cjs` 仅三方法、`platform.ts` 类型同步；`main.ts` 建窗前读偏好、`showErrorBox(startupText…)`、`win.setTitle(desktopTexts…)`；`e2e-i18n` 标题 en/zh 与重启；外部错误 `{detail}` 为 `err.message/opened.error` 原样参数（`interface.ts:4897`、`session.ts:2319` 等），插值原样输出由 P4 矩阵验证 | 当前候选 | 桌面窗口 | 三通道按契约工作、成功才广播/持久化；标题/对话框/启动错误框取词按 locale；en-US 系统行/错误生成点有单测输出；旧文本不追溯有直接断言；既有载荷形状未变。边界：无真实 Electron“系统行”e2e 观察（窗口标题为真实 Electron 主进程文本观察），外部错误原文保留以代码审计 + 插值矩阵为证据，无专门外部错误 e2e | pass |
| P9 | `RUNTIME_SETTINGS` label/help/choiceLabels key 化且仅一份；主进程解析；渲染层契约不变；字段集/必填/choices/secret/fallback 不变；消费者重测 | runtime-settings diff、字段集对比、zh/en 视图输出、设置面板 e2e、消费者原始输出 | `runtime-settings.ts` diff（label→labelKey、help→helpKey、choiceLabels→choiceLabelKeys；`key/required/secret/fallbackKeys/choices/control/integer` 未变）；`runtime-shared.ts` demo→语言中性 `"demo"` + `RUNTIME_LABEL_KEYS`；`shared.log` 14 项 runtime-settings 测试（零变化快照/逐字段 key 映射/key 契约/choices 纪律）；`i18n-integration.log` #6（zh/en 视图、IPC 无 labelKey/helpKey/choiceLabelKeys）；`multi-runtime.test.ts` en-US 用例；`e2e-i18n/en-settings-after-reopen.json`（英文 label/help/choices）；消费者：shared 181、桌面应用 558（multi-runtime/pi-config/interface）、test-domain 822（g5/t29/turn-watch）、装配 84、编排 810、typecheck 0 | 当前候选 | 项目管理、桌面窗口、测试 | 元数据仅一份 key 表达、主进程按 locale 解析、渲染层契约不变；字段集/必填/choices/secret/fallback 零变化；所有实际消费者套件重测，无新增确定性失败；渲染层不导入 `runtime-shared.ts` | pass |
| P10 | 选定检查在当前候选执行；原始输出可复算；不弱化断言；e2e/typecheck/build 齐全；失败分类正确 | 命令/退出码/环境/计数、失败原文、候选哈希、diff/status、证据清单 | §3.2 全部日志；候选最后修改 17:17:31 < 复跑开始 17:22:49；manifest 304/304；`git-status-short.txt`/`git-diff-name-only.txt`；测试 diff 扫描（删除行均为字段迁移/守卫 key 化，无删除断言、无放宽比较、无 skip 化）；EPERM/时序分类见 §3.2 | 当前候选 | 测试、统筹 + 验收复核 | 检查齐全且可复算；无弱化断言；唯一红为基线既有 EPERM，时序偶发已隔离复跑；T2 不做全量回归且记录理由 | pass |
| P11 | CLI/提示词/文档/模型输出不翻译；治理/权限/边界/发布配置不改；无新依赖/新枚举 | 路径 diff、package.json diff、范围外哈希、grep、依赖清单 | `package.json`/`vite.config.ts`/`tsconfig.json`/`app/renderer/tsconfig.json`/`app/renderer/index.html`/`src/index.ts`/`src/interface/cli/**` **零改动**；无新增依赖；无新枚举；`src/model/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、`src/service/**`、`src/provider/**` 的 i18n 标记 0（其工作树改动为目录 v3 上下文，不属本候选）；未写 `docs/verification/`；角色卡仅登记 + 授权边界补条目 + 角色自身 docs；无发布配方改动 | 当前候选 | 项目管理、桌面UI、桌面窗口 | 范围外零 i18n 改动、无新依赖/枚举、CLI 未纳入且零改；治理/边界未被 i18n 改写（boundary.md 两行为闸门 2 授权的人事校正） | pass |
| P12 | 文档状态如实：implemented-unverified ≠ 验收通过；不提前声称 verified | 文档 diff/状态行、交付说明、报告路径分离 | 项目管理/桌面UI/桌面窗口/测试 B0–B4 记录均 `implemented-unverified`；I9 记录 `verified-by-tests-only` 并明确“不是独立验收通过”；变更包“待独立验收”；无角色自写验收结论；无 `docs/verification/`；本报告为独立验收另写 | 当前候选 | 各实施角色、统筹 | 状态如实、文档分离、无提前 verified；已知状态漂移（方案/团队计划文件头、沟通记录哈希快照）已在包内如实记录并以确认记录为准 | pass |

---

## 五、残余风险与证据边界

以下均**不构成 fail**，但应与通过结论一并转达：

1. **已打开设置面板的主进程字段不随切换即时刷新**（I9 观察，最终候选未重测；相关文件哈希与观察轮一致）：语言区与渲染层自组文案立即切换，窗口标题立即切换，但主进程已推送的 `label/help/choices` 保持旧语言，关闭重开设置后按新 locale 生成。按已确认方案 §4.7/§4.9 的“主进程在构造设置视图时解析 key、后续新文本用新 locale”口径，不判 fail；作为 UX 残余（可选后续改为 locale 变更时重取设置视图）。
2. **重复文案自动检查未落为常驻测试**：设计 §4.9.4/标准 P3 提到长度 ≥4 重复文案扫描；实际以 key 复用规则 + 目录盘点（`key-inventory.tsv`）执行。验收独立扫描当前目录：zh 重复组 0；en 16 组（多为通用短词；`ui.settings.language.saveFailed` 与 `preferences.error.saveFailed` 英文长句相同，源自两条不同中文）。建议项目管理后续补常驻扫描/白名单；不影响 zh 参考目录与行为。
3. **外部错误原文保留无专门 e2e/test 输出**：以 `{detail}` 全部调用点的只读代码审计 + `translate` 插值原样输出的单元矩阵为证据；未观察到真实 SDK 错误在 en-US 的端到端展示。
4. **无真实 Electron 系统行切换 e2e**：主进程用户可见文本的 locale 行为由 en-US 生成点单测 + 真实 Electron 窗口标题覆盖；未在真实 Electron 中触发派发失败/应用错误系统行。
5. **测试时序偶发（桌面窗口 owner）**：`main.mjs` 的 `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` 4 次中 1 次；桌面应用「可重入门禁」全量首轮 1 次（隔离/复跑通过）。均已隔离分类，非 i18n 回归；`main.mjs` 本轮 3/4 `E2E_PASS`，三项 REPORT_STATUS 4/4 true。
6. **基线既有 Windows symlink EPERM**：test-domain `g4-skill-verify` 与编排各 1 项，历史基线同类；不新增，但相关套件终态仍 exit 1。
7. **`i18n-electron-smoke.mjs` 未落盘为常驻交付物**：真实 Electron 切换/布局证据由桌面UI B4 冒烟脚本与测试临时 CDP 脚本产出；证据存在，脚本非常驻。
8. **未验证**：真实在线模型会话、非 Windows、打包应用、多窗口联动（当前单窗口，N/A 依据团队计划 §9.24；广播通道与单窗口订阅可见且集成测试覆盖）。
9. **候选隔离**：`interface.ts`、`governance-advance.ts`、`interface.test.ts`、`operator-wiring.test.ts`、`e2e/main.mjs` 的整文件字节含目录 v3/治理 hunk；本报告只判 i18n 面，不为目录 v3/治理写卡背书；目录 v3 已有独立 T3 验收报告。
10. **未提交/未推送/未合并/未发布**：候选只存在于工作区；本通过结论不授权任何对外动作。
11. **文档状态漂移（不改变候选与结论）**：方案文件头仍写“草案/待确认”、团队计划文件头仍写“闸门 2 未确认”、沟通记录哈希相对标准 §1.4 快照已追加变化；均以沟通确认记录与冻结内容为准（变更包 §九已如实记录）。

---

## 六、放行边界

- 本结论只对 HEAD `ee59296` + 当前工作区 98 个候选文件（哈希见变更包 §三，本次逐项复算一致）有效。候选、依赖、契约、夹具、构建配置或 locale 目录内容任何变化都会使受影响证据失效，需重新判定。
- 通过仅表示满足验收标准 v1；**不授权**提交、推送、合并、发布、部署或对外操作。是否提交/发布由客户另行决定。
- 本结论不覆盖目录授权 v3、治理写卡闭环、验收返工排期、塔防 demo 或任何其他并行变更；不得引用本报告为其背书。
- 复用证据的边界见 §三.3（切换/重启时间线）与 §三.4（确认卡补充检查）；超出该边界的结论需补新证据。

---

## 七、关键证据索引

- 标准/方案/计划/沟通：`docs/acceptance/i18n-criteria-v1.md`（`0d91d179…`）、`docs/planning/2026-10-23_design_i18n.md`（`844db479…`）、`docs/scheduling/2026-10-23-i18n-team-plan.md`（`5ccc758f…`）、`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`（`7e1cf8db…`）。
- 变更包/I9：`docs/scheduling/i18n-change-v1.md`（`c095b308…`）、`角色卡/测试/docs/change/2026-10-23_change_i18n-integration.md`（`9cec7330…`）。
- 证据目录：`角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/`（manifest `0fd0ab69…`，304/304 OK；`rerun-final/`）。
- 验收补充检查：`C:/Users/51054/AppData/Local/Temp/ans_i18n_accept/confirm-layout-smoke.mjs`、`out-en/report.json`、`out-zh/report.json`（临时目录；关键观察已摘录于 §三.4）。
- 候选复算：本次逐路径 `git hash-object` + `sha256sum` 输出（临时目录 `C:/Users/51054/AppData/Local/Temp/ans_i18n_accept/`），98/98 一致、0 mismatch。

**本报告状态：独立验收对当前候选的判定；P1–P12 全部 pass；结论通过；不授权提交/推送/合并/发布。**
