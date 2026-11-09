#!/usr/bin/env bash
# W-J5 before/after comparison over per-file TAP summaries.
# Usage: compare.sh <preDir> <postDir> <outDir>
set -u
pre="$1"; post="$2"; out="$3"
mkdir -p "$out"
titles() {
  local dir="$1" outfile="$2" kind="$3"
  : > "$outfile"
  for f in "$dir"/*.tap; do
    local base; base=$(basename "$f" .tap)
    case "$kind" in
      fail) awk -v f="$base" '/^not ok [0-9]+ - /{ sub(/^not ok [0-9]+ - /,""); print f"\t"$0 }' "$f" >> "$outfile" ;;
      skip) awk -v f="$base" '/^ok [0-9]+ - .* # SKIP/{ sub(/^ok [0-9]+ - /,""); print f"\t"$0 }' "$f" >> "$outfile" ;;
    esac
  done
  sort -u -o "$outfile" "$outfile"
}
titles "$pre" "$out/fails-pre.txt" fail
titles "$post" "$out/fails-post.txt" fail
titles "$pre" "$out/skips-pre.txt" skip
titles "$post" "$out/skips-post.txt" skip
diff -u "$out/fails-pre.txt" "$out/fails-post.txt" > "$out/fails-diff.txt" || true
diff -u "$out/skips-pre.txt" "$out/skips-post.txt" > "$out/skips-diff.txt" || true
# Per-file count/status comparison
awk -F'\t' 'NR>1 { print $1"\t"$2"\t"$3"\t"$4"\t"$5"\t"$6"\t"$7"\t"$8"\t"$9 }' "$pre/summary.tsv" | sort > "$out/pre-normalized.tsv"
awk -F'\t' 'NR>1 { print $1"\t"$2"\t"$3"\t"$4"\t"$5"\t"$6"\t"$7"\t"$8"\t"$9 }' "$post/summary.tsv" | sort > "$out/post-normalized.tsv"
join -t $'\t' -a1 -a2 -e MISSING -o '0,1.2,2.2,1.3,2.3,1.4,2.4,1.5,2.5,1.6,2.6,1.7,2.7,1.8,2.8,1.9,2.9' \
  "$out/pre-normalized.tsv" "$out/post-normalized.tsv" > "$out/per-file-joined.tsv" 2>/dev/null || true
awk -F'\t' '$2!=$3 || $4!=$5 || $6!=$7 || $8!=$9 || $10!=$11 || $12!=$13 || $14!=$15 || $16!=$17 { print }' \
  "$out/per-file-joined.tsv" > "$out/per-file-diff.tsv"
# Totals
sumcol() { awk -F'\t' -v c="$2" 'NR>1 && $c!="-" {s+=$c} END{print s+0}' "$1/summary.tsv"; }
{
  echo -e "dir\ttests\tpass\tfail\tcancelled\tskipped\ttodo\tfiles\thang_or_nosummary"
  for d in "$pre" "$post"; do
    files=$(awk 'NR>1' "$d/summary.tsv" | wc -l)
    hang=$(awk -F'\t' 'NR>1 && $3=="-"' "$d/summary.tsv" | wc -l)
    echo -e "$d\t$(sumcol "$d" 3)\t$(sumcol "$d" 4)\t$(sumcol "$d" 5)\t$(sumcol "$d" 6)\t$(sumcol "$d" 7)\t$(sumcol "$d" 8)\t$files\t$hang"
  done
} > "$out/totals.tsv"
echo "fail-titles pre=$(wc -l < "$out/fails-pre.txt") post=$(wc -l < "$out/fails-post.txt")"
echo "skip-titles pre=$(wc -l < "$out/skips-pre.txt") post=$(wc -l < "$out/skips-post.txt")"
echo "per-file diffs: $(wc -l < "$out/per-file-diff.tsv")"
cat "$out/totals.tsv"
