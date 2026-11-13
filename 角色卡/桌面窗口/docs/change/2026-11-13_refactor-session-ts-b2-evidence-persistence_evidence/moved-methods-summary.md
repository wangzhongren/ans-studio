# B2 搬出方法摘要（15 方法，逐字移动证明）

- 源：git show HEAD:app/desktop/session.ts（7519e6f = origin/main，含 B0/B1）
- 方法数：15；全部在记录化适配下逐字节相等：**True**；方法体 sha256 全部相等：**True**
- `session.ts` 行数：12388 → **11756**（`wc -l` 口径）

| 方法 | 模块 | HEAD 源行 | 目标行 | 适配 | sha256(源归一化)=sha256(目标) |
| --- | --- | --- | --- | --- | --- |
| `findFixedReviewArtifact` | `app/desktop/session/evidence.ts` | 9703-9719 | 56-72 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `6717926ad01cda6c…` |
| `buildFixedCloseEvidence` | `app/desktop/session/evidence.ts` | 9729-9835 | 82-188 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `9dcbdb728b994926…` |
| `collectFixedProposalDocumentRefs` | `app/desktop/session/evidence.ts` | 9841-9880 | 194-233 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `da5c1b198da413f5…` |
| `fixedReleaseAutoEvidence` | `app/desktop/session/evidence.ts` | 10396-10441 | 240-285 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `2b6b9bba19dfd164…` |
| `evidenceCheckText` | `app/desktop/session/evidence.ts` | 11088-11185 | 291-388 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `ceffcadac6c2a29a…` |
| `evidenceScopeRoots` | `app/desktop/session/evidence.ts` | 11193-11274 | 396-477 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `c32f5bf0e26401ee…` |
| `contractCheckText` | `app/desktop/session/evidence.ts` | 11284-11399 | 487-602 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `f9b381a2c90c269f…` |
| `contractCheckTextFixed` | `app/desktop/session/evidence.ts` | 11408-11492 | 611-695 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `5b056ff549376309…` |
| `docFormatText` | `app/desktop/session/evidence.ts` | 11503-11506 | 706-709 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `28efa958f7b48bad…` |
| `persistenceScope` | `app/desktop/session/persistence.ts` | 7572-7572 | 68-68 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `f5fa2eea1dda0cd2…` |
| `persistenceKey` | `app/desktop/session/persistence.ts` | 7573-7573 | 70-70 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `49af62d3dff02113…` |
| `mergeReportState` | `app/desktop/session/persistence.ts` | 7578-7602 | 72-96 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `fab2415c16561711…` |
| `rememberReceipt` | `app/desktop/session/persistence.ts` | 7603-7606 | 98-101 | receiver: private -> public（模块内方法，供门面委托调用） | ✅ `31be7eb2d83fe05d…` |
| `registerPersistenceHistory` | `app/desktop/session/persistence.ts` | 7607-7614 | 103-110 | inline import path: import('./runtime-history.ts') -> import('../runtime-history.ts')（模块目录深度变化） | ✅ `f48bd84d4bfccbde…` |
| `persistenceOperation` | `app/desktop/session/persistence.ts` | 7615-7652 | 112-149 | 无 | ✅ `21d1306bc352e157…` |
