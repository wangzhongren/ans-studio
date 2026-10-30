# ANS Studio

[中文](README.md)

**ANS Studio is not a generic multi-agent task orchestrator. It is an agent runtime with organizational governance: Role-First — dispersed authority, gates before action, independent acceptance.**

It puts "who decides, who dispatches, who writes, who accepts" into the runtime instead of leaving it in prompts. The desktop app and CLI share the same roles and governance tools. The desktop uses Claude by default and can switch to Pi or Codex; the CLI supports demo (no model calls), Pi, Codex, and Claude.

**Version status:** the current public runtime bundle is **v1.8.0** (released 2026-10-30). On top of v1.7.0 it switches to the **six-role minimal system** (chief `chief`, product `product`, rapporteur `rapporteur`, nominator `nominator`, convener `convener`, verifier `verifier`): product intent → rapporteur (plan/modules/roster/architecture) → nominator (D3 hiring + appointment-write cards) → convener delivery (with optional verifier checks); machine state moves to `.ans/state/tasks.jsonl` plus the run manifest, with no flow YAML/gate/ledger. It also includes module/roster/topology versioned contracts, per-run contract freezing (run manifest + pin), three-part mechanical rejections with the read-only `contract_check`, evidence self-consistency checks (`evidence-meta/v1` sidecars, P0 criteria derivation, read-only `evidence_check`), the shell write-area guard, plus desktop cross-window state sync, duplicate-dispatch suppression, decision/review dialogs, and narrow-layout fixes. Legacy v1/v2/v3 plans, flows, and role cards are kept for historical compatibility only.

![ANS Studio desktop: five-role navigation and intent confirmation card](角色卡/桌面UI/docs/change/2026-10-20_readme-v1.4-screenshot/desktop-intent-confirm.png)

## Three layers: intent, organization, rules

| Layer | Role or mechanism | Responsibility | Power and limits |
| --- | --- | --- | --- |
| **Intent and final authorization** | **Customer** | Sets goals, scope, and acceptance criteria; decides on the D3 hiring decision, write-card confirmations, acceptance/decision cards, and confirmation cards | Final approval authority; does not schedule internal roles |
| **Organization and action** | **Chief / 幕僚 (`chief`)** | Sole main entry and overall dispatcher: dispatches product → rapporteur → nominator → convener in chain order, summarizes results, and runs patrols | Dispatches the built-in chain and verification scheduling only; **never dispatches project workers directly**, never implements, never decides for the customer |
| | **Product / 产品 (`product`)** | Writes the product intent document `docs/product/<flowId>-intent-vN.md` | Writes `docs/product/`; does not dispatch |
| | **Rapporteur / 策划 (`rapporteur`)** | Produces the plan, module list, personnel roster (module→role bindings plus a personnel+module topology), and project architecture from the intent | Writes `docs/proposals/` and `docs/contracts/`; does not hire or write role cards |
| | **Nominator / 人事 (`nominator`)** | Starts the D3 hiring decision from the roster; after D3 selection, writes project role cards/boundaries and working documents path by path through `appointment-write`; registers skill/MCP installations | Write-card power only after D3 selection and path-by-path customer/judge confirmation; does not select roles or edit the roster |
| | **Convener / 运营 (`convener`)** | Project operator: after handoff, dispatches implementation tasks to project workers and collects short reports; may initiate verification checks | Dispatches only project workers (implementation) or verifier (checks); requires handoff, a pinned run, and module ownership; never dispatches product/rapporteur/nominator/chief |
| | **Project workers** | Implement and test inside their roster modules, then short-report/hand back to convener | Write only task module paths and the boundary/task write set; no cross-module writes, no self-expansion |
| **Rules and machine state** | **Application gates** | WriteGate, shell write-area guard, run manifest pin, three-part mechanical rejections, versioned-document read-only, evidence self-consistency, `tasks.jsonl` | Deterministic validation and process integrity; **does not replace customer decisions** and does not prove engineering quality |
| | **Verifier / 质检 (`verifier`)** | Optional acceptance/quality check: reads delivery and evidence, checks it, and reports results back to the initiator (convener or chief) | Check power; does not approve, does not accept for the customer, does not implement |

