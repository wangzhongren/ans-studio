# entry-role-minimal 批次 D 变更记录（项目管理）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：D（治理机器撤除）｜风险档位：**T3**
- 实施提交：D1 `c2b6cf97d2ea59f3cd239a2b0f39b2b36ff188ec`；D2 `98d3fe2f59cedd7fe1c78b5387a4ebaf9ed846ce`；D3 测试/文档提交见最终报告。
- 交接材料：`docs/scheduling/2026-10-28-entry-role-minimal-change-D.md`（224 行；最终哈希见报告）。

## 范围

Delta-7 规则修订；change-C 的 C-11 小修；change-D/属主记录；i18n key 清理与 allowlist。

## 文件 / 测试

- 文件：`角色卡/项目管理/docs/project-rules.md`、`docs/scheduling/2026-10-28-entry-role-minimal-change-{C,D}.md`、`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n-guard-allowlist.ts`。
- 测试：`i18n-guard` 6/6；删除 `i18n.test.ts`（flow/triage key 断言随机器撤除）。

## 验证摘要

- 全量（排除 `write-sequencing.test.ts`）：**2817 tests / 2787 pass / 12 fail / 18 skip**；对比 C 基线 4569/4535/15/19，新增确定性失败 **0**、无新 skip；12 fail 均为既有基线（9 Windows symlink + T1 ×3）。
- D 专项：`test/测试/entry-role-minimal-d.test.ts` **4/4**。
- 静态：`typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0。
- Electron：`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空；截图 16/17（`00-titlebar.png` 环境性 `UnknownVizError`）。
- D-04 rg：`src`/`app` 生产源码（排除 `dist`）**0 命中**。
- 环境：Windows 11 Pro 10.0.26300；Node v24.22.1；Electron 44.7.0。

## 风险 / 备注

- `app/desktop/interface.ts` / `session.ts` 仍有 `@ts-nocheck` 兼容死代码（入口已撤、不可达）；后续批次必须物理清理并移除 `@ts-nocheck`。
- 115 个旧测试文件已删除（逐文件登记见 change-D §7）；仍适用的 6 个测试文件已恢复并改造（59 tests）。
- 不 push、不合并 main；`package.json` / `package-lock.json` 零改动。
