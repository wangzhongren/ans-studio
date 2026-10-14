export * from '../../src/provider/claude/session.ts?t1-original';
import { createClaudeRuntimeAdapter as actual } from '../../src/provider/claude/session.ts?t1-original';
import { claudeSdk } from './t1-external-engines.mjs';
export function createClaudeRuntimeAdapter(options) { return actual(options, { loadSdk: claudeSdk }); }
