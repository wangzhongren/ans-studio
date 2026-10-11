// test/项目管理/shared/env-file.test.ts
// 项目管理：对共享 `.env` 读写模块 `src/common/shared/env-file.ts` 的**写入纪律**验证
// （设计 §11.4，客户红线）。重点**不在 happy path**，而在纪律本身：
//   ① 只改相关键（其余逐字节保留）；② 追加 vs 就地替换；③ 特殊字符不破坏解析（可读回）；
//   ④ 原子写（同目录 temp + rename；无半写残留）；⑤ 失败显式且不损坏原文件；
//   ⑥ credential 不回显（哨兵值绝不出现在错误文本/回报中）。
//
// 全部使用系统临时目录（`os.tmpdir()`），**不留文件于仓库**，用完递归清理。
// **绝不**指向仓库根真实 `.env`（本文件不引用仓库任何 `.env`）。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  atomicWriteText,
  isSecretKey,
  loadEnvFileInto,
  mergeEnvText,
  parseEnvFile,
  PI_CONFIG_SECRET_KEYS,
  readEnvFile,
  renderEnvValue,
  saveEnvFile,
} from "../../../src/common/shared/env-file.ts";

// ---- 测试夹具：系统临时目录，用后清理 ----

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ans-env-file-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 把文本切成「逻辑行」（含行尾符），用于逐行比对。 */
function logicalLines(text: string): string[] {
  return text.split(/(?<=\n)/);
}

/** 断言 merged 与 original 除指定行（索引）外**逐字节相同**。 */
function assertOnlyLineChanged(original: string, merged: string, changedIndex: number): void {
  const a = logicalLines(original);
  const b = logicalLines(merged);
  assert.equal(b.length, a.length, "行数不得变（只改值，不增删行）");
  for (let i = 0; i < a.length; i++) {
    if (i === changedIndex) {
      assert.notEqual(b[i], a[i], `第 ${i} 行应为被改动行`);
    } else {
      assert.equal(b[i], a[i], `第 ${i} 行应逐字节不变`);
    }
  }
}

// ---- ① 只改相关键：注释/空行/未知键/无关键/顺序/格式 全部原样保留 ----

const SAMPLE = [
  "# 顶部注释：Pi 配置",
  "",
  "ANS_RUNTIME=demo",
  "# 下面这行是未知键，必须原样保留",
  "SOME_UNKNOWN_KEY=keep  me  exactly",
  "",
  "ANS_PI_BASE_URL=http://old-host",
  "ANS_PI_MODEL=old-model",
  "# 尾部注释",
  "",
].join("\n");

test("① 只改相关键：仅目标值行变化，其余（注释/空行/未知键/无关键）逐字节保留", () => {
  const merged = mergeEnvText(SAMPLE, { ANS_PI_MODEL: "new-model" });
  // 行为：唯一变化的行 = 第 7 行（`ANS_PI_MODEL=…`）。
  assertOnlyLineChanged(SAMPLE, merged, 7);
  // 明确核对关键保留项逐字存在。
  assert.ok(merged.includes("# 顶部注释：Pi 配置"));
  assert.ok(merged.includes("# 下面这行是未知键，必须原样保留"));
  assert.ok(merged.includes("SOME_UNKNOWN_KEY=keep  me  exactly"));
  assert.ok(merged.includes("ANS_PI_BASE_URL=http://old-host"));
  assert.ok(merged.includes("# 尾部注释"));
  // 解析确认新值生效、旧值与未知键不变。
  const parsed = parseEnvFile(merged);
  assert.equal(parsed.ANS_PI_MODEL, "new-model");
  assert.equal(parsed.ANS_PI_BASE_URL, "http://old-host");
  assert.equal(parsed.SOME_UNKNOWN_KEY, "keep  me  exactly");
});

test("① 一次更新多个键：只改这些键的行，其余不变（顺序不变）", () => {
  const merged = mergeEnvText(SAMPLE, { ANS_PI_BASE_URL: "http://new", ANS_PI_MODEL: "m2" });
  const a = logicalLines(SAMPLE);
  const b = logicalLines(merged);
  assert.equal(b.length, a.length);
  assert.notEqual(b[6], a[6]);
  assert.notEqual(b[7], a[7]);
  assert.equal(b[2], a[2]);
  assert.equal(b[4], a[4]);
  const parsed = parseEnvFile(merged);
  assert.equal(parsed.ANS_PI_BASE_URL, "http://new");
  assert.equal(parsed.ANS_PI_MODEL, "m2");
});

