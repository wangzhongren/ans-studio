// ANS 运行时的**固定设置覆盖**（环境封闭）。
//
// 归属：Pi适配器角色私有辅助（src/common/pi-adapter/）。
//
// 本文件**不 import 任何 Pi 包**，可在纯单测（未安装 Pi）中加载；真正的
// `SettingsManager.inMemory(...)` 构造在 real-adapter.ts 里完成。
//
// ── 背景（要封闭的漏洞）──
// 适配器经 `createAgentSession` 构造会话时若**不给** settingsManager，SDK 会回落到
// `SettingsManager.create(cwd, getAgentDir())`（dist/core/sdk.js:76），从而去读
// `~/.pi/agent/settings.json`（或 `$PI_CODING_AGENT_DIR` 指向处）以及 **`<项目>/.pi/settings.json`**。
// 默认安全，但用户全局若设了 `compaction.enabled=false` 或改了压缩阈值，行为就跟着变——
// 与本项目"不碰 ~/.pi/agent/ 全局 provider/凭据配置"的做法自相矛盾：设置仍从那儿漏进来。
//
// ── 对策 ──
// 显式构造 `SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES)`
// （settings-manager.d.ts:213「Create an in-memory SettingsManager (no file I/O)」；
//  实现 settings-manager.js:251-256，`InMemorySettingsStorage`，绝不读任何文件），
// 把它**同时**交给 `DefaultResourceLoader` 与 `createAgentSession`。
// 未在下面列出的设置一律取 Pi 内置缺省值（版本固定、可预期），不再受用户文件影响。
//
// ── 选定值的依据 ──
// 下列值**均等同 Pi 内置缺省**，故与"干净安装"行为一致；显式钉住只是为了让压缩行为
// **只由我们给出的值决定**——既不受用户文件影响，也不受 SDK 未来改默认值影响。
//   - compaction.enabled = true：自动压缩是我们**要**的行为（DEFAULT_COMPACTION_SETTINGS.enabled=true，
//     dist/core/compaction/compaction.js:53-57），不关闭。
//   - compaction.reserveTokens / keepRecentTokens = 16384 / 20000：同 compaction.js:53-57 与
//     settings-manager.js:10-13（DEFAULT_COMPACTION_TOKEN_SETTINGS）；`getCompactionSettings`
//     的逐字段回落见 settings-manager.js:632-662。
//   - branchSummary.reserveTokens = 16384：getBranchSummarySettings 的缺省（settings-manager.js:663-668）。

/** 与 Pi `Partial<Settings>` 结构兼容的固定覆盖子集；此处自持形状以免依赖 Pi 包。 */
export interface AnsSettingsOverrides {
  compaction: {
    enabled: boolean;
    reserveTokens: number;
    keepRecentTokens: number;
  };
  branchSummary: {
    reserveTokens: number;
  };
}

/**
 * 传给 `SettingsManager.inMemory` 的固定覆盖。**不要**根据环境变量或配置文件改这里的值——
 * 本模块的整个意义就是让压缩行为可预期；需要调阈值时应作为一次显式的代码变更评审。
 */
export const ANS_SETTINGS_OVERRIDES: AnsSettingsOverrides = {
  compaction: {
    enabled: true,
    reserveTokens: 16384,
    keepRecentTokens: 20000,
  },
  branchSummary: {
    reserveTokens: 16384,
  },
};
