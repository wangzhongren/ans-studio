#!/usr/bin/env python3
"""B7 closure: read-only extraction from the final-round CI logs (run 44010606352).

Inputs (passed as arguments, never imported/executed):
  --arm64 / --x64 / --win   paths to test-ci-output.log extracted from the three artifacts
  --outdir                  evidence output directory (this script's directory by default)

Outputs (derived summaries only; raw logs stay outside the repository):
  ci-summary.json           per-platform counts, fail names, file-level entries, skip lists,
                            log hashes, structural-guard lines, watchlist matches
  skipped-<platform>.txt    skipped test names + reasons
  skipped-names.json        skipped lists as JSON
  failnames-<platform>.txt  unique failure names (empty in the final green round)
  watchlist-matches.json    residual / zero-regression / structural watchlist matches

The script never writes outside --outdir and never modifies the input logs.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

RESULT_RE = re.compile(
    r"^\s*(?P<mark>[✔✖﹣])\s+(?P<name>.+?)\s+\((?P<dur>[0-9]+(?:\.[0-9]+)?)ms\)"
    r"(?: # (?P<reason>.*))?$"
)
SUMMARY_RE = re.compile(
    r"^ℹ (?P<key>tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (?P<val>.+)$"
)
FILE_LEVEL_RE = re.compile(r"^test[\\/]")
DIFFERENTIAL_RE = re.compile(r"^differential\(")

# Watchlist: (id, kind, substring pattern). kind = residual | regression | structural
WATCHLIST = [
    # R9 eighth-round residual 13 (deliverable 4)
    ("R1", "residual", "Git team plan publication and active-only activation"),
    ("R2", "residual", "Q2 P2 first new project"),
    ("R3", "residual", "document-change 保专业规划scope不授旧执行pin"),
    ("R4", "residual", "document-change-wrong-flow"),
    ("R5", "residual", "document-change-source-loss"),
    ("R6", "residual", "连续写入后"),
    ("R7", "residual", "真实重启迁移后"),
    ("R8", "residual", "W34 真实首文档发布与原创建者关闭后派团队规划保独立scope"),
    ("R9", "residual", "W35 缺team仍可真实Chief报告派人事准备但D3写动作拒绝"),
    ("R10", "residual", "AC-4：Claude convener 在受保护项目完成任务/回合内 git_publish delivery 完整链"),
    ("R11", "residual", "W-J5/J15：judge 代批"),
    ("R12", "residual", "Git final spawn fence"),
    ("R13", "residual", "重启：未决申请 orphaned"),
    # A2 / P-9 cascade and E2/E3 close-out
    ("A2P9", "residual", "Git team plan prepare→commit (P-9)"),
    # Zero-regression watchlist (deliverable 5)
    ("Z01", "regression", "W33 真实DocRun"),
    ("Z02", "regression", "document-change-missing-confirmation"),
    ("Z03", "regression", "重启恢复：未投递任务重新入队一次"),
    ("Z04", "regression", "independent C Window"),
    ("Z05", "regression", "独立真实 Claude"),
    ("Z06", "regression", "独立真实 Codex"),
    ("Z07", "regression", "独立真实 Pi"),
    ("Z08", "regression", "W19 实际Core"),
    ("Z09", "regression", "run-pin：M1/M2/M3"),
    ("Z10", "regression", "run-pin：缺 D3"),
    ("Z11", "regression", "Pipeline initial workflow source"),
    ("Z12", "regression", "Q74 owned Git metadata"),
    ("Z13", "regression", "W36 真实Chief"),
    ("Z14", "regression", "路径 B：B3 accepted"),
    ("Z15", "regression", "actual Core request_choice abort"),
    ("Z16", "regression", "Q30 fixture HTTP"),
    ("Z17", "regression", "W1b 真实SessionManager"),
    ("Z18", "structural", "gate H13：真实边界未撤销的 prepared 条目"),
]


def parse_int(value):
    value = value.strip()
    try:
        return int(value)
    except ValueError:
        return value


def parse_float(value):
    try:
        return float(value.strip())
    except ValueError:
        return value.strip()


def parse_log(path: Path):
    data = path.read_bytes()
    text = data.decode("utf-8", errors="replace")
    lines = text.splitlines()

    summary = {}
    results = []
    unparsed_mark_lines = []
    differential_lines = []
    module_graph = {}

    module_graph_start = None
    for idx, line in enumerate(lines):
        if line.startswith("module-graph: {"):
            module_graph_start = idx
            break
    if module_graph_start is not None:
        block = [lines[module_graph_start].split("{", 1)[1]]
        for line in lines[module_graph_start + 1 :]:
            if line == "}":
                break
            block.append(line)
        try:
            module_graph = json.loads("{" + "\n".join(block) + "}")
        except json.JSONDecodeError:
            module_graph = {"parseError": True}

    for line in lines:
        m = SUMMARY_RE.match(line)
        if m:
            key, val = m.group("key"), m.group("val")
            summary[key] = parse_float(val) if key == "duration_ms" else parse_int(val)
            continue
        if line.lstrip().startswith(("✔", "✖", "﹣")):
            if line.startswith("✖ failing tests:"):
                continue
            m = RESULT_RE.match(line)
            if m:
                results.append(
                    {
                        "mark": m.group("mark"),
                        "name": m.group("name").strip(),
                        "durationMs": float(m.group("dur")),
                        "reason": (m.group("reason") or "").strip(),
                        "indented": line[:1].isspace(),
                    }
                )
            else:
                unparsed_mark_lines.append(line)
            continue
        if DIFFERENTIAL_RE.match(line.strip()):
            differential_lines.append(line.strip())

    passes = [r for r in results if r["mark"] == "✔"]
    fails = [r for r in results if r["mark"] == "✖"]
    skips = [r for r in results if r["mark"] == "﹣"]

    fail_names = sorted({r["name"] for r in fails})
    file_level = [n for n in fail_names if FILE_LEVEL_RE.match(n)]

    skipped = [
        {"name": r["name"], "reason": r["reason"], "durationMs": r["durationMs"]}
        for r in skips
    ]

    return {
        "log": {
            "path": str(path),
            "bytes": len(data),
            "lines": len(lines),
            "sha256": hashlib.sha256(data).hexdigest(),
        },
        "summary": summary,
        "marks": {
            "passLines": len(passes),
            "failLines": len(fails),
            "skipLines": len(skips),
            "indentedPassLines": sum(1 for r in passes if r["indented"]),
            "indentedFailLines": sum(1 for r in fails if r["indented"]),
            "indentedSkipLines": sum(1 for r in skips if r["indented"]),
            "unparsedMarkLines": unparsed_mark_lines[:20],
            "unparsedMarkLineCount": len(unparsed_mark_lines),
        },
        "failNames": fail_names,
        "fileLevelEntries": file_level,
        "skipped": skipped,
        "structuralGuards": {
            "differential": differential_lines,
            "moduleGraph": module_graph,
        },
        "results": results,
    }


def matches_for(results, pattern):
    return [
        {
            "mark": r["mark"],
            "name": r["name"],
            "durationMs": r["durationMs"],
            "reason": r["reason"],
        }
        for r in results
        if pattern in r["name"]
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm64", required=True)
    parser.add_argument("--x64", required=True)
    parser.add_argument("--win", required=True)
    parser.add_argument("--outdir", default=str(Path(__file__).resolve().parent))
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    platform_logs = {
        "arm64": Path(args.arm64),
        "x64": Path(args.x64),
        "win": Path(args.win),
    }
    parsed = {name: parse_log(p) for name, p in platform_logs.items()}

    fail_union = sorted({n for p in parsed.values() for n in p["failNames"]})
    skipped_counts = {name: len(p["skipped"]) for name, p in parsed.items()}

    summary = {
        "schema": "ans-b7-closure-ci-summary/v1",
        "runId": 44010606352,
        "headSha": "ffe75ce623a659320e9caf1079ef7e9d81330b02",
        "event": "workflow_dispatch",
        "workflow": ".github/workflows/test-ci.yml",
        "displayTitle": "Test matrix (development feedback)",
        "conclusion": "success",
        "createdAt": "2026-11-17T03:29:47Z",
        "updatedAt": "2026-11-17T04:36:43Z",
        "platforms": {},
        "failUnion": fail_union,
        "fileLevelUnion": sorted({n for p in parsed.values() for n in p["fileLevelEntries"]}),
        "skippedCounts": skipped_counts,
        "watchlist": {},
    }

    platform_meta = {
        "arm64": {
            "platform": "mac-arm64",
            "jobId": 133796454792,
            "jobName": "test (macos-15, mac, arm64)",
            "startedAt": "2026-11-17T03:29:51Z",
            "completedAt": "2026-11-17T03:57:23Z",
            "artifact": {
                "name": "test-logs-mac-arm64",
                "sizeBytes": 305117,
                "digest": "sha256:698357e3a860fde8e308b7f07b249857399ea67c5aff28e1833193557366ca06",
            },
            "typecheck": "success",
        },
        "x64": {
            "platform": "mac-x64",
            "jobId": 133796455083,
            "jobName": "test (macos-15-intel, mac, x64)",
            "startedAt": "2026-11-17T03:29:52Z",
            "completedAt": "2026-11-17T04:36:43Z",
            "artifact": {
                "name": "test-logs-mac-x64",
                "sizeBytes": 311365,
                "digest": "sha256:417d098d104b7f2cb7b109c84543106d17724ac1656ded9c8fb9eac59513bc8c",
            },
            "typecheck": "success",
        },
        "win": {
            "platform": "win-x64",
            "jobId": 133796455107,
            "jobName": "test (windows-2025, win, x64)",
            "startedAt": "2026-11-17T03:29:50Z",
            "completedAt": "2026-11-17T03:57:39Z",
            "artifact": {
                "name": "test-logs-win-x64",
                "sizeBytes": 301369,
                "digest": "sha256:45ba0aba424db043fd83916c301ee2d858f6fea23ddc4f40937758b47504ecd0",
            },
            "typecheck": "success",
        },
    }

    for key, p in parsed.items():
        meta = platform_meta[key]
        summary["platforms"][key] = {
            **meta,
            "log": p["log"],
            "counts": {
                "tests": p["summary"].get("tests"),
                "suites": p["summary"].get("suites"),
                "pass": p["summary"].get("pass"),
                "fail": p["summary"].get("fail"),
                "cancelled": p["summary"].get("cancelled"),
                "skipped": p["summary"].get("skipped"),
                "todo": p["summary"].get("todo"),
                "durationMs": p["summary"].get("duration_ms"),
            },
            "marks": p["marks"],
            "failNames": p["failNames"],
            "fileLevelEntries": p["fileLevelEntries"],
            "structuralGuards": p["structuralGuards"],
        }

        skipped_path = outdir / ("skipped-%s.txt" % meta["platform"])
        skipped_path.write_text(
            "\n".join(
                "%s%s" % (s["name"], ("  # " + s["reason"]) if s["reason"] else "")
                for s in p["skipped"]
            )
            + ("\n" if p["skipped"] else ""),
            encoding="utf-8",
        )

        fail_path = outdir / ("failnames-%s.txt" % meta["platform"])
        fail_path.write_text(
            "\n".join(p["failNames"]) + ("\n" if p["failNames"] else ""), encoding="utf-8"
        )

    skipped_names = {
        platform_meta[key]["platform"]: p["skipped"] for key, p in parsed.items()
    }
    (outdir / "skipped-names.json").write_text(
        json.dumps(
            {"schema": "ans-b7-closure-skipped/v1", "platforms": skipped_names},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    watchlist = {}
    for wid, kind, pattern in WATCHLIST:
        watchlist[wid] = {
            "kind": kind,
            "pattern": pattern,
            "platforms": {
                platform_meta[key]["platform"]: matches_for(p["results"], pattern)
                for key, p in parsed.items()
            },
        }
    summary["watchlist"] = watchlist
    (outdir / "watchlist-matches.json").write_text(
        json.dumps(
            {"schema": "ans-b7-closure-watchlist/v1", "watchlist": watchlist},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    (outdir / "ci-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # ASCII-only console report (script may run under `python -I` with a legacy console).
    for key in ("arm64", "x64", "win"):
        c = summary["platforms"][key]["counts"]
        print(
            "%-6s tests=%s pass=%s fail=%s cancelled=%s skipped=%s duration_ms=%s"
            % (key, c["tests"], c["pass"], c["fail"], c["cancelled"], c["skipped"], c["durationMs"])
        )
    print("failUnion=%d fileLevelUnion=%d" % (len(fail_union), len(summary["fileLevelUnion"])))
    print("skippedCounts=%s" % json.dumps(skipped_counts, sort_keys=True))
    print("outputs written to %s" % outdir)


if __name__ == "__main__":
    sys.exit(main())