The six built-in governance roles ship with the app and have no role directories. Their writes are limited to their own Section 1 and task write set; they do not implement or test. Their shell commands go through the same approval chain as every other role. Internal roleIds stay stable; the UI shows the Chinese role names (幕僚 / 产品 / 策划 / 人事 / 运营 / 质检). The legacy `liaison` role is retired, and `su` exists only for the legacy single model and compatibility paths, not as the default entry for new projects.

## Role flow topology

```mermaid
flowchart TD
    classDef customer fill:#fff7e6,stroke:#d48806,color:#613400,stroke-width:1.5px
    classDef gov fill:#e6f4ff,stroke:#1677ff,color:#003a8c
    classDef worker fill:#f6ffed,stroke:#52c41a,color:#135200
    classDef gate fill:#f9f0ff,stroke:#722ed1,color:#391085
    classDef note fill:#fafafa,stroke:#8c8c8c,color:#262626,stroke-dasharray:4 3

    subgraph CUST["Customer: intent and final authorization"]
        CUSTREQ["Customer<br/>goals / scope / acceptance criteria"]
        D3{{"D3 hiring decision<br/>appointment multi-select"}}
        AW{{"Write-card confirmation<br/>appointment-write"}}
        ACC{{"Acceptance / decision / confirmation<br/>acceptance / decision / confirm"}}
    end

    subgraph ORG["Organization and action: six-role minimal system"]
        CHIEF["Chief / 幕僚<br/>sole main entry · ordered dispatch · summary · patrol"]
        PRODUCT["Product / 产品<br/>product intent document"]
        RAP["Rapporteur / 策划<br/>plan · modules · roster · architecture"]
        NOM["Nominator / 人事<br/>D3 hiring · role cards/boundaries"]
        CONV["Convener / 运营<br/>project operator · implementation dispatch · may initiate checks"]
        VER["Verifier / 质检<br/>optional acceptance / quality checks"]
        WORKER["Project workers (from roster)<br/>implementation · tests · short report"]
    end

    subgraph RULES["Application gates and machine state"]
        PRE[[Dispatch preconditions M1–M8]]
        RUN[[run manifest + pin]]
        WRITE[[WriteGate / shell write-area guard]]
        REJ[[Three-part rejections + contract_check]]
        EVID[[Evidence self-consistency + evidence_check]]
        STATE[[tasks.jsonl]]
    end

    CUSTREQ -->|requirements| CHIEF
    CHIEF -->|① dispatch product| PRODUCT
    CHIEF -->|② dispatch rapporteur (intent required)| RAP
    CHIEF -->|③ dispatch nominator (plan/architecture/roster/modules required)| NOM
    CHIEF -->|④ hand off to convener (D3 selection + role cards + pinned run)| CONV
    NOM -->|start D3| D3
    D3 -->|selected project roles| NOM
    NOM -->|path-by-path confirmation| AW
    AW -->|cards written, project roles online| WORKER
    CONV -->|"dispatch_task (moduleId required)"| WORKER
    CONV -->|may initiate verification| VER
    WORKER -->|short report / handback| CONV
    VER -->|check results back| CONV
    CONV -->|summary| CHIEF
    CHIEF -->|summary / report| CUSTREQ
    CUSTREQ -->|acceptance / decision| ACC
    CHIEF -.->|before every dispatch| PRE
    CONV -.->|before every dispatch| PRE
    PRE -.->|pin before handoff| RUN
    CHIEF -.->|write decision| WRITE
    NOM -.->|write decision| WRITE
    CONV -.->|write decision| WRITE
    WORKER -.->|write decision| WRITE
    CHIEF -.->|rejections / quick reference| REJ
    CONV -.->|rejections / quick reference| REJ
    CHIEF -.->|evidence checks| EVID
    CONV -.->|evidence checks| EVID
    VER -.->|evidence checks| EVID
    CHIEF -.->|task / request events| STATE
    CONV -.->|task / request events| STATE
    NOTE["Governance discipline<br/>· Chief is the sole main entry and only dispatches<br/>· In trio, only chief and convener may dispatch<br/>· Chief never dispatches project workers; convener dispatches only workers/verifier<br/>· Nominator writes cards only after D3 selection and path-by-path confirmation<br/>· Verifier is optional; it never approves or accepts for the customer"]
    class NOTE note
    class CUSTREQ,D3,AW,ACC customer
    class CHIEF,PRODUCT,RAP,NOM,CONV,VER gov
    class WORKER worker
    class PRE,RUN,WRITE,REJ,EVID,STATE gate
```

