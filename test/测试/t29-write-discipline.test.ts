// 测试角色：T29 独立验收（其二）——**写入纪律**逐条独立验证。
//
// 归属：test/测试/。**独立**自写；全程只碰系统临时目录（`os.tmpdir()` 下 `mkdtemp`），
// **绝不读写仓库根真实 `.env`**。所有字节级比对由**本文件自己做**（不依赖实现方断言）。
//
// 行文依据：设计稿 §11.4（写入纪律）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { savePiConfig, getPiConfig } from "../../app/desktop/pi-config.ts";
import {
  saveEnvFile,
  readEnvFile,
  loadEnvFileInto,
  atomicWriteText,
} from "../../src/common/shared/env-file.ts";

const SENTINEL_TOKEN = "SENTINEL-TOKEN-T29-discipline-c4f2-DO-NOT-LEAK";

function makeTempDir(): { dir: string; envPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-t29-wd-"));
  return { dir, envPath: path.join(dir, ".env"), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function writeEnv(envPath: string, text: string): void {
  fs.writeFileSync(envPath, text, "utf8");
}

/** 逐行拆开（保留行内容，不保留分隔符）——供本文件自做字节级比对。 */
function lines(text: string): string[] {
  return text.split("\n");
}

// —————————————————————— 1) 只改相关键：我自己做字节级比对 ——————————————————————

test("T29 纪律①：只改相关键——除目标键的值外，其余内容逐字节不变（自比对）", async () => {
  const t = makeTempDir();
  try {
    const original = [
      "# Pi 网关配置（此注释须逐字节保留）",
      'ANS_PI_BASE_URL="https://old.example.test/v1"',
      "",
      "Z_UNKNOWN_KEY=leave-me-alone",
      "SOME_OTHER=value # inline keep me",
      "",
      "ANS_PI_MODEL=old-model",
      "export ANS_PI_PROVIDER=ans-gateway",
      "# 末尾注释也须保留",
      "",
    ].join("\n");
    writeEnv(t.envPath, original);

    const env: Record<string, string | undefined> = {};
    const r = await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_MODEL: "new-model-XYZ" }, env });
    assert.equal(r.ok, true, r.error ?? "");

    const after = fs.readFileSync(t.envPath, "utf8");
    const before = lines(original);
    const now = lines(after);
    assert.equal(now.length, before.length, "行数不得变化（不得重写整份文件）");

    // 目标行 = 唯一变化行；其余行逐一**字节相等**。
    let changed = 0;
    let targetLine = -1;
    for (let i = 0; i < before.length; i++) {
      if (before[i] === now[i]) continue;
      changed++;
      targetLine = i;
    }
    assert.equal(changed, 1, "恰有 1 行变化（只有目标键的值）");
    assert.match(before[targetLine], /^ANS_PI_MODEL=/, "变化的必须是目标键所在行");
    // 目标行我**独立**算出期望：无引号原格式 + 无特殊字符新值 → 原样无引号。
    assert.equal(now[targetLine], "ANS_PI_MODEL=new-model-XYZ");

    // 进一步：把目标行挖掉后，两份文件**逐字节相同**（钉住「其余全等」，含顺序）。
    const strip = (arr: string[]): string => arr.filter((_, i) => i !== targetLine).join("\n");
    assert.equal(strip(now), strip(before), "除目标行外，其余内容须逐字节相同");

    // 未知键 / 注释 / 空行 / 无关键**原样在**（读回确认不是被删改后碰巧等长）。
    const re = await readEnvFile(t.envPath);
    assert.equal(re["Z_UNKNOWN_KEY"], "leave-me-alone");
    assert.equal(re["SOME_OTHER"], "value");
    assert.equal(re["ANS_PI_BASE_URL"], "https://old.example.test/v1");
    assert.equal(re["ANS_PI_MODEL"], "new-model-XYZ");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 2) 键不存在→追加；已存在→就地替换（不动行其余部分） ——————————————————————

test("T29 纪律②：已存在 → 就地替换值，键名/`=`/两侧空白/内联注释均不变", async () => {
  const t = makeTempDir();
  try {
    // 键名与 `=` 周围有空白、值有引号、行尾有内联注释——保存后这三样都须保留。
    const original = 'ANS_PI_BASE_URL = "https://old.example.test/v1"   # keep-this-note\n';
    writeEnv(t.envPath, original);
    const env: Record<string, string | undefined> = {};
    const r = await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_BASE_URL: "https://new.example.test/v2" }, env });
    assert.equal(r.ok, true, r.error ?? "");

    const after = fs.readFileSync(t.envPath, "utf8");
    // 我**独立**算出期望行：` = ` 两侧空白保留、双引号风格保留、内联注释保留。
    assert.equal(after, 'ANS_PI_BASE_URL = "https://new.example.test/v2"   # keep-this-note\n');
  } finally {
    t.cleanup();
  }
});

