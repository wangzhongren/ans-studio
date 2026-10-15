---
id: desktop-packaged-env-path-hint
type: fix
created: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 安装包配置提示指向实际显示路径

root基于已授权v1.0.0运行包发布测试指出：Window将packaged配置保存至userData/.env，dev仍repo.env，renderer硬编码“仓库根”会误导安装包用户。

仅两处可见文案改为“上方显示的 .env 路径”：index静态hint与renderer renderPiConfig动态hint。上方既有pi-panel-path提供实际envPath，不新增API、不改保存逻辑/accepted设计。静态提示移除只适用于仓库的gitignore括注，保其余键保留及生效说明。

生产hash：
- app/renderer/index.html：7ca6bdfcbd093af7601717dbceea9a86b94efe7b890dead605d14dc109d12a6e（前7beda47c…）
- app/renderer/renderer.js：35e2d289639dad05f4453ffe9a16649ea1d1a497d6380414e403a1660a5aceff（前5324b786…）

node --check renderer.js、现有renderer.test.ts与git diff --check退出0；日志/private/tmp/ans-release-env-hint-renderer.log。无测试源码改动、无GUI/Electron/全套运行，实际安装包路径验收由Window/装配/root证据覆盖。已直接向release_assembly交付精确2文件覆盖清单。
