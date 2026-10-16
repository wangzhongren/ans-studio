// test/测试/g4v2-mcp-verify/helpers.ts —— G-4 V2「su 安装外来 MCP」独立验证（测试角色）共享夹具。
//
// 纪律：**独立构造、不复用实施方断言**。本文件只读引用产品源码的公开面（模块导出、openRoleSession 输入形状、
// SessionManager 依赖注入），按验证需要自建可控假件。不修改任何他角色文件；本目录仅属测试角色边界（test/测试/）。
//
// 与 V1 验证（test/测试/g4-skill-verify/）的差异：本批聚焦 MCP 面——声明文件（docs/mcp/<name>.md）、
// MCP handler（install_mcp/uninstall_mcp）、三适配器装配。夹具以**真实临时项目盘**为根。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

/** 造临时项目根（不预建任何目录——「绝不建目录」等判据依赖初始干净盘）。 */
export function makeRoot(prefix = "ans-g4v2-verify-"): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** 落一份 MCP 声明 `docs/mcp/<name>.md`；opts.text 给定时原文落盘（对抗坏件），否则按正规格式生成。 */
export function writeMcpDeclaration(
  root: string,
  name: string,
  opts: {
    purpose?: string;
    command?: string;
    args?: string;
    env?: string;
    roles?: string;
    status?: string;
    date?: string;
    text?: string;
    /** 标题行名字（非权威——名字以文件名为准）。 */
    title?: string;
  } = {},
): string {
  const dir = path.join(root, "docs", "mcp");
  fs.mkdirSync(dir, { recursive: true });
  const body = opts.text ?? [
    `# MCP 声明：${opts.title ?? name}`,
    "",
    `- 用途：${opts.purpose ?? "一句话用途"}`,
    `- 启动：${opts.command ?? "node"}`,
    ...(opts.args !== undefined ? [`- 参数：${opts.args}`] : []),
    ...(opts.env !== undefined ? [`- 环境：${opts.env}`] : []),
    `- 适用角色：${opts.roles ?? "X"}`,
    `- 状态：${opts.status ?? "installed"}`,
    `- 安装日期：${opts.date ?? "2026-10-16"}`,
    "",
  ].join("\n");
  const bytes = Buffer.from(body, "utf8");
  fs.writeFileSync(path.join(dir, `${name}.md`), bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

/** 目录树快照（相对路径 → sha256/`<dir>`）——零副作用核对用。 */
export function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) {
        out[rel] = "<dir>";
        walk(abs);
      } else if (entry.isFile()) {
        out[rel] = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
      } else {
        out[rel] = "<other>";
      }
    }
  };
  walk(root);
  return out;
}

export const flush = (ms = 60): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function until(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("until：等待超时");
    await flush(10);
  }
}

export { fs, os, path };