test("T29 纪律②：键不存在 → 追加到末尾（前文逐字节不变；沿用原行尾符）", async () => {
  const t = makeTempDir();
  try {
    const original = "# head\nANS_PI_MODEL=m\n"; // 无 ANS_PI_CONTEXT_WINDOW
    writeEnv(t.envPath, original);
    const env: Record<string, string | undefined> = {};
    const r = await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_CONTEXT_WINDOW: "131072" }, env });
    assert.equal(r.ok, true, r.error ?? "");

    const after = fs.readFileSync(t.envPath, "utf8");
    assert.ok(after.startsWith(original), "追加不得改动原有前缀（逐字节）");
    assert.ok(after.endsWith("ANS_PI_CONTEXT_WINDOW=131072\n"), "新键应追加到末尾");
    assert.equal(after, original + "ANS_PI_CONTEXT_WINDOW=131072\n");
  } finally {
    t.cleanup();
  }
});

test("T29 纪律②：CRLF 原文 → 追加沿用 CRLF 行尾（不混行尾）", async () => {
  const t = makeTempDir();
  try {
    const original = "# head\r\nANS_PI_MODEL=m\r\n";
    writeEnv(t.envPath, original);
    const env: Record<string, string | undefined> = {};
    await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_CONTEXT_WINDOW: "99" }, env });
    const after = fs.readFileSync(t.envPath, "utf8");
    assert.equal(after, original + "ANS_PI_CONTEXT_WINDOW=99\r\n");
    assert.ok(!after.includes("\n") || after.includes("\r\n"), "不应出现裸 LF 行尾");
    // 去掉所有 CRLF 后不应再有裸 \n。
    assert.equal(after.replace(/\r\n/g, "").includes("\n"), false, "追加行不得用裸 LF 破坏 CRLF 风格");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 3) 特殊字符：写后读回逐字一致 ——————————————————————

test("T29 纪律③：值含 = 空格 引号 # 反斜杠 → 写后读回逐字一致", async () => {
  const t = makeTempDir();
  try {
    const env: Record<string, string | undefined> = {};
    const cases: Array<[string, string]> = [
      ["ANS_PI_MODEL", 'a=b c"d\'e#f\\g'],       // = 空格 " ' # \
      ["ANS_PI_PROVIDER", "  padded both ends  "], // 首尾空白
      ["ANTHROPIC_AUTH_TOKEN", `${SENTINEL_TOKEN}=x#y"z'\\`], // token 也走同一路径
      ["ANS_PI_BASE_URL", "https://h.test/p?a=b=c&d=e"], // URL 查询串（含 =&）
    ];
    const r = await savePiConfig({ envPath: t.envPath, updates: Object.fromEntries(cases), env });
    assert.equal(r.ok, true, r.error ?? "");

    // 经 parse 读回。
    const re = await readEnvFile(t.envPath);
    for (const [k, v] of cases) {
      assert.equal(re[k], v, `${k} 经 parse 读回须逐字一致`);
    }
    // 经 env 载入读回。
    const env2: Record<string, string | undefined> = {};
    await loadEnvFileInto(env2, t.envPath);
    for (const [k, v] of cases) {
      assert.equal(env2[k], v, `${k} 经 loadEnvFileInto 须逐字一致`);
    }
    // 回报与错误文本不得回显哨兵 token 值。
    assert.ok(!JSON.stringify(r).includes(SENTINEL_TOKEN), "savePiConfig 回报不得含 token 值");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 4) 原子性：无半写文件、无 temp 残留 ——————————————————————

test("T29 纪律④：写入后目录内无 temp 残留，目标内容完整（非半写）", async () => {
  const t = makeTempDir();
  try {
    writeEnv(t.envPath, "A=1\n");
    const env: Record<string, string | undefined> = {};
    await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_MODEL: "m" }, env });

    const entries = fs.readdirSync(t.dir);
    assert.deepEqual(entries, [".env"], `目录内应只有 .env，实际：${JSON.stringify(entries)}（不得有 temp 残留）`);
    const after = fs.readFileSync(t.envPath, "utf8");
    assert.equal(after, "A=1\nANS_PI_MODEL=m\n", "内容须是完整合并结果，不得截断/半写");
  } finally {
    t.cleanup();
  }
});

