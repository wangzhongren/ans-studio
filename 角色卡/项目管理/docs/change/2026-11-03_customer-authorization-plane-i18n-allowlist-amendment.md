---
id: customer-authorization-plane-i18n-allowlist-amendment
type: change
title: 客户授权平面 i18n allowlist 闸门 2 增补（W-5 A）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related: [customer-authorization-plane]
events:
  - date: "2026-11-03"
    kind: created
    summary: 按客户闸门 2 裁决 W-5 A，在 i18n 守卫 allowlist 按字典序新增 app/desktop/directive-input.ts（输入解析关键字「撤销」）；复跑 i18n-guard 6/6 与 i18n 11/11 均 exit 0，采集哈希/diff/原始日志证据
---

# 客户授权平面 i18n allowlist 闸门 2 增补（W-5 A）

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：项目管理（固定角色；本上下文只承担该角色，不切换）/ D1 阻断项「i18n allowlist 闸门 2 增补」。
- **状态**：**`implemented-unverified`**。allowlist 已增补、守卫与 i18n 测试已复跑通过；**未经独立验收、未 commit/push**。
- **基线 [事实]**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；Node `v24.22.1`；worktree `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane`。
- **输入版本 [事实]**：团队计划 **664 行 / `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8`**（v1 653 行 / `37e6bd0d…` + §十三）；P1 复审记录 **397 行 / `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c`**（W-5）；沟通记录 **199 行 / `31d3064a99739b61e452321d3c73ba43429db419ea490f877cdb48a97cefbd32`**（「i18n 守卫裁决记录」W-5 A，第 194–199 行）。
- **版本引用差异 [事实]**：任务输入引用的沟通记录为 **174 行 / `80b9170d…`**；磁盘当前为 **199 行 / `31d3064a…`**，其中第 194–199 行为 W-5 A 裁决记录（追加晚于该引用），裁决内容一致，本次按磁盘现行版本执行。

## 一、改动内容

`test/项目管理/shared/i18n-guard-allowlist.ts`（唯一测试夹具改动）按字典序新增一条，插入 `app/desktop/chat-adapter.ts` 与 `app/desktop/interface.ts` 之间：

```ts
  // 输入解析关键字「撤销」，非用户可见 UI；展示文案已 key 化——classification §4。
  "app/desktop/directive-input.ts",
```

| 指标 | 写前 | 写后 |
| --- | --- | --- |
| 行数 | 91 | **93**（+2） |
| 实际条目数 | 20 | **21**（+1） |
| SHA-256 | `7058da44715383a2314246edd0ee2b291a0c563b1e281ec4dbb1f4dcaf10b630` | `f31c0b07c639c5bcb83ebe9780e1b6c155eca4eef62b341fc00b4a1a54d2180a` |
| diff | — | 2 insertions(+), 0 deletions(-)（`04-allowlist.diff`） |

- 未改其他条目，未新增其他文件条目。
- 头部历史注释中的「当前保留 **22** 条」与写前实际 20 条本就不一致（既有陈旧计数，非本次引入）；本次写权仅限「新增一条条目」，未改动头部注释，以免超出闸门 2 授权范围。写后实际 21 条。

## 二、判定依据（classification §4）

- 守卫基线唯一失败：`app/desktop/directive-input.ts:324:10 撤销`。该「撤销」位于 `parseRevokeBody` 的输入解析正则 `/^撤销(?:\s|#|$)/` 与 `/^撤销\s*#\s*(\S+)\s*$/`（`app/desktop/directive-input.ts:323-327`），用于识别 `@审批/决策 撤销 #d-N` 的**协议 token**，不是用户可见 UI 文案。
- 该文件用户可见文案已按 A3 冻结 key 消费：`directiveSubmitErrorMessage` / `directiveRevokeErrorMessage` 均返回 `mainT("ui.directive.error.*")`（第 220–251 行）；`interface.ts:2416-2422` 只取 `result.error` 经 `directiveSubmitErrorMessage` 转 key，丢弃 `result.message`。
- 其余非注释 Han 均为内部/开发者文本，不进入客户 UI：第 334/337 行 `throw new Error` 的开发者断言、第 596–612 行 `SubmitResult.message` 的结构校验 detail（被 `interface.ts` 丢弃）。按文件级 allowlist 口径一并放行，classification §4（agent-facing/机器文本，不翻译）。
- 授权链：P1 复审 W-5 判定「新增 allowlist 属写集扩张，须统筹/闸门 2」→ 沟通记录第 188–199 行记录客户选择 **A（加 allowlist，推荐）**，授权项目管理新增该条目并附分类注释，**不改产品代码**。

## 三、验证（原始输出见证据）

