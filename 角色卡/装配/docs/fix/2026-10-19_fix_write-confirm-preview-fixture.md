---
type: fix
created: 2026-10-19
status: verified
---

# 写盘确认卡 preview 完整性闸下的装配夹具修复

## 用户/维护者会看到什么

编排在 2026-10-19 真机修复中加入「写盘确认卡呈现前 preview 完整性闸」（`src/common/编排/confirmed-writes.ts::validateConfirmPreviewCompleteness`，`src/pipeline/orchestration/run-role.ts` 呈现前调用）：`request_confirmation` 声明了写入路径时，preview 必须对**每一条**路径给出可核对正文/结构，否则**不发卡**、`request_confirmation` 直接返回失败、不发行任何写入路径。

新契约下 `test/装配/govern-target.test.ts` 第 7 例（`ans govern <空目录>` 经 `governCommand` + 假适配器）转红：夹具 preview 只有「一行一个路径」的声明行 `docs/proposals/demo-v1.md`，其后没有任何正文行 ⇒ 完整性闸拒绝呈现 ⇒ 放行桩 `customerInput` 未被调用。实测失败为 `confirmRequests.length` 断言 `0 !== 1`（测试文件原 :262；日志同时出现 `confirmation.preview.incomplete` 语义的拒绝原因）。

## 根因

夹具 preview：

```text
将写出以下文件（均已预览）：
docs/proposals/demo-v1.md
```

`declaredWritePathOfLine` 把第二行识别为声明路径（锚点），但锚点之后到 preview 末尾无任何非空、非装饰、非路径重复的正文行 ⇒ `missingPaths = ["docs/proposals/demo-v1.md"]`、`ok:false`。测试意图（先确认再把将写路径交给客户、确认通道恰好一次、写入落盘且内容一致）本身无误，缺的是新契约要求的**逐路径正文/结构**。

## 修复

只改本角色白名单内 `test/装配/govern-target.test.ts` 的该例夹具，**不放宽任何断言**：

- 保留原「一行一个路径」声明行（原测试意图：把将写出的具体路径摆给客户）；
- 为该路径补 `## docs/proposals/demo-v1.md` 标题锚点 + 与实际 `write_file` 内容一致的正文 `# 提案`（`proposalContent` 单一来源，脚本 content 与断言所用字面量同步引用）；
- 原断言逐字保留：`EXIT_OK`、stderr 不含边界/模型/目录错、提案落盘且内容为 `# 提案\n`、客户确认通道被请求**恰好一次**且形状为 `confirm`、无 pin 之物时 `.ans/project.json` 不凭空产生。

修复后 preview（结构示意）：

```text
将写出以下文件（均已预览）：
docs/proposals/demo-v1.md

## docs/proposals/demo-v1.md

# 提案
```

声明行锚点无正文不构成问题——同一路径的 `## <路径>` 标题锚点后紧跟正文行，`validateConfirmPreviewCompleteness` 对每条路径取 `anchors.some(有正文)` ⇒ `ok:true`；确认卡正常呈现，放行桩计次恢复为 1。

## 验证

- 环境：Node v24.14.0、Darwin 25.6.0；仓库 HEAD `6d40eee`，工作树含编排与他角色未提交改动（本修复只叠加 `test/装配/govern-target.test.ts`）。
- 修复前：`node --test "test/装配/govern-target.test.ts"` → 11 计 / 10 过 / 1 红（`0 !== 1`）。
- 修复后专项：同文件 **11/11 通过**。
- 修复后全装配：`node --test "test/装配/**/*.test.ts"` → **82 计 / 82 过 / 0 红 / 0 跳过**。
- 未跑全仓 `test/**` 与 typecheck（本任务范围仅装配夹具；工作树含他人未提交改动，全仓红绿不代表本修复）。
- 未读 `.env`、未跑真实模型/凭据/网络、未 git 提交。

## 残留

- `test/装配/` 零红、零跳过。
- 其他角色（编排等）对新契约的夹具改造不在本角色范围；本记录不声称其状态。
