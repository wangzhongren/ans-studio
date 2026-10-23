# 变更记录：角色根文档展示 S4（渲染层分组/空态/DocumentView 打开，桌面UI）

- **任务 ID**：`2026-10-23-role-root-docs-display`｜**产品 flowId**：`role-root-docs-display`
- **角色**：桌面UI（Desktop UI worker，独立子代理上下文）
- **日期**：2026-10-23
- **阶段**：团队计划 S4（渲染层：分组/空态/点击/焦点/布局；S6 的真实 Electron 总自检不在本批）
- **风险档位**：T2
- **状态**：**implemented-unverified（实现完成，未验收）**。本记录不是验收报告，不声称通过；未 commit / push / 暂存 / 合并 / 发布；未写目标项目。
- **客户授权**：`docs/communication/2026-10-23_intent_role-root-docs-display.md`「实施授权记录（2026-10-23）」按团队计划 v1 与 T2 标准 v1 实施 S2–S7（不含 commit/push/发布/目标写入）。
- **依据版本**：
  - 团队计划 v1：`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`（488 行；SHA-256 `8ec6e0d7…`；§3.3、S4、§六）
  - 方案 v1：`docs/planning/2026-10-23_design_role-root-docs-display.md`（1023 行；SHA-256 `9b69a786…`；§5.5、§5.7、§8.5）
  - 验收标准 v1：`docs/acceptance/role-root-docs-display-criteria-v1.md`（784 行；SHA-256 `12981ed4…`；P4/P6/P7）
  - S2+S3 契约：`角色卡/桌面窗口/docs/change/2026-10-23_change_role-root-docs-display.md`（`RoleView.rootDocs?`、`RoleRootDocEntry{name,path,kind:'file'}`、`rootDocs[].path` 项目相对）
  - S5 key：`角色卡/项目管理/docs/change/2026-10-23_change_role-root-docs-display.md`（`ui.profile.docsGroupRoot`/`docsGroupSubdir`/`noRoleDocs`/`openRootDoc` + 3 可选副标签）
- **候选**：本目录 `s4-candidate-hashes.txt` / `s4-candidate.diff`；分支 `v1.7.0-work`，HEAD `6407d63`。

## 一、环境

| 项 | 值 |
| --- | --- |
| OS / Shell | Windows 11 Pro 10.0.26300 / Git Bash 5.3.15 |
| Node / npm | v24.22.1（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）/ 11.19.1 |
| 暂存区 | `git diff --cached --name-only` 为空 |
| 原始记录 | `s4-environment.txt`、`s4-diff-stat.txt` |

## 二、实际写集（5 改 + 2 新增，均在授权写集内）