| # | 命令 | 写前 | 写后 | 原始日志 |
| --- | --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 "test/项目管理/shared/i18n-guard.test.ts"` | **exit 1**；tests 6 / pass 5 / fail 1；`scanned=136 allowlisted=20 violations=1`；唯一失败 `app/desktop/directive-input.ts:324:10 撤销` | **exit 0**；tests 6 / pass 6 / fail 0；`scanned=136 allowlisted=21 violations=0` | `02-guard-test-before.log` / `06-guard-test-after.log` |
| 2 | `node --test --test-concurrency=1 "test/项目管理/shared/i18n.test.ts"` | **exit 0**；tests 11 / pass 11 / fail 0 | **exit 0**；tests 11 / pass 11 / fail 0；key 分区计数 ui 1090 / main 591 / shared 62 / preferences 3，总计 1746（与写前一致） | `03-i18n-test-before.log` / `07-i18n-test-after.log` |

- allowlist 纪律（守卫测试第 2 例）写后通过：无重复、已排序、无陈旧条目；`app/desktop/directive-input.ts` 仍在扫描范围且仍含 Han，不会 stale。
- 产品代码未改动：`app/desktop/directive-input.ts` 写前/写后 SHA-256 均为 `914868d83015e331b412fda9a6c86040fc20a6f1e5dbc22b75c706728d6f4caa`；`test/项目管理/shared/i18n.test.ts` 仍为 `62b04e8c42bf1548606e9412c981e42baca073324980e76d23c6eff220e1a80a`。
- **新增确定性失败 0、新增 skip 0**。

## 四、写集与边界

- 本节点实际写入：`test/项目管理/shared/i18n-guard-allowlist.ts`（+2 行）、本记录、`2026-11-03_customer-authorization-plane-i18n-allowlist-amendment-evidence/`。
- **未写**：产品代码（`app/**`、`src/**`）、其他测试、其他角色文档、角色卡/边界、`docs/scheduling|acceptance|communication`；未改 A1/A2/A3/B1/C1/C2 的未提交候选。
- 未 commit/push；无暂存改动。工作树中原有其他角色的既存未提交候选保持原样。

## 五、哈希与证据

证据目录：`角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-i18n-allowlist-amendment-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `01-before-state.txt` | 28 | `c6d2777980fc783ab53a4bdd596b23e1056949ef5cb60fc85575473b64fba59d` |
| `02-guard-test-before.log` | 42 | `e2e75d915947f1c63ac60d8a8abda3325e7696836fc8df9fe78d107c06b95ada` |
| `03-i18n-test-before.log` | 19 | `e9ee8da14b4f43fff16b88fdd17cfd227e2b2bb7e9b6ba06aea1a1e6c1ae2910` |
| `04-allowlist.diff` | 13 | `e17ebaf2ca2e2134a619c4b40009d5c284eb44cc4e16f4f2a01d8d79843b6057` |
| `05-after-state.txt` | 11 | `6dd7610ca1249e6b464a960d54cc475be0cec3bc6d30eb0a98abc90ffa4fcfab` |
| `06-guard-test-after.log` | 15 | `83310ad33b8a75fe21c4f7f42bc6cb37838efa7aa144a075fe06317f03c8bc6a` |
| `07-i18n-test-after.log` | 19 | `e4827032724d2f0b4986301443af010255b542071075b0a8507e5fc5a15d0344` |
| `08-evidence-sha256.txt` | 12 | `4c915aab75e397abebd1c5d4b278f47ec3a3298b0bfad1e44f70b56b0abbeb31` |

- allowlist blob：`f11923d`（写前）→ `7804092`（写后）；diff 见 `04-allowlist.diff`。
- 输入文档哈希见 `01-before-state.txt`。

## 六、披露

1. **沟通记录版本差异**：任务输入引用 174 行 / `80b9170d…`；磁盘现行 199 行 / `31d3064a…`（新增第 194–199 行 W-5 A 裁决记录）。以磁盘现行版本为准，裁决内容一致。
2. **allowlist 头部计数陈旧**：头部历史注释仍写「当前保留 22 条」，实际写前 20 条、写后 21 条。属既有不一致；因闸门 2 仅授权新增一条条目，未顺手修改头部注释。
3. **文件级放行范围**：allowlist 以文件为粒度，放行 `directive-input.ts` 全部非注释 Han（不止第 324 行的协议 token）。已核对第 334/337 行开发者 `throw` 与第 596–612 行校验 `message` 均不进入客户 UI（`interface.ts` 丢弃 `message`、错误码统一经 `mainT`）；归类 classification §4。不改产品代码。
4. **无停止项**：无需新增文件/依赖/写集扩张；D1 阻断项（i18n 守卫）已解除，可进入 D1 → D2 → E1。