| Legend | Meaning |
| --- | --- |
| Solid arrow | Role dispatch/handoff/report: `dispatch_task`, `task.delivered`, short reports/handbacks, result summaries |
| Dashed arrow + gate-shaped node | Application gates and machine state: dispatch preconditions, run pin, write decision, mechanical rejections, evidence checks, `tasks.jsonl` |
| Hexagon | Customer decision cards: D3 hiring, `appointment-write` confirmation, acceptance/decision/confirmation |
| Yellow dashed node | Governance-discipline note, not a role |

- **Chief is the sole main entry and overall dispatcher.** It dispatches in the order product → rapporteur → nominator → convener, summarizes results, and reports to the customer. It never implements, never decides for the customer, and never dispatches project workers directly.
- **In trio, only chief and convener may dispatch.** Chief dispatches the built-in chain and verification scheduling; convener dispatches only project workers (implementation) or the verifier (checks), never product/rapporteur/nominator/chief. Other roles do not dispatch.
- **Nominator writes cards only after D3.** D3 is an `appointment` multi-select card whose options and recommendations come from the application reading the latest roster. Only D3-selected project roles enter `appointment-write` path-by-path confirmation and get `角色卡/<id>/role-card.md`, `boundary.yaml`, and working documents. No D3 or customer confirmation means no project-role write permission.
- **Convener handoff has mechanical preconditions.** It needs `flowId`, a draft run created before M1, the D3 selection, all selected role cards, and the same runId pinned before handoff. Implementation dispatch additionally requires a `moduleId` owned by the target, and the target must be in the D3 selection and the pinned run's role set.
- **The verifier is an optional checker.** It is initiated by convener or scheduled by chief; it reads delivery and evidence and reports back to the initiator. It does not approve or replace customer acceptance.
- **The new system has no flow YAML / gate engine / ledger.** Task and request state lives in `.ans/state/tasks.jsonl` as the single machine state; the run contract lives separately in `.ans/runs/<runId>/manifest.json`. `flowId` remains a slug for run/document/criteria naming and validation, but it is no longer the machine state of a flow YAML.

## Two closed loops

### Task execution loop

`Customer requirement → chief dispatches in order (product → rapporteur → nominator → convener) → convener dispatches implementation → workers short-report/hand back → optional verifier checks → convener summarizes → chief reports to the customer`

1. **Requirement and product intent.** The customer tells chief the goals, scope, and acceptance criteria. Chief first dispatches product to write `docs/product/<flowId>-intent-vN.md`. Product writes only `docs/product/`; the intent document is the mechanical precondition for dispatching rapporteur.
2. **Plan and contracts.** Dispatching rapporteur requires the intent document. Rapporteur produces the plan (`docs/proposals/<flowId>-proposal-vN.md`), the module list (`-modules-vN.md`, the single authoritative source), the personnel roster (`-roster-vN.md`, with module→role bindings, versioned references, and a personnel+module topology block), and the project architecture (`docs/contracts/<flowId>-architecture-vN.md`). All are versioned: old versions are read-only and only vN+1 may be created.
3. **Nominator hires.** Before dispatching nominator, the application mechanically checks the plan/architecture/roster/modules and the fixed `env-bootstrap` role (small projects may omit it only with a stated reason in the roster). Nominator sends the D3 `appointment` multi-select card from the roster; only D3-selected project roles can be carded. It then writes role cards, boundaries, and working documents through `appointment-write` after path-by-path customer/judge confirmation. No D3 or confirmation means no project-role write permission.
4. **Handoff to convener and run freezing.** Dispatching convener requires `flowId`, a draft run created before M1, the D3 selection, and all selected role cards; the handoff task has `stepId=project-handoff`. Before handoff the application pins the same runId from draft to pinned: intent/proposal/modules/roster/architecture are schema/hash checked (path+sha256), topology comes from the roster block, assets are optional, and D3, roster, and roles are frozen together. Implementation and acceptance after pin read only the pinned contract.
5. **Convener dispatches implementation.** Convener dispatches only to project workers (implementation) or the verifier (checks). Implementation tasks must carry a `moduleId` owned by the target, and the target must be in the D3 selection and the pinned run's role set; the run must be pinned and the handoff must exist. Workers implement and test inside their module/boundary and task write set, then short-report/hand back to convener; reports route back to the creator recorded in `task.created.from`.
6. **Optional verifier checks.** Verification is initiated by convener or scheduled by chief. The verifier reads delivery and evidence and checks it (optionally using the read-only `evidence_check` to compare sidecars and self-reports), then reports back to the initiator. It does not approve or replace customer acceptance; without a verification task, convener and chief summarize directly.
7. **Summary and closure.** Convener summarizes results for chief, and chief reports to the customer. All task and request state lands in `.ans/state/tasks.jsonl`. `task.closed` is written by the application (chief closure actions or dispatch rejections), never directly by roles; acceptance/decisions still belong to customer cards.

