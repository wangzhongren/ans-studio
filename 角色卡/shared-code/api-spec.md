# 共享代码（`src/common/shared/`）public API 实现报告

- **角色**：`shared-code`（共享代码维护角色）
- **日期**：2026-11-07
- **状态**：E1 接管后现状核对完成；**未判验收**（B2 独立验收按 B1 判定）；不提交/推送/合并/发布。
- **现行目录（唯一）**：[`docs/architecture/shared-components.md`](../architecture/shared-components.md)（2026-11-07 自项目管理迁建；旧副本由 PM 在 E1 迁移窗口删除）。
- **依据**：E0.3 冻结契约 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）§4.1/§4.2/§4.3/§4.4；团队计划 §4.4⑦/§5.1/§6.4；冻结记录 Q12；技能 `references/shared-directories.md`（修订版 `80ece2c5…`）。

## 1. 结论摘要

1. **契约对照：一致**。`src/common/shared/` 现有 **11 个组件 / 18 个源文件**（`i18n/` 含 8 个文件），与 E0 §4.2 默认公开入口清单逐项对应；**无缺失组件、无未登记组件**。
2. **本轮共享 API 变更：0**。未新增/收敛 public entry，未改任何共享实现（`src/common/shared/**` 相对 HEAD 无 diff）。E1 角色模块所需能力已由 `src/model/role.ts` 契约类型 + 既有共享 public entry 覆盖；截至本报告**无角色/门控/引擎 owner 提交共享 API 变更提案**，故**无接口评审记录**（E0 §4.4：无提案即无变更，不得为假想需求预先扩张 API）。
3. **本轮共享测试变更：+1 文件**。新增 `test/项目管理/shared/intent-entry-contract.test.ts`（22 例），补齐第 11 项组件此前只有消费方间接覆盖的**专属单测**缺口；不改组件实现。
4. **测试**：`node --test "test/项目管理/shared/**/*.test.ts"` → **199 tests / 194 pass / 0 fail / 0 cancelled / 5 skipped / 0 todo**（跳过项为 Windows 平台按设计跳过；基线 177/172/0/5，净增 22 tests / 22 pass）。
5. **类型检查**：`npm run typecheck` 退出码 0。
6. **写集**：本单元全部产物在 `shared-code` Section 1 白名单内；无越界写入（见证据文档）。

## 2. 组件 public API 状态表