| 文件 | 改动 |
| --- | --- |
| `app/renderer/src/chat/types.ts` | 新增 `RoleRootDocEntry { name; path; kind: "file" }` 与 `RoleView.rootDocs?: RoleRootDocEntry[]`（additive，与 desktop 形状一致；旧 main 缺省按 `[]` 消费）。 |
| `app/renderer/src/chat/profile-docs.ts`（新增） | 纯展示模块：`roleRootDocs`/`roleDocsEntries`/`profileDocsView`（两组、顺序、count、空态）、`docsIndexMarkdown`、`ROOT_DOC_LABEL_KEYS`/`rootDocLabelKey`、`rootDocOpenText`、`matchDocumentRefByPath`；`memo.md`/role-card/boundary 显示兜底排除；无 DOM/Node/fs/electron/网络。 |
| `app/renderer/src/shell/ProfilePanel.tsx` | “文档”节两组：角色根文档（按钮列表，后端顺序）与 `docs/` 组（沿用既有 Markdown 列表）；两组都空才显示 `ui.profile.noRoleDocs`；count = 根文档 file 数 + docs file 数（目录不计）；根文档按钮 `data-root-doc-path`、`title`/`aria-label` = `ui.profile.openRootDoc` + 文件名、可选副标签；点击 `openDocumentList(roleId, "card", path)`；role-card/boundary 不重复；memo 不渲染。 |
| `app/renderer/src/stores/drawer-store.ts` | `openDocumentList` 增加可选第三参数 `targetRelativePath`；刷新 `listProject` 后按 `ref.relativePath === target` 精确匹配，命中且 scope 可读才调用既有 `readDocument(ref)`；未命中/无 scope/平台不支持停留列表态显示既有结构化错误；`backToRole` 焦点回 `data-root-doc-path` 按钮（缺失回退 `.role-document-entry`），并加 queueMicrotask 兜底（早于既有 rAF，见 §五）。 |
| `app/renderer/src/shell/phase4a.css` | 仅分组/行/按钮样式：`min-width:0`、`flex-wrap`、`overflow-wrap:anywhere`、`white-space:normal`；不新增固定高度/宽度，不改 960×620/固定高度语义。 |
| `test/桌面UI/profile-docs.test.ts`（新增） | 14 个纯逻辑用例：有/无根文档、部分缺失、memo/role-card/boundary 过滤、changelog 不回归语义、docs 不回归、两组空/单组空、顺序、count、S5 zh/en key、打开文案、`relativePath` 精确匹配、`not-applicable` 普通项、source-guard（无 Node/fs/window）。 |
| `test/桌面UI/phase4a-electron-smoke.mjs` | 夹具 `rootDocs` 3 + 根文档 refs 追加；9 个新检查（两组/顺序/count、title/aria、Windows 结构化不可用、读态、refs 追加、api-spec 普通文本、B 空态、960/200% 可达）；既有 `documents` 数 2→5 并注明“新增根文档 refs，不是回归”；既有断言未删除/弱化。 |

**未改（按需评估后零 diff）**：
- `app/renderer/src/chat/document-view.ts`、`app/renderer/src/shell/DocumentView.tsx`：既有 `DocumentView` 已消费 opaque refs、映射 `UNSUPPORTED_ENVIRONMENT`、Markdown `html:false`、无写/编辑入口；焦点回归由 `drawer-store.backToRole` 的既有 `queueDrawerFocus` 通路完成，无需改组件。
- `test/桌面UI/document-view.test.ts`、`source-guard.test.ts`、`phase4a-smoke-preload.cjs`：`profile-docs` 纯逻辑测试独立成文件；source-guard 自动覆盖新模块并通过；preload 未新增通道/形状变化。

