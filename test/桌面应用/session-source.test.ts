// test/桌面应用/session-source.test.ts
// B0：聚合读取器自测——B0 单文件基线下与 app/desktop/session.ts 逐字节一致；
// readSessionModule 的回退口径；未来 session/** 目录注入后的固定拼接顺序与确定性。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readSessionSource, readSessionModule } from "./session-source.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BARREL = path.join(REPO_ROOT, "app", "desktop", "session.ts");
const MODULE_DIR = path.join(REPO_ROOT, "app", "desktop", "session");

function makeTempTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-session-source-"));
  fs.mkdirSync(path.join(root, "app", "desktop"), { recursive: true });
  return root;
}

test("B0 基线：模块目录不存在时 readSessionSource() 与 session.ts 逐字节一致", () => {
  const direct = fs.readFileSync(BARREL, "utf8");
  if (!fs.existsSync(MODULE_DIR)) {
    assert.equal(readSessionSource(), direct);
  } else {
    // 批次迁出后：barrel 恒为第一段（本测试不约束后续批次的内容组装，只锁定顺序起点）。
    assert.ok(readSessionSource().startsWith(direct), "模块目录存在时 barrel 仍是第一段");
  }
});

test("readSessionModule：模块文件不存在时回退到 B0 单文件内容（顺序/相邻性钉子当前口径）", () => {
  const direct = fs.readFileSync(BARREL, "utf8");
  for (const name of ["run-change", "lifecycle/send", "delivery/queue"]) {
    const moduleFile = path.join(MODULE_DIR, ...name.split("/")) + ".ts";
    if (!fs.existsSync(moduleFile)) {
      assert.equal(readSessionModule(name), direct, `${name} 回退内容与 B0 单文件一致`);
    } else {
      assert.equal(readSessionModule(name), fs.readFileSync(moduleFile, "utf8"), `${name} 读取既有模块`);
    }
  }
});

test("未来目录注入：barrel 恒第一段，模块按相对路径代码单元序拼接，重复读取结果确定", () => {
  const root = makeTempTree();
  try {
    const moduleDir = path.join(root, "app", "desktop", "session");
    fs.mkdirSync(path.join(moduleDir, "delivery"), { recursive: true });
    fs.mkdirSync(path.join(moduleDir, "lifecycle"), { recursive: true });
    fs.writeFileSync(path.join(root, "app", "desktop", "session.ts"), "BARREL");
    // 故意按非字典序创建，验证拼接顺序来自确定性排序而非文件系统枚举顺序。
    fs.writeFileSync(path.join(moduleDir, "run-change.ts"), "RUN-CHANGE");
    fs.writeFileSync(path.join(moduleDir, "index.ts"), "INDEX");
    fs.writeFileSync(path.join(moduleDir, "delivery", "queue.ts"), "DELIVERY-QUEUE");
    fs.writeFileSync(path.join(moduleDir, "lifecycle", "send.ts"), "LIFECYCLE-SEND");
    fs.writeFileSync(path.join(moduleDir, "notes.txt"), "IGNORED");
    const expected = ["BARREL", "DELIVERY-QUEUE", "INDEX", "LIFECYCLE-SEND", "RUN-CHANGE"].join("\n");
    assert.equal(readSessionSource(root), expected, "barrel 先、其余按路径代码单元序升序，非 .ts 忽略");
    assert.equal(readSessionSource(root), expected, "重复读取结果确定");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readSessionModule：模块文件存在时优先于单文件回退（含子路径模块名）", () => {
  const root = makeTempTree();
  try {
    const moduleDir = path.join(root, "app", "desktop", "session");
    fs.mkdirSync(path.join(moduleDir, "delivery"), { recursive: true });
    fs.writeFileSync(path.join(root, "app", "desktop", "session.ts"), "BARREL");
    fs.writeFileSync(path.join(moduleDir, "run-change.ts"), "RUN-CHANGE");
    fs.writeFileSync(path.join(moduleDir, "delivery", "queue.ts"), "DELIVERY-QUEUE");
    assert.equal(readSessionModule("run-change", root), "RUN-CHANGE");
    assert.equal(readSessionModule("delivery/queue", root), "DELIVERY-QUEUE");
    assert.equal(readSessionModule("lifecycle/send", root), "BARREL", "缺失模块回退到单文件内容");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readSessionModule：非法模块名拒绝（含 .. 路径段）", () => {
  for (const name of ["", "../session", "a/../b", "/"]) {
    assert.throws(() => readSessionModule(name), /非法模块名/);
  }
});
