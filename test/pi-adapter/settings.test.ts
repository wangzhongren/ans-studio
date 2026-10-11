// 环境封闭：压缩等设置只由我们显式给出的值决定，不读项目外/项目内任何设置文件。
// 归属：Pi适配器角色测试目录。
//
// 纯值断言不依赖 Pi；涉及 SettingsManager 的断言在未安装 Pi 时整组跳过。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

// —— 纯值断言（不依赖 Pi）——

test("ANS_SETTINGS_OVERRIDES：压缩被显式钉住为启用 + Pi 内置缺省阈值", () => {
  assert.deepEqual(ANS_SETTINGS_OVERRIDES, {
    compaction: { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 },
    branchSummary: { reserveTokens: 16384 },
  });
  // 自动压缩是我们**要**的行为——这里不得为 false。
  assert.equal(ANS_SETTINGS_OVERRIDES.compaction.enabled, true);
});

// —— SettingsManager 断言（需安装 Pi）——

test("封闭的 settings manager：getCompactionSettings 恒为我们钉住的值", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { buildIsolatedSettingsManager } = await import("../../src/common/pi-adapter/real-adapter.ts");
  const manager = await buildIsolatedSettingsManager();
  assert.deepEqual(manager.getCompactionSettings(), {
    enabled: true,
    reserveTokens: 16384,
    keepRecentTokens: 20000,
  });
  assert.equal(manager.getCompactionEnabled(), true);
});

test("封闭的 settings manager 不读项目内 .pi/settings.json（对照：文件式合并会漏进来）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { SettingsManager } = await import("@earendil-works/pi-coding-agent");
  const { buildIsolatedSettingsManager } = await import("../../src/common/pi-adapter/real-adapter.ts");

  const dir = mkdtempSync(join(tmpdir(), "ans-pi-settings-"));
  try {
    // 在项目目录里埋一份"敌意"设置：关闭压缩并改阈值。
    mkdirSync(join(dir, ".pi"), { recursive: true });
    writeFileSync(
      join(dir, ".pi", "settings.json"),
      JSON.stringify({ compaction: { enabled: false, reserveTokens: 999999, keepRecentTokens: 1 } }),
    );

    // 对照：文件式回落（SDK 未收到 settingsManager 时的行为）会读到它——这正是要堵的漏洞。
    const fileBased = SettingsManager.create(dir, dir);
    assert.equal(fileBased.getCompactionEnabled(), false);

    // 我们的封闭 manager 忽略项目文件，压缩仍启用、阈值仍为我们钉住的值。
    const isolated = await buildIsolatedSettingsManager();
    assert.deepEqual(isolated.getCompactionSettings(), {
      enabled: true,
      reserveTokens: 16384,
      keepRecentTokens: 20000,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
