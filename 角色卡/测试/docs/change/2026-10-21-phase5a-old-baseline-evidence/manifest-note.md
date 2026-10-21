# 5A 旧端快照 manifest 说明

- `manifest-before.sha256` / `manifest-after.sha256`：完整候选集（含 `app/main.ts`）。
- 快照期间 `app/main.ts` 由桌面窗口导航兜底在途修改（before `2fdb2173…` → after `9e7cef76…`），属**快照外的另一角色在途改动**；旧入口渲染与旧端套件不读取 `app/main.ts`（main.mjs 只镜像其 IPC 形状），故旧端结果不受影响。
- 旧入口/套件/依赖的稳定清单：`manifest-old-entry-before.sha256` / `manifest-old-entry-after.sha256`，`diff` 为空（exit 0），作为 5A 旧端快照的有效 manifest。
- 5A 新端全量开始前，候选冻结后重新生成完整 `candidate-manifest.sha256`；不得沿用本文件的 `app/main.ts` 值。
- 旧入口快照仍以 `manifest-old-entry-*.sha256` 为准；任何旧入口/套件文件差异 → 快照作废重跑。