**未写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`（含 Model/Service/Provider/i18n messages）、`test/桌面应用/**`、`test/测试/**`、`test/项目管理/**`、角色卡/边界、其他 `docs/**`、`package.json`/构建配置/依赖、目标项目。

## 三、行为（对照方案 §5.5 / 验收 P4）

1. **分组与顺序**：文档节内 `[data-docs-group="root"]`（角色根文档）在前、`[data-docs-group="subdir"]`（`docs/` 目录）在后；根文档严格按后端 `rootDocs` 数组顺序（feature-map → functional-description → api-spec），不按 locale/文件名重排。
2. **只显示存在项**：缺失文件无占位；根文档组仅在 ≥1 条时渲染；`docs/` 组仅在 `docs.length > 0` 时渲染。
3. **count 与空态**：节 count = 根文档 file 数 + `docs` file 数（目录不计）；为 0 显示 `shared.common.none`；两组都空（含内置角色/旧 main 无 `rootDocs`）显示 `ui.profile.noRoleDocs`；有根文档无 docs 不再显示“无 docs/”整节空。
4. **不重复/不展示**：`memo.md` 即使异常传入 `rootDocs` 也不渲染（显示兜底）；`role-card.md`/`boundary.yaml`/`boundary.md` 同样兜底排除，仍在各自专门节；changelog 仍在“变更记录”节。
5. **点击打开**：根文档行是键盘可达 `<button>`，`title`/`aria-label` = `ui.profile.openRootDoc` + 原样文件名；点击走 `openDocumentList(roleId,"card",targetRelativePath)`：先以当前 `role.documents` 建立列表/临时 scope，刷新 `listProject` 后按 `ref.relativePath === target` 精确匹配，命中且 `documentReadableRef` 才调用既有 `readDocument(ref)`；不构造文件系统路径、不生成 `documentId`、不自动重试。
6. **平台诚实（Windows/Q9 A）**：索引仍列文件名；无 scope/refs 时点开停留列表态，`DocumentView` 显示既有“当前环境暂不支持安全读取项目文档”，不伪造正文（Phase 4A 以受控回包覆盖）。
7. **`not-applicable`**：`api-spec.md` 按普通 Markdown 文本读取/展示，无 badge/特殊错误/隐藏。
8. **焦点回归**：从阅读态返回角色资料时焦点回触发按钮 `[data-root-doc-path="…"]`；按钮缺失时选择器回退 `.role-document-entry`。`backToRole` 在既有 `queueDrawerFocus`（rAF）之外加 queueMicrotask 兜底，与 `backToList` 既有模式一致；不改变 Drawer 组件。
9. **布局**：960×620、200% zoom 下文档节无水平溢出，根文档按钮完整可见可点（Phase 4A 检查）；截断语义由 `title`/`aria-label` 承担；长文只在 `DocumentView` 滚动。
10. **日志**：渲染层未新增 console/诊断打印；未引入 Node/fs/electron/网络；无 `dangerouslySetInnerHTML` 新用法（docs 列表仍走既有 `renderMarkdown` 受控管线，根文档标签用 React 文本节点）。

## 四、S5 key 使用（P6）

| key | 使用位置 |
| --- | --- |
| `ui.profile.docsGroupRoot` | 根文档组标题 |
| `ui.profile.docsGroupSubdir` | `docs/` 组标题（`docs/` 原样） |
| `ui.profile.noRoleDocs` | 两组都空时的整节空态 |
| `ui.profile.openRootDoc`（`{name}`） | 根文档按钮 title/aria-label（插值为原样文件名） |
| `ui.profile.rootDoc.featureMap` / `functionalDescription` / `apiSpec`（可选副标签） | 根文档行用途副标签（已实现，zh/en 齐全） |

文件名/路径/`not-applicable` 不翻译；`changelog` 既有 key 未改；未新增任何 memo key/开关。

## 五、测试与证据（当前候选，原始日志见证据目录）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 渲染层全套件 | `node --test "test/桌面UI/**/*.test.ts"` | **209 tests / 209 pass / 0 fail / 0 skipped / 0 todo**，exit 0（新增 14 个 `profile-docs` 用例；source-guard 含新模块扫描通过） |
| 渲染类型检查 | `npm run typecheck:renderer` | exit 0，无诊断 |
| 渲染构建 | `npm run build:renderer` | exit 0（既有 >500kB chunk 警告） |
| 根类型检查 | `npm run typecheck` | exit 0，无诊断 |
| Phase 4A 受控冒烟 | `./node_modules/.bin/electron test/桌面UI/phase4a-electron-smoke.mjs app/renderer/dist/index.html "C:/tmp/ans-phase4a-smoke9"` | **checks=108 / 11 fail**；S4 新增 9 项全 pass；既有文档返回焦点 pass；11 fail 与 HEAD 基线同项（见 §五.1） |

### 5.1 Phase 4A 失败分类（与 HEAD 基线对照）

- 当前候选：108 checks（99 基线 + 9 S4），11 fail。
- HEAD `6407d63` 干净源码（`git archive` 到 `C:/tmp/ans-baseline`，junction `node_modules` 重建）跑同套件：**99 checks / 11 fail**，失败集合与当前候选同类。
- 失败集中在设置面板字段/键盘（6 项）与仅靠 rAF 的焦点恢复（队列/抽屉打开，4–5 项，逐次运行 ±1 浮动）。诊断运行记录：隐藏 `BrowserWindow` 内 220ms 仅 1 个 rAF tick（`rafTicks:1`），rAF 被节流 → 焦点不落；这些路径不在 S4 写集。S4 为 `backToRole` 加 queueMicrotask 兜底后，`DOCUMENT_BACK_ROLE_RESTORES_ENTRY_FOCUS`（基线 fail）与 `ROOT_DOC_BACK_ROLE_FOCUSES_ROOT_BUTTON` 均 pass。
- `WIDTH_960_SETTINGS_NO_OVERFLOW` 在 run7/run8 fail、run9 与基线 pass（设置面板时序浮动）；与 S4 文件无关，S6 复跑分类。
- 详见 `s4-failure-classification.txt`；基线日志 `s4-phase4a-smoke-baseline-head.log`；诊断日志 `s4-phase4a-smoke-diagnostic-raf.log`。

