#!/usr/bin/env bash
# Capture D1 input document versions (lines + SHA-256).
set -u
out="$1"
{
  echo "D1 input document versions (read-only)"
  echo "generated: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "columns: lines  sha256  path"
  echo
  for f in \
    "docs/scheduling/2026-11-03_team-plan_customer-authorization-plane.md" \
    "docs/acceptance/customer-authorization-plane-criteria-v1.md" \
    "角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md" \
    "角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-B0-baseline.md" \
    "角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-implementation.md" \
    "角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-A2-implementation.md" \
    "角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-A3-implementation.md" \
    "角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-implementation.md" \
    "角色卡/桌面窗口/docs/change/2026-11-03_customer-authorization-plane-C1-implementation.md" \
    "角色卡/桌面UI/docs/change/2026-11-03_customer-authorization-plane-C2-implementation.md" \
    "角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-i18n-allowlist-amendment.md"; do
    if [ -f "$f" ]; then
      printf '%s\t%s\t%s\n' "$(wc -l < "$f")" "$(sha256sum "$f" | cut -d' ' -f1)" "$f"
    else
      printf 'MISSING\t-\t%s\n' "$f"
    fi
  done
} > "$out"
cat "$out"
