---
id: v1.6-release-prepare-20261023
type: change
title: v1.6.0 发布：治理角色粒度、受治理后台任务与 MapReduce 测试
created: "2026-10-23"
updated: "2026-10-23"
timezone: Asia/Shanghai
status: verified-published
related: []
events:
  - date: "2026-10-23"
    kind: implemented
    summary: main 合并 feat/background-tasks-governance-and-reasoning；package/lock 1.5.0→1.6.0；README 当前版本/下载表/要点 → v1.6.0
  - date: "2026-10-23"
    kind: implemented
    summary: release CI 回归测试串行化（--test-concurrency=1）；首跑/rerun 的 interface/acceptance-dispatch 并行偶发不影响产品候选
  - date: "2026-10-23"
    kind: published
    summary: CI run 39886264536 四 job 全绿；v1.6.0 已发布（publishedAt 2026-10-23T02:03:58Z）；三平台 ZIP/overlay/provenance 资产公开
---

# v1.6.0 发布准备

客户决定发布 **1.6.0**、**未签名 ZIP**（同 v1.5.0 形态）。本记录随发布进展更新；最终 tag/SHA/CI/资产在完成后填入。

## 版本与冻结源

- 版本 1.5.0 → **1.6.0**（minor）。
- 合并提交：`2b86f65`（`merge: governance role granularity and governed background tasks`）。
- 发布准备提交：**`f43f7a5`**；annotated tag：**`v1.6.0`**（tag object `34e0c30…` → commit `f43f7a5…`）。
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
| `npm run typecheck` | 0 | `ans-cli@1.6.0`，无诊断 |
| `npm run typecheck:renderer` | 0 | 无诊断 |
| `npm run build:renderer` | 0 | 2654 modules；dist 入口/CSS/JS/图标生成（JS gzip 273.82 KB、CSS gzip 19.62 KB） |
| `node --test "test/装配/**/*.test.ts"` | 0 | 84/84 通过、0 失败、0 跳过 |

## 发布配方

- `src/common/装配/release-policy.mjs`：`SOURCE_REF='v1.6.0'`、`SOURCE_SHA='f43f7a5…'`；overlay 保持基础集（`package.json`、`package-lock.json`、`.github/workflows/release.yml`、`src/common/装配/`、`test/装配/`）。
- `.github/workflows/release.yml`：`source_ref` 默认/并发/release 视图/创建/上传/编辑/标题/notes → v1.6.0；未签名沿用 `CSC_IDENTITY_AUTO_DISCOVERY=false`。
- `src/common/装配/release-policy.d.mts` 与 `test/装配/release-packaging.test.ts` 同步。

## CI 与发布

- **回归测试串行执行**：首跑与 rerun 分别暴露 `test/桌面应用/interface.test.ts`（v2 团队计划 V12/readiness、existing 迁移 readiness）与 `acceptance-dispatch.test.ts`（Lead 阻塞原因可见性）的已知并行偶发；不同断言点、mac x64 全绿、mac arm64 rerun 转绿，隔离/串行通过。为稳定发布，release workflow 的 Regression tests 改为 `node --test --test-concurrency=1 "test/**/*.test.ts"`；产品候选、tag 与验收结论不变。
- **最终 CI**：run **39886264536**（headSha `64edbb0`），mac arm64 / mac x64 / Windows x64 三个 build job 与 release job 全部 success。
- **发布**：draft=false，publishedAt **2026-10-23T02:03:58Z**，URL <https://github.com/wangzhongren/ans-studio/releases/tag/v1.6.0>。
- **资产 SHA256**：mac arm64 `4a7cc21525748e2afb03bb248d69968478281424ef2296bfd947a0245642c9ee`；mac x64 `e1faedf05ab1bfdb8c2293ce17179cb8ae66ea9c4e31b348219ad19af400ffaf`；win x64 `2c454cfec00c8c683cf1c42bdcd6eb8a85b2a4a4590089e08b186bc562954877`；overlay.patch `a279b6ab29817394c248681bcd47e774785ae909bb1ecb1b81e1559915f0f60e`；release-provenance.json `43ab7b3dc3a355172529df57e974210a1efab3a5dc65528bb745c619f95227d8`。
- **证据边界**：三平台构建/解压/启动 smoke 由 CI 原生 runner 执行；本地只做 typecheck、build、装配测试、prepare 预演与公开资产/校验文件的只读核对。
