---
id: list-dir-tool-runtime-core
type: change
title: 普通角色只读目录工具 list_dir（真机猜测文件名噪声修复）
created: "2026-10-18"
updated: "2026-10-18"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [governance-judge-p1-runtime-core]
---

# 普通角色只读目录工具 `list_dir`

## 背景

真机噪声：普通角色没有列目录工具，定位流程单/角色卡时只能反复猜文件名，产生大量 `read_file` 的 `ENOENT`/`EISDIR`。客户要求给普通角色工具集加一个只读 `list_dir`（协调者派发，2026-10-18）。

## 改了什么

1. `src/common/runtime-core/list-dir.ts`（新建）：`resolveProjectList({projectRoot,path?})`
   - 项目相对路径或项目根内绝对路径；缺省/空串＝项目根；只列**一层**；目录名以 `/` 结尾；最多 200 项（超出截断并标记）。
   - 路径必须解析到项目根内：realpath + 前缀比较（win32 大小写不敏感）；拒绝 NUL、`..` 段、win32 盘符相对/ADS、根外绝对路径、符号链接/junction 逃逸。
   - 不存在 ⇒ `not-found`；目标是文件 ⇒ `not-a-directory`（工具文案提示改用 `read_file`）；目标本身是敏感/应用私有目录（`.git`、`.ans`、`docs/audit` 等）⇒ 拒绝。
   - 目录项复用 judge 的 `sensitiveClass` 过滤：`.env*`、密钥/证书、凭据/令牌、`.git/`、`docs/audit/`、`.ans/**` 等**不列名**；不占 judge 读取预算。
2. `src/provider/runtime/tools.ts`：新增 `LIST_DIR_TOOL_NAME = "list_dir"` 与 `makeListDirTool(readRoot)`；**默认注册**在 `buildGovernedTools`（无需注入能力，普通角色会话即获得）；`read_file` 命中 `EISDIR` 时明确提示「改用 list_dir」。工具只读、不过写门禁、不写盘、不执行；judge 会话不装配（judge 走各自工具集）。
3. `src/provider/runtime/schema.ts`：`list_dir` 严格 schema（`path` 可选字符串、`additionalProperties:false`）与描述/guidelines。

## 边界与兼容

- 未改门禁引擎、编排、适配器、桌面、UI；`list_dir` 与 judge 的 `judge_list_dir` 名称独立、共用同一敏感分类与列举上限。
- 普通路径不回归：`read_file` 除目录错误提示外行为不变；未注入能力时其余工具注册规则不变。默认工具面由 3 项变为 4 项（`write_file`/`edit_file`/`read_file`/`list_dir`），本角色 test/runtime-core 内的精确清单断言已同步。

## 验证（本机 Windows / Node v24.14.0）

- 新增 `test/runtime-core/list-dir-tool.test.ts` 6 例：默认注册与 schema、列目录语义/一层/目录带 `/`、敏感项不列名与敏感目录拒绝、`..`/根外绝对路径/junction 逃逸/不存在/非目录、200 项截断、中止不执行。
- `node --test "test/runtime-core/**/*.test.ts"`：**195 计 / 192 过 / 3 红**（3 红均为既有 Windows `symlink EPERM`：session-store ×2、tools ×1）。
- `npx tsc --noEmit`：0 错。
- 全量三层 glob `node --test --test-timeout=60000 --test-force-exit "test/**/*.test.ts"`：**2961 计 / 2937 过 / 20 红 / 3 跳过**；本批无新增红（先前两条 list_dir 预期红——codex 动态工具数、g4 固定工具面——已由属主同轮同步转绿），其余为既有环境/桌面/治理在飞面（明细见 [changelog](../changelog.md) 同日条目）。`--test-force-exit`/`--test-timeout` 仅用于绕开当前工作树在飞改动留下的未释放句柄与个别挂起文件（与本批无关）。
- 未跑真实模型/凭据/网络；未读 `.env`；未 git 提交。
