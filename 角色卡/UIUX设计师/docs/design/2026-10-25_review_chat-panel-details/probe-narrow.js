(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      x: Math.round(r.x), y: Math.round(r.y),
      display: s.display, overflow: s.overflow,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  };
  const visibleOverflow = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > innerWidth + 1 || r.left < -1);
    })
    .slice(0, 25)
    .map((el) => ({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 70),
      left: Math.round(el.getBoundingClientRect().left),
      right: Math.round(el.getBoundingClientRect().right),
      text: (el.textContent || '').trim().slice(0, 40),
    }));
  const clipped = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const s = getComputedStyle(el);
      return el.scrollWidth > el.clientWidth + 2 && s.overflowX !== 'visible' && el.clientWidth > 0;
    })
    .slice(0, 25)
    .map((el) => ({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 70),
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    }));
  return {
    size: innerWidth + 'x' + innerHeight,
    sidebar: rect('.col-left'),
    mid: rect('.col-mid'),
    header: rect('.chat-head'),
    context: rect('#context-state'),
    tabs: rect('#right-tabs'),
    governance: rect('#governance-status'),
    composer: rect('.composer'),
    composerBottom: rect('.composer-bottom'),
    autoLabel: rect('#auto-approve-label'),
    decisionLabel: rect('#judge-decision-label'),
    scope: rect('#composer-scope'),
    keyboard: rect('.composer-keyboard'),
    actions: rect('.composer-actions'),
    notice: rect('.session-notice'),
    drawer: rect('#right-drawer'),
    visibleOverflow,
    clipped,
  };
})()
