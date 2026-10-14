export * from '../../src/provider/codex/session.ts?t1-original';
import { createCodexRuntimeAdapter as actual } from '../../src/provider/codex/session.ts?t1-original';
import { codexEngine } from './t1-external-engines.mjs';
export function createCodexRuntimeAdapter(options) { return actual({ ...options, engineFactory: codexEngine }); }