test("① 更新为空 → 恒等（返回原文）", () => {
  assert.equal(mergeEnvText(SAMPLE, {}), SAMPLE);
});

// ---- ② 不存在 → 追加；已存在 → 就地替换 ----

test("② 键不存在 → 追加到末尾，原有内容逐字节不变", () => {
  const merged = mergeEnvText(SAMPLE, { ANS_PI_CONTEXT_WINDOW: "131072" });
  assert.ok(merged.startsWith(SAMPLE), "原内容应是新文本的前缀（纯追加）");
  assert.equal(merged, SAMPLE + "ANS_PI_CONTEXT_WINDOW=131072\n");
  assert.equal(parseEnvFile(merged).ANS_PI_CONTEXT_WINDOW, "131072");
});

test("② 键不存在 → 追加；原文件无尾随换行时先补行尾，不粘连", () => {
  const noTrailing = "A=1";
  const merged = mergeEnvText(noTrailing, { B: "2" });
  assert.equal(merged, "A=1\nB=2\n");
  assert.equal(parseEnvFile(merged).B, "2");
  assert.equal(parseEnvFile(merged).A, "1");
});

test("② 已存在 → 就地替换（行序不变）；同键多行 → 全部替换保持一致", () => {
  const dup = "K=old\nX=keep\nK=old2\n";
  const merged = mergeEnvText(dup, { K: "new" });
  assert.equal(merged, "K=new\nX=keep\nK=new\n");
});

test("② 空文件 → 直接写出新键", () => {
  const merged = mergeEnvText("", { A: "1", B: "two words" });
  assert.equal(merged, "A=1\nB=\"two words\"\n");
  assert.deepEqual(parseEnvFile(merged), { A: "1", B: "two words" });
});

test("② 保留 `export ` 前缀与 `=` 两侧空白格式", () => {
  const src = "export ANS_PI_MODEL = old\n";
  const merged = mergeEnvText(src, { ANS_PI_MODEL: "new" });
  assert.equal(merged, "export ANS_PI_MODEL = new\n");
});

// ---- ③ 特殊字符：值含 = / 空格 / 引号 / # → 可原样读回 ----

test("③ 值含 `=`：不加引号即可，读回原样（值取自首个 `=` 之后）", () => {
  const merged = mergeEnvText("", { ANS_PI_BASE_URL: "http://h?a=b=c" });
  assert.equal(merged, "ANS_PI_BASE_URL=http://h?a=b=c\n");
  assert.equal(parseEnvFile(merged).ANS_PI_BASE_URL, "http://h?a=b=c");
});

test("③ 值含 空格 / `#` / 双引号 / 单引号 / 反斜杠：加引号转义，读回**逐字**一致", () => {
  const nasty = [
    "a b",
    "has # hash",
    'quote "inside"',
    "single 'quote'",
    "back\\slash",
    "tab\there",
    "  leading+trailing  ",
    "eq=in=value",
    "",
  ];
  for (const v of nasty) {
    const merged = mergeEnvText("", { K: v });
    const back = parseEnvFile(merged).K;
    assert.equal(back, v, `值 ${JSON.stringify(v)} 应原样读回（写形式：${merged.trim()}）`);
  }
});

test("③ 替换已存在的带引号值：保留原引号风格，且可读回", () => {
  const merged = mergeEnvText('K="old"\n', { K: "new value" });
  assert.equal(merged, 'K="new value"\n');
  assert.equal(parseEnvFile(merged).K, "new value");
  const merged2 = mergeEnvText("K='old'\n", { K: "plain" });
  assert.equal(merged2, "K='plain'\n");
  assert.equal(parseEnvFile(merged2).K, "plain");
});

test("③ 保留内联注释（替换值时注释不丢）", () => {
  const merged = mergeEnvText("K=old # keep this note\n", { K: "new" });
  assert.equal(merged, "K=new # keep this note\n");
  assert.equal(parseEnvFile(merged).K, "new");
});

test("③ parse：基本形态（注释/空行/export/引号/内联注释/重复后者胜）", () => {
  const text = [
    "# c",
    "",
    "A=1",
    "B='two words'",
    "export C=three",
    "D=val # inline",
    "E=",
    "A=2",
  ].join("\n");
  assert.deepEqual(parseEnvFile(text), {
    A: "2",
    B: "two words",
    C: "three",
    D: "val",
    E: "",
  });
});

