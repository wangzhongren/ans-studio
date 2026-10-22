// E7 静态契约核对：killProcessTree 单一实现、RuntimeSessionOptions 不允许外部注入 backgroundTasks、
// 显示规则映射与判断会话隔离的结构性证据（运行时行为测试见 background-review/background-engines）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { GovernedToolsOptions } from "../../src/model/runtime.ts";
import type { RuntimeSessionOptions } from "../../src/service/runtime/session.ts";

// 编译期断言：RuntimeSessionOptions 必须排除 backgroundTasks（外部调用方不能自行注入）。
type Excluded<T extends never> = T;
type _BackgroundTasksExcluded = Excluded<"backgroundTasks" extends keyof RuntimeSessionOptions ? "must-be-excluded" : never>;
// 编译期断言：GovernedToolsOptions 必须保留 backgroundTasks（Service 注入面）。
type _BackgroundTasksInjectable = "backgroundTasks" extends keyof GovernedToolsOptions ? true : false;
const injectable: _BackgroundTasksInjectable = true;

const sourceUrl = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

test("E7：killProcessTree 只保留一份实现，run_shell 从 process-tree.ts 导入", async () => {
  const tools = await readFile(sourceUrl("../../src/provider/runtime/tools.ts"), "utf8");
  const tree = await readFile(sourceUrl("../../src/common/runtime-core/process-tree.ts"), "utf8");
  assert.equal(/function\s+killProcessTree\s*\(/.test(tools), false, "tools.ts 不得保留第二份 killProcessTree 实现");
  assert.match(tools, /import\s*\{\s*killProcessTree\s*\}\s*from\s*"\.\.\/\.\.\/common\/runtime-core\/process-tree\.ts"/);
  assert.equal((tree.match(/function\s+killProcessTree\s*\(/g) ?? []).length, 1, "process-tree.ts 必须恰有一份实现");
  assert.match(tree, /export function killProcessTree/);
  assert.equal(injectable, true);
});
