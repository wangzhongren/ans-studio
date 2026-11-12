export const SOURCE_REF = 'v2.0.0';
export const SOURCE_SHA = '752953cf229ef9771fb574d0972b80e73ec7c27a';
// v2.0.0 overlay：冻结源 tag v2.0.0 已含全部产品/测试代码（两条固定工作流路径 T3——新增 A1–A13 / 修改
// B1–B4、运营=生产线唯一派发者与幕僚产线调度+独立验收派发、Git 简化（默认路径零 trunk/bootstrap/
// stable-write，治理走应用账本）、B29–B34 修复）；白名单为基础集 + 1 条发布阻断修复条目（见下）：
// files＝package.json、package-lock.json、.github/workflows/release.yml、
// test/桌面应用/optional-acceptance.test.ts；dirs＝src/common/装配/、test/装配/
// （v1.9.2 及更早条目已随冻结源吸收，见下）。
// v2.0.0 发布阻断修复：tag v2.0.0 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、断言不放宽。
// · 测试 1 条：test/桌面应用/optional-acceptance.test.ts——macOS arm64 CI Regression 挂起修复（>45 分钟
// 被取消）：v2.0.0 起 acceptance 属幕僚业务卡、不再进通用 judge，旧夹具 `await customerInput` 永不解
// （无界等待）；改用非业务卡 `intent-confirm` 钉同一 decision 组 judge 语义，open/stop/customerInput/
// 客户手选全部有界等待（超时如实失败并指出挂起点），stop 后等待后台投递落盘 + fs.rm 重试（清理竞态）。
// 断言未放宽；无自动验收语义保持。
// · 发布阻断修复（第二批，macOS 根路径规范化）：生产 2 条 + 测试 2 条——macOS `os.tmpdir()` 返回
// 符号链接路径（`/var` → `/private/var`），旧实现把「realpath(项目根) ≠ 输入逐字字符串」判为
// `noncanonical-project-root` ⇒ 保护范围 unknown ⇒ CI 120 名以 `runtime-protection-scope-unknown`
// 失败。修复两侧都以真实路径比较，只放行**同一真实根的不同书写形式**（符号链接祖先）；最终根自身为
// 符号链接、初始化源指向不同真实根、`.git` 为文件、`.ans/trunk`/初始化源链接混淆仍 fail-closed；
// 断言未放宽。单文件不开目录。
// · 生产 2 条：src/provider/trunk/impl/git-command.ts、src/service/runtime/session.ts
// · 测试 2 条：test/runtime-core/project-root-canonicalization.test.ts（新增回归钉）、
//   test/runtime-core/write-gate-context.test.ts（protectedRoots 按同一真实根比较，断言未放宽）
// · 编排 1 条（第三批，同一根因在编排层的第二处比较）：src/pipeline/orchestration/run-role.ts——
//   托管会话证据（`managedCoreHandles`）记录 `readGitProtectionFacts().projectRoot`（realpath 规范根），
//   而派发/授权路径用会话输入根的别名拼写（`/var` → `/private/var`）查询；旧实现逐字比较 ⇒ 同一真实根
//   被判不等 ⇒ 父 chief 证据不可见 ⇒ `prepareRoleDispatch` 走 staleParent 拒绝
//   （chief-workflow W20×2、W21×2、W48×4 残余 8 名）。修复：证据归属按两侧 realpath 相等判定，只放行
//   **同一真实根的不同书写形式**；不同真实根、任一侧不可解析、最终根自身为符号链接仍 fail-closed；
//   既有断言/门禁未放宽。单文件不开目录。
// · 发布阻断修复（第四批，B3-1/B3-3）：生产 1 条 + 测试 3 条——`e71501c` 在 `presentEntryNow()` 顶部
//   插入幕僚分支（`isChiefBusinessCard`），但把 C1 `@决策` 指令消费者留在其后 ⇒ 非主权 decision 卡的
//   指令成为死代码（客户授权：「替我审批等同于我自己审批」）。产品恢复指令消费者最优先；测试侧
//   directive-decision（全部 `customerInput` 等待有界、坏账本按 v2.0.0 无默认推荐语义以客户 responder
//   结算）、authorization-plane 集成回归（同口径有界/过时期望）、chief-workflow 清理 `fs.rm` 有界重试
//   （ENOTEMPTY 竞态；主断言不动，W1b 旧 flow 预设语义随 B3-1 调整）。均按精确路径、单文件不开目录、
//   断言未放宽。
// · 生产 1 条：app/desktop/customer-input.ts
// · 测试 3 条：test/桌面应用/directive-decision.test.ts、
//   test/测试/customer-authorization-plane-integration.test.ts、test/桌面应用/chief-workflow.test.ts
// 以下各段均为「历史」注释，仅作存档，不代表这些条目仍在活动白名单。
// 历史（v1.9.2 overlay）：冻结源 tag v1.9.2 已含全部产品/测试代码（输入区按钮精简——移除发送按钮、停止改为
// 纯图标；幕僚回复去折叠——settled 与会话回放原文直显）；白名单为基础集、无产品/测试 overlay 条目。
// 历史（v1.9.1 overlay）：冻结源 tag v1.9.1 已含全部产品/测试代码（交付行默认内联报告正文；自动决策
// 「无法核对」原卡转客户确认与同指纹拒绝去重）；当时白名单为基础集 + 1 条发布阻断修复条目（见下）。
// 历史（v1.9.1 发布阻断修复）：tag v1.9.1 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、
// 断言不放宽。· 测试 1 条：test/项目管理/shared/i18n-guard-allowlist.ts——为 app/desktop/customer-input.ts
// 补 allowlist 条目（import specifier 含技能路径「编排」，classification §4 机器路径）；守卫本身与断言未放宽。
// （该条目已随 v1.9.2 冻结源吸收，整批移出活动白名单。）
// 历史（v1.9.0 overlay）：冻结源 tag v1.9.0 已含全部产品/测试代码（contract_check 只读 schema 查询与逐字段
// 错误诊断、客户授权平面（@审批/@决策 与客户指令账本 customer.directives.jsonl）、角色资料抽屉布局修复）；
// 当时白名单重置为基础集、无产品/测试 overlay 条目。
// v1.8.4 发布阻断修复条目及更早的 v1.8.0/v1.8.2/v1.7.0/v1.6.0/v1.5.0 精确条目均已随 v1.9.0 冻结源吸收，
// 整批移出活动白名单。
// 历史（v1.8.4 overlay）：冻结源 tag v1.8.4 已含全部产品/测试代码（全局任务状态与幕僚版本决策权、验收报告卡
// 特殊显示与原文直出、派发护栏放松）；当时白名单为基础集与历史保留条目。
// 历史（v1.8.4 发布阻断修复）：tag v1.8.4 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、
// 断言不放宽。· 测试 1 条：test/桌面应用/version-decision.test.ts——关闭失败用例在 macOS 上仅 chmod 文件
// 不阻止 temp+rename，补 run 目录只读，使部分失败路径在 POSIX/Windows 一致；断言未放宽。
// 历史（v1.8.3 overlay）：冻结源 tag v1.8.3 已含全部产品/测试代码（run-change 契约变更通道接线：会话头显式入口、
// 两类保守自动触发、run-change-required 三段式；冻结三模式由客户选择）。
// 历史（v1.8.2 overlay）：冻结源 tag v1.8.2 已含全部产品/测试代码（D3 选中集记账修复：仅 appointment 卡写角色集，
// 决策/确认/验收卡选项不再被当作项目角色；读侧只认 D3 裁决、历史污染自动忽略）。
// 历史（v1.8.2 发布阻断修复）：tag v1.8.2 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、
// 断言不放宽。测试 4 条：test/桌面应用/chain-enforcement.test.ts、test/桌面应用/run-pin.test.ts、
// test/桌面应用/application-line.test.ts、test/编排/task-state.test.ts——D3 账本用例清理竞态
// （stop 后等待后台投递落盘 + fs.rm 重试），macOS arm64 CI 稳定性修复，断言未放宽。
// 历史（v1.8.1 overlay）：冻结源 tag v1.8.1 已含全部产品/测试代码（第二波可靠性：§5A 意图入口契约对角色可见、
// P0 投递/会话收尾不变量与停止解楔、P1 请求级超时与 SDK api_retry 诊断、P2 网络状态监听、P3 仅 replay-safe
// 同回合重试、验收卡归属三段式指引、view_image 每轮图片预算移除）。
// 历史（v1.8.0 overlay）：冻结源 tag v1.8.0 已含全部产品/测试代码（内建角色最小系统与五步雇佣链、模块/名单/拓扑 v2
// 与 roster v3、run 冻结、机械拒绝三段式与 contract_check、证据自洽校验与 evidence_check、桌面缺陷修复）。
// 历史（v1.8.0 发布阻断修复）：tag v1.8.0 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、
// 断言不放宽。· 生产 1 条：app/desktop/session.ts——升级裁决人工处置日志改为 await 落盘（C-04 Windows 时序）。
// · 测试 4 条：test/桌面应用/role-log.test.ts（平台原生 fixture）、test/测试/lightweight-permission-repairs.test.ts
// （短内联 review 口径 + 长内联/sh -c deny 更严断言）、test/测试/t1-pipeline-integration.test.ts（补任务 scope
// 使确认成为唯一写源）、test/编排/workflow-preconditions.test.ts（fileURLToPath）。
// · 第二轮（arm64 写后即读竞态）：app/desktop/session.ts 增持久化 await（notify 链、投递与拒绝审计行）；
// test/测试/governance-e2e-auto/i-full-chain.test.ts 以真实可读的 task.delivered 为观测点（断言不变）。
// 历史（v1.7.0 overlay）：冻结源 tag v1.7.0 已含全部产品/测试代码（独立验收覆盖所有变更、release 仅可选元数据、
// 验收标准门、任命客户决定自动收口、写卡校验反馈去重/忙时门控、中文角色名、角色根文档、目录级授权、
// i18n、自动推进、验收返工路由、Lead 治理协调）。
// 历史（v1.7.0 发布阻断修复）：tag v1.7.0 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、
// 断言不放宽。· 生产 1 条：src/common/shared/diagnostics.ts——diagnostics root 输出过度脱敏修复。
// （原 v1.7.0 overlay 的旧团队计划模块条目随 D 批撤除，已从白名单移除。）
// · 测试 3 条：test/桌面应用/interface.test.ts（第四轮等待预算 6000→15000）、
// test/桌面应用/project-document.test.ts（期望补 changelog）、
// test/桌面应用/acceptance-dispatch.test.ts（自动验收合法发送不再被旧“不派 Proof”断言误伤）。
// 历史（v1.6.0 overlay）：冻结源 tag v1.6.0 已含全部产品/测试代码（治理角色粒度、团队计划 v2、
// MapReduce 测试、受治理后台任务、思考行显示修复、验收风险档位）。
// 历史（v1.5.0 overlay）：打包/版本/发布面——白名单重置为基础集（files＝package.json、package-lock.json、
// .github/workflows/release.yml；dirs＝src/common/装配/、test/装配/）。冻结源 tag v1.5.0 已含全部产品代码
// （UI 平台化：React/shadcn Nova 渲染层、单入口 app/renderer/dist/index.html、新应用图标、派发投射去重、
// 默认不再 15 分钟自动中止回合、治理角色显示名统一），本版无生产源码/测试随版修复需求。
// v1.4.0 overlay-2 的 5 条一次性精确条目（1 项产品修复 src/common/编排/shell-command-guard.ts 与 4 项
// 测试/夹具修复）均已随冻结源吸收、整批移除、不列入；overlay-3 的 test/装配/multi-runtime.test.ts
// 属 test/装配/ 目录白名单，同样随冻结源生效、无需单独列名。
// 历史（v1.5.0 overlay 追加，三平台 CI 前置修复，按精确路径、单文件不开目录、断言不放宽）：
//   · 生产（唯一）：src/common/codex-adapter/reasoning-catalog.ts——Windows CRLF 内嵌模型目录读取修复。
//   · 测试/夹具 7 条：test/codex-adapter/reasoning-catalog.test.ts、test/codex-adapter/fixtures.ts、
//     test/桌面UI/source-guard.test.ts（Windows 路径归一）、test/runtime-core/file-write-safety.test.ts
//     （ENOTDIR Windows 真值）、test/测试/g5-reasoning-verify/helpers.ts 与
//     test/测试/g5-reasoning-verify/compatibility-loopback.test.ts（Windows loopback EBUSY 稳定化）、
//     test/测试/governance-e2e-auto/c-appointment-timing.test.ts（Windows 时序可见性修复）。
// fail-closed 不变：未列名的 app//src/ 变更仍使 prepare 明确失败；
// 未列名的 test/ 文件仍静默落 excluded、不随构建树（机制同前：经评审文件必须显式入列）。
const files = new Set(['package.json', 'package-lock.json', '.github/workflows/release.yml',
  'test/桌面应用/optional-acceptance.test.ts',
  'src/provider/trunk/impl/git-command.ts',
  'src/service/runtime/session.ts',
  'test/runtime-core/project-root-canonicalization.test.ts',
  'test/runtime-core/write-gate-context.test.ts',
  'src/pipeline/orchestration/run-role.ts',
  'app/desktop/customer-input.ts',
  'test/桌面应用/directive-decision.test.ts',
  'test/测试/customer-authorization-plane-integration.test.ts',
  'test/桌面应用/chief-workflow.test.ts']);
const directories = ['src/common/装配/', 'test/装配/'];
export function selectOverlay(paths) {
  const selected = [], excluded = [];
  for (const name of paths) {
    if (files.has(name) || directories.some(dir => name.startsWith(dir))) selected.push(name);
    else if (name.startsWith('app/') || name.startsWith('src/')) throw new Error(`Unreviewed production overlay: ${name}`);
    else excluded.push(name);
  }
  return { selected, excluded };
}