test("T29 纪律④：atomicWriteText 直接调用——内容完整、无 temp 残留、覆盖原子", async () => {
  const t = makeTempDir();
  try {
    await atomicWriteText(t.envPath, "FIRST=1\n");
    assert.equal(fs.readFileSync(t.envPath, "utf8"), "FIRST=1\n");
    await atomicWriteText(t.envPath, "SECOND=2222\n");
    assert.equal(fs.readFileSync(t.envPath, "utf8"), "SECOND=2222\n");
    assert.deepEqual(fs.readdirSync(t.dir), [".env"], "不得有 temp 残留");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 5) 失败路径：抛错且不损坏原文件 ——————————————————————

test("T29 纪律⑤：目标目录不存在 → savePiConfig 显式失败，且不创建任何文件", async () => {
  const t = makeTempDir();
  try {
    const missingDir = path.join(t.dir, "no-such-dir");
    const envPath = path.join(missingDir, ".env");
    const env: Record<string, string | undefined> = {};
    const r = await savePiConfig({ envPath, updates: { ANS_PI_MODEL: "m" }, env });
    assert.equal(r.ok, false, "目标目录不存在应显式失败");
    assert.ok(typeof r.error === "string" && r.error.length > 0, "应给出错误说明");
    assert.equal(fs.existsSync(missingDir), false, "失败不得创建目录");
    assert.deepEqual(r.appliedKeys, [], "失败时 appliedKeys 应为空");
  } finally {
    t.cleanup();
  }
});

test("T29 纪律⑤：saveEnvFile 目标目录不存在 → 抛错（不静默）", async () => {
  const t = makeTempDir();
  try {
    const envPath = path.join(t.dir, "nope", ".env");
    await assert.rejects(() => saveEnvFile(envPath, { ANS_PI_MODEL: "m" }));
  } finally {
    t.cleanup();
  }
});

test("T29 纪律⑤：readEnvFile 目标不存在 → 抛错（读取失败显式，不返回空）", async () => {
  const t = makeTempDir();
  try {
    await assert.rejects(() => readEnvFile(t.envPath), "读取不存在的 .env 应抛错");
    // 对照：loadEnvFileInto 对 ENOENT 是「无 .env」→ 不抛、空 applied（语义不同，须分别成立）。
    const env: Record<string, string | undefined> = {};
    const res = await loadEnvFileInto(env, t.envPath);
    assert.deepEqual(res.applied, []);
  } finally {
    t.cleanup();
  }
});

test("T29 纪律⑤：目标是一个目录 → 抛错，且该目录不被损坏", async () => {
  const t = makeTempDir();
  try {
    // 把「路径」做成一个目录（同名 .env 目录）。
    const envAsDir = path.join(t.dir, "envdir");
    fs.mkdirSync(envAsDir);
    fs.writeFileSync(path.join(envAsDir, "marker.txt"), "untouched", "utf8");

    await assert.rejects(() => saveEnvFile(envAsDir, { ANS_PI_MODEL: "m" }), "目标是目录应抛错");

    // 目录仍在、仍是目录，内容未被损坏/替换。
    assert.equal(fs.statSync(envAsDir).isDirectory(), true, "目标目录不得被替换成文件");
    assert.equal(fs.readFileSync(path.join(envAsDir, "marker.txt"), "utf8"), "untouched");
    assert.deepEqual(fs.readdirSync(t.dir), ["envdir"], "不得留下 temp 残留");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 6) 不回显：哨兵凭据值绝不出现在回报/错误/视图 ——————————————————————

test("T29 纪律⑥：哨兵 token —— 只进 env；回报/错误/视图文本一律不含其值", async () => {
  const t = makeTempDir();
  try {
    // 甲) 成功保存：回报不含值；但 env（落点）确实拿到了值。
    const env: Record<string, string | undefined> = {};
    const ok = await savePiConfig({
      envPath: t.envPath,
      updates: { ANTHROPIC_AUTH_TOKEN: SENTINEL_TOKEN, ANS_PI_MODEL: "m" },
      env,
    });
    assert.equal(ok.ok, true, ok.error ?? "");
    assert.equal(env["ANTHROPIC_AUTH_TOKEN"], SENTINEL_TOKEN, "token 应到达 env（凭据落点）");
    assert.ok(!JSON.stringify(ok).includes(SENTINEL_TOKEN), "成功回报不得含 token 值");

    // 乙) 面板视图：机密键恒空 value、只给 isSet；整份视图文本不含值。
    const view = await getPiConfig(t.envPath);
    const tok = view.fields.find((f) => f.key === "ANTHROPIC_AUTH_TOKEN");
    assert.ok(tok, "应有 token 字段");
    assert.equal(tok!.secret, true);
    assert.equal(tok!.value, "", "机密键 value 必须恒为空串（绝不外发）");
    assert.equal(tok!.isSet, true, "已设置应如实反映为 isSet=true");
    assert.ok(!JSON.stringify(view).includes(SENTINEL_TOKEN), "面板视图不得含 token 值");

    // 丙) **失败路径**携哨兵：错误文本不得回显值。
    const rFail = await savePiConfig({
      envPath: path.join(t.dir, "no-such-dir", ".env"),
      updates: { ANTHROPIC_AUTH_TOKEN: SENTINEL_TOKEN },
      env: {},
    });
    assert.equal(rFail.ok, false);
    assert.ok(!String(rFail.error).includes(SENTINEL_TOKEN), "失败回报不得回显 token 值");

    // 丁) 底层 saveEnvFile 抛错信息也不得回显值。
    let msg = "";
    try {
      await saveEnvFile(path.join(t.dir, "no-such-dir", ".env"), { ANTHROPIC_AUTH_TOKEN: SENTINEL_TOKEN });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    assert.ok(msg.length > 0, "应抛错");
    assert.ok(!msg.includes(SENTINEL_TOKEN), "底层错误文本不得回显 token 值");
  } finally {
    t.cleanup();
  }
});

test("T29 纪律⑥：非面板键被忽略——不越界写入（哨兵值不得落盘）", async () => {
  const t = makeTempDir();
  try {
    writeEnv(t.envPath, "KEEP=1\n");
    const env: Record<string, string | undefined> = {};
    const r = await savePiConfig({
      envPath: t.envPath,
      updates: { EVIL_UNKNOWN_KEY: SENTINEL_TOKEN, ANS_PI_MODEL: "ok" },
      env,
    });
    assert.equal(r.ok, true, r.error ?? "");
    assert.deepEqual(r.appliedKeys, ["ANS_PI_MODEL"], "只采纳面板键");
    const after = fs.readFileSync(t.envPath, "utf8");
    assert.ok(!after.includes("EVIL_UNKNOWN_KEY"), "非面板键不得落盘");
    assert.ok(!after.includes(SENTINEL_TOKEN), "非面板键的值不得落盘");
    assert.equal(after, "KEEP=1\nANS_PI_MODEL=ok\n");
  } finally {
    t.cleanup();
  }
});
