# 门禁引擎 B17 记录：fixed A8 激活只传 path（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「门禁引擎」（独立固定上下文；B17 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 T3 后续批次 **B17**（RR12 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`d35e2de`（RR12 记录提交）

## 一、依据

- RR12：nominator 写出角色三文件后，`activate_role_documents` v2 需要 roster/三文档 64-hex sha256；模型无法取得应用侧 hash，A8 阻塞。
- 协调方 B17：fixed A8 只传 path，hash 由应用计算回填；不得猜 hash/用 shell。

## 二、实施内容

`src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（M）A7→A8 条目：

- 由「人事以 `activate_role_documents` v2（proposalDecisionId + roster + 三文档 hash）逐个 `role.activated`」改为：
  「人事以 `activate_role_documents` v2（proposalDecisionId + roster + 三文档，**只传 path**；hash 由应用在激活前按实际字节计算并回填，不猜 hash、不得用 shell 计算）逐个 `role.activated`」。
- A7 任务文本仍携 roster path + 应用 A6 `documentRefs` 回执的 sha256（该值由应用提供，不由角色 shell 计算）；A8 的三文档 hash 由应用在激活时计算。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| chief v2 资源/禁 shell hash 测试 | 含在受影响集 **109/109 pass** | `角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-02-affected.tap`（`be8bbf40…`） |
| `npm run typecheck` | exit 0 | 同目录 `b17-01-typecheck.txt` |
| legacy `chief-workflow.md` 字节/pin | 未改（资源测试通过） | 同上 |

## 四、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` | M | 23,808 / 129 | `69fc0a6f7119d0e8c04f230c2d96c73aea91d50dc89e1875d65a532a2534b166` | +1/−1 |

## 五、限制与披露

- 本批只改 fixed v2 资源静态文本；legacy 资源未改；未运行真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR13。
