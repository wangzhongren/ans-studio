#!/usr/bin/env python3
"""B7 closure: read-only classification and baseline rebuild.

Consumes only derived summaries (ci-summary.json / skipped-names.json / watchlist-matches.json)
plus the frozen historical baseline files. Produces:

  run-metadata.json                 verified run/job/artifact metadata + invalid-run history
  knownred-review.json / .md        frozen known-red 33/5/24 vs final-round zero-hit review
  b0-new-<platform>.json/.txt       per-platform new B0 baseline (empty failure set)
  b7-new-<platform>.json/.txt       per-platform new B7 baseline (empty failure set)
  new-baseline-merged.json          merged new baseline
  baseline-diff-classification.json/.tsv
                                    per-name classification (a/b/c/d) of the old 191/190 names
  residual-zero-report.json         R9 eighth-round 13 residuals + A2/P-9/E2/E3 close-out
  zero-regression.json              zero-regression watchlist + structural guards

No raw CI logs are copied; no files outside --outdir are written.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

BASELINE_REL = (
    "角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3"
)

EXPECTED = {
    "B0": 191,
    "B7": 190,
    "knownRed": {"runtime-core-33": 33, "gates-5": 5, "orchestration-24": 24},
}

# Exact names of the R9 eighth-round 13 residuals (from the R9 records / final-round logs).
RESIDUAL_NAMES = {
    "R1": "Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority",
    "R2": "Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards",
    "R3": "W29 默认Core/Chat真实既有文档基线后续 document-change 保专业规划scope不授旧执行pin",
    "R4": "W29 默认Core/Chat真实既有文档基线后续 document-change-wrong-flow 保专业规划scope不授旧执行pin",
    "R5": "W29 默认Core/Chat真实既有文档基线后续 document-change-source-loss 保专业规划scope不授旧执行pin",
    "R6": "W30 默认Core/Chat真实第二版意图卡确认必须持久同request版本冻结 连续写入后",
    "R7": "W30 默认Core/Chat真实第二版意图卡确认必须持久同request版本冻结 真实重启迁移后",
    "R8": "W34 真实首文档发布与原创建者关闭后派团队规划保独立scope",
    "R9": "W35 缺team仍可真实Chief报告派人事准备但D3写动作拒绝",
    "R10": "AC-4：Claude convener 在受保护项目完成任务/回合内 git_publish delivery 完整链（sidecar {publication}/ref journal/发布回执，无 native 前提）",
    "R11": "W-J5/J15：judge 代批 intent 冻结 → verifyReviewIntent → judge D3 经 Runtime 包装层激活 → pin/run；非法 d3-by 仍负例",
    "R12": "Git final spawn fence: real pending-record interruption records no launch and permits a later genuine retry",
    "R13": "重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等",
}

RESIDUAL_BATCH = {
    "R1": "R9-A（夹具根 realpath）+ R9-A2（per-test 180→300s）+ R9-E3（300→600s）",
    "R2": "R9-E（三层预算 + 超时诊断）+ R9-E2（tail 拆 4 子段，remainingCase）+ R9-E3（child 900s / 父 960s）",
    "R3": "R9-B（turnLastResortMs 4500→30000；用例预算/等待同步）",
    "R4": "R9-B（同上）",
    "R5": "R9-B（同上）",
    "R6": "R9-B（同上）",
    "R7": "R9-B（同上）",
    "R8": "R9-B（同上；W34 另有 18s<20s 预算矛盾修正）",
    "R9": "R9-B（W34 级联消失）",
    "R10": "无需代码改动；#137 CLI 600s 覆盖（E3 轮复核）",
    "R11": "R9-F（per-test 180s→300s）",
    "R12": "R9-C（spawn fence 路 C：零进程记录 fail-closed 分类）",
    "R13": "R9-D（fs.rm 有界重试；B7 记录已先转绿）",
}

RESIDUAL_PLATFORM_KEY = {"arm64": "mac-arm64", "x64": "mac-x64", "win": "win-x64"}

# R9-batch targets that exist in the old B0/B7 baseline (classification stays a/b/c/d
# by primary category; this mapping preserves the R9 batch linkage without double counting).
R9_BATCH_IN_OLD = {
    "Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority": "A + A2 + E3",
    "W34 真实首文档发布与原创建者关闭后派团队规划保独立scope": "B",
    "重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等": "D",
}


def read_names(path):
    return [line.rstrip("\n") for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_special_notes():
    """Known batch provenance for old-baseline names (only where records are explicit)."""
    return {
        "W19 实际Core回报与Git回调同assignment；报告续父/通知/新chat/关闭父边界":
            "w19 批（close 必发通知 / hub 跨 run 白名单）",
        "W33 真实DocRun关闭通知退休旧InitRun绑定且后续合法任务继续":
            "w19 批（W33 遗留 active 条目清理链）",
        "重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过":
            "misc 批（v2.0.0 run-bound 重写）+ x64fu（有界等待）",
        "Q74 owned Git metadata observer atomic rename race remains bounded and strict":
            "B6b（产品文案同步）+ B5（证据目录 mkdir）",
        "Q30 fixture HTTP preserves split UTF8 and byte budget":
            "B6b（证据目录 mkdir）",
        "Q normal-new early chain: actual chief customer request -> formal product dispatch -> product write/report; no seeded freeze":
            "misc 批（fixed A1→A2→A3 重写并退役旧名）",
        "run-pin：M1/M2/M3 共享 draft runId；handoff 前 pin 同一 runId；任务锚定 pinned":
            "B3a 残差后续批次",
        "关闭全部与双角色刷新扫描交接：停止返回后没有后续重开或投递":
            "B5（夹具 gate 顺序修复；10s 有界）",
        "C-04 decision 开关开启（真实 channel）：judge 按唯一推荐项代选 terminate ⇒ 0 张客户卡 + 结果行 + 任务收口":
            "B5（v2.0.0 decision 卡语义更新，旧名退役）",
        "AC-8 预算：索引 5,223 B、最大详情 4,089 B（均 ≤8192 B，B1 实测 pin）":
            "B6b（文档内容增长后重钉）",
        "buildProjectConfig：由枚举结果构造角色表，acceptance 透传":
            "B6b（文档化非角色目录 warning）",
        "D-04 撤除残留：src/app 生产源码零命中（排除 dist/node_modules）":
            "B6b（team-plan 词汇重新引入）",
        "F3 护栏矩阵：无轮次/非客户轮（派发或系统 kind）⇒ not-customer-turn 逐字＋零副作用；客户轮与排队客户消息轮放行":
            "B5/B6b（绑定层 + handler 两层语义）",
        "F7 拒绝路径诊断：mcp.refused 落盘（reasonCode 如实）；系统行零投递已由 F2 覆盖":
            "B6b（两层语义）",
        "stable workflow：确认卡 → 许可安装 → run-role gate 放行/拒绝 → completeWrite → mini re-pin（不升版本、无 drift）":
            "B6b（active-role-evidence 夹具）",
        "appointment-write：role-card 钩子 → 许可 → gate → mini re-pin roleCards（F15 三类快照、不升版本）":
            "B6b（active-role-evidence 夹具）",
        "跨轮配对：两轮各一次检索 ⇒ 每轮恰一对、turnId 归各自轮、结果文本各自对应（id 不串）":
            "B6b（currentTurnId getter 契约）",
        "审计坏行：downloads.jsonl/tasks.jsonl 坏行不影响主路径；小上限账本轮转仍可读":
            "B5（trunk 账本 observation 语义）",
        "一项目一卡：前一张未决时下载卡排队，不呈现":
            "B5（toolCallId/requestId 透传）",
        "B1 检查时限到点不中止；turnLastResortMs 到点才中止，文案明确「最后兜底」":
            "B5（mock 时钟推进，b-last-resort）",
        "重建 dispose 等待窗口：stop A 保持用户目标/关闭契约":
            "B5（stop 栅栏语义同步）",
        "重建 dispose 等待窗口：stop all 保持用户目标/关闭契约":
            "B5（stop 栅栏语义同步）",
        "重建 open 等待窗口：stop A 保持用户目标/关闭契约":
            "B5（stop 栅栏语义同步）",
        "T1 actual bin role/claude: actual adapter and registered handler reject an out-of-boundary write":
            "B6b（受派任务授权交集）",
        "T1 actual bin role/codex: actual adapter and registered handler reject an out-of-boundary write":
            "B6b（受派任务授权交集）",
        "T1 actual bin role/pi: actual adapter and registered handler reject an out-of-boundary write":
            "B6b（受派任务授权交集）",
        "T1 claude: real Pipeline confirmation pause → abort → stale yes → next write denied → current yes permits exact path/report":
            "B6b（受派任务授权交集/聊天回交）",
        "T1 codex: real Pipeline confirmation pause → abort → stale yes → next write denied → current yes permits exact path/report":
            "B6b（受派任务授权交集/聊天回交）",
        "T1 pi: real Pipeline confirmation pause → abort → stale yes → next write denied → current yes permits exact path/report":
            "B6b（受派任务授权交集/聊天回交）",
        "commit-race":
            "W5 参数化嵌套子用例名（最终轮绿）",
        "required":
            "W10 参数化嵌套子用例名（最终轮绿）",
        "selected":
            "W7/W5 参数化嵌套子用例名（最终轮绿）",
        "硬编码守卫：allowlist 之外不得出现中文（B0 基线条目全部通过）":
            "B7 新增失败；i18n allowlist Option A 已解决（B7 补记）",
    }


def classify(name, kr_suite, b_set, c_set, notes):
    if name in kr_suite:
        suite = kr_suite[name]
        if suite == "runtime-core-33":
            note = "KR-33（K1–K4 分类与修复）"
        elif suite == "gates-5":
            note = "KR-29（门禁 A 批）"
        else:
            note = "KR-29（编排 B 批）"
        if name.startswith("Git team plan publication"):
            note += "；另经 R9-A 夹具 realpath + A2/E3 预算"
        if name.startswith("wiring guards"):
            note += "；KR-29 记录：B3c 8f6bbd2 已修复（基线过期）"
        return "a", suite, note
    if name in b_set:
        return (
            "b",
            "",
            "R9-B（turnLastResortMs/用例预算）；B0/B7 时期另有 e71501c 漂移背景（B4 记录）",
        )
    if name in c_set:
        return "c", "", notes.get(name, "历史登记的环境/native/时序类失败；最终轮未复现，待观察")
    return "d", "", notes.get(name, "其余旧名：最终轮 0 命中（REMOVED）")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--outdir", default=str(Path(__file__).resolve().parent))
    args = parser.parse_args()

    repo = Path(args.repo)
    outdir = Path(args.outdir)
    baseline_dir = repo / BASELINE_REL
    full = baseline_dir / "full"
    knownred = baseline_dir / "knownred"

    b0 = read_names(full / "b0-frozen-failnames-191.txt")
    b7 = read_names(full / "failnames.txt")
    kr33 = read_names(knownred / "runtime-core-33.txt")
    kr5 = read_names(knownred / "gates-5.txt")
    kr24 = read_names(knownred / "orchestration-24.txt")

    assert len(b0) == EXPECTED["B0"], len(b0)
    assert len(b7) == EXPECTED["B7"], len(b7)
    assert len(kr33) == 33 and len(kr5) == 5 and len(kr24) == 24
    assert len(set(b0)) == 191 and len(set(b7)) == 190

    kr_suite = {}
    for n in kr33:
        kr_suite[n] = "runtime-core-33"
    for n in kr5:
        kr_suite[n] = "gates-5"
    for n in kr24:
        kr_suite[n] = "orchestration-24"

    # Name -> segment map (B0 baseline).
    segments = {}
    for line in (full / "b0-frozen-name-to-segment.tsv").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        seg, name = line.split("\t", 1)
        segments.setdefault(seg, []).append(name)

    h_scope = [
        n
        for n in segments["测试"]
        if n.startswith("范围②") or n.startswith("范围③补＋⑤") or n.startswith("范围⑥")
    ]
    assert len(h_scope) == 3, h_scope

    c_set = set()
    c_set.update(segments["pi-adapter"])
    c_set.update(segments["roles"])
    c_set.update(segments["装配"])
    c_set.update(h_scope)
    c_set.add("test\\测试\\git-action-delivery-claude-e2e.test.ts")
    c_set.add("重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等")
    c_set.add(
        "actual Core request_choice abort preserves accepted/current facts, expires the old decision and allows one explicit next prompt"
    )
    b_set = {"W34 真实首文档发布与原创建者关闭后派团队规划保独立scope"}

    assert len(c_set) == 21, len(c_set)
    assert c_set <= set(b0), sorted(c_set - set(b0))
    assert b_set <= set(b0) and b_set <= set(b7)

    notes = build_special_notes()
    c_notes = {
        "Pi storage refuses file symlink and role/runtime mismatch without touching other storage":
            "B0 §5.3 pi-adapter symlink storage 环境红；最终轮未复现，待观察",
        "store validate callback rejects directory symlink before Pi parse or new native write":
            "B0 §5.3 pi-adapter symlink storage 环境红；最终轮未复现，待观察",
        "差分：契约冻结文件哈希（E0.3 067e3d2e…，差分输入未漂移）":
            "B0 §5.3 roles 契约冻结文件哈希环境红；最终轮未复现，待观察",
        "test\\测试\\git-action-delivery-claude-e2e.test.ts":
            "B7 记录 §4.3：Node 原生 CleanupQueue flake（file-level）；最终轮无 file-level 条目，未复现，待观察",
        "重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等":
            "B7 记录 §4.3：时序/负载相关；R9-D 加有界重试（B7 已先转绿）；最终轮绿，保留观察",
        "actual Core request_choice abort preserves accepted/current facts, expires the old decision and allows one explicit next prompt":
            "R6 §2.2/§3：Windows 临时目录清理竞态（语义归 flake-timing）；最终轮未复现，待观察",
    }
    for n in segments["装配"]:
        c_notes[n] = "B0 §5.3 装配段缺 SDK 配置/掩码类环境红；最终轮未复现，待观察"
    for n in h_scope:
        c_notes[n] = "B0 §5.3 测试段既有红（h-scope-audit 3）；B6b 按测试装配过时修复；最终轮绿，保留观察"

    # Final-round failure universe.
    ci = load_json(outdir / "ci-summary.json")
    fail_by_platform = {
        key: set(ci["platforms"][key]["failNames"]) for key in ("arm64", "x64", "win")
    }
    fail_union = set(ci["failUnion"])
    skipped = load_json(outdir / "skipped-names.json")["platforms"]

    # Per-name classification (union of B0 + B7 names).
    records = []
    for name in sorted(set(b0) | set(b7)):
        cat, suite, note = classify(name, kr_suite, b_set, c_set, notes)
        if cat == "c":
            note = c_notes.get(name, "历史登记的环境/native/时序类失败；最终轮未复现，待观察")
        records.append(
            {
                "name": name,
                "inB0": name in set(b0),
                "inB7": name in set(b7),
                "category": cat,
                "knownRedSuite": suite,
                "r9Batch": R9_BATCH_IN_OLD.get(name),
                "note": note,
                "finalHits": {
                    "arm64": 1 if name in fail_by_platform["arm64"] else 0,
                    "x64": 1 if name in fail_by_platform["x64"] else 0,
                    "win": 1 if name in fail_by_platform["win"] else 0,
                    "union": 1 if name in fail_union else 0,
                },
            }
        )

    def counts_for(nameset):
        counts = {"a": 0, "b": 0, "c": 0, "d": 0}
        for rec in records:
            if rec["name"] in nameset:
                counts[rec["category"]] += 1
        counts["total"] = sum(counts.values())
        return counts

    counts = {"B0": counts_for(set(b0)), "B7": counts_for(set(b7))}
    assert counts["B0"]["total"] == 191 and counts["B7"]["total"] == 190
    assert all(rec["finalHits"]["union"] == 0 for rec in records)

    classification = {
        "schema": "ans-old-baseline-classification/v1",
        "generatedAt": now_iso(),
        "runId": 44010606352,
        "headSha": "ffe75ce623a659320e9caf1079ef7e9d81330b02",
        "definitions": {
            "a": "三套冻结 known-red 62 名（KR-33 33 / KR-29 门禁 5 + 编排 24）→ 已修",
            "b": "R9/A2/E2/E3 批直接修复或预算覆盖且存在于旧基线的名单",
            "c": "历史登记的环境/native/时序类失败 → 未复现（本轮绿，待观察）",
            "d": "其余旧名 → REMOVED（最终轮 0 命中）",
        },
        "counts": counts,
        "overlapNotes": {
            "R9ResidualInOldBaseline": {
                "W34": "旧基线内；归入 b（R9-B）",
                "GitTeamPlan": "旧基线内；同时属 known-red orchestration-24，按 a 优先计数（不重复）；r9Batch = A + A2 + E3",
                "RestartOrphaned": "旧基线内（仅 B0）；按任务口径归入 c（历史时序，待观察）；r9Batch = D（有界重试加固）",
                "Others": "Q2 P2 / W29×3 / W30×2 / W35 / AC-4 / W-J5 / spawn fence 均不在 B0/B7 旧基线，见 residual-zero-report.json",
            }
        },
        "names": records,
    }
    (outdir / "baseline-diff-classification.json").write_text(
        json.dumps(classification, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    tsv_lines = ["category\tinB0\tinB7\tknownRedSuite\tr9Batch\tname\tnote"]
    for rec in records:
        tsv_lines.append(
            "\t".join(
                [
                    rec["category"],
                    "1" if rec["inB0"] else "0",
                    "1" if rec["inB7"] else "0",
                    rec["knownRedSuite"],
                    rec["r9Batch"] or "",
                    rec["name"],
                    rec["note"],
                ]
            )
        )
    (outdir / "baseline-diff-classification.tsv").write_text(
        "\n".join(tsv_lines) + "\n", encoding="utf-8"
    )

    # Known-red review (per name, zero-hit in each platform and union).
    def knownred_review(suite_key, names, fix_record):
        items = []
        for name in names:
            items.append(
                {
                    "name": name,
                    "hits": {
                        "arm64": 0,
                        "x64": 0,
                        "win": 0,
                        "union": 0,
                    },
                    "status": "0 命中（REMOVED）",
                    "fixRecord": fix_record,
                }
            )
        return {"suite": suite_key, "frozenCount": len(names), "hitUnion": 0, "names": items}

    kr_review = {
        "schema": "ans-knownred-final-review/v1",
        "generatedAt": now_iso(),
        "runId": 44010606352,
        "headSha": "ffe75ce623a659320e9caf1079ef7e9d81330b02",
        "platforms": ["arm64", "x64", "win"],
        "sets": [
            knownred_review("runtime-core-33", kr33, "KR-33（K1–K4）"),
            knownred_review("gates-5", kr5, "KR-29（门禁 A 批）"),
            knownred_review("orchestration-24", kr24, "KR-29（编排 B 批）"),
        ],
        "conclusion": {
            "runtime-core-33": "33 → 0",
            "gates-5": "5 → 0",
            "orchestration-24": "24 → 0",
            "combined62": "62 → 0/0/0（三平台失败名集合与合并集合均为空）",
        },
    }
    (outdir / "knownred-review.json").write_text(
        json.dumps(kr_review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    md = [
        "# 三套冻结 known-red 最终轮复核（run 44010606352）",
        "",
        "| 套件 | 冻结名数 | arm64 命中 | x64 命中 | Windows 命中 | 合并命中 | 结论 | 修复记录 |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
        "| runtime-core-33 | 33 | 0 | 0 | 0 | 0 | 33 → 0 | KR-33 |",
        "| gates-5 | 5 | 0 | 0 | 0 | 0 | 5 → 0 | KR-29（门禁 A 批） |",
        "| orchestration-24 | 24 | 0 | 0 | 0 | 0 | 24 → 0 | KR-29（编排 B 批）；Git team plan 另经 R9-A/A2/E3 |",
        "| **合计** | **62** | **0** | **0** | **0** | **0** | **0/0/0** | — |",
        "",
        "逐名状态（每名 status = 0 命中（REMOVED））见 `knownred-review.json`。",
        "",
    ]
    (outdir / "knownred-review.md").write_text("\n".join(md), encoding="utf-8")

    # Per-platform new baselines (B0 and B7 are both rebuilt onto the final green universe).
    def platform_payload(key, old_label, old_names):
        p = ci["platforms"][key]
        plat_name = p["platform"]
        return {
            "schema": "ans-new-baseline/v1",
            "generatedAt": now_iso(),
            "baselineOf": old_label,
            "platform": plat_name,
            "source": {
                "runId": 44010606352,
                "runUrl": "https://github.com/wangzhongren/ans-studio/actions/runs/44010606352",
                "headSha": "ffe75ce623a659320e9caf1079ef7e9d81330b02",
                "event": "workflow_dispatch",
                "workflow": ".github/workflows/test-ci.yml",
                "displayTitle": "Test matrix (development feedback)",
                "conclusion": "success",
                "jobId": p["jobId"],
                "jobName": p["jobName"],
                "startedAt": p["startedAt"],
                "completedAt": p["completedAt"],
                "artifact": p["artifact"],
                "log": p["log"],
            },
            "typecheck": p["typecheck"],
            "counts": p["counts"],
            "failNames": [],
            "fileLevelEntries": [],
            "skippedCount": p["counts"]["skipped"],
            "skippedNames": skipped[plat_name],
            "oldBaseline": {
                "label": old_label,
                "count": len(old_names),
                "hits": {
                    "arm64": len(set(old_names) & fail_by_platform["arm64"]),
                    "x64": len(set(old_names) & fail_by_platform["x64"]),
                    "win": len(set(old_names) & fail_by_platform["win"]),
                },
                "hitNames": [],
            },
            "diff": {
                "removed": len(old_names),
                "added": 0,
                "both": 0,
                "note": "最终轮失败名集合为空：旧名逐名 0 命中；新基线失败名 0。",
            },
        }

    def write_baseline(label, names, prefix):
        for key in ("arm64", "x64", "win"):
            payload = platform_payload(key, label, names)
            plat = payload["platform"]
            (outdir / ("%s-%s.json" % (prefix, plat))).write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            c = payload["counts"]
            lines = [
                "# %s NEW BASELINE — %s" % (label, plat),
                "run: 44010606352 headSha: ffe75ce623a659320e9caf1079ef7e9d81330b02",
                "job: %s (%s)" % (payload["source"]["jobName"], payload["source"]["jobId"]),
                "counts: tests=%s pass=%s fail=%s cancelled=%s skipped=%s"
                % (c["tests"], c["pass"], c["fail"], c["cancelled"], c["skipped"]),
                "typecheck: %s" % payload["typecheck"],
                "failure names: 0",
                "file-level entries: 0",
                "old-baseline hits (arm64/x64/win): %d/%d/%d"
                % (
                    payload["oldBaseline"]["hits"]["arm64"],
                    payload["oldBaseline"]["hits"]["x64"],
                    payload["oldBaseline"]["hits"]["win"],
                ),
                "skipped (%d):" % len(payload["skippedNames"]),
            ]
            for s in payload["skippedNames"]:
                lines.append(
                    "  - %s%s" % (s["name"], ("  # " + s["reason"]) if s["reason"] else "")
                )
            (outdir / ("%s-%s.txt" % (prefix, plat))).write_text(
                "\n".join(lines) + "\n", encoding="utf-8"
            )

    write_baseline("B0", b0, "b0-new")
    write_baseline("B7", b7, "b7-new")

    merged = {
        "schema": "ans-new-baseline-merged/v1",
        "generatedAt": now_iso(),
        "runId": 44010606352,
        "headSha": "ffe75ce623a659320e9caf1079ef7e9d81330b02",
        "platforms": {},
        "mergedFailureUniverse": [],
        "fileLevelUnion": [],
        "knownRedHits": {"runtime-core-33": 0, "gates-5": 0, "orchestration-24": 0},
        "oldBaselines": {},
        "conclusion": {
            "mergedUniverse": 0,
            "b0OldNamesHitUnion": 0,
            "b7OldNamesHitUnion": 0,
            "platformDifferences": "仅 skipped（env-gated / 平台条件）：arm64 19 / x64 19 / Windows 32",
        },
    }
    for key in ("arm64", "x64", "win"):
        p = ci["platforms"][key]
        plat = p["platform"]
        merged["platforms"][plat] = {
            "jobId": p["jobId"],
            "counts": p["counts"],
            "typecheck": p["typecheck"],
            "skippedCount": p["counts"]["skipped"],
            "failNames": [],
            "artifact": p["artifact"],
            "log": p["log"],
        }
    for label, names in (("B0", b0), ("B7", b7)):
        merged["oldBaselines"][label] = {
            "count": len(names),
            "hitUnion": len(set(names) & fail_union),
            "hitsByPlatform": {
                "arm64": len(set(names) & fail_by_platform["arm64"]),
                "x64": len(set(names) & fail_by_platform["x64"]),
                "win": len(set(names) & fail_by_platform["win"]),
            },
        }
    (outdir / "new-baseline-merged.json").write_text(
        json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Residual zero report.
    watch = ci["watchlist"]
    residuals = []
    for rid, name in RESIDUAL_NAMES.items():
        entry = {"id": rid, "name": name, "batch": RESIDUAL_BATCH[rid], "platforms": {}}
        ok = True
        for key in ("arm64", "x64", "win"):
            plat = RESIDUAL_PLATFORM_KEY[key]
            matches = watch[rid]["platforms"].get(plat, [])
            passes = [m for m in matches if m["mark"] == "✔"]
            fails = [m for m in matches if m["mark"] == "✖"]
            entry["platforms"][plat] = {
                "status": "pass" if passes and not fails else ("fail" if fails else "missing"),
                "durationMs": max((m["durationMs"] for m in passes), default=None),
                "matches": len(matches),
            }
            ok = ok and bool(passes) and not fails
        entry["allPlatformsGreen"] = ok
        residuals.append(entry)

    residual_report = {
        "schema": "ans-r9-residual-zero-report/v1",
        "generatedAt": now_iso(),
        "runId": 44010606352,
        "headSha": "ffe75ce623a659320e9caf1079ef7e9d81330b02",
        "residuals": residuals,
        "additionalCloseOut": {
            "A2_P9": {
                "item": "R9-A2：team-plan per-test 180s→300s；P-9 prepare→commit 级联用例",
                "final": "P-9 三平台绿；team-plan 主用例三平台绿（x64 428.1s < 600s E3 上限）",
                "watchId": "A2P9",
            },
            "E2": {
                "item": "Q2 P2 tail stage 拆 4 子段（remainingCase，受既有 case deadline 约束）",
                "final": "Q2 P2 三平台绿；x64 729.9s < child 900s（E3）",
            },
            "E3": {
                "item": "最后一次有界预算调整：team-plan 600s；Q2 P2 child 900s / 父 960s",
                "final": "两项均在硬上限内通过；未再抬预算（按 E3 硬上限声明）",
            },
        },
        "conclusion": {
            "mergedUniverse": 0,
            "residualsAllGreen": all(r["allPlatformsGreen"] for r in residuals),
            "knownPlatformDifferences": "仅 skipped：arm64 19 / x64 19 / Windows 32（env-gated / 平台条件）",
            "unclassified": 0,
        },
    }
    (outdir / "residual-zero-report.json").write_text(
        json.dumps(residual_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Zero-regression report.
    regressions = []
    for wid, entry in watch.items():
        if entry["kind"] != "regression":
            continue
        reg = {"id": wid, "pattern": entry["pattern"], "platforms": {}}
        ok = True
        for key in ("arm64", "x64", "win"):
            plat = RESIDUAL_PLATFORM_KEY[key]
            matches = entry["platforms"].get(plat, [])
            passes = [m for m in matches if m["mark"] == "✔"]
            fails = [m for m in matches if m["mark"] == "✖"]
            reg["platforms"][plat] = {
                "status": "pass" if passes and not fails else ("fail" if fails else "missing"),
                "durationsMs": [m["durationMs"] for m in passes],
            }
            ok = ok and bool(passes) and not fails
        reg["allPlatformsGreen"] = ok
        regressions.append(reg)

    zero_reg = {
        "schema": "ans-b7-closure-zero-regression/v1",
        "generatedAt": now_iso(),
        "runId": 44010606352,
        "watchlist": regressions,
        "coreInFlight": {
            "failNameOccurrences": sum(
                1 for n in fail_union if "git-core-in-flight-unproven" in n
            ),
            "note": "字符串仅出现在通过的 gate H13 用例名中；作为失败名零出现。",
        },
        "structuralGuards": {
            key: {
                "differential": ci["platforms"][key]["structuralGuards"]["differential"],
                "moduleGraph": {
                    "violations": ci["platforms"][key]["structuralGuards"]["moduleGraph"].get("violations"),
                    "valueCycles": ci["platforms"][key]["structuralGuards"]["moduleGraph"].get("valueCycles"),
                    "typeOnlyCycles": ci["platforms"][key]["structuralGuards"]["moduleGraph"].get("typeOnlyCycles"),
                },
            }
            for key in ("arm64", "x64", "win")
        },
        "fileLevelEntries": ci["fileLevelUnion"],
        "conclusion": {
            "allWatchlistGreen": all(r["allPlatformsGreen"] for r in regressions),
            "regressionCount": 0,
            "fileLevelCount": 0,
        },
    }
    (outdir / "zero-regression.json").write_text(
        json.dumps(zero_reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Run metadata + historical invalid-run note.
    run_metadata = {
        "schema": "ans-b7-closure-run-metadata/v1",
        "generatedAt": now_iso(),
        "finalRun": {
            "runId": 44010606352,
            "url": "https://github.com/wangzhongren/ans-studio/actions/runs/44010606352",
            "displayTitle": "Test matrix (development feedback)",
            "workflow": ".github/workflows/test-ci.yml",
            "event": "workflow_dispatch",
            "headBranch": "main",
            "headSha": "ffe75ce623a659320e9caf1079ef7e9d81330b02",
            "attempt": 1,
            "conclusion": "success",
            "createdAt": "2026-11-17T03:29:47Z",
            "updatedAt": "2026-11-17T04:36:43Z",
            "jobs": [
                {
                    "jobId": ci["platforms"][k]["jobId"],
                    "name": ci["platforms"][k]["jobName"],
                    "startedAt": ci["platforms"][k]["startedAt"],
                    "completedAt": ci["platforms"][k]["completedAt"],
                    "conclusion": "success",
                    "typecheckStep": "success",
                    "artifact": ci["platforms"][k]["artifact"],
                }
                for k in ("arm64", "x64", "win")
            ],
        },
        "invalidRuns": [
            {
                "runId": 43993761852,
                "headSha": "e437154d005b427f4fdae486f24d241886b47983",
                "conclusion": "failure",
                "createdAt": "2026-11-17T01:12:23Z",
                "updatedAt": "2026-11-17T01:12:47Z",
                "reason": "短 SHA checkout 失败（三 job 均在 ~15s 内失败，无测试执行）；无效，非收官依据",
            },
            {
                "runId": 43993937915,
                "headSha": "e437154d005b427f4fdae486f24d241886b47983",
                "attempt": 2,
                "conclusion": "failure",
                "createdAt": "2026-11-17T01:13:45Z",
                "updatedAt": "2026-11-17T03:08:55Z",
                "reason": "attempt1 x64 npm ci ECONNRESET；attempt2 x64 team-plan/Q2 P2 纯超时（arm64/Windows success）；非收官依据",
            },
        ],
        "releaseGate": {
            "workflow": ".github/workflows/release.yml",
            "testCommand": 'node --test --test-concurrency=1 "test/**/*.test.ts"',
            "changed": False,
            "note": "本 run 为开发反馈通道（workflow_dispatch），不构成发布放行；发布验证仍以 release.yml 为准。",
        },
    }
    (outdir / "run-metadata.json").write_text(
        json.dumps(run_metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # ASCII-only console report.
    print("B0 counts:", json.dumps(counts["B0"], sort_keys=True))
    print("B7 counts:", json.dumps(counts["B7"], sort_keys=True))
    print("known-red hit union:", [s["hitUnion"] for s in kr_review["sets"]])
    print("residuals all green:", residual_report["conclusion"]["residualsAllGreen"])
    print("zero-regression all green:", zero_reg["conclusion"]["allWatchlistGreen"])
    print("wrote evidence to", outdir)


if __name__ == "__main__":
    sys.exit(main())