### 5.2 环境限制

- 当前为 Windows：POSIX 正文实读未执行（不得以 Windows 列名冒充可读）；`test/桌面应用/e2e/main.mjs` 属 S6（由桌面窗口/测试按团队计划最小追加与分平台记录），本批未改未运行。

## 六、零改动与候选身份

- `git status --short -- app/renderer test/桌面UI` 只列本批 7 个文件；`git diff --cached --name-only` 为空（`s4-zero-diff-check.txt`）。
- `app/main.ts`、`app/preload.cjs`、`package.json`/锁文件、`tsconfig*`、`vite.config.ts` 零改动；`src/provider/project-document`、`src/pipeline/project-document`、Service abstract/public 零 diff。
- 外部上下文（S2/S3/S5 候选）blob 与各自记录一致（project.ts `47b41f64…`、interface.ts `b28ba1a5…`、model `e501ff31…`、service `ef66fa69…`、zh `5700649e…`、en `183eddea…`），本批未触碰。
- 候选逐文件 `git hash-object` + `sha256sum` + 字节见 `s4-candidate-hashes.txt`；完整 diff 见 `s4-candidate.diff`。

## 七、残余与后续

1. **未验收**：本记录为 `implemented-unverified`；独立验收按标准 v1 另写报告。
2. **S6 真实 Electron 总自检**：`test/桌面应用/e2e/main.mjs` 的 Windows 列表+`UNSUPPORTED_ENVIRONMENT`、fixture 字节/mtime、POSIX 实读分开记录仍待 S6；本批 Phase 4A 为受控回包证据。
3. **既有冒烟失败**：设置/队列焦点等 11 项在当前隐藏窗口 + 未提交上游候选上下文中与 HEAD 基线同样失败；非 S4 引入，S6 按基线复跑与归属处理。
4. **POSIX 未执行**（Windows 环境）；不声称全平台正文可读。
5. **未 commit / push / 暂存 / 发布**；未写 `ans-gateway`；未启用 task_ops，未伪造令牌/锁/审批/`docs/verification/`。

## 八、证据文件

目录：`角色卡/桌面UI/docs/change/2026-10-23_change_role-root-docs-display-evidence/`

| 文件 | 内容 |
| --- | --- |
| `s4-environment.txt` | 时间、OS/Shell、Node/npm、HEAD/分支、暂存状态 |
| `s4-candidate-hashes.txt` | 7 个候选文件基线/候选 blob + sha256 + 字节；按需未改文件零 diff |
| `s4-candidate.diff` | 5 个 tracked 改动 + 2 个新增文件完整 diff |
| `s4-diff-stat.txt` | status、diff stat、新增文件行数 |
| `s4-zero-diff-check.txt` | 禁止路径/Provider/preload/main 零改动；外部候选 blob 对照 |
| `s4-test-desktop-ui.log` | `node --test "test/桌面UI/**/*.test.ts"` 原始输出（209/209 pass） |
| `s4-typecheck-renderer.log`、`s4-typecheck-root.log`、`s4-build-renderer.log` | typecheck/build 原始输出（exit 0） |
| `s4-phase4a-smoke-current.log`、`s4-phase4a-report-current.json` | 当前候选 Phase 4A 原始日志与 report.json |
| `s4-phase4a-smoke-baseline-head.log` | HEAD 6407d63 干净基线 Phase 4A 日志（99 checks / 11 fail） |
| `s4-phase4a-smoke-diagnostic-raf.log` | rAF 节流诊断运行（`rafTicks:1`） |
| `s4-failure-classification.txt` | 失败分类与本批结论口径 |
| `s4-1360-profile.png`、`s4-1360-document-read.png`、`s4-1360-200-profile.png`、`s4-960-profile.png`、`s4-1360-settings-codex.png`、`s4-960-settings.png` | 1360/960/200% 截图（文档节、阅读态、设置对照） |