| # | 组件 | public entry（现行导出，不复制） | 状态 | 专属测试（`test/项目管理/shared/`） |
| --- | --- | --- | --- | --- |
| 1 | `config-loader` | `loadEffectiveConfig`、`readGovernanceModel`、`ansProjectPath`、`enforcePinBackedAcceptance`、`ANS_DIR_NAME`/`ANS_PROJECT_FILE_NAME`、`ConfigSource*`/`LoadedConfig`/`LoadConfigOptions`/`GovernanceModelRead` | 与 §4.2 一致；零变更 | `config-loader.test.ts` 24/24 |
| 2 | `path-primitives` | `IS_WINDOWS`、`toPosix`、`isAbsoluteAny`、`normalizeLexical`、`compareKey`、`isUnderOrEqual`、`absRel`、`isWithinReal`、`realResolve`、`realResolveAsync` | 一致；零变更 | `path-primitives.test.ts` 21/21 |
| 3 | `runtime-shared` | `RUNTIME_KINDS`、`RuntimeKind`、`DEFAULT_RUNTIME`、`RUNTIME_LABELS`、`RUNTIME_LABEL_KEYS`、`PI_CREDENTIAL_ENV_VARS`、`RUNTIME_CREDENTIAL_ENV_VARS`、`resolveSkillRoot` | 一致；零变更 | `runtime-shared.test.ts` 8/8 |
| 4 | `argv-primitives` | `normalizeArgv` | 一致；零变更 | `argv-primitives.test.ts` 12/12 |
| 5 | `env-file` | `parseEnvFile`、`mergeEnvText`、`atomicWriteText`、`readEnvFile`、`saveEnvFile`、`loadEnvFileInto`、`parseEnvValue`、`renderEnvValue`、`PI_CONFIG_SECRET_KEYS`、`RUNTIME_CONFIG_SECRET_KEYS`、`isSecretKey`、`EnvMap`/`EnvTarget`/`LoadEnvResult` | 一致；零变更 | `env-file.test.ts` 31/31 |
| 6 | `atomic-write` | `atomicWrite`、`renameReplacingExisting`、`retryOnTransient`、`RENAME_TRANSIENT_CODES`、`RENAME_MAX_ATTEMPTS`、`AtomicWriteOptions` | 一致；零变更 | `atomic-write.test.ts` 22（17 pass + 5 平台跳过） |
| 7 | `diagnostics` | `configureDiagnostics`、`createDiagnosticLogger`、`getDiagnosticsStatus`、`flushDiagnostics`、`disposeDiagnostics`、`DIAGNOSTIC_RETENTION_MS`/`DIAGNOSTIC_MAINTENANCE_MS`、`DiagnosticContext`/`DiagnosticLogger` | 一致；零变更 | `diagnostics.test.ts` 10/10 |
| 8 | `runtime-settings` | `RUNTIME_SETTINGS`、`getRuntimeSettingsDefinition`、`RuntimeSettingField`/`RuntimeSettingsDefinition` | 一致；零变更 | `runtime-settings.test.ts` 14/14 |
| 9 | `i18n` | `Locale`/`SUPPORTED_LOCALES`/`DEFAULT_LOCALE`/`isLocale`/`resolveLocale`；`MessageKey`；`translate`/`createTranslator`/`TranslateOptions`/`TranslateDiagnostic`；`formatNumber`/`formatDateTime`/`selectPluralCategory`；`Catalog*`/`Message*`/`PluralCategory`；`zhCN`/`enUS` | 一致；零变更 | `i18n.test.ts` 13/13；`i18n-guard.test.ts` 6/6 + 扫描器/allowlist 夹具 |
| 10 | `jsonl-ledger` | `appendJsonlLine`、`readJsonlLedger`、`jsonlSegmentFiles`、`DEFAULT_JSONL_MAX_BYTES`/`DEFAULT_JSONL_ROTATIONS`、`JsonlLedgerLimits`/`JsonlAppendResult`/`JsonlParseResult`/`JsonlReadError`/`JsonlReadResult` | 一致；零变更 | `jsonl-ledger.test.ts` 16/16 |
| 11 | `intent-entry-contract` | `INTENT_ENTRY_*`、`resolveIntentEntryReference`、`intentEntryContractText`、`intentEntryRejectionHint`、`isValidIntentId`、`intentIdFromFrontmatter`、`readIntentEntryFacts`、`IntentContractRole`/`IntentReferenceSource`/`IntentEntryResolution`/`IntentEntryFacts` | 一致；零变更；**测试补齐** | `intent-entry-contract.test.ts` 22/22（E1 新增） |

> 完整用途/消费者/契约/变更影响见现行目录 §2 逐项条目。

## 3. 本轮变更清单

| 类型 | 文件 | 说明 |
| --- | --- | --- |
| 目录（迁建） | `角色卡/shared-code/docs/architecture/shared-components.md` | PM 旧目录（216 行 / `dd33fdf7…`）为只读输入，建立 shared-code 现行唯一目录；11 组件逐项 + §3 模块 owner/public entry + §5 消费者观察 |
| 测试（新增） | `test/项目管理/shared/intent-entry-contract.test.ts` | 22 例专属单测（解析优先级/冲突 fail-closed/契约文本同源/只读事实解析；注入桩件，不触真实 FS） |
| 文档 | `角色卡/shared-code/api-spec.md`、`memo.md`、`docs/change/2026-11-07_E1_shared-catalog-and-maintenance-evidence.md` | 本报告、工作备忘录、E1 证据 |
| 共享实现 | `src/common/shared/**` | **无变更**（E1 行为零变更；无新增 public entry） |

**接口评审记录**：无（本轮无共享 API 新增/变更/删除；§4.4 提案前置条件未发生）。若后续角色/门控/引擎 owner 提出共享 public entry 需求，按 E0 §4.4 提交提案、评审记录写入本角色 `docs/change/` 并更新现行目录与冻结记录后再实现。

## 4. 兼容性与消费者影响

- 共享实现零变更 ⇒ 现有消费者（装配/编排/运行时核心/Pipeline/Service/Provider/三适配器/桌面窗口/桌面UI）行为与证据**不受影响**；无证据失效。
- 新增测试文件不改变任何生产行为；共享测试目录仍为单源（`test/项目管理/shared/`，路径历史名保留）。
- 已知消费者观察（非阻断，交各 owner）：见现行目录 §5（Model type-only 边、i18n `keys.ts` 直连、渲染层本地 `RuntimeKind`、门禁 `versioned-doc-guard.ts` 私有原子写、编排 `role-log.ts` 私有轮转、共享文件头历史 owner 注释）。

## 5. 未决事项

见 [memo.md](../memo.md)「遗留」：PM 旧目录删除（不在本角色写集）、`feature-map.md`/`functional-description.md` 待建、共享文件头 owner 注释清理、消费者观察项移交。
