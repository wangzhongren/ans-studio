// Read-only CDP helper for UI/UX evidence collection against the running ANS app.
// Usage:
//   node cdp.mjs run "<expr>"           -> evaluate JS in page, print JSON result
//   node cdp.mjs run-file <path>        -> evaluate JS read from file
//   node cdp.mjs shot <path.png>        -> viewport screenshot
//   node cdp.mjs shot-full <path.png>   -> full-page screenshot (Page.captureScreenshot captureBeyondViewport)
//   node cdp.mjs html <path.html>       -> save document.documentElement.outerHTML
//   node cdp.mjs click "<selector>"     -> click first matching element
import fs from 'node:fs';
import WebSocket from 'ws';

const CDP = 'http://127.0.0.1:9225';
const [cmd, arg] = process.argv.slice(2);

const targets = await fetch(`${CDP}/json/list`).then((r) => r.json());
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
let id = 0;
const pending = new Map();

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid);
        reject(new Error(`timeout: ${method}`));
      }
    }, 30000);
  });
}

await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});

try {
  await send('Runtime.enable');
  await send('Page.enable');

  if (cmd === 'run') {
    const result = await send('Runtime.evaluate', {
      expression: arg,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      console.error('EXCEPTION:', JSON.stringify(result.exceptionDetails, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result.result?.value ?? result.result, null, 2));
    }
  } else if (cmd === 'run-file') {
    const expr = fs.readFileSync(arg, 'utf8');
    const result = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      console.error('EXCEPTION:', JSON.stringify(result.exceptionDetails, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result.result?.value ?? result.result, null, 2));
    }
  } else if (cmd === 'shot' || cmd === 'shot-full') {
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: cmd === 'shot-full',
      fromSurface: true,
    });
    fs.writeFileSync(arg, Buffer.from(data, 'base64'));
    console.log('saved', arg);
  } else if (cmd === 'html') {
    const result = await send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true,
    });
    fs.writeFileSync(arg, result.result.value);
    console.log('saved', arg, result.result.value.length, 'chars');
  } else if (cmd === 'resize') {
    const [width, height] = arg.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    console.log('resized to', width, height);
  } else if (cmd === 'resize-reset') {
    await send('Emulation.clearDeviceMetricsOverride', {});
    console.log('metrics cleared');
  } else if (cmd === 'probe') {
    // probe <WxH> <shot.png> <expr.js>  -- set metrics, screenshot, and evaluate in one session.
    const [size, shotPath, exprPath] = arg.split('|');
    const [width, height] = size.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
      dontSetVisibleSize: false,
    });
    await new Promise((r) => setTimeout(r, 500));
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    let value = null;
    if (exprPath && exprPath !== '-') {
      const expr = fs.readFileSync(exprPath, 'utf8');
      const result = await send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        console.error('EXCEPTION:', JSON.stringify(result.exceptionDetails, null, 2));
        process.exitCode = 1;
      } else {
        value = result.result?.value ?? result.result;
      }
    }
    console.log(JSON.stringify({ size: `${width}x${height}`, shot: shotPath, value }, null, 2));
  } else if (cmd === 'click') {
    const expr = `(() => {
      const el = document.querySelector(${JSON.stringify(arg)});
      if (!el) return { ok: false, reason: 'not found' };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, tag: el.tagName, text: (el.textContent || '').slice(0, 120) };
    })()`;
    const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true });
    console.log(JSON.stringify(result.result?.value ?? result.result, null, 2));
  } else {
    console.error('unknown command', cmd);
    process.exitCode = 2;
  }
} finally {
  ws.close();
}