#### Task and request state (machine contract)

`.ans/state/tasks.jsonl` is the new system's **single machine state**: application-only, append-only, one event per line; roles cannot write it. Event shapes have a single source in `TaskStateEvent` and include task events (`task.created` / `task.delivered` / `task.reported` / `task.closed` / `task.redispatch` / `delegation.changed`) and request/approval events (`request.created` / `request.presented` / `request.resolved` / `request.notified` / `request.orphaned`, `approval.created` / `approval.resolved` / `approval.expired`).

```json
{
  "v": 1,
  "at": "2026-10-30T00:00:00.000Z",
  "kind": "task.created",
  "taskId": "t-...",
  "from": "chief",
  "to": "product",
  "text": "Write the product intent document",
  "sideEffect": "docs",
  "idempotencyKey": "...",
  "flowId": "focus",
  "runId": "run-20261030-focus-...",
  "runState": "draft"
}
```

- **Bad lines do not block startup.** Reading/replay skips bad lines and records them; rotated files are read oldest→newest.
- **The run contract is stored separately.** `.ans/runs/<runId>/manifest.json` is application-only and stores only document paths, hashes, schemas, and references, never document content; project roles read it only.
- **No legacy flow machinery.** v1.8.0 does not create or parse `docs/flows/<flowId>.yaml` and has no gate engine or ledger; tests assert that no `docs/flows` or `.ans/governance/ledger.jsonl` is produced. Legacy v1/v2/v3 flow/gate/ledger/acceptance-triage/`request_boundary_change` artifacts are no longer read or executed; they are kept only as historical records.

### Organizational governance loop (run freezing and contract governance)

`Draft runId before M1 → pin the same runId before handoff → implementation/acceptance read only the pinned contract → mid-run changes go through the run-change decision card → the old run closes or a new run is pinned`

1. **A draft run exists first.** The application creates a draft `runId` before the first M1 dispatch; without a real flow it uses a pending placeholder and adopts the same runId when the real flow arrives. Only the application writes the manifest; roles never hand-write or forge it.
2. **Pin before handoff.** Before handoff the same runId is pinned: intent/proposal/modules/roster/architecture must exist and pass schema/hash checks, topology comes from the roster block, assets are optional, and D3 (decisionId + targetRoleIds), roster version, and project role set are frozen. Missing documents, schema/hash mismatches, missing D3, an invalid roster, or another active pinned run for the same flow all fail closed.
3. **Pinned is read-only.** Implementation and acceptance continue only on the pinned run and verify pinned document hashes. A legacy flow without a manifest is read-only: it cannot continue implementation/acceptance and must start a new run pinned before a new handoff.
4. **Frozen contracts do not change mid-run.** New document versions created during a run do not replace the pinned basis. Old versions of versioned documents are read-only on every channel (`write_file` / `edit_file` / shell cp/tee/scripts); only vN+1 may be created and referenced as the latest.
5. **Changes go through the run-change decision card.** Changing the frozen contract uses a `run-change/v1` decision card with three modes: `continue-frozen` (keep the run), `stop-and-restart` (close the old run; a new run must be pinned), and `stop` (close). `approve` / `reject` / `cancel` map deterministically to those modes; unknown choices fail closed and are never guessed.
6. **Write permission still comes only from role boundaries and confirmation.** Role cards/boundaries are written only after D3 selection and path-by-path `appointment-write` confirmation. Other governance-sensitive or out-of-bound writes still require confirmation or are rejected; shell file writes are constrained by the same write-area guard.

## The honest limits of the gates and machine state

Application gates and the judge agent are complementary: the former makes deterministic decisions, the latter performs bounded structured review; neither replaces customer decisions.

