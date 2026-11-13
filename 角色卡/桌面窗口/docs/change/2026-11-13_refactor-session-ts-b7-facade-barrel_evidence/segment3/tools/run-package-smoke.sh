#!/usr/bin/env bash
# B7 第三段：本地 Windows 打包冒烟（npm run package:local = build:renderer + electron-builder --publish never）。
# 不发布/不上传；产物落 release-output/local（.gitignore 已覆盖）。
set -u
WT="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7"
E="$WT/角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/package"
cd "$WT" || exit 90
mkdir -p "$E"
start=$(date +%s)
npm run package:local > "$E/package-local.log" 2>&1
code=$?
dur=$(( $(date +%s) - start ))
{
  echo "command: npm run package:local"
  echo "exit=$code dur=${dur}s"
  echo "note: script = npm run build:renderer && electron-builder --config electron-builder.yml --publish never -c.directories.output=release-output/local"
} > "$E/package-summary.txt"
ls -la release-output/local > "$E/artifact-listing.txt" 2>&1
{
  echo "# top-level file sizes (bytes) and paths"
  find release-output/local -maxdepth 1 -type f -printf "%s %p\n" 2>/dev/null | sort -k2
} >> "$E/artifact-listing.txt" 2>&1
( cd release-output/local 2>/dev/null && sha256sum * 2>/dev/null ) > "$E/sha256sums.txt"
git status --porcelain > "$E/git-status-after-package.txt"
git check-ignore -v release-output/local > "$E/gitignore-check.txt" 2>&1
exit $code
