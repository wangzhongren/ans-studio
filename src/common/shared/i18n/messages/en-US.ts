// English (en-US) message catalog.
//
// Owner: 项目管理. This catalog must cover **every** key of the zh-CN reference
// catalog; the `satisfies Record<MessageKey, MessageTemplate>` annotation makes a
// missing or extra key a TypeScript error.
//
// Terminology (方案 §13 Q9): role / card / boundary / flow / acceptance. Brand names
// (Pi, Codex, Claude, ANS) are not translated. `roleId` values are machine identifiers
// and stay untranslated in the UI.
//
// B1–B4 key contract: `ui.*` renderer chrome, `main.*` main-process user-visible text,
// `shared.*` shared settings metadata and cross-layer short terms. Machine identifiers,
// prompts/task text addressed to agents, model/tool output, log/diagnostic codes and
// CLI output are deliberately absent.

import type { MessageKey } from "../keys.ts";
import type { MessageTemplate } from "../types.ts";

export const enUS = {
  // ---- Renderer settings: language section (B0 skeleton) ----
  "ui.settings.language.title": "Language",
  "ui.settings.language.description":
    "Choose the interface language. Changes take effect immediately; existing records keep their original language.",
  "ui.settings.language.zhCN": "Chinese (Simplified)",
  "ui.settings.language.enUS": "English",
  "ui.settings.language.saveFailed":
    "Could not save the language preference. Please try again.",

  // ---- Main process: window and dialog titles ----
  "main.window.title": "ANS Desktop (Governed Sessions)",
  "main.dialog.importProject.title": "Import Project (Select Project Root Folder)",
  "main.dialog.pickImage.title": "Choose Image",

  // ---- Main process: startup failure ----
  "main.error.startup.title": "Application Failed to Start",
  "main.error.startup.detail":
    "The interface could not start. Check the diagnostics log and reopen the application.",

  // ---- Application-level language preference errors ----
  "preferences.error.invalidLocale":
    "The language preference was invalid; Simplified Chinese has been restored.",
  "preferences.error.saveFailed":
    "Could not save the language preference. Please try again.",
  "preferences.error.readInvalid":
    "The language preference could not be read; the default language is in use.",

  // =====================================================================
  // shared.* — B4 shared settings metadata + cross-layer short terms
  // =====================================================================

  "shared.common.cancel": "Cancel",
  "shared.common.close": "Close",
  "shared.common.collapse": "Collapse",
  "shared.common.retry": "Retry",
  "shared.common.retryRead": "Retry reading",
  "shared.common.unknown": "Unknown",
  "shared.common.unknownReason": "Unknown reason",
  "shared.common.unknownStatus": "Unknown status",
  "shared.common.none": "None",
  "shared.common.notReported": "Not reported",
  "shared.common.notProvided": "(Not reported)",
  "shared.common.notSet": "Not set",
  "shared.common.system": "System",
  "shared.common.role": "Role",
  "shared.common.tool": "Tool",
  "shared.common.failed": "Failed",
  "shared.common.completed": "Completed",
  "shared.common.aborted": "Aborted",
  "shared.common.redacted": "Redacted",
  "shared.common.truncated": "Truncated",
  "shared.common.safeCopyTitle": "Handover content (safe display copy)",
  "shared.common.working": "Working",

  "shared.common.stopUnsupportedPeriod": "The current runtime does not support stopping.",
  "shared.common.stopTurn": "Stop turn",
  "shared.common.shellConfirmationExpired": "This confirmation has expired (timeout or app restart) and was not approved — ask the role to initiate it again.",
  "shared.common.customerMessage": "Customer message",
  "shared.common.rebuildSession": "Rebuild session",
  "shared.common.invalidSaveRequest": "Invalid save request.",
  "shared.runtimeSettings.runtime.demo": "Demo",
  "shared.runtimeSettings.pi.token.label": "Access token",
  "shared.runtimeSettings.field.apiBaseUrl.label": "API base URL",
  "shared.runtimeSettings.field.apiKey.label": "API key",
  "shared.runtimeSettings.field.model.label": "Model",
  "shared.runtimeSettings.pi.contextWindow.label": "Context window",
  "shared.runtimeSettings.pi.contextWindow.help":
    "Drag to pick a preset; maximum 1M tokens. Leave empty for the system default (500k). Applied when the next session opens.",
  "shared.runtimeSettings.pi.contextWindow.choice.default": "System default (500k)",
  "shared.runtimeSettings.pi.contextWindow.choice.k32": "32k",
  "shared.runtimeSettings.pi.contextWindow.choice.k64": "64k",
  "shared.runtimeSettings.pi.contextWindow.choice.k128": "128k",
  "shared.runtimeSettings.pi.contextWindow.choice.k256": "256k",
  "shared.runtimeSettings.pi.contextWindow.choice.k500": "500k",
  "shared.runtimeSettings.pi.contextWindow.choice.m1": "1M",
  "shared.runtimeSettings.pi.promptTimeout.label": "Watchdog check limit",
  "shared.runtimeSettings.pi.promptTimeout.help":
    "At the limit, the governance role is only asked to check whether the turn is stuck; the turn is not aborted. If it is still progressing, no action is taken; one hour is the last-resort limit. Leave empty for the system default (5 minutes). Unit: ms. Applied when the next session opens.",
  "shared.runtimeSettings.pi.promptTimeout.choice.default": "System default (5 min)",
  "shared.runtimeSettings.pi.promptTimeout.choice.m1": "1 min",
  "shared.runtimeSettings.pi.promptTimeout.choice.m2": "2 min",
  "shared.runtimeSettings.pi.promptTimeout.choice.m5": "5 min",
  "shared.runtimeSettings.pi.promptTimeout.choice.m10": "10 min",
  "shared.runtimeSettings.pi.promptTimeout.choice.m15": "15 min",
  "shared.runtimeSettings.pi.promptTimeout.choice.m30": "30 min",
  "shared.runtimeSettings.reasoning.label": "Reasoning effort",
  "shared.runtimeSettings.reasoning.help":
    "Leave empty to keep the platform default (no change). Levels are off / low / medium / high / xhigh (see the platform for the default level's meaning). Thinking counts toward output tokens.",
  "shared.runtimeSettings.reasoning.choice.off": "Off",
  "shared.runtimeSettings.reasoning.choice.low": "Low",
  "shared.runtimeSettings.reasoning.choice.medium": "Medium",
  "shared.runtimeSettings.reasoning.choice.high": "High",
  "shared.runtimeSettings.reasoning.choice.xhigh": "XHigh",
  "shared.runtimeSettings.codex.apiKey.help":
    "If OPENAI_API_KEY already exists, it can be used as the credential.",
  "shared.runtimeSettings.codex.apiBaseUrl.help":
    "Leave empty to use the OpenAI API; a custom URL must be compatible with the Responses API.",
  "shared.runtimeSettings.claude.model.help": "Leave empty to use the SDK default model.",
  "shared.runtimeSettings.claude.apiBaseUrl.help": "Leave empty to use the SDK default service.",

  // =====================================================================
  // ui.* — B1/B2 renderer
  // =====================================================================

  "ui.titlebar.windowControlsUnavailable": "Window controls unavailable",
  "ui.titlebar.subtitle": "Governed session workbench",
  "ui.titlebar.minimize": "Minimize",
  "ui.titlebar.restore": "Restore",
  "ui.titlebar.maximize": "Maximize",
  "ui.titlebar.controlsUnavailableHint": "Window controls are not available in this environment",

  "ui.app.missingRoot": "Missing #root mount point",
  "ui.app.expandSidebar": "Expand sidebar",
  "ui.app.emptySub": "No project imported or no role selected",

  "ui.chatHeader.noSession": "Session not started",
  "ui.chatHeader.selectRoleHint": "Select a role on the left to start chatting",
  "ui.chatHeader.tabWork": "Work overview",
  "ui.chatHeader.tabCard": "Role profile",

  "ui.role.noneSelected": "No role selected",
  "ui.role.builtinGovernance": "Built-in governance role (see SKILL.md)",
  "ui.role.boundaryCount": {
    one: "{count} boundary entry",
    other: "{count} boundary entries",
  },
  "ui.role.group.primary": "Primary",
  "ui.role.group.governance": "Governance functions (built-in)",
  "ui.role.group.default": "Work roles",
  "ui.role.governance.builtinNote": "Built-in role: shipped with the app, no role directory",
  "ui.role.governance.chief.name": "Chief of Staff",
  "ui.role.governance.chief.power":
    "Workflow management · customer communication · no final approval power",
  "ui.role.governance.product.name": "Product",
  "ui.role.governance.product.power": "Product review · no final approval power",
  "ui.role.governance.draft.name": "Planner",
  "ui.role.governance.draft.power": "Proposal power · no final approval power",
  "ui.role.governance.crew.name": "People Ops",
  "ui.role.governance.crew.power":
    "Card-writing power (after customer appointment) · no final approval power",
  "ui.role.governance.steward.name": "Operations",
  "ui.role.governance.steward.power": "Scheduling power · no final approval power",
  "ui.role.governance.verifier.name": "QA",
  "ui.role.governance.verifier.power": "Acceptance power · no final approval power",

  "ui.sidebar.primaryHint": "Primary entry: default entry point and main path",
  "ui.sidebar.builtinRoleNote": "Built-in role: defined in SKILL.md, no role directory",
  "ui.sidebar.busyAria": "Currently working on {busy}, queued {queued}",
  "ui.sidebar.selectProjectFailed": "Could not select the project. Please try again.",
  "ui.sidebar.noProject": "No project imported",
  "ui.sidebar.noProjectPeriod": "No project imported.",
  "ui.sidebar.collapse": "Collapse sidebar",
  "ui.sidebar.workspace": "Workspace",
  "ui.sidebar.roleListAria": "Role list",
  "ui.sidebar.noRolesInProject": "No roles found in this project.",
  "ui.sidebar.resizeAria": "Resize sidebar",
  "ui.sidebar.resizeTitle": "Drag to resize the sidebar; double-click to reset to 248px",
  "ui.sidebar.switchProject": "Switch project",
  "ui.sidebar.importProject": "Import project",
  "ui.sidebar.pickUnavailable": "Project picker is not available in this environment",
  "ui.sidebar.runtimeSettings": "{runtime} settings",
  "ui.sidebar.settingsDisabled": "Import a project to configure the engine",
  "ui.sidebar.settings": "Settings",
  "ui.sidebar.roleCount": { one: "{count} role", other: "{count} roles" },

  "ui.queue.expand": "Expand full text",
  "ui.queue.collapse": "Collapse full text",
  "ui.queue.fullText": "Full text",
  "ui.queue.withdrawTitle": "Withdraw this queued message (only before delivery)",
  "ui.queue.withdrawing": "Withdrawing…",
  "ui.queue.withdraw": "Withdraw",

  "ui.queueSubview.backRole": "Back to role profile",
  "ui.queueSubview.backWork": "Back to work overview",
  "ui.queueSubview.emptyTitle": "Select a role to view its queue",
  "ui.queueSubview.emptySub":
    "Select a role on the left, then view that role's current work and queued messages.",
  "ui.queueSubview.queued": "Queued {count}",
  "ui.queueSubview.showAll": "View more queue ({count})",
  "ui.queueSubview.collapse": "Collapse queue",

  "ui.work.title": "{roleName} · Work overview",
  "ui.work.emptyTitle": "Select a role to view its work overview",
  "ui.work.emptySub":
    "Select a role on the left, then open the work overview; content follows the current role.",
  "ui.work.pending": "Pending {count}",
  // Count-free title (A2; desktop UI wiring: use with a separate count badge)
  "ui.work.pendingTitle": "Pending",
  "ui.work.locateTitle": "Jump to the original interaction card (does not answer it)",
  "ui.work.locate": "Locate",
  "ui.work.currentWork": "Current work",
  "ui.work.queued": "Queued",
  "ui.work.viewAllQueueAria": "View the full queue ({count} items)",
  "ui.work.viewAllQueue": "View full queue ({count})",
  "ui.work.recentReports": "Recent deliveries",
  "ui.work.emptyPending": "No pending requests",
  "ui.work.emptyQueue": "No in-progress or queued messages",
  "ui.work.emptyReports": "No delivery reports yet",
  "ui.work.overviewAria": "Work overview, {count} pending",
  "ui.work.kind.choice": "Awaiting choice",
  "ui.work.kind.confirm": "Awaiting confirmation",
  "ui.work.requestFallback": "Interaction request",
  "ui.work.reportStatus.blocked": "Blocked",
  "ui.work.origin.report": "Reported by the report: ",
  "ui.work.origin.system": "Recorded by the system as terminal: ",
  "ui.work.origin.unconfirmed": "Source unconfirmed: ",

  // ---- Background tasks panel (renderer; runtime BackgroundTaskCapability: list/read/stop) ----
  "ui.background.title": "Background tasks",
  "ui.background.count": {
    one: "{count} background task",
    other: "{count} background tasks",
  },
  "ui.background.empty": "No background tasks",
  "ui.background.runningSummary": "{count} running",
  "ui.background.role": "Role",
  "ui.background.command": "Command",
  "ui.background.startedAt": "Started",
  "ui.background.pid": "PID",
  "ui.background.duration": "Running time",
  "ui.background.exitCode": "Exit code {code}",
  "ui.background.state.running": "Running",
  "ui.background.state.exited": "Exited",
  "ui.background.state.stopped": "Stopped",
  "ui.background.state.failed": "Failed",
  "ui.background.state.killTimeout": "Stop timed out",
  "ui.background.viewLog": "View log",
  "ui.background.hideLog": "Hide log",
  "ui.background.logEmpty": "No output yet",
  "ui.background.logTruncated": "Log is long; showing the most recent part",
  "ui.background.stop": "Stop",
  "ui.background.stopConfirm": "Stop this background task?",
  "ui.background.stopFailed": "Failed to stop: {detail}",
  "ui.background.readFailed": "Failed to read log: {detail}",
  "ui.background.loadFailed": "Failed to load background tasks: {detail}",
  "ui.background.refresh": "Refresh",

  // Flow status panel (renderer; step progress from docs/flows/<flowId>.yaml)
  "ui.flow.title": "Flow status",
  "ui.flow.progress": "{done}/{total} steps",
  "ui.flow.current": "Current step",
  "ui.flow.owner": "Owner",
  "ui.flow.updatedAt": "Updated",
  "ui.flow.empty": "No flow status",
  "ui.flow.loadFailed": "Failed to load flow status: {detail}",
  "ui.flow.parseError": "Failed to parse {file}: {detail}",
  "ui.flow.showAll": "Show all steps",
  "ui.flow.hideAll": "Hide unfinished steps",
  "ui.flow.state.pending": "Pending",
  "ui.flow.state.dispatched": "Dispatched",
  "ui.flow.state.delivered": "Delivered",
  "ui.flow.state.done": "Done",
  "ui.flow.state.failed": "Failed",
  "ui.flow.state.blocked": "Blocked",
  "ui.flow.state.superseded": "Superseded",
  "ui.flow.kind.artifact": "Artifact",
  "ui.flow.kind.dispatch": "Dispatch",
  "ui.flow.kind.customerDecision": "Customer decision",
  "ui.flow.kind.acceptance": "Acceptance",
  "ui.flow.refresh": "Refresh",

  // Acceptance triage card (result/severity/options/advice/source/report text; desktop UI wiring)
  "ui.triage.title": "Acceptance triage",
  "ui.triage.question": "How should this acceptance result be handled?",
  "ui.triage.option.rework": "Send to coordinator for fixes",
  "ui.triage.option.reportOnly": "Report only, no rework",
  "ui.triage.advice.rework":
    "Recommend sending to the coordinator for fixes — blockers: {blockers}, major items: {majors}; the improvement plan is actionable",
  "ui.triage.advice.reportOnly":
    "Recommend reporting only, without rework — minor/style items: {minors}",
  "ui.triage.advice.none": "No automatic recommendation; please decide manually",
  "ui.triage.conclusion.pass": "Pass",
  "ui.triage.conclusion.fail": "Fail",
  "ui.triage.conclusion.conditional": "Conditional pass",
  "ui.triage.severity.blocker": "Blocker",
  "ui.triage.severity.major": "Major",
  "ui.triage.severity.minor": "Minor",
  "ui.triage.severity.nit": "Nit",
  "ui.triage.section.summary": "Result",
  "ui.triage.section.failures": "Failures",
  "ui.triage.section.improvements": "Improvements",
  "ui.triage.section.source": "Decision source",
  "ui.triage.source.judge": "Judge delegation",
  "ui.triage.source.customer": "Customer choice",
  "ui.triage.warn.blockingReportOnly":
    "The report contains blockers; reporting only will leave them unfixed",
  "ui.triage.report.head": "Acceptance result: {conclusion}",
  "ui.triage.report.reasonLine": "{id} · {severity}: {reason}",
  "ui.triage.report.actionLine": "Suggested improvement: {action}",
  "ui.triage.report.pathLine": "Report: {path}",
  "ui.triage.report.noRework": "No rework this time ({source})",
  "ui.triage.returnedToVerifier":
    "Acceptance report lacks the triage structure; returned to QA to fill it in",
  "ui.triage.missingReport": "Acceptance report unreadable: {detail}",

  // Decision card (material choice, single recommended option, separate from acceptance; desktop UI wiring).
  // A decision card records a material choice only: it is not a proposal/appointment/acceptance, not
  // customer approval, and triggers no gate or acceptance. The judge result must be attributed to the
  // automatic agent, never presented as the customer in person.
  "ui.decisionCard.title": "Decision card · material choice",
  "ui.decisionCard.notApprovalBadge": "Not customer approval",
  "ui.decisionCard.recommended": "Recommended",

  "ui.drawer.collapseTitle": "Collapse (Esc)",

  "ui.engineSelect.aria": "Session engine",
  "ui.engineSelect.ariaCurrent": "Session engine, currently {title}",

  "ui.composer.readFileFailed": "Could not read the file",
  "ui.composer.currentRole": "current role",
  // Visible group title (B1; desktop UI wiring: title of .composer-trust)
  "ui.composer.trustGroupTitle": "Delegation",
  "ui.composer.emptyMessageHint":
    "Enter a message; images are sent together with the message.",
  "ui.composer.sendChannelUnavailable": "Send channel unavailable (not provided in this version).",
  "ui.composer.imageCount": "(Images ×{count})",
  "ui.composer.sendFailed": "Send failed",
  "ui.composer.sendExceptionPrefix": "Send error: ",
  "ui.composer.sendFailedPrefix": "Send failed: ",
  "ui.composer.sendNotReturned":
    "The send call did not return normally; the actual turn result has not been reported yet.",
  "ui.composer.queuedPosition":
    "Queued: it will run after the current task completes (position {position}).",
  "ui.composer.stopFailedPrefix": "Stop failed: ",
  "ui.composer.stopRequested":
    "Stop requested for the current turn — the turn will still end with a completion event.",
  "ui.composer.imageFallbackName": "Image",
  "ui.composer.pickChannelUnavailable": "Image picker is not provided in this version.",
  "ui.composer.pickFailedNoData": "Image selection failed: no image data received.",
  "ui.composer.pickFailedPrefix": "Image selection failed: ",
  "ui.composer.readImageFailedPrefix": "Could not read image: ",
  "ui.composer.attachValidationUnavailable":
    "Attachment validation is not provided in this version.",
  "ui.composer.pastedImage": "Pasted image",
  "ui.composer.imageValidationFailedPrefix": "Image validation failed: ",
  "ui.composer.imageValidationFailed": "Image validation failed.",
  "ui.composer.imageOnly": "Only image files are supported (png / jpeg / webp / gif).",
  "ui.composer.removeImage": "Remove image",
  "ui.composer.placeholderToRole": "Message {role}…",
  "ui.composer.placeholderSelectRole": "Select a role to send a message…",
  "ui.composer.ariaMessage": "Message to the current role",
  "ui.composer.addImage": "Add image (png / jpeg / webp / gif, ≤5MB)",
  "ui.composer.addImageUnavailable": "Image picker is not provided in this version",
  "ui.composer.ariaAddImage": "Add image",
  "ui.composer.enterHint": "Enter to send, Shift + Enter for a new line",
  "ui.composer.stopTitle": "Stop the current turn",
  "ui.composer.sendWithEnter": "Send (Enter)",
  "ui.composer.sessionNotOpen": "Session not started: select a role and start a session",
  "ui.composer.ariaSend": "Send",
  "ui.composer.send": "Send",
  "ui.composer.dismissHint": "Dismiss hint",
  "ui.composer.footerWorking":
    "Enter to send, Shift+Enter for a new line; failures are reported honestly.",
  "ui.composer.footerIdle": "Select a role and start a session to send.",
  "ui.composer.writeBoundaryNote":
    "Writes go to the imported project; writes outside the role boundary are rejected.",

  // view_image attachment label (project image attachment in the next user prompt; desktop UI optional wiring).
  // Customer requirement: roles can view project image evidence. view_image only confirms the image was read
  // and queued this turn; the image reaches the same role as an image attachment on the next user prompt.
  "ui.viewImage.attachmentLabel": "view_image attachment: {path}",
  // Chat-stream thumbnail (customer request 2026-10-27: show the image the role viewed).
  // Invalid path / missing project root / load failure keeps the tool row and states the reason; no broken image.
  "ui.viewImage.previewNoProject": "No project is loaded; the image cannot be previewed.",
  "ui.viewImage.previewPathUnsafe":
    "The target is not a project image path; the image cannot be previewed.",
  "ui.viewImage.previewLoadFailed": "The image failed to load; it cannot be previewed.",
  // Lightbox (customer follow-up 2026-10-27: enlarge in-app; no file:// navigation, no CSP change).
  "ui.viewImage.openPreview": "Open larger preview: {path}",
  "ui.viewImage.lightboxLabel": "Image preview: {path}",

  "ui.confirm.shellDenyNote":
    "Clicking Reject, pressing Esc, or closing this box = no approval (nothing runs).",
  "ui.confirm.shellApproveNote":
    "Once approved, the command runs with the current OS user's permissions and may bypass the ANS file write boundary; verify the exact command first.",
  "ui.confirm.recoveryNote":
    "Clicking Cancel, pressing Esc, or closing this box = not executed; only Execute runs it.",
  "ui.confirm.unknownRole": "(unidentified)",
  "ui.confirm.matchedReason": "Match reason: {reason}",
  "ui.confirm.reviewOriginal": "Review text (internal wording, for verification only): {reason}",
  "ui.confirm.suApprovalBadge": "su approval",
  "ui.confirm.closeNoApprove": "Close (no approval)",
  "ui.confirm.detailsArgv": "Details (argv / cwd)",
  "ui.confirm.cwd": "Working directory (cwd)",
  "ui.confirm.argv": "Normalized argv",
  "ui.confirm.approve": "Approve and run",
  "ui.confirm.reject": "Reject",
  "ui.confirm.actionWithLabel": "Action: {label} ({action})",
  "ui.confirm.action": "Action: {action}",
  "ui.confirm.proposer": "Proposed by: {name}",
  "ui.confirm.proposedAt": "Proposed at: {time}",
  "ui.confirm.targetItem": "Target item: {id}",
  "ui.confirm.recoveryTitle": "Recovery request",
  "ui.confirm.closeNoExecute": "Close (do not execute)",
  "ui.confirm.targetRole": "Target role: {role}",
  "ui.confirm.reasonProvided": "Reason (from proposer): {reason}",
  "ui.confirm.evidenceLabel": "Evidence (from proposer, verbatim):",
  "ui.confirm.detailsRecovery": "Details (proposer / time / item)",
  "ui.confirm.execute": "Execute",
  "ui.confirm.failedShell":
    "Your decision could not be delivered (channel missing or failed) — fail-closed: not approved. Ask the role to initiate it again.",
  "ui.confirm.expiredRecovery":
    "This confirmation has expired (app restart or request ended) and was not executed — ask the proposer to initiate it again.",
  "ui.confirm.expiredShell":
    "This confirmation has expired and was not approved — ask the role to initiate it again.",
  "ui.confirm.failedRecovery":
    "Your decision could not be delivered (channel missing or failed) — fail-closed: not executed. Ask the proposer to initiate it again.",
  "ui.confirm.sourceDispatchWithRole": "Dispatch · from {roleId}",
  "ui.confirm.sourceDispatch": "Dispatch",
  "ui.confirm.sourceHandbackWithRole": "Delivery · from {roleId}",
  "ui.confirm.sourceHandback": "Delivery",
  "ui.confirm.queueRunning": "In progress",
  "ui.confirm.withdrawn": "Queued message withdrawn: {summary}",
  "ui.confirm.withdrawInvalid": "Withdrawal had no effect: {detail}",
  "ui.confirm.withdrawFailed": "Withdrawal failed: {detail}",
  "ui.confirm.imageTypeUnsupported":
    "Unsupported image type: {type} — only png / jpeg / webp / gif are supported.",
  "ui.confirm.imageTooLarge": "Image too large (> {mb}MB) — compress it and try again.",

  "ui.settings.placeholderSet": "Already set; leave empty to keep unchanged",
  "ui.settings.hide": "Hide",
  "ui.settings.show": "Show",
  "ui.settings.optionDefault": "Empty (platform default)",
  "ui.settings.rangeOffPreset": "Current value is off-preset; switch to a preset before saving",
  "ui.settings.secretTag": "Secret",
  "ui.settings.statusChecking": "Checking…",
  "ui.settings.statusUnknown": "Configuration unknown",
  "ui.settings.statusMissing": "Missing configuration",
  "ui.settings.statusConfigured": "Configured",
  "ui.settings.engineSettingsAria": "Engine settings",
  "ui.settings.runtimeConfigCurrent": "{runtime} configuration (current session engine)",
  "ui.settings.runtimeConfig": "{runtime} configuration",
  "ui.settings.panelNote":
    "Configuration only affects the selected engine; it does not switch the current session.",
  "ui.settings.pathNotReported": "(save location not reported)",
  "ui.settings.saveNote": "Saved to the repository-root .env; only this engine's fields change.",
  "ui.settings.readFailed": "Could not read the configuration.",
  "ui.settings.incomplete":
    "{label} configuration is incomplete; missing: {missing}. Fill it in before saving.",
  "ui.settings.advanced": "Advanced",
  "ui.settings.advancedHint":
    "All advanced fields may be left empty; empty = use the default value.",
  "ui.settings.saveToEnv": "Save to .env",
  "ui.settings.saveNoteTitle": "Saved to .env (changed keys: {keys}). {tail}{application}",
  "ui.settings.saveNoteShort": "Saved to .env ({count} changed keys). {tail}{application}",
  "ui.settings.saveNoteNoChanges": "Saved to .env (no keys changed). {tail} {application}",
  "ui.settings.stillMissingCount": "Required configuration still missing {count} items (see above).",
  "ui.settings.stillMissingList": "Required configuration still missing: {keys}.",
  "ui.settings.requiredReady": "Required configuration is complete.",
  "ui.settings.applicationCurrent": "The current configuration is applied.",
  "ui.settings.applicationNextSession": "Applied when the next session opens.",
  "ui.settings.applicationAfterActiveTurn":
    "The current turn keeps the old configuration; the next input uses the new one.",
  "ui.settings.applicationAfterActiveTurnShort":
    "The current turn keeps the old configuration; the next input applies it.",
  "ui.settings.applicationUnknown": "Configuration application timing not reported.",
  "ui.runtimeConfig.unknownEngine": "Unknown engine",
  "ui.runtimeConfig.summaryNotReady": "Configuration summary not ready",
  "ui.runtimeConfig.source.file": "File",
  "ui.runtimeConfig.source.environment": "Environment",
  "ui.runtimeConfig.source.fallback": "Fallback",
  "ui.runtimeConfig.source.default": "Default",
  "ui.runtimeConfig.sourceUnknown": "Source not reported",
  "ui.runtimeConfig.fieldRequired": "{label} · Required",
  "ui.runtimeConfig.fieldOptional": "{label} · Optional",
  "ui.runtimeConfig.requiredReady": "{label} required configuration is complete. {application}",
  "ui.runtimeConfig.readFailedWithDetail": "Could not read configuration: {detail}",
  "ui.runtimeConfig.saveFailed": "Save failed: {detail}",
  "ui.runtimeConfig.saveException": "Save error: {detail}",
  "ui.runtimeConfig.unknownError": "Unknown error",
  "ui.runtimeConfig.saving": "Saving…",
  "ui.runtimeConfig.readFailedForLabel":
    "Could not read the {label} configuration; open settings to check or retry.",
  "ui.runtimeConfig.checkingLabel": "Checking the {label} configuration…",
  "ui.runtimeConfig.engineSettingsTitle": "{label} configuration",
  "ui.runtimeConfig.engineSettingsTabTitle": "{label} settings",
  "ui.runtimeConfig.openEngineSettings": "Open {label} settings",

  "ui.governance.checkAndReaccept": "Check and re-accept",
  "ui.governance.establish": "Create governance record",
  "ui.governance.readingPreview": "Reading preview…",
  "ui.governance.reacceptPreview": "Re-accept governance boundary (preview)",
  "ui.governance.upgradePreview": "Upgrade to trio governance (preview)",
  "ui.governance.establishPreview": "Create governance record (preview)",
  "ui.governance.reaccepting": "Re-accepting…",
  "ui.governance.confirmAccept": "Confirm acceptance",
  "ui.governance.modelLabel": "Governance model (written to .ans on creation):",
  "ui.governance.modelAria": "Governance model",
  "ui.governance.modelToWrite": "Governance model to be written: {model}",
  "ui.governance.pinObjects": "Objects to pin: {pinCount}; roles: {roleCount}:",
  "ui.governance.establishing": "Creating governance record…",
  "ui.governance.upgrading": "Upgrading…",
  "ui.governance.confirmUpgrade": "Confirm upgrade",
  "ui.governance.model.single": "Legacy model (su)",
  "ui.governance.model.trio": "Trio · five roles",
  "ui.governance.modelShort.trio": "Trio",
  "ui.governance.status.awaitingCustomer": "Awaiting customer decision",
  "ui.governance.status.inProgress": "In progress",
  "ui.governance.status.blocked": "Blocked",
  "ui.governance.status.escalated": "Escalated to customer",
  "ui.governance.modelLine": "Governance model: {model}",
  "ui.governance.currentFlow": "Current flow: {flowId}",
  "ui.governance.noRecordBody":
    "This project has {roleCount} project roles but no governance record yet (.ans/project.json). Project roles can work within their own boundaries; governance roles cannot write for now.",
  "ui.governance.reasonNotProvided": "Reason not provided",
  "ui.governance.recordUnavailable":
    "Governance record unavailable: {reason}; this version does not overwrite automatically",
  "ui.governance.primaryRole": "Primary role",
  "ui.governance.noRecordTitle": "No governance record yet",
  "ui.governance.recordUnavailableTitle": "Governance record unavailable",
  "ui.governance.establishHint":
    "Before talking to {roleName}, create the governance record; you can also run ans govern <project-dir> in a terminal.",
  "ui.governance.roleIntro.chief":
    "Default customer entry: manages workflow, dispatches tasks and patrols, and receives request notifications; does not decide, forward, or approve. Role requests go directly to the customer and are presented/adjudicated by the app.",
  "ui.governance.roleIntro.product":
    "A product review/advisory worker; tasks come only from the Chief of Staff and results are briefly reported only to it; submits requests directly when a customer decision is needed.",
  "ui.governance.roleIntro.proposal":
    "Usually opened via a handoff from Product; customers may also come to me directly. I only write proposals and do not approve.",
  "ui.governance.roleIntro.nomination":
    "Opened after customer appointment to write cards; writes role cards and boundaries only per the team plan and appointment list; does not select roles or approve.",
  "ui.governance.roleIntro.schedule":
    "Usually opened after a proposal is accepted; only orders steps and dispatches, does not approve plans",
  "ui.governance.roleIntro.verification":
    "Usually opened by the acceptance step after delivery completes; only checks evidence and issues acceptance cards, does not approve.",
  "ui.governance.mismatch.modified": "{count} changed",
  "ui.governance.mismatch.missing": "{count} missing",
  "ui.governance.mismatch.unreadable": "{count} unreadable",
  "ui.governance.mismatch.someInconsistent": "inconsistencies exist",
  "ui.governance.mismatch.summary":
    "Governance record and on-disk boundaries are inconsistent: {pinCount} pins, of which {diffCount} differ from the record ({detail}). Until confirmed, sessions cannot start and writes are rejected.",
  "ui.governance.mismatch.title": "Governance record and on-disk boundaries are inconsistent",
  "ui.governance.mismatch.note":
    "Accepting refreshes SHA-256 and the audit trail only; it does not modify any boundary file content.",
  "ui.governance.mismatch.hint":
    "You can also verify the git history in a terminal before acting.",
  "ui.governance.pin.changed": "{path} — content changed (pin {pinned}… → now {actual}…)",
  "ui.governance.pin.missing": "{path} — file missing (cannot re-pin)",
  "ui.governance.pin.unreadable": "{path} — file unreadable (cannot re-pin)",
  "ui.governance.reacceptPinned":
    "Recalculates {count} pins; adds or removes no pin entries and modifies no boundary file content.",
  "ui.governance.reacceptWriteLine":
    "Will write: .ans/project.json, docs/bootstrap-manifest.md",
  "ui.governance.reacceptWarning":
    "If you do not recognize these changes, verify them via git history or a backup first; do not accept blindly.",
  "ui.governance.reacceptSuccess":
    "Re-accepted: updated {updated} pins ({total} total); wrote .ans/project.json and docs/bootstrap-manifest.md. The project is usable again.",
  "ui.governance.reacceptNotWritten": "No files were written this time.",
  "ui.governance.reacceptNoRecord": "No governance record; create one first.",
  "ui.governance.reacceptInvalidRecord":
    "Governance record unavailable; this version does not provide a repair.",
  "ui.governance.reacceptNotNeeded": "Boundaries match the record; no re-acceptance needed.",
  "ui.governance.reacceptPreviewStale":
    "Boundary files changed again after the preview; this write was cancelled. Check again.",
  "ui.governance.reacceptFixFiles": "Resolve the files above, then retry.",
  "ui.governance.reacceptBusy":
    "A previous operation is still running; no files were written this time.",
  "ui.governance.establishWritePath": "Will write: {path}",
  "ui.governance.establishAdoptExisting":
    "Will adopt the existing governance boundary document (without overwriting its content).",
  "ui.governance.establishWriteBoundary": "Will write governance boundary document: {path}.",
  "ui.governance.establishBoundaryNotReported": "Governance boundary document: (not reported)",
  "ui.governance.establishLegacyBoundary":
    "{path} (legacy Markdown boundary; pinned verbatim, migration is a later version)",
  "ui.governance.establishDeclaration":
    "Does not widen any role's write boundary or modify any role boundary file content.",
  "ui.governance.establishAlreadyExists":
    "A governance record already exists; no files were written this time.",
  "ui.governance.establishBusy":
    "A previous creation is still running; no files were written this time.",
  "ui.governance.establishInvalidRecord":
    "Governance record unavailable; this version does not overwrite automatically; a repair path is planned.",
  "ui.governance.errorCode": "Error code: {code}",
  "ui.governance.noFilesWritten": "No files were written.",
  "ui.governance.modelOption.single": "Single model (single)",
  "ui.governance.modelOption.trio": "Trio (trio)",
  "ui.governance.modelChoiceUnwired":
    "This desktop window has not wired the governance model selector; this version cannot create by the selected model, and the button is disabled.",
  "ui.governance.trioArtifactsHint":
    "Trio artifacts detected (docs/proposals / docs/nominations / docs/flows); trio is recommended. Please choose explicitly.",
  "ui.governance.legacyModelHint":
    "This project uses the legacy governance model (su). It can be upgraded to trio.",
  "ui.governance.migrationLabel": "View diff / upgrade",
  "ui.governance.migrationPending": "Upgrade entry pending in a later version",
  "ui.governance.migrationOpenTitle":
    "Opens the migration preview (zero writes); confirming only changes .ans governanceModel and appends a manifest record.",
  "ui.governance.migrationUnwired":
    "Migration preview and write are not wired yet; unavailable in this version.",
  "ui.governance.migration.legacyModel": "Legacy model",
  "ui.governance.migration.fieldMissing":
    '(field missing, will add governanceModel: "trio")',
  "ui.governance.migration.modelLine": "Model: {from} → {to}",
  "ui.governance.migration.modelField": "Will write .ans field: {field}",
  "ui.governance.migration.manifestAppend": "Will append manifest record: {id}",
  "ui.governance.migration.pinChange": "Pin change: {item}",
  "ui.governance.migration.pinNoChange": "Pin change: none (pins are not recalculated)",
  "ui.governance.migration.retained": "Retained files: {files}",
  "ui.governance.migration.digest": "Preview digest (first 8): {digest}",
  "ui.governance.migration.zeroWrite":
    "Preview writes nothing. Confirming only changes .ans governanceModel and appends a manifest record; role cards/boundaries/pins/session history are not rewritten.",
  "ui.governance.migration.success":
    'Upgraded to trio governance (.ans governanceModel = "trio"). Legacy role cards/boundaries/pins/session history are retained.',
  "ui.governance.migration.alreadyTrio":
    "Already trio governance; no upgrade needed. No files were written this time.",
  "ui.governance.migration.noRecord":
    "No governance record (.ans/project.json); no files were written this time.",
  "ui.governance.migration.blocked": "Upgrade blocked; no files were written this time.",
  "ui.governance.migration.previewStale":
    ".ans changed again after the preview; this write was cancelled. Check again.",
  "ui.governance.migration.busy":
    "A previous upgrade is still running; no files were written this time.",
  "ui.governance.migration.invalidRequest":
    "Invalid upgrade request; no files were written this time.",
  "ui.governance.migration.status": "Status: {status}",
  "ui.governance.migration.writeFailed":
    "The write phase failed; some files may have been written. Verify the current state.",
  "ui.governance.decisionBadge": "Governance decision · final customer approval",
  "ui.governance.intentBadge": "Intent confirmation · customer",
  "ui.governance.queueNote": "Waiting for the previous decision",
  "ui.governance.mirrorBadge": "Mirror · primary",
  "ui.governance.power.proposal": "Proposal",
  "ui.governance.power.appointment": "Appointment",
  "ui.governance.power.appointmentWrite": "Appointment card-writing",
  "ui.governance.power.scheduleWrite": "Scheduling",
  "ui.governance.power.acceptance": "Acceptance",
  "ui.governance.power.intentConfirm": "Intent confirmation",
  "ui.governance.decisionLine.step": "Step: {stepId}",
  "ui.governance.decisionLine.power": "Power type: {power}",
  "ui.governance.decisionLine.writePath": "Path to write: {path}",
  "ui.governance.decisionLine.summary": "Summary: {summary}",
  "ui.governance.decisionLine.hash": "Hash: {sha256}",
  "ui.governance.decisionSourceFallback": "Originating role",
  "ui.governance.decisionTitle":
    "Governance decision from {name} · final customer approval",
  "ui.governance.moreDecisions":
    "There are {count} more decisions waiting for the previous decision",

  "ui.reportCard.viewSource": "View source role documents",
  "ui.reportCard.unsupportedVersion":
    "This report version is not supported; no outcome summary was generated.",
  "ui.reportCard.sourceLine": "Source {sourceName} · {origin}",
  "ui.reportCard.title": "Task report",
  "ui.reportCard.runtimeUnknown": "Engine unknown",
  "ui.reportCard.task": "Task {taskId}",
  "ui.reportCard.taskUnknown": "Task association unknown",
  "ui.reportCard.turn": "Turn {turnId}",
  "ui.reportCard.turnNotProvided": "Turn not provided",
  "ui.reportCard.excerptLabel": "Report excerpt",
  "ui.reportCard.folded": "Summary folded; the full safe display copy is below",
  "ui.reportCard.storage": "Report storage",
  "ui.reportCard.independentAcceptance": "Independent acceptance",
  "ui.reportCard.notConfirmed": "Not confirmed yet",
  "ui.reportCard.disclaimer":
    "The above is a report or terminal record; it is not an independent acceptance pass.",
  "ui.reportCard.viewFull": "View full report summary and evidence",
  "ui.reportCard.noEvidence": "(no evidence provided)",
  "ui.reportCard.receiptHistory": "Receipt history",
  "ui.reportCard.targetInput": "Target input record",
  "ui.reportCard.targetTurn": "Target turn result",
  "ui.reportView.provenance.timestamp": "Original time not saved or displayable",
  "ui.reportView.provenance.anchorToken": "Original anchor token not provided",
  "ui.reportView.provenance.oversize": "Original call identity exceeds the display budget",
  "ui.reportView.originFormal": "Formal delivery",
  "ui.reportView.originTerminal": "Terminal record",
  "ui.reportView.originUnconfirmed": "Source unconfirmed",
  "ui.reportView.evidenceTruncatedSome": "Some evidence is truncated",
  "ui.reportView.evidenceRedactedSome": "Some evidence is redacted",
  "ui.reportView.evidenceOmitted": {
    one: "{count} more evidence item omitted for budget",
    other: "{count} more evidence items omitted for budget",
  },
  "ui.reportView.saveError.conflict":
    "Saved content conflicts; it cannot be overwritten automatically.",
  "ui.reportView.saveError.invalid":
    "Invalid saved material; it cannot be restored automatically.",
  "ui.reportView.saveError.replayDamaged":
    "History record damaged; it cannot be backfilled automatically.",
  "ui.reportView.saveError.replayChanged":
    "History record changed; it cannot be backfilled automatically.",
  "ui.reportView.saveError.snapshotExpired":
    "The session material available for backfill has expired; it cannot be backfilled here.",
  "ui.reportView.saveError.provenanceTooLarge":
    "The delivery record exceeds the display and provenance budget; nothing further has been delivered.",
  "ui.reportView.saveError.textProjectionFailed":
    "Could not generate the delivery display content; it has not been handed to the Provider.",
  "ui.reportView.savedTargetHistory": "Receipt history saved",
  "ui.reportView.savedReport": "Report saved",
  "ui.reportView.save.sessionOnly":
    "Visible only in this session; history saving is disabled.",
  "ui.reportView.save.unsupported":
    "The current session cannot confirm or does not support this save/restore capability.",
  "ui.reportView.save.historyNotSaved":
    "This receipt history was not saved; execution status is subject to the actual results above.",
  "ui.reportView.save.reportNotSaved":
    "The report has not been saved, so the delivery has not continued. You can backfill the original report without rerunning the task.",
  "ui.reportView.savingReport": "Saving report…",
  "ui.reportView.savingHistory": "Saving history…",
  "ui.reportView.save.historyReceiptPending":
    "Final history receipt not obtained yet; processing may have started.",
  "ui.reportView.save.reportUnconfirmed": "Report save status unconfirmed.",
  "ui.reportView.retryHistory": "Retry saving history",
  "ui.reportView.retryReport": "Retry saving report",
  "ui.reportView.retryNote":
    "Backfills the existing record; does not execute or deliver again.",
  "ui.reportView.turnStatus.timedOut": "Timed out",
  "ui.reportView.history.unconfirmed": "Unconfirmed",
  "ui.reportView.history.saved": "Saved",
  "ui.reportView.history.disabled": "History saving disabled",
  "ui.reportView.history.notSaved": "Not saved yet",
  "ui.reportView.history.maybeStarted": "May have started; result unconfirmed",
  "ui.reportView.history.notHandedToProvider": "Not handed to the Provider yet",
  "ui.reportView.batch": "Delivery · {count} in this batch (not all received)",
  "ui.reportView.modelInputMissing": "The full model input is not recorded here",
  "ui.reportView.displayTruncated": "Display copy truncated",
  "ui.reportView.summaryTruncated": "Summary truncated",
  "ui.reportView.replicaMissing":
    "No safe display copy of the handover content was provided; the full model input cannot be shown.",
  "ui.reportView.taskRequestLabel": "Original task request",
  "ui.reportView.replyOriginalLabel": "Original role reply for this turn (expand)",
  "ui.reportView.deliveryReplyLabel":
    "Original delivery-processing reply for this turn (expand)",
  "ui.reportView.projection.reportUnreadable": "Unreadable report records: {count}",
  "ui.reportView.projection.omitted": "History projections before omission: {count}",
  "ui.reportView.projection.invalid": "Invalid projection entries: {count}",
  "ui.reportView.projection.truncated": "History projection truncated",
  "ui.reportView.projection.skipped": "Skipped by the original parse: {count}",

  "ui.documentView.expired": "Document context is no longer valid.",
  "ui.documentView.reading": "Reading listed documents…",
  "ui.documentView.openReadonly": "Open this document read-only",
  "ui.documentView.unreadable": "Not readable in the current project/scope",
  "ui.document.error.invalidRequest": "Invalid document request.",
  "ui.document.error.projectNotGranted":
    "Document read permission for the current project has not been granted; reselect the project folder.",
  "ui.document.error.projectNotActive": "This project is not the current project.",
  "ui.document.error.staleScope":
    "The project document list is stale; return to the current project and select again.",
  "ui.document.error.unknownDocument": "Unknown document reference.",
  "ui.document.error.notListed": "This document is no longer in the readable list.",
  "ui.document.error.outsideProject":
    "This file is outside the readable scope allowed for the current project.",
  "ui.document.error.symlinkNotAllowed": "Symlinked documents cannot be read.",
  "ui.document.error.notFound": "Document not found.",
  "ui.document.error.notFile": "This reference is not a regular file.",
  "ui.document.error.unsupportedFormat": "This document format is not supported yet.",
  "ui.document.error.invalidUtf8": "The document is not valid UTF-8 text.",
  "ui.document.error.binaryContent": "The document contains binary content and cannot be previewed.",
  "ui.document.error.tooLarge": "The document exceeds 256KiB and cannot be previewed here.",
  "ui.document.error.permissionDenied": "No permission to read this document.",
  "ui.document.error.changedDuringRead":
    "The document changed during reading; select it again.",
  "ui.document.error.unsupportedEnvironment":
    "This environment does not support safe reading of project documents yet.",
  "ui.document.error.ioError": "Document read failed.",
  "ui.document.error.fallback": "Could not read this document.",
  "ui.document.readonlyMeta": "Read-only document · {bytes} bytes",
  "ui.document.reading": "Reading document…",
  "ui.document.unlisted": "This link has no reading entry yet.",
  "ui.document.empty": "This role currently has no listed readable documents.",
  "ui.document.pickHint":
    "These are the readable documents listed for this role in the current project; choose one to read.",
  "ui.document.sourceTitle": "{roleName} · Source documents",
  "ui.document.backList": "Back to source documents",
  "ui.document.refresh": "Refresh listed documents",
  "ui.document.read": "Read",
  "ui.profile.title": "{roleName} · Role profile",
  "ui.profile.aria": "Role profile, {count} in progress or queued",
  "ui.profile.noEntries": "(no entries)",
  "ui.profile.noEntriesParseFailed": "(no entries; parse failed: {detail})",
  "ui.profile.emptyTitle": "Select a role to view its profile",
  "ui.profile.emptySub":
    "Select a role on the left, then open the matching panel from the session header's “Role profile” or “Work overview”; content follows the current role.",
  "ui.profile.cardTab": "Role card",
  "ui.profile.emptyCard": "(empty)",
  "ui.profile.boundaryTab": "Boundary entries",
  "ui.profile.changelogTab": "Change log",
  "ui.profile.noChangelog": "(no changelog.md)",
  "ui.profile.docsTab": "Documents",
  "ui.profile.noDocs": "(no docs/ directory or it is empty)",
  "ui.profile.viewListedDocs": "View listed documents",
  // Role-root-docs display (2026-10-23 role-root-docs-display S5; design §5.5.6):
  // 4 required keys (root group, docs group, section empty state, read-only open)
  // + 3 optional sub-labels. File names (feature-map.md etc.), `docs/`, and
  // `not-applicable` are path/content identifiers and stay untranslated.
  "ui.profile.docsGroupRoot": "Role root documents",
  "ui.profile.docsGroupSubdir": "docs/ directory",
  "ui.profile.noRoleDocs": "(no role documents)",
  "ui.profile.openRootDoc": "Open {name} read-only",
  "ui.profile.rootDoc.featureMap": "Feature map",
  "ui.profile.rootDoc.functionalDescription": "Module view and code locations",
  "ui.profile.rootDoc.apiSpec": "API / implementation report",
  "ui.profile.pendingQueue": "Pending / queue",
  "ui.queue.title": "{roleName} · Queue",

  "ui.status.label.stopped": "Stopped",
  "ui.status.label.closed": "Not started",
  "ui.status.label.idle": "Idle",
  "ui.status.label.working": "Working",
  "ui.status.label.waitingConfirm": "Waiting for you",
  "ui.status.label.error": "Error",
  "ui.status.label.idleRecovered": "Idle (restored)",
  "ui.status.title.closed": "Session not started (click to start)",
  "ui.status.title.idle": "Session started; no task is running",
  "ui.status.title.working":
    "A turn is running (turns that keep running in the background after switching count too) or the queue has pending items",
  "ui.status.title.waitingConfirm":
    "An interaction request is pending, waiting for your answer in the conversation",
  "ui.status.title.stopped":
    "Session stopped (history stays on screen; clicking again starts a new session)",
  "ui.status.title.error": "The latest turn or session ended with an error",
  "ui.status.title.idleRecovered":
    "No live handle; the conversation shows history restored for this role",
  "ui.status.title.unknown": "Unknown status (conservative placeholder)",
  "ui.status.pendingCount": {
    one: "{count} pending",
    other: "{count} pending",
  },
  "ui.status.queueNote.enqueued": {
    one: "{count} more item is queued and runs after the current task",
    other: "{count} more items are queued and run after the current task",
  },
  "ui.status.queueNote.pending": {
    one: "{count} more item is pending in the queue (processed in order)",
    other: "{count} more items are pending in the queue (processed in order)",
  },

  "ui.chatRow.noFileTarget": "No file target",
  "ui.chatRow.timeNotRecorded": "Not recorded",
  "ui.chatRow.legacyStatusSource":
    "Status source: legacy text classification, not new machine execution facts",
  "ui.chatRow.legacyClassification":
    "Legacy text classification, not new machine execution facts",
  "ui.chatRow.unsupportedDetail": "This detail version is not supported.",
  "ui.chatRow.noDetails": "This history entry saved no further target or error details.",
  "ui.chatRow.actualCommand": "Actual command",
  "ui.chatRow.targetFile": "Target file",
  "ui.chatRow.noFileTargetDetail": "No file target for this call (interaction/dispatch tools)",
  "ui.chatRow.message": "Message",
  "ui.chatRow.error": "Error",
  "ui.chatRow.result": "Result",
  "ui.chatRow.exitCode": "Exit code: {code}",
  "ui.chatRow.signal": "Signal: {signal}",
  "ui.chatRow.stdout": "stdout",
  "ui.chatRow.stderr": "stderr",
  "ui.chatRow.duration": "Duration: {ms} ms",
  "ui.chatRow.budgetOmitted": "Part of the display content was omitted for budget",
  "ui.chatRow.nonTextResult": "Non-text result not shown",
  "ui.chatRow.unsupportedInput": "Unsupported input not shown",
  "ui.chatRow.timeNotSaved": "Time not saved",
  "ui.chatRow.operationNotApproved": "Operation not approved",
  "ui.chatRow.targetNotRecorded": "Target not recorded",
  "ui.chatRow.choose": "Please choose",
  "ui.chatRow.confirm": "Please confirm",
  "ui.chatRow.preview": "Preview",
  "ui.chatRow.submit": "Submit",
  "ui.chatRow.confirmAction": "Confirm",
  "ui.chatRow.rejectAction": "Reject",
  "ui.chatRow.turnEnded": "Turn ended",
  "ui.chatRow.judgeDetails": "Details (command / reason / evidence)",
  "ui.chatRow.commandOriginal": "Original command",
  "ui.chatRow.customerMessage": "Customer note: {message}",
  "ui.chatRow.customerMessageNote": "The customer note is compiled by the system.",
  "ui.chatRow.evidence": "Evidence",
  "ui.chatRow.hardDenyOverride": "hardDenyOverride: true (deny tier approved by the automatic agent).",
  "ui.chatRow.durationStat": "Duration {ms}ms",
  "ui.chatRow.readCalls": "Reads {count}",
  "ui.chatRow.readBytes": "{bytes} bytes",
  "ui.chatRow.decisionDetails": "Details (judge reason / selected items / evidence)",
  "ui.chatRow.perPath": "Per-path outcome",
  "ui.chatRow.pathResult": "{path}: {result}",
  "ui.chatRow.allowed": "Allowed",
  "ui.chatRow.denied": "Denied",
  // Client projection status (A3: clientProjection.statusCode → text mapping; desktop UI wiring)
  "ui.projection.status.completed": "Completed",
  "ui.projection.status.failed": "Failed",
  "ui.projection.status.aborted": "Aborted",
  "ui.projection.status.timedOut": "Timed out",
  "ui.projection.status.unknown": "Unknown",
  "ui.projection.status.internalFeedback": "Internal feedback",
  "ui.chatStore.context.opened": "Session started",
  "ui.chatStore.context.projectLoadFailed": "Project loading failed",
  "ui.chatStore.context.primaryNoSession": "Primary · session not started",
  "ui.chatStore.context.opening": "Opening or restoring session…",
  "ui.chatStore.context.notConnected": "Not connected to the main process",
  "ui.chatStore.context.channelUnavailable": "Session channel unavailable",
  "ui.chatStore.error.noDesktopBridge": "Desktop bridge is not available in this environment",
  "ui.chatStore.error.noSessionChannel": "Session channel is not provided in this version",
  "ui.chatStore.openFailed": "Session failed to start",
  "ui.chatStore.openFailedWithReason": "Could not start session: {reason}",
  "ui.chatStore.context.continues": "The session continues with the existing context",
  "ui.chatStore.context.recovered": "Model context restored locally",
  "ui.chatStore.context.recoveryFailed": "Restore failed; this is a new session",
  "ui.chatStore.context.newSession": "New session",
  "ui.chatStore.context.sourceUnreported": "Context source not reported",
  "ui.chatStore.context.historyFailed": "History read failed",
  "ui.chatStore.context.engineSwitched": "Engine switched; click the role to reopen the session",
  "ui.chatStore.replayFailed": "Could not read the session record; not replayed: {detail}",
  "ui.chatStore.historyRetainedSuffix": "; readable history retained, model not restored",
  "ui.chatStore.context.historyRecovered": "Session record restored",
  "ui.chatStore.error.operatorChannelMissing": "operatorRespond channel not wired",
  "ui.chatStore.operatorChannelNotAccepted": "Channel did not accept the request",
  "ui.chatStore.context.openingSession": "Opening session…",
  "ui.chatStore.context.openedBackground":
    "Session started; working in the background, no visible messages yet",
  "ui.chatStore.toolNotApproved": "{toolName} not approved",
  "ui.chatStream.withdrawUnavailable":
    "Withdrawal had no effect: withdrawal is not provided in this version.",
  "ui.chatStream.running": "In progress",
  "ui.chatStream.queuePosition": "position {position}",
  "ui.chatStream.empty.noProjectSub":
    "Click “Import project” on the left to choose the project root; after importing, click any role to start chatting.",
  "ui.chatStream.empty.notBootstrappedTitle": "Project not bootstrapped yet",
  "ui.chatStream.empty.notBootstrappedSubWithRole":
    "Chat with {roleName} to have it create the roles; the tree will grow accordingly.",
  "ui.chatStream.empty.notBootstrappedSubPrimary":
    "Chat with the primary entry to have it create the roles; the tree will grow accordingly.",
  "ui.chatStream.empty.noRolesTitle": "No roles found in this project",
  "ui.chatStream.empty.noRolesSub":
    "Make sure the project contains role card directories and governance boundaries; re-import the project and retry.",
  "ui.chatStream.empty.selectRoleTitle": "Select a role to start chatting",
  "ui.chatStream.empty.selectRoleSub":
    "Select a role from the tree on the left; each role keeps its own session history.",
  "ui.chatStream.empty.startSub":
    "Click the button below to start the session; after you send a message, the conversation and tool records appear here.",
  "ui.chatStream.empty.openedTitle": "Session started; you can type a message now",
  "ui.chatStream.empty.openedSub":
    "After the first message, the conversation and tool records appear here. Writes are checked by the governance engine; out-of-boundary operations are flagged directly in the conversation.",
  "ui.chatStream.openingSession": "Opening session with {roleName}…",
  "ui.chatStream.loadingHistory": "Loading session history…",
  "ui.chatStream.startConversation": "Start a conversation with {roleName}",
  "ui.chatStream.working": "Working",
  "ui.chatStream.pendingLocate": {
    one: "{count} pending confirmation · locate",
    other: "{count} pending confirmations · locate",
  },

  "ui.tool.status.called": "Call started",
  "ui.tool.status.denied": "Denied",
  "ui.tool.status.failed": "Execution failed",
  "ui.tool.status.timedOut": "Terminated on timeout",
  "ui.tool.status.completed": "Executed",
  "ui.tool.status.completedExit": "Executed (exit code {code})",
  "ui.tool.status.completedShort": "Execution complete",
  "ui.tool.status.returned": "Tool returned",
  "ui.tool.status.unknown": "Status not recorded",
  "ui.tool.status.recorded": "Recorded",
  "ui.tool.status.notApproved": "Not approved",
  "ui.tool.status.running": "Running",
  "ui.tool.status.done": "Done",
  "ui.tool.summary": "This turn: {count} tool calls",
  "ui.tool.summaryWithTools": "This turn: {count} tool calls: {tools}",
  "ui.tool.containsDenied": "{count} not approved",
  "ui.tool.containsFailed": "{count} failed",
  "ui.tool.containsUnknown": "status not recorded for some",
  "ui.events.target": "Target: {target}",
  "ui.events.timedOut": "Timed out",
  "ui.events.systemMessage": "System message · {label}",
  "ui.events.systemNotice": "System notice",
  "ui.events.systemNoticeWithLabel": "System notice · {label}",
  "ui.events.dispatchTask": "Dispatched task",
  "ui.events.dispatchTaskWithRole": "Dispatched task · from {role}",
  "ui.events.handbackDelivery": "Delivery",
  "ui.events.handbackDeliveryWithRole": "Delivery · from {role}",
  "ui.events.handbackLegacy": "Delivery received (legacy source, safe details unavailable)",
  "ui.events.legacyUnknown": "Legacy/unknown system record: {summary}",
  "ui.events.historyRecord": "(history record)",
  "ui.reasoning.fallbackLabel": "Thought",
  "ui.reasoning.unsafe": "Reasoning content cannot be displayed safely",
  "ui.reasoning.omitted": "The platform omitted the thinking text; details cannot be shown.",
  "ui.reasoning.empty": "No thinking text to display.",
  "ui.reasoning.partial": "The platform omitted part of the thinking text.",
  "ui.reasoning.thoughtSeconds": "Thought for {seconds}s",
  "ui.reasoning.omittedSuffix": " (content omitted by the platform)",
  "ui.reasoning.partialSuffix": " (partially omitted by the platform)",
  "ui.markdown.externalUnavailable": "External opening is not available in this environment",
  "ui.markdown.openFailed": "Could not open the link: {detail}",
  "ui.markdown.openFailedChannel": "Could not open the link: channel error",

  "ui.operator.kind.choice": "Awaiting choice",
  "ui.operator.result.confirm": "Confirmed.",
  "ui.operator.result.deny": "Replied “Disagree” (not approved).",
  "ui.operator.result.cancel": "Cancelled (not approved).",
  "ui.operator.result.submit": "Submitted.",
  "ui.operator.submitting": "Submitted; waiting for the main process to accept…",
  "ui.operator.expired": "The request has expired and was not approved.",
  "ui.operator.expiredWithReason":
    "The request has expired and was not approved. Reason: {reason}",
  "ui.operator.expiredRetry":
    "The request has expired and was not approved. Ask the role to initiate it again.",
  "ui.operator.retryFailed": "Delivery failed: {detail} — please retry.",

  "ui.judge.mode.approval": "Approval delegation",
  "ui.judge.mode.decision": "Decision delegation",
  "ui.judge.titleWithRole": "Command approval · {roleName}",
  "ui.judge.roleName.chief": "Chief of Staff",
  "ui.judge.roleName.product": "Product",
  "ui.judge.roleName.verifier": "QA",
  "ui.judge.titleSu": "SU command approval",
  "ui.judge.titleShell": "shell command request",
  "ui.judge.tier.risky": "Risky command (risky)",
  "ui.judge.tier.review": "Not auto-classified (review)",
  "ui.judge.tier.deny": "Hard-deny class (deny)",
  "ui.judge.shellOn": "Approving for you · automatic agent",
  "ui.judge.shellOff": "Approve for me",
  "ui.judge.decisionOn": "Deciding for you · automatic agent",
  "ui.judge.decisionOff": "Decide for me",
  "ui.judge.bridgeMissing": "Automatic judging is not supported in this version; staying manual",
  "ui.judge.decisionSingleNote": "The legacy governance model (single) does not support decision delegation",
  "ui.judge.shellOffTitle":
    "Manually confirm each shell command and each trio write/appointment-write confirmation (default)",
  "ui.judge.shellOnTitle":
    "The automatic agent evaluates shell commands and trio write/appointment-write confirmations first; can be turned off anytime",
  "ui.judge.decisionOffTitle":
    "Manually confirm each proposal acceptance, appointment, and acceptance (default)",
  "ui.judge.decisionOnTitle":
    "The automatic agent evaluates proposal acceptance, appointments, and acceptance first; can be turned off anytime",
  "ui.judge.warningClose": "Got it",
  "ui.judge.toggleOn.shell":
    "Approving for you: shell commands and write/appointment-write/schedule-write confirmations (write / appointment-write / schedule-write) will be auto-approved by the automatic agent.",
  "ui.judge.toggleOn.decision":
    "Deciding for you: proposal acceptance, appointments, and acceptance will be auto-approved by the automatic agent.",
  "ui.judge.scopeNote":
    "The automatic agent only reads project code/documents/role cards (excluding .env, keys/credentials, the .ans ledger/sessions, audit logs, and anything outside the project); it does not write files or run commands. It only acts for you on “accept/appoint/confirm/accept”, and never rejects for you, requests changes, or ticks under-evidenced candidates. When uncertain, lacking evidence, read failures, engine unavailable, timeout, or parse failure occur, it falls back to card-by-card handling for that switch and you decide.",
  "ui.judge.quickPathNote":
    "The proposal quick path (accept-quick) is not delegated by default; governance direction cards under the legacy model (single/su) are still confirmed card by card; under single, write confirmations are still manual.",
  "ui.judge.costNote":
    "Each delegated decision makes one model call (tokens/latency); result rows and the audit trail are marked “judge delegation · approve/decide”; misjudgments are possible and it can be turned off anytime.",
  "ui.judge.toggleFailed":
    "Could not confirm the automatic-judging switch (channel error); keeping the previous state.",
  "ui.judge.summaryFallback": "Cannot summarize the command; expand to view the original",
  "ui.judge.alternative": "Alternative: {value}",
  "ui.judge.alternativeWithRationale": "Alternative: {value} ({rationale})",
  "ui.judge.tierLine": "Tier: {tier}",
  "ui.judge.hardDenyNote":
    "This command belongs to the hard-deny class; the automatic agent approved it as necessary. Please review.",
  "ui.judge.reasonLine": "Judge reason: {reason}",
  "ui.judge.approvedHardDeny":
    "Approved for you (automatic agent · approval delegation · deny tier)",
  "ui.judge.approved": "Approved for you (automatic agent · approval delegation)",
  "ui.judge.notApproved": "Not approved (automatic agent · approval delegation)",
  "ui.judge.hardDenyLabel": "deny tier · judge approved",
  "ui.judge.engineText": "Judge engine: {engine}",
  "ui.judge.closeAndRetry":
    "Turn off “Approve for me” and retry (manual confirmation), or adjust the command per the alternative.",
  "ui.judge.headline.acceptProposal": "Accept proposal ({selected})",
  "ui.judge.headline.acceptance": "Acceptance passed ({selected})",
  "ui.judge.headline.appointment": "Appoint {selected}",
  "ui.judge.headline.appointmentNotReported": "Appoint (selected items not reported)",
  "ui.judge.headline.writeConfirm": "Confirm writing {count} paths ({paths}{tail})",
  "ui.judge.headline.writeConfirmOverflow": {
    one: "Confirm writing {count} path ({paths}, etc.)",
    other: "Confirm writing {count} paths ({paths}, etc.)",
  },
  "ui.judge.headline.writeNotReported": "Confirm write (paths not reported)",
  "ui.judge.headline.autoApproved": "Auto-approved",
  "ui.judge.headline.autoApprovedWithKind": "Auto-approved ({cardKind})",
  "ui.judge.flowSuffix": " · flow {flowId}",
  "ui.judge.titlePrefix": "judge delegation · {label}",
  // Delegation source and the “automatic delegation ≠ customer manual approval” note (A0; desktop UI wiring)
  "ui.judge.autoSource": "Automatic agent",
  "ui.judge.autoNotCustomerNote":
    "Automatic delegation ≠ customer manual approval: this result comes from the automatic agent under the governance switches; the customer retains the final decision.",
  "ui.judge.selectedLine": "Selected: {items}",
  "ui.judge.pathsLine": "Paths: {paths}",
  "ui.judge.flowText": "Flow: {flowId}",
  "ui.judge.recovery.stopNote":
    "Stops the role's current turn; does not destroy the session.",
  "ui.judge.recovery.rebuildNote":
    "Rebuilds this role's session (keeps ANS replay); skipped while the target is busy.",
  "ui.judge.recovery.redeliver": "Redeliver",
  "ui.judge.recovery.redeliverNote":
    "Triggers an immediate retry of this role's delivery queue.",

  "ui.drawerStore.noSourceRole":
    "Cannot determine the source role; cannot list source documents right now.",
  "ui.drawerStore.refreshFailed": "Document list refresh failed.",
  "ui.drawerStore.withdrawUnavailable": "Withdrawal is not provided in this version",
  "ui.governanceStore.previewUnavailable":
    "Preview channel unavailable (desktop window not wired yet).",
  "ui.governanceStore.migrationUnavailable":
    "Migration channel unavailable (desktop window not wired yet).",
  "ui.governanceStore.previewFailed": "Preview failed.",
  "ui.governanceStore.reacceptUnavailable":
    "Re-accept channel unavailable (desktop window not wired yet).",
  "ui.governanceStore.establishUnavailable":
    "Creation channel unavailable (desktop window not wired yet).",
  "ui.governanceStore.reacceptFailed":
    "Re-accept failed (the main process returned no message).",
  "ui.governanceStore.reacceptEffect":
    "Governance roles will be rebuilt against the new boundary before their next send (if running, effective after the current turn).",
  "ui.governanceStore.establishFailed":
    "Creation failed (the main process returned no finalize.message).",
  "ui.governanceStore.cancelled": "Cancelled; no files were written.",
  "ui.governanceStore.nextStep": "Next step: {step}",
  "ui.governanceStore.stepFallback": "Governance step",
  "ui.governanceStore.flow": "Flow {flowId}",
  "ui.reportStore.sessionNotAvailable": "No original session is available for save/restore.",
  "ui.reportStore.unsupported":
    "The current session does not support this save/restore capability.",
  "ui.reportStore.projectNotActive": "The project is no longer active.",
  "ui.reportStore.scopeMismatch": "Save status scope mismatch.",
  "ui.reportStore.statusUnavailable": "Could not obtain the save status.",
  "ui.settingsStore.noConfigChannel":
    "Configuration channel is not available in this environment",
  "ui.settingsStore.configChannelUnavailable":
    "Configuration channel is not provided in this version",
  "ui.settingsStore.saveChannelUnavailable":
    "Configuration save channel is not provided in this version",

  // =====================================================================
  // main.* — B3 main process
  // =====================================================================

  "main.common.unknownRuntime": "Unknown runtime.",
  "main.common.unknownRole": "(unknown role)",
  "main.common.reloadInterface": "Reload interface",
  "main.common.recoveryPageTitle": "Interface needs recovery",
  "main.common.recoveryPageHeading": "The interface cannot be displayed right now",
  "main.common.recoveryPageBody":
    "Click reload to recover the interface; existing tasks are not resent automatically.",

  // Background task service
  "main.backgroundTasks.unavailable": "Background task service unavailable",

  // Flow status service (docs/flows/<flowId>.yaml reads)
  "main.flowStatus.unavailable": "Flow status service unavailable",
  "main.flowStatus.invalidProject": "Invalid project directory",

  "main.session.contextRecoveryFailed":
    "Native context restore failed; the context was rebuilt.",
  "main.session.rebuiltBoundary":
    "This role's boundary was updated or the runtime configuration was saved ({changed}); the old session was invalidated and reopened against the new boundary. The context restore result is subject to the engine's actual response.",
  "main.session.rebuiltSkills":
    "This role's installed skills changed ({changed}); the old session was invalidated and reopened with the new skill registrations. The context restore result is subject to the engine's actual response.",
  "main.session.rebuildChangedRuntimeConfig": "runtime configuration",
  "main.session.rebuildFailed":
    "Could not reopen the session against the new boundary: {detail} (retry or click the role on the left).",
  "main.session.intentHandoffFailed":
    "The app could not hand the intent to Planner: {detail}; no retry",
  "main.session.openProposalFailed": "Could not open the Planner session ({detail})",
  "main.session.sendProposalFailed": "Could not send the task to Planner ({detail})",
  "main.session.proposalQueued": "Planner is working; the task is queued",
  "main.session.proposalWorking": "Handed to Planner (working)",
  "main.session.intentHandedOff":
    "Intent “{intentId}” handed to Planner (handoffKind={handoffKind}) — handoff ≠ customer approval.",
  "main.session.clarificationEmpty": "The clarification question cannot be empty; not submitted.",
  "main.session.clarificationDisplayFailed":
    "Could not display the clarification request in the primary entry; not submitted.",
  "main.session.clarificationShown":
    "Shown in the primary entry ({roleId}); after the customer answers, Product updates the intent and hands it off.",
  "main.session.clarificationDelivery": "Planner (proposal) needs clarification: {question}",
  "main.session.missingProjectOrRole": "Missing project root or role id.",
  "main.session.readyContinue": "Session ready; continuing the current session.",
  "main.session.closedClickRole": "The session is closed; click the role again.",
  "main.session.continuing": "Already in this role's session; continuing it.",
  "main.session.configAfterTurn":
    "The current turn keeps the old configuration; the new configuration applies after the turn ends.",
  "main.session.boundaryRebuildFailed":
    "This role's boundary was updated, but reopening the session against the new boundary failed: {detail}. Please retry.",
  "main.session.projectNotEnumerated":
    "The project has not been enumerated; import the project first (app:list-project).",
  "main.session.roleNotFound": "Role not found under project {projectRoot}: {roleId}",
  "main.session.eventStreamError": "Session event stream error: {detail}",
  "main.session.rebuildFailedNoSend":
    "This role's boundary was updated, but reopening the session against the new boundary failed: {detail} — this message was not sent; please retry.",
  "main.session.notOpen": "The session is not started (click the role on the left to start it).",
  "main.session.youMessage": "You: {text}",
  "main.session.stopNoSession":
    "Role {roleId} has no open session — there is no turn to stop.",
  "main.session.stopUnsupported": "The current runtime does not support stopping",
  "main.session.stopNoMatch": "No matching session; specify the project and runtime.",
  "main.session.releasedRole":
    "Closed the session with role {roleId} (history stays on screen).",
  "main.session.releaseError": "Error releasing the session: {detail}",
  "main.session.noOpenSessions": "No open sessions.",
  "main.session.releaseNoSession": "Role {roleId} has no open session.",
  "main.session.closed": "Session closed.",
  "main.session.closedAll": "Closed all sessions ({count}).",
  "main.session.recoveryDelivery": "Recovery delivery · from {role}",
  "main.session.withdrawIncomplete": "Incomplete withdrawal parameters.",
  "main.session.withdrawRunning":
    "This item is already “in progress”; withdrawal has no effect (it is being executed).",
  "main.session.withdrawNotCustomer":
    "This item is not a customer message (dispatch/delivery belong to the governance flow) — read-only, cannot be withdrawn.",
  "main.session.withdrawNotQueued":
    "This item is not queued (it may have been delivered or withdrawn).",
  "main.session.safeCopyPending": "Delivery content (safe display copy): pending generation",
  "main.session.saveSnapshotExpired": "The original saved material has expired.",
  "main.session.saveUnsupported": "The current session does not support this save operation.",
  "main.session.handbackMalformed":
    "Received a **malformed** delivery event (missing delivery payload / missing roleId) — **not delivered** (ignored honestly; no crash, no silence).",
  "main.session.handbackRenderFailed":
    "Could not render the delivery payload ({detail}) — **not delivered** (ignored honestly; no crash).",
  "main.session.handbackException":
    "Delivery processing exception intercepted (no unhandled rejection): {detail}",
  "main.session.dispatchRejectedEmpty":
    "Dispatch not accepted: roleId and task must both be non-empty.",
  "main.session.dispatchNoDispatcher":
    "Dispatch not accepted: could not find the dispatch owner for this project's governance model (trio=Operations / single=primary entry) — **not delivered**.",
  "main.session.dispatchNoDispatcherShort":
    "Dispatch not accepted: no dispatch owner found — **not delivered** (not silent).",
  "main.session.dispatchModelNote": " (trio: Operations or Product)",
  "main.session.dispatchWrongSource":
    "Dispatch not accepted: source role {from} is not this project's dispatch owner {dispatcher}{modelNote}.",
  "main.session.dispatchWrongSourceShort":
    "Dispatch not accepted: source role {from} is not the dispatch owner {dispatcher} — **not delivered** (not silent).",
  "main.session.dispatchUnknownTarget":
    "Dispatch not accepted: role {roleId} is not in this project (not enumerated).",
  "main.session.dispatchUnknownTargetShort":
    "Dispatch not accepted: role {roleId} is not in this project — **not delivered** (not silent).",
  "main.session.dispatchBuiltinTarget":
    "Dispatch not accepted: {roleId} is a built-in governance role (neither the trio nor su can receive dispatches) — dispatch targets must be project roles.",
  "main.session.dispatchBuiltinTargetShort":
    "Dispatch not accepted: {roleId} is a built-in governance role — **not delivered** (not silent).",
  "main.session.dispatchGateDenied": "Dispatch rejected by the governance gate: {message}",
  "main.session.dispatchGateRejected":
    "Dispatch not accepted (governance gate {code}): {message} — **not delivered** (not silent).",
  "main.session.dispatchDuplicateCoordinate":
    "This coordination message (target {roleId}, same content/flow) is already in the delivery queue — deduplicated, not delivered again.",
  "main.session.dispatchDuplicate":
    "This dispatch (target {roleId}, same task text/flow step) is already in the delivery queue — deduplicated, not delivered again.",
  "main.session.dispatchSummaryCoordinate": "Coordination · from {from} → {to}: {text}",
  "main.session.dispatchSummary": "Dispatch · from {from}: {text}",
  "main.session.sessionWillAutoOpen": " (its session is not open — it will open automatically)",
  "main.session.acceptedCoordinate":
    "Accepted: the coordination message will be delivered to {to}{openNote} (source {from} → Operations; coordination ≠ customer approval and does not clear any dispatch/acceptance gate; accepted ≠ completed).",
  "main.session.acceptedTask":
    "Accepted: the task will be delivered to role {to}'s session{openNote}; delivery results/failures are shown honestly in its chat stream and in {from}'s chat stream (accepted ≠ completed).",
  "main.session.recoveryNoMatch": "No matching session found; specify the project and runtime.",
  "main.session.recoveryNoSession":
    "This role has no open session — nothing to rebuild (open the role in the UI first, or use another action).",
  "main.session.recoveryBusy":
    "This role has a running turn — not interrupted (stop the turn with abort-turn first, or retry after it ends).",
  "main.session.recoveryConcurrent":
    "Session state changed (concurrent open/rebuild) — this rebuild was not executed; verify and retry.",
  "main.session.rebuiltByRecovery":
    "Rebuilt role {roleId}'s session as requested (customer-confirmed recovery action; ANS replay retained). The context restore result is subject to the engine's actual response.",
  "main.session.redeliverNoMatch":
    "No matching session/queue found; specify the project and runtime.",
  "main.session.redeliverInFlight":
    "This item is already “in progress” (being delivered/executed) — no redelivery needed (it settles per the existing settled semantics).",
  "main.session.redeliverNotQueued":
    "The item is not queued (it may have been sent, withdrawn, or the id does not match) — no retry triggered.",
  "main.session.redeliverQueued":
    "Queue retry triggered; the item is still at queue position {position} (target busy or not open — kept for retry, which happens automatically at the next opportunity).",
  "main.session.redeliverSent":
    "Queue retry triggered; the item left the queue and was sent (in progress).",
  "main.session.redeliverGone":
    "Queue retry triggered; the item is no longer queued (it was sent during this retry, or was handled/withdrawn).",
  "main.session.redeliverCleared":
    "Queue retry triggered; the queue is empty and this role's delivery is in flight (in progress).",
  "main.session.redeliverEmpty":
    "Queue retry triggered; this role's delivery queue is empty.",
  "main.session.redeliverRemaining":
    "Queue retry triggered; {count} items remain queued (target busy or not open — kept for retry), {inflight}.",
  "main.session.redeliverInFlightOne": "1 in flight",
  "main.session.redeliverNoInflight": "none in flight",
  "main.session.recoveryProposalRejected": "Recovery proposal not accepted: {message}",
  "main.session.recoveryRoleEmpty": "roleId must be non-empty.",
  "main.session.recoveryBadAction":
    "action must be abort-turn / rebuild-session / redeliver (received {type}).",
  "main.session.recoveryMissingEvidence":
    "evidence must be non-empty — recovery actions require factual grounds.",
  "main.session.recoveryTargetMissing":
    "Role {roleId} is not in this project (not enumerated) — no confirmation card was pushed.",
  "main.session.recoveryTargetBuiltin":
    "{roleId} is a built-in governance role — recovery actions target project roles only (no confirmation card was pushed).",
  "main.session.recoveryAbortRequested":
    "Requested stopping role “{roleId}”'s current turn — the turn still settles via the existing settled path (no fake “stopped” state).",
  "main.session.recoveryAbortFailed":
    "Stop failed (unknown reason) — not pretending it was executed.",
  "main.session.recoveryRebuilt":
    "Rebuilt role “{roleId}”'s session (history replay retained; the context restore result is subject to the engine's actual response).",
  "main.session.recoveryRebuildFailed":
    "Rebuild failed (unknown reason) — no action took place.",
  "main.session.recoveryChannelUnwired":
    "Recovery confirmation channel not wired — not executed (fail-closed); no action took place.",
  "main.session.recoveryDeclined":
    "The customer did not confirm (rejected/cancelled, or the confirmation channel expired) — “{action}” was not executed and no action took place.",
  "main.session.recoveryReceipt": "Recovery receipt ({action} · role {roleId}): {message}",
  "main.session.recoveryAutoText":
    "[System·Recovery] The recovery proposal was **executed automatically** by the desktop (“Decide for me” switch on — automatic execution ≠ per-item customer approval): {action} · role {roleId} · {executed}.",
  "main.session.recoveryAutoSummary":
    "System·Recovery · auto-executed · {action} · role {roleId} · {executed}",
  "main.session.executed": "executed",
  "main.session.notExecuted": "not executed",
  "main.session.configNextSession":
    "This role has no open session (no turn is running) — the new configuration takes effect when a new session opens.",
  "main.session.install.notCustomerTurn":
    "This action can only run in a turn initiated by a customer message — not executed.",
  "main.session.install.roleNotFound":
    "Role “{roleId}” is not a project role of this project (or is a built-in governance role) — not executed.",
  "main.session.install.skillNotRegistered":
    "Skill not registered: docs/skills/{name}/install.md does not exist — write it first, then {verb}; not executed.",
  "main.session.install.skillNotRegisteredInstall":
    "Skill not registered: docs/skills/{name}/install.md does not exist — write it first, then install; not executed.",
  "main.session.install.skillNotRegisteredUninstall":
    "Skill not registered: docs/skills/{name}/install.md does not exist or cannot be parsed — nothing to unregister; not executed.",
  "main.session.install.roleNotListed":
    "The registration does not include role “{roleId}” — not executed; update the registration first if installation is intended.",
  "main.session.install.skillStatus":
    "Skill not registered as installed: docs/skills/{name}/install.md status is “{status}” — update the registration before installing; not executed.",
  "main.session.install.registrationUnchanged":
    "The registration still includes role “{roleId}” — update the registration before uninstalling; not executed.",
  "main.session.install.skillMissing":
    "Skill content missing: {path} does not exist or is unreadable — write it first, then install; not executed.",
  "main.session.install.skillMissingUninstall":
    "Skill content missing: {path} does not exist or is unreadable — cannot issue an honest receipt (sha256 and “file retained” statement); not executed.",
  "main.session.install.rebuildFailed":
    "Skill registration was {action}, but rebuilding role “{roleId}”'s session with the new registration failed: {detail} — the registration remains and the session was not rebuilt (not pretending it took effect; it can take effect the next time the role opens a session, or retry).",
  "main.session.install.effectiveRebuilt": "this role's session was rebuilt and takes effect immediately",
  "main.session.install.effectiveNextSession": "this role currently has no open session — effective from the next session",
  "main.session.install.effectiveAfterTurn": "this role has a running turn (not interrupted) — effective from the next session",
  "main.session.install.installedSkill":
    "Installed skill “{name}” → role “{roleId}”; {effective}; content: {path} (sha256 {digest}).",
  "main.session.install.uninstalledSkill":
    "Uninstalled skill “{name}” (role “{roleId}”); the effect was withdrawn, the file remains at {path} (sha256 {digest}); {effective}.",
  "main.session.install.summarySkill":
    "System·Install · {verb} skill “{name}” · role “{roleId}” · {effectiveShort}",
  "main.session.install.verbInstall": "install",
  "main.session.install.verbUninstall": "uninstall",
  "main.session.install.effectiveShortRebuilt": "effective immediately (rebuilt)",
  "main.session.install.effectiveShortNextSession": "effective from the next session",
  "main.session.install.mcpNotRegistered":
    "MCP not registered: docs/mcp/{name}.md does not exist — write it first, then {verb}; not executed.",
  "main.session.install.mcpNotRegisteredInstall":
    "MCP not registered: docs/mcp/{name}.md does not exist — write it first, then install; not executed.",
  "main.session.install.mcpNotRegisteredUninstall":
    "MCP not registered: docs/mcp/{name}.md does not exist or cannot be parsed — nothing to revoke; not executed.",
  "main.session.install.mcpStatus":
    "MCP not registered as installed: docs/mcp/{name}.md status is “{status}” — update the declaration before installing; not executed.",
  "main.session.install.mcpDeclarationMissing":
    "MCP not registered: {path} does not exist — write it first, then install; not executed.",
  "main.session.install.mcpDeclarationMissingUninstall":
    "MCP declaration missing: {path} does not exist or is unreadable — cannot issue an honest receipt (sha256 and “file retained” statement); not executed.",
  "main.session.install.mcpRebuildFailed":
    "MCP declaration was {action}, but rebuilding role “{roleId}”'s session with the new declaration failed: {detail} — the declaration remains and the session was not rebuilt (not pretending it took effect; it can take effect the next time the role opens a session, or retry).",
  "main.session.install.installedMcp":
    "Installed MCP “{name}” → role “{roleId}”; {effective}; declaration: {path} (sha256 {digest}); external MCP tools run outside ANS gates (capability-level grant, not per-call review).",
  "main.session.install.uninstalledMcp":
    "Uninstalled MCP “{name}” (role “{roleId}”); the effect was withdrawn, the declaration file remains at {path} (sha256 {digest}); side effects already caused cannot be undone; {effective}.",
  "main.session.install.summaryMcp":
    "System·Install · {verb} MCP “{name}” · role “{roleId}” · {effectiveShort}",
  "main.session.delivery.malformedItem":
    "Malformed delivery item (missing body/source) — item dropped and recorded honestly (no crash).",
  "main.session.delivery.machineryException":
    "Delivery machinery exception intercepted (no unhandled rejection): {detail}",
  "main.session.delivery.noTarget":
    "A {kind} (from {sourceRoleId}) is waiting for delivery, but the target (primary entry) cannot be found — **not delivered** (kept; retried automatically at the next opportunity).",
  "main.session.delivery.openFailedHandback":
    "A delivery (from {sourceRoleId}) is waiting for delivery, but **opening {target}'s session failed**: {detail} — not delivered (kept; retried automatically at the next opportunity: when you open {target}, or on the next delivery/turn end).",
  "main.session.delivery.openFailedDispatch":
    "A dispatched task (from {sourceRoleId}) is waiting for delivery to role {target}, but **opening its session failed**: {detail} — not delivered (kept; retried automatically at the next opportunity: when you open that role, or on the next dispatch/turn end).",
  "main.session.delivery.handbackBatch":
    "Delivery batch · {count} reports · from {roles}",
  "main.session.delivery.autoDelivered":
    "Automatically delivered {roles}' submissions to {target} (awaiting acceptance and summary).",
  "main.session.delivery.dispatchedNote":
    "Dispatched the task to {target} (delivered to its session; its result/delivery returns to this session).",
  "main.session.delivery.receivedDispatch":
    "Received a dispatched task from {role} — follow the task text and hand back a report when done.",
  "main.session.delivery.handbackFailed":
    "Delivery failed (from {sourceRoleId}): {detail} — not discarded; kept for retry (retried automatically at the next opportunity).",
  "main.session.delivery.handbackFailedShort":
    "Delivery failed (from {sourceRoleId}): {detail}",
  "main.session.delivery.dispatchFailed":
    "Dispatch delivery failed (target {target}): {detail} — **not discarded**; kept for retry (retried automatically at the next opportunity).",
  "main.session.delivery.systemFailed":
    "System message delivery failed (target {target}): {detail} — **not discarded**; kept for retry (retried automatically at the next opportunity).",
  "main.session.delivery.queuedFailed":
    "Queued message delivery failed (role {target}): {detail} — **not discarded**; kept for retry (retried automatically at the next opportunity).",
  "main.session.delivery.maybeProcessed":
    "It may already have been processed or its save status is unknown; not resent automatically. Check the history save status.",
  "main.session.delivery.retained":
    "The input has not been handed to the model and was not discarded; the same batch is kept for retry.",

  "main.interface.toggleInvalid": "Invalid switch request (requires {enabled:boolean}).",
  "main.interface.toggleNotBoolean": "enabled must be a boolean.",
  "main.interface.toggleUnknownField": "The switch request contains unknown fields.",
  "main.interface.teamPlanMissingTypeColumn":
    "The team plan role table is missing the “Type” column (must be new / changed / existing)",
  "main.interface.teamPlanNoSchemaV2":
    "The team plan does not declare teamPlanSchema: 2: validated for v1 compatibility (v2 fields such as modules/public contracts/test surface are not required; migrating the team plan to v2 is recommended)",
  "main.interface.teamPlanNoFrontmatter":
    "The team plan is missing frontmatter (must include flowId/version/riskTier/recommended)",
  "main.interface.teamPlanNoFlowId": "The team plan frontmatter is missing flowId",
  "main.interface.teamPlanNoRecommended":
    "The team plan lacks a unique machine-readable recommendation set (a recommended inline array or a “Recommended:” line; empty/duplicate/ambiguous sets are not accepted)",
  "main.interface.verifierFinished":
    "QA / acceptance review finished (flowId={flowId}); report at {report} (attachments under docs/verification/) and {governance}; the acceptance card/customer decision continues in the app (this line is not an acceptance conclusion or customer approval).",
  "main.interface.acceptanceCloseFailed":
    "Acceptance passed but flow closing failed (flow {flowId}): {detail}; no QA dispatched, the flow remains pending closure (check the flow YAML).",
  "main.interface.acceptanceClosed":
    "Acceptance passed (judge delegation or manual customer approval, per the ledger's customer.decision); flow {flowId} is closed (the acceptance step remains marked done).",
  "main.interface.deliveredStepsHeader":
    "Flow {flowId}: the following steps are delivered, awaiting Operations verification:",
  "main.interface.deliveredStepLine":
    "- Step {stepId} is delivered (owner={owner}); verify the ledger/artifact evidence, then mark it done with flow_step_update or return it for rework; do not write the flow YAML directly.",
  "main.interface.deliveredVerificationNote":
    "Verification requirements: check ledger and artifact evidence before updating step status; return for rework when done conditions are not met; do not write the flow YAML directly with write_file.",
  "main.interface.deliveredWaitNote":
    "Flow {flowId}: steps {steps} are delivered, awaiting Operations verification (verification task dispatched).",
  "main.interface.criteriaMissing":
    "Pre-implementation acceptance criteria missing or empty ({path}); acceptance decision not dispatched",
  "main.interface.changePackageMissing":
    "Change package missing ({path}); acceptance decision not dispatched",
  "main.interface.changePackageNoRisk":
    "Change package is missing riskTier (T0–T3): {path}; acceptance decision not dispatched",
  "main.interface.flowValidationFailed": "Flow state YAML validation failed: {detail}",
  "main.interface.advanceOpenFailed":
    "Closing advance failed: could not open the QA session: {detail}; no automatic retry.",
  "main.interface.advanceSendFailed":
    "Closing advance failed: sending the acceptance task to QA failed: {detail}; no automatic retry.",
  "main.interface.piBusy":
    "Pi's previous turn is still running; the new configuration applies after it ends. Messages can keep queueing.",
  "main.interface.readFileNotFound": "File not found",
  "main.interface.readFileFailed": "Read failed: {detail}",
  "main.interface.teamPlanMissingUnreadable":
    "The team plan is missing or unreadable (the ledger appointment is bound to it); have Operations rewrite the plan before validating again",
  "main.interface.teamPlanMissingLegacy":
    "Team plan missing: only the minimum structural checks are performed for legacy flows (migrating to the team-plan / role-cards flow is recommended)",
  "main.interface.teamPlanRoleMissing":
    "The team plan is missing a role row for recommended/appointed role {roleId}",
  "main.interface.teamPlanRoleTypeInvalid":
    "The team plan role {roleId} has a missing or unrecognized type (must be new / changed / existing)",
  "main.interface.teamPlanRoleFieldEmpty":
    "The team plan role {roleId} has an empty “{label}” (plan lacks detail)",
  "main.interface.teamPlanFlowMismatch":
    'frontmatter flowId="{planFlowId}" does not match flow {flowId}',
  "main.interface.cardEmpty": "File is empty (role card body required)",
  "main.interface.cardNoHeading":
    "Missing Markdown heading (at least one line starting with #)",
  "main.interface.cardMissingSection":
    "Missing the “{label}” section or equivalent content (item 5 is required)",
  "main.interface.boundaryEmpty": "File is empty (boundary YAML with role + entries required)",
  "main.interface.boundaryParseFailed": "Boundary YAML parse failed: {detail}",
  "main.interface.boundaryNoEntries":
    "entries is empty (Section 1 needs at least one entry)",
  "main.interface.boundaryRoleMismatch":
    "Top-level role does not match the directory id (YAML role={declared}, directory={roleId})",
  "main.interface.boundaryDeclaredMissing": "not provided",
  "main.interface.boundaryMissingRootDocs":
    "entries is missing the role root work-document entry {path} (item 5 is required)",
  "main.interface.boundaryOnlyRootDocs":
    "entries only contains role root work-document entries; no actual writeset entries from the team plan were found (check the plan writeset)",
  "main.interface.directorySpecMissing":
    "The authorized directory “{path}” for team plan role {roleId} has no directory-spec row (plan issue: ask Operations to add the directory spec)",
  "main.interface.moduleImplMissing":
    "Team plan module “{module}” has no implementation directory, so wider boundary parts cannot be checked (plan issue: ask Operations to add implementation directories)",
  "main.interface.authorizedDirNotCoveredExisting":
    "Authorized directory “{path}” is not covered by boundary.yaml entries (existing: warning only, not blocking; migration note: add the directory entry at the next substantive change)",
  "main.interface.authorizedDirNotCovered":
    "Authorized directory “{path}” is not covered by boundary.yaml entries (People Ops: add the directory to Section 1 per the team plan; if the plan directory itself is wrong, report it to Operations for correction)",
  "main.interface.precisePathNotCoveredExisting":
    "Precise write path “{path}” from the plan is not covered by boundary.yaml entries (existing: warning only, not blocking; migration note: add it at the next substantive change)",
  "main.interface.precisePathNotCovered":
    "Precise write path “{path}” from the plan is not covered by boundary.yaml entries (People Ops: add the file to Section 1 per the team plan; if the plan is wrong, report it to Operations for correction)",
  "main.interface.boundaryDirWider":
    "boundary.yaml directory entry “{path}” {wider} (new role boundary directories must match the plan's authorized directories, neither wider nor narrower; People Ops narrows the boundary or reports it to Operations for plan correction)",
  "main.interface.boundaryDirWiderWord": "is wider than the authorized directory",
  "main.interface.boundaryDirNotInPlan": "is not in the authorized directory set",
  "main.interface.boundaryMissingAuthorizedDir":
    "boundary.yaml is missing a directory entry for authorized directory “{path}” (new role boundary directories must match the plan's authorized directories, neither wider nor narrower; People Ops adds the entry)",
  "main.interface.boundaryDirWiderExisting":
    "boundary.yaml directory entry “{path}” is wider than the authorized directory (existing: warning only, not blocking; migration note: narrow/migrate per v3 at the next substantive change{extra})",
  "main.interface.boundaryDirWiderExistingExtra":
    "; and it is not inside the role's module implementation directories, so readiness must review it against existing duties",
  "main.interface.boundaryDirWiderChanged":
    "boundary.yaml directory entry “{path}” is wider than the authorized directory and outside the role's module implementation directories (changed: readiness reviews it against existing duties; not hard-rejected)",
  "main.interface.boundaryWiderMultiModule":
    "A wider boundary.yaml directory covers multiple module implementation directories ({modules}; multi-module expansion — readiness review)",
  "main.interface.writesetNotCoveredExisting":
    "Plan writeset “{path}” is not covered by boundary.yaml entries (existing: warning only, not blocking; add it at the next substantive change)",
  "main.interface.writesetNotCovered":
    "Plan writeset “{path}” is not covered by boundary.yaml entries (People Ops: add the path to Section 1 per the team plan; if the plan writeset itself is wrong, report it to Operations for correction)",
  "main.interface.docEmptyExisting": "File is empty (existing/legacy: warning only)",
  "main.interface.docEmpty": "File is empty (body required)",
  "main.interface.readErrorExistingSuffix": " (existing/legacy: warning only)",
  "main.interface.docNoHeadingExisting":
    "Missing Markdown heading (existing/legacy: warning only)",
  "main.interface.featureMapNoContent":
    "No function table/list rows and no declaration of having no directly responsible system functions",
  "main.interface.functionalDescriptionMissing":
    "Missing responsibilities/handoff/code locations or equivalent content",
  "main.interface.memoNoContinuation":
    "At least one YYYY-MM-DD continuation record is required",
  "main.interface.apiSpecMissing":
    "No interface/export/contract description and no not-applicable + non-empty reason",
  "main.interface.apiSpecNotApplicableNoReason":
    "api-spec.md is marked not-applicable but gives no non-empty reason",
  "main.interface.projectListWarning": "listProject warning: {warning}",
  "main.interface.writeValidationFailed":
    "Flow {flowId}: the role-card/write artifacts failed validation (the appointment step cannot continue; Operations was not dispatched for role-readiness and the step was not marked done).",
  "main.interface.specificProblems": "Specific problems:",
  "main.interface.warningsHeader": "Warnings (non-blocking, existing/legacy roles):",
  "main.interface.fixWriteCard":
    "Fix the files above, then **send a new appointment-write confirmation card** to finish writing (role-card.md must contain the item-5 required sections; boundary.yaml must be valid YAML with top-level role matching the directory id and entries covering the role root work documents and the actual writeset; complete the work documents per feature-map/functional-description/memo/api-spec, and write not-applicable + a non-empty reason when api-spec does not apply).",
  "main.interface.fixTeamPlanV3":
    "Fix/complete the team plan per v3 (frontmatter teamPlanSchema: 3 and non-empty directories; a non-empty implementation directory for every module; authorized directories/precise writesets in the role table; a 12-field directory-spec table; one unique owner per directory / no overlaps / sharing strategy; governance-critical paths authorized by exact files only), bump the version if needed, and resend the appointment card; the app re-validates after the fix.",
  "main.interface.fixTeamPlanLegacy":
    "Fix/complete the team plan (frontmatter flowId/version/riskTier/recommended; per-role type new/changed/existing, responsibility goals, capability requirements, unique writeset, dependencies), bump it to v2 if needed, and resend the appointment card; the app re-validates after the fix.",
  "main.interface.teamPlanValidationFailed":
    "Flow {flowId}: the team plan failed structural validation (the appointment's card-writing step is paused; People Ops does not fix plans on its own, and the app did not dispatch role-readiness or mark the step done).",
  "main.interface.roleCardsStepMissing":
    "The flow is missing the step with id \"{stepId}\" (the team plan exists but the flow does not declare role-cards, so closure cannot complete; ask Operations to add the flow step).",
  "main.interface.crewBlocking": "People Ops fixes {count}",
  "main.interface.planBlocking": "Operations completes plan items {count}",
  "main.interface.writeBlockingSummary":
    "The write artifacts failed validation (flow {flowId}): {count} issues — routed {routed}; Operations was not dispatched for role-readiness and the appointment step was not marked done. First issue: {path}: {issue}",
  "main.interface.queueKind.handback": "Delivery",
  "main.interface.queueKind.dispatch": "Dispatch",
  "main.interface.queueKind.system": "System",
  "main.interface.queueKind.message": "Message",
  "main.interface.queueRecoveredLine":
    "- [{kind}] {summary} (role {roleId} · {runtime})",
  "main.interface.queueRecovered":
    "Recovered and redelivered {count} tasks from the previous run (resuming after app restart/crash; no customer cards, no steps marked done):\n{lines}",
  "main.interface.staleStepFact":
    "- Step {stepId} (owner: {owner}, status: {status})",
  "main.interface.staleSteps":
    "Flow {flowId}: {count} steps may have been lost due to an app restart/crash (the flow YAML marks them dispatched, but the owner has no session/queue/in-flight delivery):\n{facts}\nUse flow_get to check the current revision; if needed, use flow_step_supersede to create new steps and dispatch_task to redispatch; do not reuse dispatched stepIds.",
  "main.interface.saveProjectNotActive": "This project is not the current imported project.",
  "main.interface.missingProjectRoot": "Missing project root path.",
  "main.interface.pinCheckFailed": "Pin evidence check failed: {detail}",
  "main.interface.projectNotCurrent":
    "The project is not the current imported project; no files were written this time.",
  "main.interface.governanceModelInvalid":
    "governanceModel must be single or trio; no files were written this time.",
  "main.interface.confirmMissing":
    "Missing operator confirmation (confirm:true); no files were written this time.",
  "main.interface.previewDigestInvalid":
    "Missing a valid preview digest (previewDigest must be 64 hex characters); no files were written this time.",
  "main.interface.sessionRequestInvalid":
    "Session requests must specify the project, role, and runtime.",
  "main.interface.imageNotSent":
    "Image not sent ({detail}) — this message was not sent; remove the image and retry.",
  "main.interface.imageNotSentUnsupported":
    "Image not sent (the content is not a supported image — the real format is not among {mimes}; file extensions/declared types do not count). This message was not sent; remove the image and retry.",
  "main.interface.autoAdvanceFailed": "Automatic advance failed: {detail}",
  "main.interface.autoAdvanceStalled": "Automatic advance stalled: {detail}",
  "main.interface.dispatchNoProjectRoot": "Missing project root; cannot dispatch in the background",
  "main.interface.dispatchNoRuntime": "Missing runtime; cannot dispatch in the background",
  "main.interface.openSessionFailed": "Could not open the {label} session: {detail}",
  "main.interface.sendTaskFailed": "Sending the task to {label} failed: {detail}",
  "main.interface.missingFlowIdWrite":
    "Missing flow information (flowId); card-writing task not dispatched",
  "main.interface.appointmentNotApproved":
    "The latest appointment decision in the ledger is {decision} (not approved by the customer); card-writing task not dispatched",
  "main.interface.missingAppointmentList":
    "Missing appointment list; card-writing task not dispatched",
  "main.interface.teamPlanMissingNoRoles":
    "Missing team plan/appointment list; card-writing task not dispatched",
  "main.interface.teamPlanMissingBoundHint": " (appointment ledger bound to {plan})",
  "main.interface.teamPlanMissingBound":
    "Flow {flowId}: team plan missing (docs/scheduling/{flowId}-team-vN.md){bound}; People Ops card-writing not dispatched and the flow did not advance. Have Operations write the team plan first.",
  "main.interface.teamPlanMissingShort":
    "Team plan missing{bound}; People Ops card-writing not dispatched (no guessing plans, no unilateral scope expansion)",
  "main.interface.appointmentVsPlanMismatch":
    "The customer's actual appointment list ({appointed}) differs from the team plan's recommended set ({recommended}); have Operations revise the team plan to {version} to reflect the actual appointment (People Ops writes cards only for the actual list).",
  "main.interface.missingFlowOrList":
    "Missing flow information (flowId/appointment list); automatic dispatch not performed",
  "main.interface.missingFlowIdNomination":
    "Missing flow information (flowId); nomination task not dispatched",
  "main.interface.flowYamlTimeout":
    "Operations did not finish within the time limit; flow state YAML {path} is unconfirmed; nomination task not dispatched",
  "main.interface.flowYamlMissing":
    "Operations did not write flow state YAML {path}; nomination task not dispatched (a same-named human-readable .md does not count as written state)",
  "main.interface.flowYamlInvalid":
    "Flow state YAML validation failed ({path}): {detail}; nomination task not dispatched",
  "main.interface.flowYamlUnreadable":
    "Flow state YAML {path} is unreadable: {detail}; nomination task not dispatched",
  "main.interface.missingFlowInfoNomination":
    "Missing flow information; nomination task not dispatched",
  "main.interface.openCrewFailed": "Could not open the People Ops session: {detail}",
  "main.interface.sendNominationFailed": "Sending the nomination task to People Ops failed: {detail}",
  "main.interface.linkScheme": "Only http/https links can be opened.",
  "main.interface.linkTooLong": "The link is too long and was rejected.",
  "main.interface.externalOpenUnwired": "External opening not wired (fail-closed).",
  "main.interface.pickImageUnwired": "Image picking not wired (fail-closed).",
  "main.interface.readImageFailed": "Could not read the image: {detail}",
  "main.interface.imageUnsupported":
    "The content is not a supported image (the real format is not among {mimes}) — file extension does not count.",
  "main.interface.imageUnsupportedShort":
    "The content is not a supported image (the real format is not among {mimes}).",

  "main.governance.acceptanceAdvance":
    "Flow {flowId}: all steps are complete; acceptance review was dispatched to QA automatically (working)",
  "main.governance.acceptanceBlocked":
    "Automatic acceptance not dispatched: flow {flowId} did not pass the closing gate. Reason: {issue}. {advice}",
  "main.governance.acceptanceBlockedTerminal":
    "No action needed: the flow is already closed; the app will not dispatch acceptance review again.",
  "main.governance.acceptanceBlockedAdvice":
    "Suggestion: if old steps were replaced by a retake, mark the corresponding aborted/failed steps as superseded (or cancelled) in the flow state file {path}; or dispatch a new task with a new stepId and update the status and evidence in the flow state file. The next event re-checks automatically after the fix; the app does not rewrite the flow state file and does not automatically dispatch QA.",
  "main.governance.nominationDispatched":
    "Nomination task dispatched to People Ops (working)",
  "main.governance.roleCardDispatched":
    "Card-writing task dispatched to People Ops (working)",
  "main.governance.flowTaskDispatched":
    "Flow task dispatched to Operations (working)",
  "main.governance.flowYamlAndNomination":
    "Flow state YAML written; nomination task dispatched to People Ops (working)",
  "main.governance.roleReadinessDispatched":
    "Card structure validation passed; role-readiness review dispatched to Operations (working)",
  "main.governance.criteriaDispatched":
    "Flow {flowId}: pre-implementation criteria-writing task dispatched to QA (working)",
  "main.governance.nominationAlreadyDone":
    "Nomination already complete; not dispatched again. Operations has been asked to continue with the next step.",

  "main.governance.acceptanceReworkRoutedCustomer":
    "Flow {flowId}: the customer rejected the acceptance result; the app routed the rework to Operations (Operations) under the routing rules.",
  "main.governance.acceptanceReworkRoutedAutomatic":
    "Flow {flowId}: the automatic decision did not pass or did not complete (judge proxy approval / automatic return); the app routed the rework to Operations (Operations) under the routing rules.",
  "main.governance.acceptanceReworkPending":
    "Flow {flowId}: rework routing is not complete yet (waiting to send or waiting for the next event to retry); the app is not dispatching acceptance review for now and will not notify repeatedly.",
  "main.governance.acceptanceReworkReportIncomplete":
    "Flow {flowId}: the acceptance report has no parseable acceptance-rework/v1 structured rework section ({detail}); the app passed report path {reportPath} and the parse error to Operations (Operations) for manual rework; no rework items were generated and no flow steps were created.",
  "main.governance.acceptanceReworkFailed":
    "Flow {flowId}: rework routing failed ({detail}); the app does not claim delivery and will not dispatch acceptance review; the next event retries automatically after the issue is fixed.",
  "main.governance.acceptanceReworkAuditFailed":
    "Flow {flowId}: the rework task was routed, but writing the audit record failed ({detail}); the sent fact is not reversed, the app does not fabricate ledger entries; check the ledger and diagnostics.",

  // Gate review receipts and system lines (2026-10-26 request_gate_review; design §5–§8/§12).
  // Placeholders: {flowId} flow id; {gateId} gate step id; {reportPath} gate report path;
  // {detail} bounded diagnostic/missing-item note; {severity} failure severity summary (blocker/major).
  // A gate review is not an acceptance pass and not customer approval; gate decisions never write
  // customer.decision or enter acceptance triage. A gate fail must rest on a blocker/major; a fail
  // with only minor/nit items is returned to Proof as structurally invalid and triggers no rework.
  "main.gateReview.dispatched":
    "Flow {flowId}: gate {gateId} review submitted to QA (working); this is not an acceptance pass and not customer approval.",
  "main.gateReview.alreadyDispatched":
    "Flow {flowId}: gate {gateId} review was already submitted (in flight or passed); not dispatched again. Check the gate step status with flow_get.",
  "main.gateReview.gateNotFound":
    "Flow {flowId}: gate {gateId} not found (the step does not exist or is not a gate); check the flow YAML and submit again.",
  "main.gateReview.criteriaMissing":
    "Flow {flowId}: the acceptance criteria have no gate review section for {gateId}; have QA add it to the latest criteria and submit again (Operations does not write docs/acceptance/).",
  "main.gateReview.flowIncomplete":
    "Flow {flowId}: gate {gateId} prerequisites or evidence are incomplete ({detail}); complete them and submit again — do not submit early or use submission to stand in for missing steps.",
  "main.gateReview.flowBusy":
    "The flow still has in-flight deliveries, runs, or handbacks, so the gate is not dispatched yet; this is a retryable state, not a failure or a gate failure — retry after the in-flight work finishes.",
  "main.gateReview.unavailable":
    "Flow {flowId}: the gate {gateId} review channel is unavailable ({detail}); it may already have been dispatched — check with flow_get. The app does not claim dispatch and never decides a pass on its own.",
  "main.gateReview.rejected":
    "Flow {flowId}: the gate {gateId} review request was rejected ({detail}); fix the cause and resubmit instead of retrying unchanged.",
  "main.gateReview.passNote":
    "Flow {flowId}: gate {gateId} passed (report {reportPath}) and was handed off to the convener (delivery results are reported separately); downstream work may continue, and final customer acceptance is still required.",
  "main.gateReview.failNote":
    "Flow {flowId}: gate {gateId} did not pass ({severity}; report {reportPath}); the gate stays pending, and review must be requested again after rework.",
  "main.gateReview.returnedToProof":
    "Flow {flowId}: the gate {gateId} report is missing or structurally invalid ({detail}); returned to QA with a correction request and the convener was informed — delivery results are reported separately; not passed and no rework routed.",
  // 2026-10-27 gate return/pass routing (design v3.2 §3.1/§3.2/§3.6, Q10 A): delivery-result keys.
  // {detail} = bounded recipient/error summary (no report body, credentials, or command text);
  // queued counts as delivered.
  "main.gateReview.returnedRouted":
    "Flow {flowId}: the gate {gateId} return notifications were delivered or queued (queued counts as delivered); the app did not pass the gate and routed no rework — it continues when a new report version appears or the convener requests again.",
  "main.gateReview.returnedRouteFailed":
    "Flow {flowId}: the gate {gateId} return notifications were not fully delivered ({detail}); the app does not claim notification, retries automatically later, and needs manual checking after the retry limit; not passed and no rework routed.",
  "main.gateReview.reportUnreadable":
    "Flow {flowId}: the gate {gateId} report exists but is currently unreadable ({reportPath}); QA was reminded to check readability and the convener was informed; the record stays dispatched (not returned, not passed).",
  "main.gateReview.reportUnreadableDeliveryFailed":
    "Flow {flowId}: the gate {gateId} report exists but is currently unreadable ({reportPath}); the reminder or notification was not fully delivered ({detail}); the record stays dispatched — the app retries later and manual checking is required after the retry limit.",
  "main.gateReview.passHandoffSent":
    "Flow {flowId}: gate {gateId} passed and the handoff was delivered or queued to the convener (queued counts as delivered); downstream dispatch remains with the convener — a gate pass is not final acceptance and not customer approval.",
  "main.gateReview.passHandoffFailed":
    "Flow {flowId}: gate {gateId} passed, but the handoff to the convener was not delivered ({detail}); the app does not claim handoff, retries automatically later, and needs manual checking after the retry limit; the general auto-advance can still fall back.",
  "main.gateReview.routingRecordUnusable":
    "Flow {flowId}: the routing record for gate {gateId} is corrupt and cannot be rebuilt ({detail}); the app stopped automatic notifications (fail-closed), does not claim delivery, and manual checking of the gate record and report is required.",
  "main.gateReview.nitOnly":
    "Flow {flowId}: the gate {gateId} fail contains only minor/nit items; a gate failure must rest on a blocker/major, so it was returned to QA as structurally invalid and no rework was triggered.",
  "main.gateReview.reportMissing":
    "Flow {flowId}: the gate {gateId} report is missing or unreadable ({reportPath}); the gate stays pending while waiting for QA to submit it — a timeout never counts as a pass.",
  "main.gateReview.reworkTask":
    "Gate rework task | {gateId}: fix the {severity} items in gate report {reportPath}; minor/nit items are non-blocking and optional follow-ups.",

  // Decision-card receipts and system lines (2026-10-26 customer rule; request_choice(cardKind="decision")).
  // Placeholders: {option} selected option label; {detail} bounded diagnostic/missing-item note.
  // A decision card is independent of proposal/appointment/acceptance, is not customer approval, and
  // triggers no gate or acceptance. The app audits the choice separately as decisionKind="material-choice"
  // (internal ledger vocabulary is not exposed in user-facing text). Judge delegation must be attributed
  // to the automatic agent, never presented as the customer in person. A missing unique recommended option
  // or an invalid card is fail-closed: no card is sent to the customer.
  "main.decisionCard.selectedRecommended":
    "Decision card: you selected the recommended option “{option}”; this material choice has been recorded as-is.",
  "main.decisionCard.selectedOther":
    "Decision card: you selected “{option}” (not the recommended option); this material choice has been recorded as-is.",
  "main.decisionCard.judgeSelectedRecommended":
    "Judge delegation · decision (automatic agent): recorded the single recommended option “{option}”; this is not a selection by the customer.",
  "main.decisionCard.notApproval":
    "A decision card is not acceptance and not customer approval, and does not constitute an acceptance/proposal/appointment decision: this choice is recorded only as a separate material-choice audit trail and triggers no gate or acceptance; final acceptance and customer approval still follow the existing path.",
  "main.decisionCard.noRecommended":
    "Decision card has no unique recommended option ({detail}); no card was sent to the customer (fail-closed). Fix and retry.",
  "main.decisionCard.invalid":
    "Decision card parameters are invalid ({detail}); no card was sent to the customer (fail-closed). Fix and retry.",

  "main.history.invalidRequest":
    "History requests must specify the project, role, and runtime.",
  "main.history.deliveryState": "Delivery history status",
  "main.history.deliveryMaybeStarted": "Delivery may have started",
  "main.history.legacyReadFailed": "Legacy history read failed.",
  "main.history.readOrProjectionFailed": "History read or safe projection failed.",
  "main.history.callTool": "Called tool {name}",
  "main.history.invalidSessionHeader":
    "The first line is not a valid session header (type!=session)",
  "main.history.emptySession": "The session file is empty or has no valid session header",
  "main.history.sessionReadFailed": "Session file read failed: {detail}",

  "main.composerImages.typeUnsupported":
    "Unsupported image type: {type} — only {mimes} are supported.",
  "main.composerImages.emptyContent": "Image content is empty or cannot be read.",
  "main.composerImages.tooLargeWithLimit":
    "Image too large ({size} > limit {max}) — compress it and try again.",
  "main.composerImages.dataMissing": "Image data is missing (empty).",
  "main.composerImages.notBase64": "Image data is not valid base64.",
  "main.composerImages.tooLarge": "Image too large (> {max}) — compress it and try again.",
  "main.composerImages.decodeFailed": "Image data decoding failed.",

  // view_image project image tool (customer requirement: roles can view project image evidence).
  // Delivery semantics (customer request 2026-10-27 "same-turn image fix"): same-turn tool-result
  // images are preferred — the image travels with this turn's tool result to the same model turn, so
  // the next model call can see and judge it; no queue entry or system line is produced. Engines
  // without same-turn support fall back to a next-user-prompt image attachment for the same role.
  // The per-engine policy is decided by the runtime core. Either way, never pretend to have seen an
  // image that was not delivered. Path/type/size are fail-closed; the tool is not registered when
  // the capability is not injected.
  "main.viewImage.sameTurn":
    "Read project image {path}; the image is attached to this turn's tool result (visible within the same turn), so you can view and judge it now. If your context does not include the image, state clearly that you have not seen it — do not pretend you have.",
  "main.viewImage.queued":
    "Read project image {path} and queued it: it will be provided as an image attachment with the next user prompt; you have not seen the image content this turn — do not pretend you have.",
  "main.viewImage.failed":
    "Failed to read or queue the project image ({detail}); no image was provided.",

  // Requirement change request receipts/tickets/system line/approval results (2026-10-26
  // request_requirement_change; customer requirement). Scenario: when a Draft proposal needs new
  // authorization/scope, it must not be written into the proposal card; the request and the
  // requirement-change approval card may be initiated by the Steward or the proposer role
  // (Rapporteur) — no other role may initiate them, and the initiator must not approve its own
  // request. Approval is completed on the decision card by the independent judge agent (with
  // “decide for me” enabled, defaulting to the unique recommended option) or by the customer when
  // it is not enabled. The Lead does not approve: it only executes the intent change after approval
  // and notifies Draft to revise. Placeholders: {flowId} flow id; {intentId} intent id;
  // {requestId} request ticket id; {detail} bounded diagnostic/missing-item note; {source}
  // approval source (judge delegation “decide for me”, or customer choice). A request is not
  // approval; proposal cards must not carry unconfirmed new authorization; never present a request
  // or approval result as the customer's own approval.
  "main.requirementChange.dispatched":
    "Flow {flowId}: requirement change request {requestId} (intent {intentId}) submitted for independent approval: the request may be initiated by Operations or the proposer role (Planner), and the approval card is presented automatically by the app through the initiator's session after a successful request — no other role may initiate them, and the initiator must not approve its own request; approval is completed on the decision card by the judge agent (with “decide for me” enabled, defaulting to the recommended option) or by the customer when it is not enabled; a request is not approval — Product does not approve and only executes the intent change after approval and notifies Planner to revise; proposal cards must not carry unconfirmed new authorization.",
  "main.requirementChange.alreadyDispatched":
    "Flow {flowId}: a pending requirement change request {requestId} already exists (intent {intentId}); not submitted again — wait for the independent approval result (the request may be initiated by Operations or the proposer role, and the approval card is presented automatically by the app through the initiator's session; the initiator must not self-approve).",
  "main.requirementChange.invalid":
    "Requirement change request parameters are invalid ({detail}); not submitted (fail-closed). Fix and retry.",
  "main.requirementChange.intentNotFound":
    "Flow {flowId}: intent {intentId} not found; the requirement change request was not submitted. Check and retry.",
  "main.requirementChange.flowNotFound":
    "Flow {flowId}: flow not found; the requirement change request was not submitted. Check and retry.",
  "main.requirementChange.unavailable":
    "Flow {flowId}: the requirement change request channel is unavailable ({detail}); it may already have been submitted — check. The app does not claim submission.",
  "main.requirementChange.rejected":
    "Flow {flowId}: the requirement change request submission was rejected ({detail}); it did not enter independent approval — fix the cause and resubmit instead of retrying unchanged.",
  "main.requirementChange.taskLabel":
    "[Requirement change request · independent approval pending]",
  "main.requirementChange.ticket":
    "Requirement change request {requestId} | flow {flowId} | intent {intentId} | pending independent approval (the request may be initiated by Operations or the proposer role, and the approval card is presented automatically by the app through the initiator's session; the initiator must not self-approve; a request is not approval): {detail}",
  "main.requirementChange.systemLine":
    "System·Requirement change · requirement change request {requestId} (flow {flowId} · intent {intentId}) submitted for independent approval: the request may be initiated by Operations or the proposer role (Planner), and the approval card is presented automatically by the app through the initiator's session after a successful request — no other role may initiate them, and the initiator must not self-approve; approval is completed on the decision card by the judge agent (decide-for-me → default recommendation) or by the customer when not enabled; a request is not approval — Product does not approve and only executes the intent change after approval and notifies Planner to revise; proposal cards must not carry unconfirmed new authorization.",
  "main.requirementChange.approved":
    "Flow {flowId}: requirement change request {requestId} (intent {intentId}) passed independent approval ({source}); Product does not approve and will execute the intent change within the approved scope and notify Planner to revise; proposal cards must not carry unapproved new authorization.",
  "main.requirementChange.approvalRejected":
    "Flow {flowId}: requirement change request {requestId} (intent {intentId}) did not pass independent approval ({detail}); Product does not approve and does not execute the intent change; a request is not approval — do not revise the proposal on that request; adjust per the approval feedback and submit again.",
  "main.requirementChange.leadExecuteTask":
    "Requirement change execution task | flow {flowId} | intent {intentId} | request {requestId}: independent approval passed ({source}); Product does not approve and only executes the intent change (docs/intents/**) within the approved scope and notifies Planner to revise; do not expand scope, do not put new authorization into proposal cards, and do not delete requirements to bypass gate 0.",

  "main.confirm.expiredTimeout": "Confirmation timed out; the old confirmation is no longer valid.",
  "main.confirm.expiredStopped":
    "This turn was stopped or the session was rebuilt; the old confirmation is no longer valid.",
  "main.recovery.expired":
    "This recovery confirmation has expired (app closed or session rebuilt) and was **not executed** — su may propose again.",
  "main.operator.channelUnavailable":
    "Operator confirmation channel is not configured (no presenter); execution denied (fail-closed)",
  "main.operator.timeoutRejected":
    "Operator confirmation timed out (>{ms}ms); execution denied (fail-closed)",
  "main.operator.channelErrorRejected":
    "Operator confirmation channel unavailable; execution denied (fail-closed): {detail}",
  "main.operator.rejected": "Operator denied execution",
  "main.operator.judgeTimeoutManual": "Judging timed out (>{ms}ms); switched to manual confirmation.",
  "main.operator.judgeAbortedManual":
    "This turn was aborted; the judge result does not apply (returned to the existing abort path).",
  "main.operator.judgeErrorManual": "Judging error: {detail}. Switched to manual confirmation.",
  "main.operator.manualDenyAdvice.narrowCommand":
    "Use a script written to disk or split the command, then retry.",
  "main.operator.manualDenyAdvice.narrowJudge":
    "Narrow the reviewed scope (use a script written to disk or split the command), then retry.",
  "main.operator.manualDenyAdvice.narrowRead":
    "Narrow the read scope or use a script written to disk, then retry.",
  "main.operator.manualDenyAdvice.aborted":
    "This turn was aborted and the command was not executed; initiate it again if it is still needed.",
  "main.operator.manualDenyAdvice.switchOff":
    "Turn off “Approve for me” and confirm manually.",
  "main.operator.manualDenyAdvice.retry":
    "Retry; if it keeps failing, turn off “Approve for me” and confirm manually.",
  "main.operator.judgeResultDeliveryFailed":
    "Could not deliver the review result, so the judge conclusion cannot be shown in the chat; denied. {detail}.",
  "main.operator.judgeRowFailedManual":
    "The automatic agent finished judging, but the result cannot be shown in the chat; the rule decision is reference only and this card switched to your manual confirmation.",
  "main.operator.judgeIncompleteManual":
    "The automatic agent could not complete judging: {reason}. The rule decision is reference only; you confirm manually only when the automatic agent has not completed. Switched to your manual confirmation.",
  "main.operator.judgeReason.retryCapped":
    "Similar commands were rejected repeatedly; the retry cap was reached",
  "main.operator.judgeReason.contextMissing":
    "Missing the task context for the current turn",
  "main.operator.judgeReason.contextTooLarge": "The command or context is too large",
  "main.operator.judgeReason.modelManual": "The automatic agent reported it cannot judge",
  "main.operator.judgeReason.fallback": "Judging did not complete",
  "main.operator.judgeDeniedHead": "The automatic agent did not approve this command.",
  "main.operator.judgeExplainToCustomer": "Explain to the customer: {message}",
  "main.operator.judgeReasonLine": "Reason: {reason}",
  "main.operator.judgeAlternative": "Alternative ({kind}): {value}",
  "main.operator.judgeWayOut":
    "Way out: to execute it, turn off “Approve for me” and retry.",
  "main.operator.judgeWillRun": "It will run in the project: {word}",
  "main.operator.shellReview.title": "Governed shell review · operator confirmation (third gate a)",
  "main.operator.shellReview.intro": "This shell command must be **personally confirmed** by you before execution (the pm model review was unsure or unavailable, so it escalated to you).",
  "main.operator.shellReview.verify": "**Verify the exact command text below** before deciding; clicking “Approve” will really start a subprocess in the project to run it.",
  "main.operator.shellReview.escalationHeader": "── Escalation reason (why it came to you) ──",
  "main.operator.shellReview.argvEmpty": "(argv is empty)",
  "main.operator.shellReview.commandHeader": "── Original command (verbatim, unprocessed) ──",
  "main.operator.shellReview.argvHeader": "── Normalized argv (JSON-escaped; quotes are delimiters only) ──",
  "main.operator.shellReview.cwdHeader": "── Working directory (cwd) ──",
  "main.operator.shellReview.denyNote": "Clicking “Reject” or closing the dialog = no approval (nothing runs).",
  "main.operator.approvalTierLine":
    "{role} approval tier: {tier} — each one requires customer approval before execution; once approved it may bypass the ANS file write boundary (the command runs with the current OS user's permissions). Rejection/timeout/channel-unavailable = reject; default is reject, there is no “remember”, and nothing passes automatically.",
  "main.operator.review.risky":
    "Automatic review judged this command risky — per the governance rules, risky commands require your personal confirmation before execution.",
  "main.operator.review.timeout":
    "Automatic review timed out without a conclusion — fail-closed: handed to you for confirmation.",
  "main.operator.review.parse":
    "The automatic review conclusion cannot be parsed, so no clear opinion was formed — fail-closed: handed to you for confirmation.",
  "main.operator.review.error":
    "Automatic review failed without a conclusion — fail-closed: handed to you for confirmation.",
  "main.operator.review.unavailable":
    "Automatic review is currently unavailable (review session not connected) — fail-closed: handed to you for confirmation.",
  "main.operator.review.unsure":
    "Automatic review was unsure — fail-closed: handed to you for confirmation.",
  "main.operator.review.fallback":
    "The review could not produce a clear conclusion; fail-closed: handed to you for confirmation.",
  "main.operator.expiredTimeout":
    "Operator confirmation timed out (>{ms}ms) and was not approved — the role may initiate it again.",
  "main.operator.expiredTimeoutNoMs":
    "Operator confirmation timed out and was not approved — the role may initiate it again.",
  "main.operator.expiredStopped":
    "This turn ended or was stopped, or the session was rebuilt; the old shell confirmation is no longer valid.",
  "main.operator.judgeTimeoutError":
    "Judging timed out ({ms}ms): no judge conclusion within the time limit.",
  "main.operator.confirmTimeoutError":
    "Operator confirmation timed out ({ms}ms): no operator choice within the time limit.",

  "main.customerInput.judgeDecisionHead":
    "judge delegation · decision: accept proposal (accept)",
  "main.customerInput.judgeAcceptanceHead":
    "judge delegation · decision: acceptance passed (accept)",
  "main.customerInput.judgeAppointmentHead":
    "judge delegation · decision: appoint {ids}",
  "main.customerInput.judgeWriteHead":
    "judge delegation · approval: confirm writing {count} paths ({paths})",
  "main.customerInput.judgeWriteHeadZero":
    "judge delegation · approval: confirm writing 0 paths",
  "main.customerInput.judgeWriteHeadOverflow": {
    one: "judge delegation · approval: confirm writing {count} path ({paths}, etc.)",
    other: "judge delegation · approval: confirm writing {count} paths ({paths}, etc.)",
  },
  "main.customerInput.expiredQueued":
    "Queued decision was handled automatically (customer card was not presented)",
  "main.customerInput.deliveryFailed":
    "The customer interaction request could not reach the interface: {detail}",
  "main.customerInput.rowFailedManual":
    "Judging completed, but the result cannot be shown in the chat; switched to your manual confirmation.",
  "main.customerInput.judgeNotDelegated":
    "The automatic agent did not delegate ({label}): {reason}; switched to your manual confirmation.",
  "main.customerInput.rejectNotApproval": "Rejection applies only to the approval group",
  "main.customerInput.switchOff": "You turned off the corresponding switch",
  "main.customerInput.groupMismatch":
    "The judge result group does not match the card",
  "main.customerInput.notRecommended":
    "The judge conclusion does not match the card options",
  "main.customerInput.emitChannelMissing":
    "The judge result row channel is not configured",
  "main.customerInput.rowFailed": "The judge result cannot be shown in the chat",
  "main.customerInput.turnAborted":
    "This turn was aborted; the judge result does not apply.",
  "main.customerInput.judgeException": "Judging error: {detail}",
  "main.customerInput.judgeTimeout": "Judging timed out (>{ms})",
  "main.customerInput.parseFailed": "The judge result has an invalid shape",
  "main.customerInput.ledgerUnavailable":
    "{label} did not pass: {reason}{detail}. This automatic judgment did not pass/did not complete and was rejected; correct the cause above and submit the confirmation again.",
  "main.customerInput.ledgerUnavailableShort":
    "{label} did not pass: {reason}. This automatic judgment did not pass/did not complete and was rejected; correct the cause above and submit the confirmation again.",
  "main.customerInput.presenterMissing":
    "The customer interaction channel is not configured (no presenter); not approved (fail-closed)",
  "main.customerInput.noPendingRequest":
    "No pending interaction request (stopping a turn, rebuilding a session, or closing the app invalidates old requests)",
  "main.customerInput.missingDecision": "Missing decision content",
  "main.customerInput.choiceMismatch":
    "The decision does not match the request type (the request is choice)",
  "main.customerInput.confirmMustBeBoolean": "A confirm decision must be a boolean",
  "main.customerInput.customerDeclined": "Customer disagreed",
  "main.customerInput.confirmMismatch":
    "The decision does not match the request type (the request is confirm)",
  "main.customerInput.customerCancelled": "Customer cancelled",
  "main.customerInput.selectionMustBeArray":
    "The selection must be an array of strings",
  "main.customerInput.emptySelection":
    "No option selected (an empty selection is not accepted; use “Cancel” to reject)",
  "main.customerInput.selectionNotInRequest":
    "The option is not part of this request (rejected against the request snapshot)",
  "main.customerInput.singleChoiceOnly": "Single-choice questions accept only one option",
  "main.customerInput.unknownDecisionType": "Unknown decision type",
  "main.customerInput.reason.timeout": "Judging timed out",
  "main.customerInput.reason.aborted": "This turn was aborted",
  "main.customerInput.reason.unavailable": "Judge service unavailable",
  "main.customerInput.reason.unsupportedEngine":
    "The current engine does not support automatic judging",
  "main.customerInput.reason.parseFailed": "The judge result cannot be parsed",
  "main.customerInput.reason.artifactMissing": "Required artifact evidence is missing",
  "main.customerInput.reason.artifactNotRead":
    "Judging did not read the required project files",
  "main.customerInput.reason.pathOutsideBoundary":
    "A write path is outside the allowed scope",
  "main.customerInput.reason.pathUnverified":
    "Write paths cannot be verified one by one",
  "main.customerInput.reason.notRecommended":
    "The candidate does not match the recommendation/options",
  "main.customerInput.reason.insufficientEvidence": "Insufficient evidence",
  "main.customerInput.reason.ledgerUnavailable": "Governance facts are unreadable",
  "main.customerInput.reason.groupMismatch":
    "The judge result does not match the card group",
  "main.customerInput.reason.budget": "The read budget is exhausted",
  "main.customerInput.reason.readTruncated": "The read content was truncated",
  "main.customerInput.reason.contextMissing":
    "Missing the context required for judging",
  "main.customerInput.reason.fallback":
    "Judging did not produce a delegable conclusion",
  "main.customerInput.rework.head":
    "{label} rejected: {reason}. This automatic judgment did not pass/did not complete and was rejected; correct the cause above and submit the confirmation again.",
  "main.customerInput.autoApprovalLabel": "Auto-approval",
  "main.customerInput.autoDecisionLabel": "Auto-decision",
  // Write pre-authorization system lines (write-preauthorization.ts; customer rule of 2026-10-25).
  "main.customerInput.writePreauthorization.accepted":
    "Boundary write pre-authorized; allowed: {paths}",
  "main.customerInput.writePreauthorization.rejected":
    "System pre-authorization rejected: {paths} (outside the role boundary; no customer card, no judge call)",
  "main.customerInput.writePreauthorization.reason.boundary":
    "Target path is outside the role's writable boundary",
  "main.customerInput.writePreauthorization.reason.unresolved":
    "Declared path cannot be resolved",
  "main.customerInput.writePreauthorization.reason.mixed":
    "Request contains out-of-boundary paths; rejected as a whole",
  "main.customerInput.writePreauthorization.noPaths":
    "Write confirmation has no resolvable declared paths",
  "main.judgeReason.readDeniedPrefix": "Judge read denied: ",
  "main.judgeReason.readDeniedDetail": "Read denied: ",
  "main.judgeReason.readDeniedFallback":
    "A required project file could not be read (no specific path recorded)",
  "main.judgeReason.readDeniedTail": "; switched to manual confirmation.",

  "main.runtimeConfig.readFileFailed": "Could not read the runtime configuration file.",
  "main.runtimeConfig.invalidUrl": "Invalid URL format",
  "main.runtimeConfig.demoNoConfig": "The demo runtime needs no configuration.",
  "main.runtimeConfig.settingsMustBeObject": "Settings must be a key-value object.",
  "main.runtimeConfig.valueMustBeString": "Setting values must be strings.",
  "main.runtimeConfig.urlCredentials":
    "The API base URL must be an http/https URL without username or password.",
  "main.runtimeConfig.invalidApiUrl": "Invalid API base URL.",
  "main.runtimeConfig.choiceInvalid":
    "Invalid value for {label}: only {accepted} is accepted (or leave empty to keep the platform default).",
  "main.runtimeConfig.integerInvalid": "{label} must be a{bound} positive integer.",
  "main.runtimeConfig.integerBound": " value ≥ {min}",
  "main.runtimeConfig.notSaved":
    "Runtime configuration was not saved; cannot write the configuration file.",
  "main.project.governanceInvalid":
    "Governance record unavailable (.ans/project.json is unparseable or structurally invalid)",
  "main.project.governanceUnaccepted":
    "Governance record not accepted (accepted is not true)",
  "main.project.governancePathEmpty":
    "Governance record is missing the governance boundary path (governanceBoundary.path is empty)",
  "main.project.pinCheckFailed": "Pin evidence check failed",
  "main.project.pinMissing": "The governance record provides no verifiable pins",
  "main.runtimeResolution.noRuntime":
    "Could not determine the project engine; select an engine first. This automatic acceptance dispatch was skipped (no loop retries).",
  "main.runtimeResolution.invalidParams": "Invalid persistence parameters.",
  "main.runtimeResolution.persistFailed":
    "The engine selection could not be written to the persistence file.",
  "main.watchdog.signal.turnDeadline": "Turn deadline check",
  "main.watchdog.signal.queueStuck": "Delivery queue backlog",
  "main.watchdog.signal.cmdTimeout": "Command timeout",
  "main.watchdog.signal.repeatFail": "Repeated failures",
  "main.watchdog.durationSeconds": "{seconds} s",
  "main.watchdog.durationMinutesSeconds": "{minutes} min {seconds} s",
  "main.watchdog.durationHours": "{hours} h",
  "main.watchdog.kind.handback": "Delivery",
  "main.watchdog.kind.dispatch": "Dispatch",
  "main.watchdog.kind.system": "System",
  "main.watchdog.action.redeliver": "Redeliver task",
  "main.watchdog.recoveryNote": "System·Recovery · {action} · role {roleId} · {executed}",
  "main.watchdog.stormGuard": "System·Watchdog · storm guard · {count} suppressed",
  "main.watchdog.recoverySignal":
    "System·Watchdog · watchdog recovery · {signal} · role {roleId}",
  "main.watchdog.turnAbortedText":
    "{prefix} turn aborted automatically: role “{roleId}” consumed {elapsed} this turn (explicitly configured auto-abort limit {limit}). Auto-abort ≠ customer approval: this is the watchdog stopping the turn according to the “Decide for me / Approve for me” switches; it stops only this turn and does not represent per-item customer approval. After the turn settles, queued deliveries/dispatches continue in the existing order.",
  "main.watchdog.turnAbortedSummary":
    "System·Watchdog · turn auto-aborted · role {roleId}",
  "main.watchdog.signalSummary": "System·Watchdog · {signal} · role {roleId}",
  "main.watchdog.queueStuckSummary":
    "System·Watchdog · {signal} · role {roleId} (depth {depth})",
  "main.watchdog.repeatFailSummary":
    "System·Watchdog · {signal} · role {roleId} ({count} times)",
  "main.watchdog.turnDeadlineElapsedAbort":
    "This turn has consumed about {elapsed} (watchdog check limit {timeoutMs}ms; at the limit it only checks; explicitly configured auto-abort limit {limit}, the watchdog aborts automatically at the limit when the switch is on)",
  "main.watchdog.turnDeadlineElapsedNoAbort":
    "This turn has consumed about {elapsed} (watchdog check limit {timeoutMs}ms; at the limit it only checks and does not abort; no watchdog auto-abort configured)",
  "main.watchdog.turnDeadlineAdvice":
    "Use role_status / session_tail to check whether the role is stuck; if it is still progressing, take no action; if stuck, use propose_recovery (the desktop executes it automatically when the switch is on; when off it still requires customer confirmation before the app executes)",
  "main.watchdog.turnDeadlineLastResort":
    "Whole-turn last resort {text} (runtime hard limit, not watchdog auto-abort)",
  "main.watchdog.turnDeadlineStarted": "This turn started at {time} and is still running",
  "main.watchdog.turnDeadlinePendingCard":
    "This signal is not triggered while the role has a pending confirmation card (correct waiting is not reported)",
  "main.watchdog.queueStuckHead":
    "Queue head has waited {age} (queue depth {depth})",
  "main.watchdog.queueStuckItem": "- [{kind}] from {source}: {summary} (enqueued {time})",
  "main.watchdog.repeatFailWindow":
    "{count} turns ended as failed/timed_out within the last {minutes} min",
  "main.watchdog.repeatFailLast": "Most recent {detail}",
  "main.watchdog.repeatFailUnknown": "(unknown)",
  "main.watchdog.cmdTimeoutTimedOut":
    "{time} (structured fact display.process.timedOut=true — F-1 already terminated the command automatically; the turn continues)",
  "main.watchdog.cmdTimeoutNote":
    "The original command and output are in this role's session stream; this alert contains no command text",
  "main.watchdog.systemSource": "(system)",
  // ---- Batch B (2026-10-28): task cards / work results / role log / patrol ----
  "main.watchdog.signal.logSilence": "role log silence",
  "main.watchdog.patrolSummary": "System·Patrol · {count} role(s) on duty",
  "main.watchdog.patrolSkipped": "System·Patrol · skipped {count} consecutive time(s) (previous round unsettled)",
  "ui.task.title": "Task",
  "ui.task.cardTitle": "Task #{taskId}",
  "ui.task.target": "Target role: {role}",
  "ui.task.goal": "Goal: {text}",
  "ui.task.expected": "Expected output: {text}",
  "ui.task.evidence": "Suggested evidence: {list}",
  "ui.task.status": "Status: {status}",
  "ui.task.sideEffect": "Side effect: {sideEffect}",
  "ui.task.time": "Time: {at}",
  "ui.task.retryOf": "Redispatched from #{taskId}",
  "ui.task.restored": "Restored {count} undelivered task(s)",
  "ui.task.duplicate": "The same task already exists (#{taskId}); not dispatched again",
  "ui.task.stateWriteFailed": "Task state write failed — not delivered (not silent)",
  "ui.task.accepted": "Task accepted: #{taskId} (accepted ≠ completed)",
  "ui.workReport.title": "Work result",
  "ui.workReport.status.done": "done",
  "ui.workReport.status.blocked": "blocked",
  "ui.workReport.status.failed": "failed",
  "ui.workReport.summary": "Summary: {text}",
  "ui.workReport.evidence": "Evidence",
  "ui.workReport.unreported": "No formal task report was submitted; completion cannot be confirmed",
  "ui.roleLog.title": "Role log",
  "ui.roleLog.empty": "No log entries",
  "ui.roleLog.lastActivity": "Last log: {at}",
  "ui.roleLog.status.normal": "normal",
  "ui.roleLog.status.slow": "slow",
  "ui.roleLog.status.stuck": "stuck",
  "ui.roleLog.status.waiting": "waiting",
  "ui.roleLog.view": "Read log",
  // ---- Batch C (2026-10-28): direct requests / decision / notifications ----
  "ui.request.title": "Request",
  "ui.request.sourceRole": "Source role: {role}",
  "ui.request.submitted": "Request submitted",
  "ui.request.presented": "Request presented",
  "ui.request.resolved": "Request resolved",
  "ui.request.notified": "Chief notified",
  "ui.request.toCustomer": "customer",
  "ui.request.toJudge": "judge agent",
  "ui.request.byCustomer": "customer decision",
  "ui.request.byJudge": "judge auto-approval",
  "ui.request.orphaned": "Unresolved request marked orphaned after restart (original action not executed)",
  "ui.request.expired": "Approval card expired after restart (command/write is not replayed)",
  "ui.request.application": "Application-originated",
  "ui.request.appointmentWrite": "Role-card / boundary write approval",
  "ui.judge.directRequest": "Direct request",
  "ui.judge.directRequestHint": "Built-in roles request directly; the app presents/adjudicates; the chief is notified, never answers or decides for them",
  "main.demo.toolCall": "Model requested write_file -> {path}",
  "main.demo.unknownToolDenied": "Unknown tool; refusing to execute: write_file",
  "main.demo.message": "(Demo runtime · turn {turn}) received: {text}",
  "main.demo.inBoundsWrite": "Write attempt inside the role boundary",
  "main.demo.outOfBoundsWrite": "Out-of-boundary write attempt",
  "main.demo.turnEndedPrototype":
    "Turn {turn} ended (nothing was actually written during the prototype phase).",
  "main.demo.turnEnded": "Turn {turn} ended (demo runtime).",
} satisfies Record<MessageKey, MessageTemplate>;
