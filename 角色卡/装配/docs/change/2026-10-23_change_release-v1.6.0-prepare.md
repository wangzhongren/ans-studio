---
id: v1.6-release-prepare-20261023
type: change
title: v1.6.0 发布：治理角色粒度、受治理后台任务与 MapReduce 测试
created: "2026-10-23"
updated: "2026-10-23"
timezone: Asia/Shanghai
status: in-progress
related: []
events:
  - date: "2026-10-23"
    kind: implemented
    summary: main 合并 feat/background-tasks-governance-and-reasoning；package/lock 1.5.0→1.6.0；README 当前版本/下载表/要点 → v1.6.0
---

# v1.6.0 发布准备

客户决定发布 **1.6.0**、**未签名 ZIP**（同 v1.5.0 形态）。本记录随发布进展更新；最终 tag/SHA/CI/资产在完成后填入。

## 版本与冻结源

- 版本 1.5.0 → **1.6.0**（minor）。
- 合并提交：`2b86f65`（`merge: governance role granularity and governed background tasks`）。
- 发布准备提交：**待创建**；annotated tag：**`v1.6.0` 待创建**。
- 发布范围＝main（治理角色粒度/团队计划 v2/MapReduce 测试、受治理后台任务、治理守卫、思考行显示修复、验收风险档位）。

## 本轮变化

- 受治理后台任务与治理守卫。
- 推理/思考行显示修复（正文/省略/回放/坏件 fail-closed）。
- 独立验收先判 T0–T3，按档位复用证据；全量回归仅 T3/证据不足。
- 团队计划 v2：bounded context/模块、契约、测试面、并行组、`dependsOn`、粒度理由；角色卡拆分能力与工作流描述。
- 测试：模块分片并行 + Reduce 合并；旧 v1 计划/流程/角色卡保持兼容。

## 本地预检

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 待运行 | — |
| `npm run typecheck:renderer` | 待运行 | — |
| `npm run build:renderer` | 待运行 | — |
| `node --test "test/装配/**/*.test.ts"` | 待运行 | — |

## 发布配方

- `src/common/装配/release-policy.mjs`：`SOURCE_REF='v1.6.0'`、`SOURCE_SHA=<tag target>`；overlay 保持基础集（`package.json`、`package-lock.json`、`.github/workflows/release.yml`、`src/common/装配/`、`test/装配/`）。
- `.github/workflows/release.yml`：`source_ref` 默认/并发/release 视图/创建/上传/编辑/标题/notes → v1.6.0；未签名沿用 `CSC_IDENTITY_AUTO_DISCOVERY=false`。
- `src/common/装配/release-policy.d.mts` 与 `test/装配/release-packaging.test.ts` 同步。

## CI 与发布

- 待触发；记录 run id、三平台 build/release 结果、draft→publish、资产 SHA256 与公开 URL。