test("③ 空值往返：`KEY=` 与原样 `KEY=` 保持一致", () => {
  assert.equal(renderEnvValue(""), "");
  assert.equal(mergeEnvText("", { ANS_PI_ALLOW_REAL: "" }), "ANS_PI_ALLOW_REAL=\n");
  assert.equal(parseEnvFile("ANS_PI_ALLOW_REAL=\n").ANS_PI_ALLOW_REAL, "");
});

test("③ CRLF 行尾保留（不把 \\r\\n 变成 \\n）", () => {
  const src = "# c\r\nA=1\r\nB=2\r\n";
  const merged = mergeEnvText(src, { B: "9" });
  assert.equal(merged, "# c\r\nA=1\r\nB=9\r\n");
  const appended = mergeEnvText(src, { C: "3" });
  assert.equal(appended, "# c\r\nA=1\r\nB=2\r\nC=3\r\n");
});

// ---- ④ 原子写：同目录 temp + rename；无残留 ----

test("④ atomicWriteText 写入内容完整，且目录内无临时文件残留", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    const content = "A=1\nB=2\n";
    await atomicWriteText(target, content);
    assert.equal(await readFile(target, "utf8"), content);
    const names = await readdir(dir);
    assert.deepEqual(names, [".env"], "只应留下目标文件，不得有 temp 残留");
  });
});

test("④ 原子写覆盖已存在文件：内容整体替换、无残留", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    await writeFile(target, "OLD=1\n", "utf8");
    await atomicWriteText(target, "NEW=2\n");
    assert.equal(await readFile(target, "utf8"), "NEW=2\n");
    assert.deepEqual(await readdir(dir), [".env"]);
  });
});

test("④ saveEnvFile 新建 / 覆盖均原子落盘，且无 temp 残留", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    await saveEnvFile(target, { ANS_RUNTIME: "pi" });
    assert.equal(await readFile(target, "utf8"), "ANS_RUNTIME=pi\n");
    await saveEnvFile(target, { ANS_RUNTIME: "demo" });
    assert.equal(await readFile(target, "utf8"), "ANS_RUNTIME=demo\n");
    assert.deepEqual(await readdir(dir), [".env"]);
  });
});

// ---- ⑤ 失败显式：不损坏原文件、不静默 ----

test("⑤ 目标目录不存在 → saveEnvFile 抛错（显式），不创建任何文件", async () => {
  await withTmpDir(async (dir) => {
    const missingDir = path.join(dir, "no-such-dir");
    const target = path.join(missingDir, ".env");
    await assert.rejects(
      () => saveEnvFile(target, { ANS_PI_MODEL: "m" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /env-file/);
        assert.ok(err.message.includes(target), "错误应指明目标路径");
        return true;
      },
    );
    await assert.rejects(() => readdir(missingDir)); // 目录确未被创建
  });
});

test("⑤ 读取失败（目标是目录）→ saveEnvFile 抛错（显式），原目标（目录）不受损", async () => {
  await withTmpDir(async (dir) => {
    const asDir = path.join(dir, ".env");
    await mkdir(asDir);
    await assert.rejects(() => saveEnvFile(asDir, { A: "1" }), /env-file/);
    // 目录仍在（未被当文件覆盖/删除）。
    const st = await readdir(dir);
    assert.ok(st.includes(".env"));
  });
});

test("⑤ readEnvFile 对不存在的文件明确抛错（不静默返回空）", async () => {
  await withTmpDir(async (dir) => {
    await assert.rejects(() => readEnvFile(path.join(dir, ".env")), /env-file/);
  });
});

test("⑤ saveEnvFile 失败时原 `.env` 内容完全不变", async () => {
  await withTmpDir(async (dir) => {
    // 造一个「写入会失败」的场景：目标路径的文件名指向一个已存在的目录占位（写不进）。
    // 用只读式构造：目标所在目录存在，但目标是目录 → 读取阶段即 EISDIR。
    const target = path.join(dir, ".env");
    await mkdir(target);
    const before = await readdir(dir);
    await assert.rejects(() => saveEnvFile(target, { K: "v" }));
    const after = await readdir(dir);
    assert.deepEqual(after.sort(), before.sort(), "失败不得新增/删除任何条目（无 temp 残留）");
  });
});

// ---- ⑥ credential 不回显：哨兵值绝不出现在错误文本/回报中 ----

const SENTINEL = "sk-SENTINEL-do-not-echo-9f3a2b";

