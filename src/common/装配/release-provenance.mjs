import { access, mkdir, copyFile } from 'node:fs/promises';
try { await access('.release/source/release-provenance.json'); await access('.release/overlay.patch'); }
catch { console.log('No source provenance: preparation did not complete.'); process.exit(0); }
await mkdir('.release/provenance', { recursive: true });
await copyFile('.release/source/release-provenance.json', '.release/provenance/release-provenance.json');
await copyFile('.release/overlay.patch', '.release/provenance/overlay.patch');
