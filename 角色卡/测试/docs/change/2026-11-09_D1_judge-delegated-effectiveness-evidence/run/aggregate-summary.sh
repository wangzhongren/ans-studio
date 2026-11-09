#!/usr/bin/env bash
# Aggregate per-file summary.tsv -> totals + hang list.
# Usage: aggregate-summary.sh <suite-dir>
set -u
export LC_ALL=C
dir="$1"
awk -F'\t' '
  NR>1 {
    files++
    if ($2 ~ /^hang/) hangs++
    for (i=3;i<=8;i++) if ($i != "-") { v[i] += $i } else { miss[i]++ }
    if ($9 != 0) nonzero_exit++
    dur += $10
  }
  END {
    printf "files\t%d\n", files
    printf "tests\t%s\n", (miss[3] ? miss[3] " files missing" : v[3])
    printf "pass\t%s\n", (miss[4] ? miss[4] " files missing" : v[4])
    printf "fail\t%s\n", (miss[5] ? miss[5] " files missing" : v[5])
    printf "cancelled\t%s\n", (miss[6] ? miss[6] " files missing" : v[6])
    printf "skipped\t%s\n", (miss[7] ? miss[7] " files missing" : v[7])
    printf "todo\t%s\n", (miss[8] ? miss[8] " files missing" : v[8])
    printf "hang_files\t%d\n", hangs
    printf "nonzero_exit_files\t%d\n", nonzero_exit
    printf "duration_s_total\t%d\n", dur
  }' "$dir/summary.tsv"
awk -F'\t' 'NR>1 && ($2 ~ /^hang/ || $9 != 0 || $5 != "0") {print $1"\t"$2"\t"$3"\t"$4"\t"$5"\t"$6"\t"$7"\t"$8"\t"$9"\t"$10}' "$dir/summary.tsv" > "$dir/nonzero.tsv"