- **Application gates guarantee paths, permissions, and process integrity — not business correctness, and not customer consent.** WriteGate only decides Section 1 / task write set / forbidden paths; dispatch preconditions M1–M8 only check chain order, roster, D3, modules, and run state deterministically; run pin only checks document path+sha256/schema and frozen facts. They cannot replace customer decisions or prove engineering quality.
- **Writes inside the boundary are preauthorized, which is not a bypass.** Writes inside Section 1 use `write_file` / `edit_file` directly without a per-write confirmation card; writes outside the boundary are rejected by WriteGate before side effects. Role-card/boundary changes, shared directories or other roles' write sets, and governance-sensitive writes still follow the existing confirmation rules; old versions of versioned documents are read-only on every channel.
- **Shell file writes are constrained by the write-area guard.** `shell-write-guard` uses the same `resolveWrite` as WriteGate to judge statically resolvable shell write targets: if all targets are fully resolvable and inside the role write area, the normal approval chain continues; any out-of-bound/forbidden/symlink-escape target is denied without a card; targets that cannot be fully resolved statically (unknown options, `find -exec`, `xargs`, scripts/interpreters/build scripts, etc.) are marked opaque and require customer approval — automatic judge delegation must not approve them. Read-only allowlisted commands run directly; risky/review/deny commands are approved one by one; rejection, timeout, or channel unavailability never allows execution. There is no OS sandbox.
- **Run freezing never guesses "latest".** Pinned documents and hashes are the only active basis; new versions during a run do not replace the pinned contract; legacy without a manifest is read-only; run-change accepts only three deterministic modes. The application never silently switches to a new version because a file was updated or a timestamp changed.
- **Mechanical rejections share one three-part shape.** High-frequency rejections use `{code, missing, action, owner, docs, retryable}`: customer cards show only human text (what is missing / what to do / who acts), while the technical code goes to the system line or model receipt. The read-only `contract_check` provides the code→owner quick reference and current run/write-area summary, is ≤4KB, is scoped to the calling role, and is **not approval or authorization**.
- **Evidence self-consistency is recomputed by the application.** Evidence may carry an `evidence-meta/v1` sidecar; the application recomputes the artifact's lines/bytes/sha256 and compares them with the sidecar, the artifact's self-report, `generatedAt` freshness, and acIds. P0 is derived mechanically from `ans-criteria/v1` (P0 requires a sidecar; the sidecar's own `p0` is ignored; non-P0 evidence without a sidecar is marked unverified/legacy). A self-reported line/pass/fail mismatch, an artifact modified after the sidecar, or acIds missing the AC all fail closed. The read-only `evidence_check` reuses the same data layer, never executes project scripts or writes artifacts/sidecars, and is scoped to the calling role's module directories.
- **AI gates perform structured review only.** The judge agent reads only permitted text and reviews only system risk (hangs, boundary violations, destruction, resources, sensitive exfiltration) or intent drift; it does not re-review engineering quality, architecture, or tests — the verifier checks those. `deny` / `manual` / timeout / unavailable never passes; delegated approval is marked "judge delegated" and never impersonates the customer.
- **Application advancement, dispatch, pin, and acceptance requests are not customer approval.** Dispatch grants no extra write permission; pin only freezes the contract and does not mean acceptance passed; `appointment-write` confirmation issues only the exact previewed paths; verifier checks do not replace customer acceptance.
- **Legacy mechanisms are retired.** v1.8.0 has no acceptance triage (`acceptance-triage/v1`), `request_boundary_change`, flow YAML, gate engine, or ledger. Those legacy v1/v2/v3 artifacts are no longer read or executed; they are kept only as historical records.

Technical structure and cross-role interfaces are in [project architecture](角色卡/项目管理/docs/architecture.md).

## Research and citation

ANS Studio's Role-First governance model is inspired by the Role-First Software Governance (RFSG) line of work; ANS is a name, not an acronym. The design discussion of role-first responsibility, asymmetric authority boundaries, and independent verification appears in:

Wang, Zhongren. 2026. *Role-First Software Governance: Asymmetric Authority Boundaries for AI-Native Agent Systems*. [DOI: 10.5281/zenodo.22824700](https://zenodo.org/records/22824700).

## Install and run

### Download the runtime

Current public version: **v1.8.0** (released 2026-10-30). The bundle ships with its own runtime, so no separate Node.js installation is needed to launch the app. Running a project's `npm test`, Git, and similar commands still requires that project's development toolchain.

| System | Download | Checksum file | Launch |
| --- | --- | --- | --- |
| macOS 13+ · Apple Silicon | [mac-arm64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/ANS-Studio-1.8.0-mac-arm64.zip) | [SHA256SUMS-darwin-arm64.txt](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/SHA256SUMS-darwin-arm64.txt) | Extract fully, then open `ANS Studio.app` |
| macOS 13+ · Intel | [mac-x64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/ANS-Studio-1.8.0-mac-x64.zip) | [SHA256SUMS-darwin-x64.txt](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/SHA256SUMS-darwin-x64.txt) | Extract fully, then open `ANS Studio.app` |
| Windows 10/11 · x64 | [win-x64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/ANS-Studio-1.8.0-win-x64.zip) | [SHA256SUMS-win32-x64.txt](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/SHA256SUMS-win32-x64.txt) | Extract fully, open `ANS Studio.exe`, and keep the resource files in the same directory |

Verify SHA256 before launching: on macOS, run `shasum -a 256 -c SHA256SUMS-darwin-arm64.txt` in the download directory (use `SHA256SUMS-darwin-x64.txt` for Intel); on Windows PowerShell, run `Get-FileHash .\ANS-Studio-1.8.0-win-x64.zip -Algorithm SHA256` and compare it with `SHA256SUMS-win32-x64.txt`.

<details>
<summary>v1.8.0 SHA256 and provenance</summary>

| Artifact | SHA256 |
| --- | --- |
| `ANS-Studio-1.8.0-mac-arm64.zip` | `5a4944d9675d698e72d0303996a3f0e4634a19539dbc3cbf8b71ffffa5f97a68` |
| `ANS-Studio-1.8.0-mac-x64.zip` | `e79ef4735290420da934d995ef47f4d3d31193268dbd820e0b8eca436c01cdf0` |
| `ANS-Studio-1.8.0-win-x64.zip` | `5a2c99d467dd0b9ae39dac4bc3c0676bbdd0cb72b935e13958783658b5052249` |
| `overlay.patch` | `fc21fd89a12561f0b6f963c4a6f8e42060906e658a3dec40b4b96d0f52cf1e34` |
| `release-provenance.json` | `0d0738c60a7dcdbeabea879b06403e9adfb07515b0765b243a1f1d6faf579571` |

[SHA256SUMS-overlay.txt](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/SHA256SUMS-overlay.txt), [release-provenance.json](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/release-provenance.json), and [overlay.patch](https://github.com/wangzhongren/ans-studio/releases/download/v1.8.0/overlay.patch) record the frozen source and packaging adaptations; see [this release record](角色卡/装配/docs/change/2026-10-30_change_release-v1.8.0-prepare.md) for provenance verification.

The runtime bundles are **unsigned and not notarized**: macOS builds are not notarized and Windows builds are not code-signed, so the first launch may warn that the source is unverified. Download from the Release above, verify SHA256, then run.

</details>

v1.8.0 includes the bilingual UI (zh-CN / en-US), directory-level authorization, acceptance rework routing, and independent acceptance covering all changes, plus the built-in role hiring chain, module/roster/topology contracts, run freezing, three-part rejections with the contract quick reference, and evidence self-consistency checks; the asset gate (3.3), staged release (3.5), and timeline panel (3.6) are still not in that bundle.

### First use

1. **Import a project and choose an engine.** Click "Import project" (导入项目) in the lower-left corner. Engine selection is unavailable before import; you can also choose an empty folder and start with the default six built-in governance roles. Choose the engine at the top of the session: Claude by default, or switch to Pi or Codex. If configuration is missing, click "Open settings" (打开设置) in the prompt; later you can open Settings from the lower-left. A successful save only means the configuration was saved; connection availability still requires an actual request.
2. **Describe the requirement to chief.** Chief (`chief`) is the default main entry. It confirms goals, scope, and acceptance criteria and dispatches in the order product → rapporteur → nominator → convener. You do not need to remember internal role ids or give verbal approval in chat. Product first writes the product intent document; rapporteur then produces the plan, module list, personnel roster (with module→role bindings and topology), and project architecture — all versioned documents.
3. **Decide on customer cards.** Nominator starts the D3 `appointment` multi-select hiring card from the roster; after D3 selection, card writing is confirmed path by path through `appointment-write`. Acceptance, decisions, and other actions that need customer confirmation are also shown as cards. With "Approve for me" (替我审批) / "Decide for me" (替我决策) enabled, the judge agent may delegate using the card's single recommendation or an already-presented option; delegation is labeled "judge delegated" and never impersonates you. If the switch is off, the judge is unavailable/times out/cannot verify, the case falls back to you. Do not answer card-required questions verbally in chat.
4. **Handoff, implementation, and optional verification.** Before chief hands the project to convener, the application pins the same runId from draft to pinned. Convener then dispatches implementation only to D3-selected project workers with cards, and every implementation task must carry its module ownership. Workers implement and test inside their module directories and short-report to convener; convener may initiate a verifier check, and the verifier reports results back to convener. Verification is optional; it does not approve or replace your acceptance.
5. **Summary and results.** Convener summarizes results for chief, and chief reports to you. Task and request state lives in `.ans/state/tasks.jsonl`; the legacy flow-YAML "flow status" no longer participates in decisions. The work overview shows pending confirmations, current work, queued messages, recent deliveries, and background tasks. The input area uses **Enter to send, Shift + Enter for a newline**; while busy you can stop the current turn or withdraw queued messages not yet executed, and roles and engines keep their own drafts. The details drawer closes with Esc and returns to the original entry.

### Engine configuration

Each engine has its own configuration and never silently switches to another engine when configuration is missing.

| Engine | Required configuration | Optional configuration |
| --- | --- | --- |
| Pi | `ANTHROPIC_AUTH_TOKEN`, `ANS_PI_BASE_URL`, `ANS_PI_MODEL` | `ANS_PI_CONTEXT_WINDOW`, default 500000 when empty; override when the model/gateway's actual window is smaller |
| Codex | `CODEX_API_KEY` (or `OPENAI_API_KEY`), `ANS_CODEX_MODEL` | `ANS_CODEX_BASE_URL`, default `https://api.openai.com/v1`; custom endpoints must be compatible with the Responses API |
| Claude | `ANTHROPIC_API_KEY` | `ANS_CLAUDE_MODEL`, `ANTHROPIC_BASE_URL`; empty uses the SDK default |

Codex and Claude use API keys and do not fall back to subscriptions or OAuth login. For more variables, see [`.env.example`](.env.example).

The runtime bundle stores configuration in the **`.env` in the user data directory**; development startup uses the **repository-root `.env`**. The settings panel shows the actual path. Secret values are not echoed, are not included in the runtime bundle, and should not be committed to Git. Session records live in the project's `.ans/sessions/`, which this repository ignores.

## Build from source

Requires **Node.js 23.6+** and npm.

```bash
git clone https://github.com/wangzhongren/ans-studio.git
cd ans-studio
npm ci
npm run app
```

After the desktop app starts, configure it according to the first-use flow above. If you use the CLI, copy `.env.example` to `.env` and fill in the chosen engine configuration.

### Common CLI commands

Run from the repository root:

```bash
# Self-check and help
node bin/ans.js doctor
node bin/ans.js --help

# Demo session without model calls
node bin/ans.js role run 编排 --task T-1

# Start a governance session on an existing directory; confirm through terminal Q&A
node --env-file=.env bin/ans.js govern /path/to/project --runtime pi

# Run a registered role in the project; replace the role ID and task text
node --env-file=.env bin/ans.js role run "角色ID" --task "任务内容" --runtime pi
```

`--runtime` supports `demo|pi|codex|claude` and takes precedence over the `ANS_RUNTIME` environment variable. When unspecified, `role run` defaults to demo and `govern` defaults to Pi. The desktop default is Claude; the CLI keeps the defaults above. The `govern` target directory must already exist; when no directory is given, the current tool project is used. `ans init` has been removed.

### Directory layout

```text
app/                 Electron main process, preload, desktop-window logic, and React renderer
bin/ans.js           CLI executable entry
src/
  model/             Shared types: roles, boundaries, decisions, runtime contracts
  service/           Service layer: role resolution, runtime sessions, boundary binding
  provider/          Provider layer: Pi / Codex / Claude adapters and governed tools
  pipeline/          Orchestration: governed sessions, flow advancement, judges and gates
  interface/         CLI interface layer
  common/            Role-private and shared support code (gate engine, orchestration public exits, etc.)
  index.ts           CLI root entry and layer wiring
test/                Unit, integration, e2e, and startup smoke tests by role/layer
docs/                Governance artifacts: intents / proposals / contracts / flows / scheduling / acceptance / verification / governance
角色卡/               Role cards, boundary.yaml, and role documents (this repository's own governance)
site/                Static site
.github/workflows/   Release and Pages pipelines
electron-builder.yml Electron packaging configuration
vite.config.ts       Renderer build configuration
```

After a user project is imported, it produces its own governance artifacts under that project's `docs/`; `.ans/` is the application-exclusive governance record area.

### Checks and packaging

```bash
node --test "test/**/*.test.ts"
npm run typecheck
npm run typecheck:renderer
```

Keep the quotes around the test path so it covers multiple directory levels. Some integration tests need to listen on the local loopback address. Build the renderer with `npm run build:renderer`; package locally with `npm run package:local`.

## Release and verification

Release builds use the [GitHub Actions workflow](.github/workflows/release.yml). On native macOS (arm64 / x64) and Windows (x64) runners it freezes the source, applies an explicit overlay, runs `npm ci`, `npm run typecheck`, the full regression suite, the renderer build, packaging, extraction, and a real launch check, then generates `SHA256SUMS`, `release-provenance.json`, and `overlay.patch`. Maintainer provenance checks, build commands, and release steps are in [desktop packaging notes](角色卡/装配/docs/feature/desktop-release-packaging.md) and the [v1.8.0 release record](角色卡/装配/docs/change/2026-10-30_change_release-v1.8.0-prepare.md).

The native CI builds, regresses, and extracts/starts each bundle; in-bundle tests do not call online models. In existing real verification records, online desktop and coding tasks are mainly Pi; controlled/offline whole-chain tests for Codex and Claude are not equivalent to online-model full-chain acceptance. The desktop default of Claude indicates the default choice only, not online acceptance.

## Current limitations

- **Open only trusted projects.** Shell commands have rule checks and review flows but no OS sandbox; approved commands' file side effects are not constrained by the ANS file-write gate. The CLI does not currently enable the shell tool.
- **Windows does not yet support built-in source document reading.** You can view the full summary and execution record; open source files with the system editor.
- **CLI and desktop capabilities differ.** The CLI uses terminal confirmation and does not yet provide desktop-style dispatch, handback delivery, or a queue UI. Automatic scheduling of multi-task dependencies is not implemented.
- **ZIP distribution has no installer or auto-update.** Updates require downloading a new version yourself.
- **Some capabilities are not in the release bundle yet.** The asset completeness gate (3.3), staged planning and stage release (3.5), and the runtime timeline and stage panels (3.6) are not implemented yet and are not in the v1.8.0 bundle.
- **Scaffold-first is governance guidance, not a deterministic hard gate yet.** When a team plan lacks `build-scaffold` or places it too late, the application does not yet deterministically reject the appointment card; enforcement relies on the role-card requirement and the generic `dependsOn` dispatch gate, and real-model compliance with the card text has not been verified online.
- **Verification scope is limited.** The three-platform bundles are built and regressed by native CI with extraction/startup checks. Real desktop and online-model verification is still mainly Pi; controlled/offline tests for Codex and Claude are not online full-chain acceptance. The bundles are unsigned and not notarized.

## Learn more

- [v1.8.0 release preparation](角色卡/装配/docs/change/2026-10-30_change_release-v1.8.0-prepare.md): frozen source, release recipe, and local precheck results.
- [Independent acceptance report for all changes](docs/acceptance/2026-10-24_all-changes-independent-acceptance-report.md): basis and evidence for acceptance covering all changes.
- [Acceptance triage design](角色卡/项目管理/docs/design/2026-10-25_design_acceptance-triage.md): rework / report-only states and ledger semantics.
- [Background tasks and flow status acceptance](角色卡/独立验收/docs/change/2026-10-25_change_app-ui-background-flow-acceptance.md): the background-task panel and read-only flow-status surface.
- [Project architecture](角色卡/项目管理/docs/architecture.md): layering, call direction, and role collaboration.
- [Engineering rules](角色卡/项目管理/docs/project-rules.md): layering, role boundaries, and collaboration constraints.
- [CLI wiring and behavior notes](角色卡/装配/docs/feature/cli-runtime-assembly.md): runtime selection, configuration, and command details.
- [Desktop packaging notes](角色卡/装配/docs/feature/desktop-release-packaging.md): release pipeline, artifacts, and verification.

This project uses the [MIT License](LICENSE).
