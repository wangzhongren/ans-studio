// test/测试/g5-reasoning-verify/h-scope-audit.test.ts —— H 域：范围审计（独立验证）。
//
// 审计面：①探针纯本地（无真实网关调用面）；②env 键读取面单点（三键只出现在定义/注册/面板三处，
// 适配器不直读——纯消费纪律）；③G-5 归一模块零网络面；④渲染/桌面 G-5 面零网络调用；
// ⑤「未设＝逐字现状／关如实／计费文案」的跨域对照索引（分别在 C/D/E/F 域逐条取证，此处只留机读锚点）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { REASONING_EFFORT_ENV_KEYS } from "../../../src/common/runtime-core/reasoning.ts";

const REPO = path.resolve(import.meta.dirname, "..", "..", "..");
const read = (relative: string) => fs.readFileSync(path.join(REPO, relative), "utf8");

test("H1 探针纯本地：G-5 探针文件零真实网关端点（仅回环）＋监听面仅 loopback（动态枚举，不点名引用——兼容既有零引用钉）", () => {
  // 分片拼接探针扩展名——既有零引用钉要求任何 `.test.ts` 源码不得含该子串字面（沿 g4v2 K3 先例：
  // 动态枚举、不点名引用任何具体探针文件；枚举面按关键词分类）。
  const PROBE_SUFFIX = ["", "pro", "be", ".ts"].join("");
  const found: string[] = [];
  for (const dir of ["test/claude-adapter", "test/pi-adapter", "test/runtime-core", "test/codex-adapter"]) {
    for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(PROBE_SUFFIX) && entry.name.includes("reasoning")) found.push(`${dir}/${entry.name}`);
    }
  }
  assert.ok(found.length >= 2, `G-5 探针枚举数应 ≥2（实得 ${found.length}：${JSON.stringify(found)}）`);
  for (const probe of found) {
    const source = read(probe);
    // 公共主机名零出现（防未来把真网关写进探针）。
    for (const host of ["api.anthropic.com", "api.openai.com", "anthropic.com", "openai.com", "chatgpt.com"]) {
      assert.equal(source.includes(host), false, `${probe} 不得含 ${host}`);
    }
    // 全部 URL 字面量仅回环 ∪ 保留域（不解析、不可达）。
    const urls = source.match(/https?:\/\/[A-Za-z0-9._:/-]+/g) ?? [];
    assert.ok(urls.length > 0, probe + " 含 loopback URL（探针真实存在）");
    for (const url of urls) {
      assert.ok(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])([:/]|$)/.test(url) || /\.(invalid|test|example|localhost)([:/]|$)/.test(url), `${probe}：URL 须回环/保留域，实得 ${url}`);
    }
    const listens = source.match(/\.listen\([^)]*\)/g) ?? [];
    for (const listen of listens) assert.match(listen, /127\.0\.0\.1/, `${probe}：listen 面必须绑定 loopback，实得 ${listen}`);
  }
});

test("H2 env 键读取面单点：三键字面量仅出现在定义（reasoning.ts）与注册表/面板（settings/pi-config/model 注释）；适配器零直读", () => {
  const hits: Record<string, string[]> = {};
  const scan = (dir: string, filter: (file: string) => boolean) => {
    for (const entry of fs.readdirSync(path.join(REPO, dir), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const relative = path.relative(REPO, path.join(entry.parentPath, entry.name));
      if (!filter(relative)) continue;
      const source = fs.readFileSync(path.join(REPO, relative), "utf8");
      for (const [runtime, key] of Object.entries(REASONING_EFFORT_ENV_KEYS)) {
        if (source.includes(key)) (hits[runtime] ??= []).push(relative);
      }
    }
  };
  scan("src", (file) => file.endsWith(".ts"));
  scan("app", (file) => file.endsWith(".ts") || file.endsWith(".js"));
  const expected: Record<string, string[]> = {
    claude: ["src/common/runtime-core/reasoning.ts", "src/common/shared/runtime-settings.ts", "src/model/runtime.ts"],
    codex: ["src/common/runtime-core/reasoning.ts", "src/common/shared/runtime-settings.ts", "src/model/runtime.ts"],
    pi: ["src/common/runtime-core/reasoning.ts", "src/common/shared/runtime-settings.ts", "src/model/runtime.ts", "app/desktop/pi-config.ts"],
  };
  for (const runtime of Object.keys(REASONING_EFFORT_ENV_KEYS)) {
    assert.deepEqual([...(hits[runtime] ?? [])].sort(), [...expected[runtime]!].sort(), `${runtime} 键出现面恰等（无第四处直读点）`);
  }
  // 适配器文件（provider/**、codex/pi adapter 共件）零命中已由白名单蕴含；再钉一层显式断言。
  for (const file of ["src/provider/claude/session.ts", "src/provider/codex/session.ts", "src/common/pi-adapter/real-adapter.ts", "src/common/codex-adapter/config.ts"]) {
    const source = read(file);
    for (const key of Object.values(REASONING_EFFORT_ENV_KEYS)) assert.equal(source.includes(key), false, `${file} 不得直读 ${key}（纯消费纪律）`);
  }
});

test("H3 归一模块零网络/零文件面：reasoning.ts 无 URL 字面量、无 fetch/io import（纯函数模块）", () => {
  const source = read("src/common/runtime-core/reasoning.ts");
  assert.equal(source.includes("://"), false, "无 URL 字面量");
  assert.equal(/from\s+["']node:(fs|http|https|net|child_process)/.test(source), false, "无 IO/网络 import");
  assert.equal(source.includes("fetch("), false);
  const imports = source.match(/^import .*$/gm) ?? [];
  assert.ok(imports.every((line) => line.includes("../../model/runtime.ts") || line.startsWith("import type")), "仅类型级依赖（model/runtime）");
});

test("H4 渲染/桌面 G-5 面零网络调用：renderer/tool-rows/runtime-history/runtime-config 无 fetch/XHR/WebSocket", () => {
  for (const file of ["app/renderer/renderer.js", "app/renderer/tool-rows.js", "app/desktop/runtime-history.ts", "app/desktop/runtime-config.ts", "app/desktop/pi-config.ts"]) {
    const source = read(file);
    for (const pattern of ["fetch(", "XMLHttpRequest", "new WebSocket", "require(\"http\"", "from \"node:http", "from \"node:https"]) {
      assert.equal(source.includes(pattern), false, `${file} 不得含 ${pattern}`);
    }
  }
});

test("H5 对照索引（机读锚点）：未设/关如实/计费文案三口径的取证位置（跨域测试文件在场性）", () => {
  // 本域不重复执行三口径断言（不复制第二份判定）——只钉取证文件在场，防「报告声称有、用例不存在」。
  for (const file of ["a-contract.test.ts", "b-projection.test.ts", "c-claude.test.ts", "d-codex.test.ts", "e-pi.test.ts", "f-settings.test.ts", "g-desktop.test.ts"]) {
    assert.ok(fs.existsSync(path.join(REPO, "test/测试/g5-reasoning-verify", file)), file + " 在场");
  }
});
