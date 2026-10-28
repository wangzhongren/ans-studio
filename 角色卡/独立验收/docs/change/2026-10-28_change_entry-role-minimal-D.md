# entry-role-minimal 批次 D 变更记录（独立验收）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：D（治理机器撤除）｜风险档位：**T3**
- 实施提交：D1 `c2b6cf97d2ea59f3cd239a2b0f39b2b36ff188ec`；D2 `98d3fe2f59cedd7fe1c78b5387a4ebaf9ed846ce`；D3 `4c24149`；D 返工 `e8e5c1f`；最终文档提交见最终报告。
- 交接材料：`docs/scheduling/2026-10-28-entry-role-minimal-change-D.md`（511 行；最终字节哈希见最终报告）。

## 范围

接收 D 批次候选与证据，独立判定 D-01–D-09。

## 文件 / 测试

- 文件：交接材料：`docs/scheduling/2026-10-28-entry-role-minimal-change-D.md`；属主记录 9 份；日志/哈希见 change-D §5。
- 测试：全量 2817/2787/12/18；D 专项 4/4；static 三份 exit 0；Electron `E2E_PASS=true`；D-04 rg 0 命中。

## 验证摘要

- 全量（排除 `write-sequencing.test.ts`）：**2880 tests / 2850 pass / 12 fail / 18 skip**；对比 C 基线 4569/4535/15/19，新增确定性失败 **0**、无新 skip；12 fail 均为既有基线（9 Windows symlink + T1 ×3）。D-03/D-10 强制质量基线已删除；D-05 i18n counts/parity/泄漏测试已恢复；D-11 测试差异表与 D-12 逐文件哈希已补入 change-D。
- D 专项：`test/测试/entry-role-minimal-d.test.ts` **5/5**。
- 静态：`typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0。
- Electron：`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空；截图 16/17（`00-titlebar.png` 环境性 `UnknownVizError`）。
- D-04 rg：`src`/`app` 生产源码（排除 `dist`）**0 命中**。
- 环境：Windows 11 Pro 10.0.26300；Node v24.22.1；Electron 44.7.0。

## 风险 / 备注

- `app/desktop/interface.ts` / `session.ts` 仍有 `@ts-nocheck` 兼容死代码（入口已撤、不可达）；后续批次必须物理清理并移除 `@ts-nocheck`。
- 115 个旧测试文件已删除（逐文件登记见 change-D §7）；仍适用的 6 个测试文件已恢复并改造（59 tests）。
- 不 push、不合并 main；`package.json` / `package-lock.json` 零改动。