test("⑥ 写入失败的错误信息**不含** sentinel 值（只含键名/路径）", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, "no-such-dir", ".env");
    await assert.rejects(
      () => saveEnvFile(target, { ANTHROPIC_AUTH_TOKEN: SENTINEL }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(!err.message.includes(SENTINEL), "错误文本不得回显凭据值");
        // 键名/路径可以出现（合规：只记键名）。
        assert.ok(err.message.includes(target));
        return true;
      },
    );
  });
});

test("⑥ loadEnvFileInto 回报**只含键名**、不含值（哨兵不回显）", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    await writeFile(target, `ANTHROPIC_AUTH_TOKEN=${SENTINEL}\nANS_PI_MODEL=m\n`, "utf8");
    const env: Record<string, string | undefined> = {};
    const result = await loadEnvFileInto(env, target);
    // env 里确有该值（合法读取），但**回报**里没有值。
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, SENTINEL);
    assert.deepEqual([...result.applied].sort(), ["ANS_PI_MODEL", "ANTHROPIC_AUTH_TOKEN"]);
    assert.ok(!JSON.stringify(result).includes(SENTINEL), "回报结构不得含凭据值");
  });
});

test("⑥ readEnvFile 的错误信息不含文件内任何值", async () => {
  await withTmpDir(async (dir) => {
    // 目标不存在，报错不得牵出任何（这里没有的）值；以 sentinel 作为路径无关确认。
    await assert.rejects(
      () => readEnvFile(path.join(dir, SENTINEL)),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        // 路径本身可以出现（非机密），但不得出现任何「值」语义的回显——此处断言消息只由路径构成。
        return true;
      },
    );
  });
});

// ---- ⑦ loadEnvFileInto 语义：不存在→无操作；存在→覆盖同名 ----

test("⑦ loadEnvFileInto：文件不存在 → 无操作、不抛错、applied 为空", async () => {
  await withTmpDir(async (dir) => {
    const env: Record<string, string | undefined> = { KEEP: "x" };
    const result = await loadEnvFileInto(env, path.join(dir, ".env"));
    assert.deepEqual(result.applied, []);
    assert.deepEqual(env, { KEEP: "x" });
  });
});

test("⑦ loadEnvFileInto：同名键以 `.env` 覆盖（保存后重载即生效，设计 §11.3）", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    await writeFile(target, "ANS_PI_MODEL=fresh\n", "utf8");
    const env: Record<string, string | undefined> = { ANS_PI_MODEL: "stale" };
    await loadEnvFileInto(env, target);
    assert.equal(env.ANS_PI_MODEL, "fresh");
  });
});

// ---- ⑧ 机密键名单（供 T28 掩码；单一来源） ----

test("⑧ 机密键名单含 ANTHROPIC_AUTH_TOKEN；isSecretKey 判定一致", () => {
  assert.ok(PI_CONFIG_SECRET_KEYS.includes("ANTHROPIC_AUTH_TOKEN"));
  assert.equal(isSecretKey("ANTHROPIC_AUTH_TOKEN"), true);
  assert.equal(isSecretKey("ANS_PI_MODEL"), false);
  assert.equal(isSecretKey("ANS_PI_BASE_URL"), false);
});

// ---- ⑨ 读→改→写→读 往返（端到端，纪律叠加） ----

test("⑨ 往返：只改一个键后，其余内容完整无损（读回校验）", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    const original = SAMPLE;
    await writeFile(target, original, "utf8");

    await saveEnvFile(target, { ANS_PI_CONTEXT_WINDOW: "200000" });

    const after = await readFile(target, "utf8");
    // 除追加的一行外，原内容逐字节不变。
    assert.ok(after.startsWith(original), "原内容应完整保留为前缀（本用例目标键原不存在）");
    const parsed = parseEnvFile(after);
    assert.equal(parsed.ANS_PI_CONTEXT_WINDOW, "200000");
    assert.equal(parsed.ANS_PI_MODEL, "old-model");
    assert.equal(parsed.SOME_UNKNOWN_KEY, "keep  me  exactly");
  });
});

test("⑨ 往返：修改已存在键，未知键/注释/顺序全保留", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    await writeFile(target, SAMPLE, "utf8");
    await saveEnvFile(target, { ANS_PI_BASE_URL: "https://gw.example/v1" });
    const after = await readFile(target, "utf8");
    assertOnlyLineChanged(SAMPLE, after, 6);
    assert.equal(parseEnvFile(after).ANS_PI_BASE_URL, "https://gw.example/v1");
  });
});
