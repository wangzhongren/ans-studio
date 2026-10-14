// Test only. Reuses actual factories; substitutes their documented external-engine seams.
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const own = new URL('./', import.meta.url);
const redirects = new Map([
  [path.join(root, 'src/provider/codex/session.ts'), 't1-codex-facade.mjs'],
  [path.join(root, 'src/provider/claude/session.ts'), 't1-claude-facade.mjs'],
  [path.join(root, 'app/desktop/pi-config.ts'), 't1-env-facade.mjs'],
]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('?t1-original')) return next(specifier.slice(0, -12), context);
    if (specifier === '@earendil-works/pi-coding-agent') return { url: new URL('t1-pi-sdk.mjs', own).href, shortCircuit: true };
    const result = next(specifier, context);
    if (result.url.startsWith('file:')) {
      const replacement = redirects.get(fileURLToPath(result.url));
      if (replacement) return { ...result, url: new URL(replacement, own).href };
    }
    return result;
  },
});
