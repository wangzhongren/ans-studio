/**
 * game/ui/ui.js
 * 模块：ui-hud（界面与 HUD）
 * 项目：wuxia-roguelike ·《江湖夜雨》武侠肉鸽生存
 *
 * 职责（架构契约 §3）：
 *   - 开始界面：标题/副标题/开始按钮/操作提示；
 *   - 游戏 HUD：气血条、境界/修为、波次、余时、斩敌、已战；
 *   - 升级三选一面板：展示 progression 提供的选项（名称/描述/权重层级），点击或按键选择；
 *   - 暂停覆盖层、波次横幅与提示；
 *   - 胜利/失败结算（斩敌/境界/存活时长）与重开。
 *
 * 公开契约（架构契约 §5.5 / §5.6）：
 *   WX.UI.init(viewSource)           绑定视图快照来源，构建并挂载 DOM 覆盖层；
 *   WX.UI.render(snapshot)           只读渲染视图快照；
 *   WX.UI.showUpgrade(choices, onPick)  展示三选一，选择后回调或发 `upgrade:chosen`；
 *   WX.UI.showResult(result, onRestart) 展示结算，重开回调或发 `run:restart`。
 *   仅发契约登记事件 `upgrade:chosen` / `run:restart`，不新增任何未登记事件；
 *   开始/继续等无登记事件的交互走 App 回调或 App 公开方法，绝不写领域状态。
 *
 * 只读约束：本模块不修改 player/combat/progression/enemies/items 的任何内部状态，
 * 只消费 App 的视图快照与 WX.Config.text 文案；DOM 交互只通过回调/事件交回 App。
 *
 * 硬约束（架构契约 §1）：
 *   - 经典 <script> + IIFE 挂载 window.WX.UI，不使用 ES Module / import / export；
 *   - 不 fetch/XHR，不引 CDN/外部字体/图片/音频，无构建链；
 *   - 样式在 game/ui/styles.css，由本文件注入；加载失败时注入最小内联兜底样式。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var NS = WX.UI || (WX.UI = {});
  var doc = global.document || null;

  var VERSION = '1.0.0';
  var SCRIPT_SRC = (doc && doc.currentScript && doc.currentScript.src) || '';

  /** 状态机名（架构契约 §5.3）。UI 只读识别，不驱动状态迁移。 */
  var STATES = {
    BOOT: 'BOOT',
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    LEVEL_UP: 'LEVEL_UP',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
    VICTORY: 'VICTORY'
  };

  /* 仅在 WX.Config.text 缺失时兜底的文案；正常路径全部读 config-data。 */
  var FALLBACK_TEXT = {
    title: '江湖夜雨',
    subtitle: '一剑一人，独闯风雨',
    menu: {
      tagline: '十年磨一剑，霜刃未曾试。',
      startButton: '踏入江湖',
      controlsHint: 'WASD / 方向键 移动 · 自动出招 · Esc 暂停'
    },
    hud: {
      hpLabel: '气血', levelLabel: '境界', expLabel: '修为', waveLabel: '波次',
      timeLeftLabel: '余时', killsLabel: '斩敌', elapsedLabel: '已战', secondsUnit: '秒'
    },
    levelUp: { title: '顿悟', subtitle: '择一法门，精进己身' },
    states: { pausedTitle: '静息', pausedHint: '按 P / Esc 继续' },
    result: {
      victoryTitle: '名震江湖', defeatTitle: '身死道消',
      victoryDesc: '最后一波敌影散去，长街血雨渐歇。',
      defeatDesc: '刀光散尽，你倒在青石长街。',
      restartButton: '再战江湖',
      statsKills: '斩敌', statsLevel: '境界', statsTime: '存活'
    },
    wave: { bannerPrefix: '第', bannerSuffix: '波', clearedText: '此波已清' },
    tips: ['靠近经验光点即可自动拾取。', '气血归零即败，撑过终波即胜。']
  };

  /* ---------------------------- 运行时状态 ---------------------------- */

  var state = {
    mounted: false,
    viewSource: null,
    root: null,
    els: null,
    handlers: {
      onStart: null,
      onRestart: null,
      onUpgrade: null,
      onResume: null
    },
    emitSink: null,
    cssHref: null,
    snapshot: null,
    uiState: null,
    stylesInjected: false,
    fallbackStyled: false,
    keyBound: false,
    bannerTimer: 0,
    toastTimer: 0,
    lastWave: null,
    upgrade: {
      open: false,
      byApi: false,
      choices: [],
      onPick: null,
      focus: 0,
      key: ''
    },
    result: {
      open: false,
      byApi: false,
      onRestart: null,
      type: '',
      key: ''
    }
  };

  var cachedText = null;
  var cachedTextSource = null;

  /* ---------------------------- 基础工具 ---------------------------- */

  function isObject(value) {
    return !!value && typeof value === 'object';
  }

  function num(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function clamp01(value) {
    if (!isFinite(value)) { return 0; }
    if (value < 0) { return 0; }
    if (value > 1) { return 1; }
    return value;
  }

  function h(tag, className, text) {
    if (!doc) { return null; }
    var node = doc.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = String(text); }
    return node;
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i += 1) {
      if (parent && arguments[i]) { parent.appendChild(arguments[i]); }
    }
    return parent;
  }

  function setText(node, value) {
    if (!node) { return; }
    var next = value === null || value === undefined ? '' : String(value);
    if (node.__wxText === next) { return; }
    node.__wxText = next;
    node.textContent = next;
  }

  function setScale(node, ratio) {
    if (!node) { return; }
    var value = clamp01(ratio);
    if (node.__wxScale === value) { return; }
    node.__wxScale = value;
    node.style.transform = 'scaleX(' + value + ')';
  }

  function setHidden(node, hidden) {
    if (!node) { return; }
    if (node.hidden !== !!hidden) { node.hidden = !!hidden; }
  }

  function formatInt(value, fallback) {
    var n = num(value, fallback === undefined ? 0 : fallback);
    return String(Math.round(n));
  }

  function formatClock(seconds) {
    var total = Math.max(0, Math.floor(num(seconds, 0)));
    var mins = Math.floor(total / 60);
    var secs = total % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  /** 合并兜底文案与 WX.Config.text（两层足够覆盖契约结构）。 */
  function mergeText(base, over) {
    var out = {};
    var key;
    for (key in base) {
      if (!Object.prototype.hasOwnProperty.call(base, key)) { continue; }
      out[key] = base[key];
    }
    if (!isObject(over)) { return out; }
    for (key in over) {
      if (!Object.prototype.hasOwnProperty.call(over, key)) { continue; }
      var b = out[key];
      var o = over[key];
      out[key] = isObject(b) && isObject(o) ? mergeText(b, o) : o;
    }
    return out;
  }

  function getText() {
    var source = WX.Config && WX.Config.text ? WX.Config.text : null;
    if (source === cachedTextSource && cachedText) { return cachedText; }
    cachedTextSource = source;
    cachedText = mergeText(FALLBACK_TEXT, source);
    return cachedText;
  }

  function config() {
    return WX.Config || {};
  }

  /* ---------------------------- 样式注入 ---------------------------- */

  function resolveCssHref() {
    if (SCRIPT_SRC) {
      var cut = SCRIPT_SRC.lastIndexOf('/');
      if (cut >= 0) { return SCRIPT_SRC.slice(0, cut + 1) + 'styles.css'; }
      return 'styles.css';
    }
    if (doc && doc.getElementsByTagName) {
      var scripts = doc.getElementsByTagName('script');
      for (var i = 0; i < scripts.length; i += 1) {
        var src = scripts[i] && scripts[i].src ? String(scripts[i].src) : '';
        if (/ui\.js(\?|#|$)/.test(src)) {
          return src.replace(/ui\.js(\?|#|$)/, 'styles.css');
        }
      }
    }
    return 'game/ui/styles.css';
  }

  /** 兜底样式：仅在 styles.css 加载失败时注入，保证界面仍可读可用。 */
  function injectFallbackStyles() {
    if (!doc || state.fallbackStyled) { return; }
    state.fallbackStyled = true;
    var css = [
      '.wx-ui{position:fixed;inset:0;z-index:40;pointer-events:none;color:#f2e9d4;',
      'font-family:"STKaiti","KaiTi","SimSun",serif;font-size:16px;line-height:1.45;',
      'user-select:none;overflow:hidden}',
      '.wx-ui [hidden]{display:none!important}',
      '.wx-ui .wx-layer{position:absolute;inset:0;display:flex}',
      '.wx-ui .wx-menu{pointer-events:auto;flex-direction:column;align-items:center;',
      'justify-content:center;background:rgba(6,11,9,.92);text-align:center;padding:24px}',
      '.wx-ui .wx-menu__inner{display:flex;flex-direction:column;gap:12px;align-items:center;',
      'padding:28px 40px;border-top:1px solid rgba(201,165,92,.4);',
      'border-bottom:1px solid rgba(201,165,92,.4)}',
      '.wx-ui .wx-menu__title{margin:0;font-size:clamp(2.4rem,8vw,4rem);letter-spacing:.16em}',
      '.wx-ui .wx-menu__subtitle,.wx-ui .wx-menu__tagline,.wx-ui .wx-menu__hint,',
      '.wx-ui .wx-menu__tips{margin:0;color:#cbbfa4;font-size:.9rem}',
      '.wx-ui .wx-btn{pointer-events:auto;min-height:44px;padding:.5em 2em;cursor:pointer;',
      'border:1px solid #c9a55c;background:rgba(9,15,13,.86);color:#e8cd8d;',
      'font-family:inherit;font-size:1.05rem;letter-spacing:.2em}',
      '.wx-ui .wx-hud{flex-direction:column;padding:12px;gap:8px}',
      '.wx-ui .wx-hud__panel{width:min(340px,52vw);display:flex;flex-direction:column;gap:8px;',
      'padding:12px 14px;pointer-events:auto;border:1px solid rgba(201,165,92,.35);',
      'border-left:3px solid #c9a55c;background:rgba(10,17,15,.75);cursor:default}',
      '.wx-ui .wx-hud__row,.wx-ui .wx-hud__top,.wx-ui .wx-hud__cell,.wx-ui .wx-hud__footer',
      '{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.wx-ui .wx-hud__grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}',
      '.wx-ui .wx-hud__label{font-size:.76rem;letter-spacing:.14em;color:#cbbfa4}',
      '.wx-ui .wx-hud__value{font-size:.95rem;white-space:nowrap}',
      '.wx-ui .wx-bar{position:relative;flex:1;height:10px;background:rgba(0,0,0,.5);',
      'border:1px solid rgba(201,165,92,.35);overflow:hidden}',
      '.wx-ui .wx-bar__fill{position:absolute;inset:0 auto 0 0;width:100%;',
      'transform-origin:left;background:#b23a2f}',
      '.wx-ui .wx-bar--exp .wx-bar__fill{background:#4f8c72}',
      '.wx-ui .wx-banner{position:absolute;top:12vh;left:50%;transform:translateX(-50%);',
      'padding:8px 26px;border-top:1px solid rgba(201,165,92,.4);',
      'border-bottom:1px solid rgba(201,165,92,.4);background:rgba(10,17,15,.86);',
      'color:#e8cd8d;letter-spacing:.24em;opacity:0;transition:opacity .24s}',
      '.wx-ui .wx-banner.is-visible{opacity:1}',
      '.wx-ui .wx-toast{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);',
      'padding:6px 16px;background:rgba(10,17,15,.8);border:1px solid rgba(201,165,92,.3);',
      'color:#cbbfa4;opacity:0;transition:opacity .2s}',
      '.wx-ui .wx-toast.is-visible{opacity:1}',
      '.wx-ui .wx-modal{pointer-events:auto;flex-direction:column;align-items:center;',
      'justify-content:center;background:rgba(4,8,7,.66);padding:20px}',
      '.wx-ui .wx-modal__box{width:min(920px,94vw);max-height:92vh;overflow-y:auto;',
      'padding:28px 34px;text-align:center;border:1px solid rgba(201,165,92,.5);',
      'background:#0d1714;pointer-events:auto}',
      '.wx-ui .wx-modal__title{margin:0;font-size:clamp(1.6rem,4vw,2.4rem);letter-spacing:.2em}',
      '.wx-ui .wx-modal__subtitle,.wx-ui .wx-modal__hint{color:#cbbfa4;font-size:.86rem}',
      '.wx-ui .wx-modal__box--narrow{width:min(460px,92vw)}',
      '.wx-ui .wx-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}',
      '.wx-ui .wx-card{pointer-events:auto;position:relative;display:flex;flex-direction:column;',
      'gap:8px;min-height:180px;padding:16px;text-align:left;cursor:pointer;',
      'border:1px solid rgba(201,165,92,.4);background:rgba(13,21,18,.92);color:#f2e9d4;',
      'font-family:inherit}',
      '.wx-ui .wx-card__name{margin:0;font-size:1.24rem;letter-spacing:.1em}',
      '.wx-ui .wx-card__desc{margin:0;flex:1;color:#cbbfa4;font-size:.9rem}',
      '.wx-ui .wx-card__key{position:absolute;top:8px;right:8px;color:#c9a55c;font-size:.72rem}',
      '.wx-ui .wx-result__title{font-size:clamp(1.9rem,6vw,2.8rem);letter-spacing:.22em}',
      '.wx-ui .wx-result__stats{display:flex;flex-wrap:wrap;justify-content:center;',
      'gap:12px 28px;margin:18px 0;padding:14px 0;',
      'border-top:1px solid rgba(201,165,92,.2);border-bottom:1px solid rgba(201,165,92,.2)}',
      '.wx-ui .wx-result__stat{display:flex;flex-direction:column;gap:4px;min-width:80px}',
      '.wx-ui .wx-result__stat-label{font-size:.72rem;color:#cbbfa4}',
      '.wx-ui .wx-result__stat-value{font-size:1.5rem}',
      '.wx-ui .wx-result__actions{display:flex;justify-content:center;gap:12px}',
      '@media (max-width:860px){.wx-ui .wx-cards{grid-template-columns:1fr;max-width:520px;',
      'margin:0 auto}.wx-ui .wx-card{min-height:0}}'
    ].join('');
    var style = h('style', '');
    style.setAttribute('data-wx-ui', 'fallback');
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function injectStyles(href) {
    if (!doc || state.stylesInjected) { return; }
    state.stylesInjected = true;
    var target = href || state.cssHref || resolveCssHref();
    var link = h('link', '');
    link.rel = 'stylesheet';
    link.href = target;
    link.setAttribute('data-wx-ui', 'styles');
    link.onerror = function () { injectFallbackStyles(); };
    (doc.head || doc.documentElement).appendChild(link);
    /* 某些 file:// 环境不触发 onerror：延迟自检样式表是否生效。 */
    global.setTimeout(function () {
      var applied = 0;
      try {
        applied = link.sheet ? 1 : 0;
      } catch (err) {
        applied = 0;
      }
      if (!applied) { injectFallbackStyles(); }
    }, 1200);
  }

  /* ---------------------------- DOM 构建 ---------------------------- */

  function makeButton(className, label) {
    var btn = h('button', 'wx-btn' + (className ? ' ' + className : ''), label);
    btn.type = 'button';
    return btn;
  }

  function buildMenu() {
    var tx = getText();
    var layer = h('div', 'wx-layer wx-menu');
    var inner = h('div', 'wx-menu__inner');
    var title = h('h1', 'wx-menu__title', tx.title);
    var subtitle = h('p', 'wx-menu__subtitle', tx.subtitle);
    var rule = h('div', 'wx-menu__rule');
    var tagline = h('p', 'wx-menu__tagline', tx.menu.tagline);
    var start = makeButton('wx-menu__start', tx.menu.startButton);
    var hint = h('p', 'wx-menu__hint', tx.menu.controlsHint);
    var tips = h('ul', 'wx-menu__tips');
    var tipList = tx.tips || [];
    for (var i = 0; i < tipList.length; i += 1) {
      tips.appendChild(h('li', '', tipList[i]));
    }
    append(inner, title, subtitle, rule, tagline, start, hint, tips);
    layer.appendChild(inner);
    start.addEventListener('click', function () { handleStart(); });
    return { layer: layer, start: start };
  }

  function buildHud() {
    var tx = getText();
    var layer = h('div', 'wx-layer wx-hud');
    var panel = h('div', 'wx-hud__panel wx-panel');

    var top = h('div', 'wx-hud__top');
    var hpLabel = h('span', 'wx-hud__label', tx.hud.hpLabel);
    var hpText = h('span', 'wx-hud__hp-text', '0 / 0');
    append(top, hpLabel, hpText);

    var hpBar = h('div', 'wx-bar wx-bar--hp');
    var hpFill = h('div', 'wx-bar__fill');
    hpBar.appendChild(hpFill);

    var expRow = h('div', 'wx-hud__row');
    var expLabel = h('span', 'wx-hud__label', tx.hud.expLabel);
    var expText = h('span', 'wx-hud__value', '0 / 0');
    append(expRow, expLabel, expText);

    var expBar = h('div', 'wx-bar wx-bar--exp');
    var expFill = h('div', 'wx-bar__fill');
    expBar.appendChild(expFill);

    var grid = h('div', 'wx-hud__grid');
    function cell(labelText) {
      var box = h('div', 'wx-hud__cell');
      var lb = h('span', 'wx-hud__label', labelText);
      var val = h('span', 'wx-hud__value', '—');
      append(box, lb, val);
      grid.appendChild(box);
      return val;
    }
    var levelValue = cell(tx.hud.levelLabel);
    var waveValue = cell(tx.hud.waveLabel);
    var timeValue = cell(tx.hud.timeLeftLabel);
    var killsValue = cell(tx.hud.killsLabel);

    var footer = h('div', 'wx-hud__footer');
    var elapsed = h('span', 'wx-hud__elapsed', '');
    var waveName = h('span', 'wx-hud__wave-name', '');
    append(footer, elapsed, waveName);

    append(panel, top, hpBar, expRow, expBar, grid, footer);
    layer.appendChild(panel);

    return {
      layer: layer,
      panel: panel,
      hpText: hpText,
      hpBar: hpBar,
      hpFill: hpFill,
      expText: expText,
      expFill: expFill,
      level: levelValue,
      wave: waveValue,
      timeLeft: timeValue,
      kills: killsValue,
      elapsed: elapsed,
      waveName: waveName
    };
  }

  function buildUpgrade() {
    var tx = getText();
    var layer = h('div', 'wx-layer wx-modal wx-modal--upgrade');
    var box = h('div', 'wx-modal__box');
    var title = h('h2', 'wx-modal__title', tx.levelUp.title);
    var subtitle = h('p', 'wx-modal__subtitle', tx.levelUp.subtitle);
    var rule = h('div', 'wx-modal__rule');
    var cards = h('div', 'wx-cards');
    var hint = h('p', 'wx-modal__hint', '按 1 / 2 / 3 或 ← → 选择，Enter 确认');
    append(box, title, subtitle, rule, cards, hint);
    layer.appendChild(box);
    return { layer: layer, box: box, cards: cards, hint: hint };
  }

  function buildPause() {
    var tx = getText();
    var layer = h('div', 'wx-layer wx-modal wx-modal--pause');
    var box = h('div', 'wx-modal__box wx-modal__box--narrow');
    var title = h('h2', 'wx-modal__title', tx.states.pausedTitle);
    var hint = h('p', 'wx-pause__hint', tx.states.pausedHint);
    var resume = makeButton('wx-pause__resume', '继续闯荡');
    append(box, title, hint, resume);
    layer.appendChild(box);
    resume.addEventListener('click', function () { handleResume(); });
    return { layer: layer, box: box, resume: resume };
  }

  function buildResult() {
    var tx = getText();
    var layer = h('div', 'wx-layer wx-modal wx-modal--result');
    var box = h('div', 'wx-modal__box wx-result');
    box.style.width = 'min(640px, 94vw)';
    var title = h('h2', 'wx-modal__title wx-result__title', tx.result.victoryTitle);
    var desc = h('p', 'wx-result__desc', '');
    var stats = h('div', 'wx-result__stats');
    var actions = h('div', 'wx-result__actions');
    var restart = makeButton('wx-result__restart', tx.result.restartButton);
    actions.appendChild(restart);
    append(box, title, desc, stats, actions);
    layer.appendChild(box);
    restart.addEventListener('click', function () { handleRestart(); });
    return { layer: layer, box: box, title: title, desc: desc, stats: stats, restart: restart };
  }

  function mount() {
    if (state.mounted || !doc) { return; }
    var custom = state.root;
    var root = custom && custom.nodeType === 1
      ? custom
      : h('div', 'wx-ui');
    if (!root) { return; }
    if (!root.className || root.className.indexOf('wx-ui') < 0) {
      root.className = (root.className ? root.className + ' ' : '') + 'wx-ui';
    }
    if (!root.id) { root.id = 'wx-ui'; }
    root.setAttribute('role', 'presentation');

    var els = state.els || {};
    if (!els.menu) {
      els.menu = buildMenu();
      els.hud = buildHud();
      els.upgrade = buildUpgrade();
      els.pause = buildPause();
      els.result = buildResult();

      els.banner = h('div', 'wx-banner');
      els.bannerTitle = h('span', 'wx-banner__title', '');
      els.bannerSub = h('small', 'wx-banner__sub', '');
      append(els.banner, els.bannerTitle, els.bannerSub);

      els.toast = h('div', 'wx-toast', '');

      append(
        root,
        els.menu.layer,
        els.hud.layer,
        els.upgrade.layer,
        els.pause.layer,
        els.result.layer,
        els.banner,
        els.toast
      );
      state.els = els;
    }

    if (!custom) {
      (doc.body || doc.documentElement).appendChild(root);
    }
    state.root = root;
    state.mounted = true;
    bindKeys();

    setHidden(els.menu.layer, true);
    setHidden(els.hud.layer, true);
    setHidden(els.upgrade.layer, true);
    setHidden(els.pause.layer, true);
    setHidden(els.result.layer, true);
    injectStyles();
  }

  /* ---------------------------- 键盘（仅升级面板） ---------------------------- */

  function bindKeys() {
    if (state.keyBound || !doc || !doc.addEventListener) { return; }
    state.keyBound = true;
    doc.addEventListener('keydown', function (event) {
      if (!state.upgrade.open) { return; }
      if (event.ctrlKey || event.metaKey || event.altKey) { return; }
      var key = event.key;
      var count = state.upgrade.choices.length;
      if (!count) { return; }
      var index = -1;
      if (key === '1' || event.code === 'Digit1' || event.code === 'Numpad1') { index = 0; }
      else if (key === '2' || event.code === 'Digit2' || event.code === 'Numpad2') { index = 1; }
      else if (key === '3' || event.code === 'Digit3' || event.code === 'Numpad3') { index = 2; }
      else if (key === 'ArrowLeft' || key === 'ArrowUp') {
        index = (state.upgrade.focus + count - 1) % count;
      } else if (key === 'ArrowRight' || key === 'ArrowDown') {
        index = (state.upgrade.focus + 1) % count;
      } else if (key === 'Enter' || key === ' ') {
        index = state.upgrade.focus;
      } else {
        return;
      }
      if (index < 0) { return; }
      event.preventDefault();
      if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowRight' || key === 'ArrowDown') {
        setFocus(index);
        return;
      }
      pickChoice(index);
    });
  }

  /* ---------------------------- 快照读取与状态识别 ---------------------------- */

  /** 从 init 传入的 viewSource 读取只读快照：函数 / getSnapshot() / snapshot()。 */
  function readSnapshot() {
    var vs = state.viewSource;
    if (!vs) { return null; }
    try {
      if (typeof vs === 'function') {
        var value = vs();
        return isObject(value) ? value : null;
      }
      if (typeof vs.getSnapshot === 'function') {
        var snap = vs.getSnapshot();
        return isObject(snap) ? snap : null;
      }
      if (typeof vs.snapshot === 'function') {
        var snap2 = vs.snapshot();
        return isObject(snap2) ? snap2 : null;
      }
      if (isObject(vs.snapshot)) { return vs.snapshot; }
    } catch (err) {
      return null;
    }
    return null;
  }

  function normalizeState(raw) {
    if (typeof raw !== 'string') { return ''; }
    var value = raw.toUpperCase();
    if (STATES[value]) { return STATES[value]; }
    if (value === 'RUNNING' || value === 'PLAY' || value === 'IN_GAME') { return STATES.PLAYING; }
    if (value === 'LEVELUP' || value === 'LEVEL-UP' || value === 'LEVELING') { return STATES.LEVEL_UP; }
    if (value === 'PAUSE' || value === 'PAUSED_GAME') { return STATES.PAUSED; }
    if (value === 'GAMEOVER' || value === 'GAME-OVER' || value === 'OVER' ||
        value === 'DEFEAT' || value === 'LOSE' || value === 'LOST') {
      return STATES.GAME_OVER;
    }
    if (value === 'WIN' || value === 'WON' || value === 'SUCCESS') { return STATES.VICTORY; }
    if (value === 'START' || value === 'TITLE' || value === 'MAIN_MENU') { return STATES.MENU; }
    return '';
  }

  /* ---------------------------- HUD ---------------------------- */

  function updateHud(snapshot) {
    if (!state.els) { return; }
    var tx = getText();
    var cfg = config();
    var els = state.els.hud;

    var hp = num(snapshot.hp, 0);
    var maxHp = num(snapshot.maxHp, 0);
    var hpRatio = maxHp > 0 ? hp / maxHp : 0;
    setText(els.hpText, formatInt(hp) + ' / ' + formatInt(maxHp));
    setScale(els.hpFill, hpRatio);
    if (els.hpBar.classList) {
      els.hpBar.classList.toggle('is-low', maxHp > 0 && hpRatio <= 0.3);
    }

    var exp = num(snapshot.exp, 0);
    var expToNext = num(snapshot.expToNext, 0);
    setScale(els.expFill, expToNext > 0 ? exp / expToNext : 0);
    setText(els.expText, expToNext > 0
      ? formatInt(exp) + ' / ' + formatInt(expToNext)
      : formatInt(exp));

    setText(els.level, formatInt(snapshot.level, 1));

    var wave = num(snapshot.wave, 0);
    var target = cfg.balance && cfg.balance.run
      ? num(cfg.balance.run.targetWaveCount, 0)
      : 0;
    setText(els.wave, target > 0
      ? formatInt(wave) + ' / ' + formatInt(target)
      : formatInt(wave));

    var timeLeft = Math.max(0, Math.ceil(num(snapshot.timeLeft, 0)));
    setText(els.timeLeft, formatInt(timeLeft) + (tx.hud.secondsUnit || ''));

    setText(els.kills, formatInt(snapshot.kills));

    var elapsed = num(snapshot.elapsed, 0);
    setText(els.elapsed, tx.hud.elapsedLabel + ' ' + formatClock(elapsed));

    var waveName = '';
    if (cfg.waves && wave >= 1 && cfg.waves[wave - 1] && cfg.waves[wave - 1].name) {
      waveName = cfg.waves[wave - 1].name;
    }
    setText(els.waveName, waveName);
  }

  /* ---------------------------- 横幅 / 提示 ---------------------------- */

  function showBanner(wave, subText, durationMs) {
    if (!state.els) { return; }
    var tx = getText();
    var els = state.els;
    if (typeof wave === 'number' || /^\d+$/.test(String(wave))) {
      var index = Math.max(1, Math.round(Number(wave)));
      var name = '';
      var waves = config().waves;
      if (waves && waves[index - 1] && waves[index - 1].name) { name = waves[index - 1].name; }
      setText(els.bannerTitle,
        (tx.wave.bannerPrefix || '第') + index + (tx.wave.bannerSuffix || '波'));
      setText(els.bannerSub, subText === undefined || subText === null ? name : subText);
    } else {
      setText(els.bannerTitle, wave);
      setText(els.bannerSub, subText || '');
    }
    els.banner.classList.add('is-visible');
    if (state.bannerTimer) { global.clearTimeout(state.bannerTimer); }
    state.bannerTimer = global.setTimeout(function () {
      state.bannerTimer = 0;
      if (state.els) { state.els.banner.classList.remove('is-visible'); }
    }, Math.max(400, num(durationMs, 2200)));
  }

  function toast(text, durationMs) {
    if (!state.els) { return; }
    setText(state.els.toast, text);
    state.els.toast.classList.add('is-visible');
    if (state.toastTimer) { global.clearTimeout(state.toastTimer); }
    state.toastTimer = global.setTimeout(function () {
      state.toastTimer = 0;
      if (state.els) { state.els.toast.classList.remove('is-visible'); }
    }, Math.max(400, num(durationMs, 1800)));
  }

  function maybeBanner(snapshot, uiState) {
    if (uiState !== STATES.PLAYING && uiState !== STATES.LEVEL_UP && uiState !== '') { return; }
    var wave = num(snapshot.wave, 0);
    if (wave <= 0) {
      if (wave === 0) { state.lastWave = 0; }
      return;
    }
    if (state.lastWave === null || state.lastWave === 0) {
      state.lastWave = wave;
      showBanner(wave);
      return;
    }
    if (wave !== state.lastWave) {
      state.lastWave = wave;
      showBanner(wave);
    }
  }

  /* ---------------------------- 面板开合 ---------------------------- */

  function closeUpgrade() {
    var up = state.upgrade;
    up.open = false;
    up.byApi = false;
    up.onPick = null;
    up.key = '';
    up.focus = 0;
    if (state.els && state.els.upgrade && state.els.upgrade.cards) {
      var cardsEl = state.els.upgrade.cards;
      while (cardsEl.firstChild) { cardsEl.removeChild(cardsEl.firstChild); }
    }
    up.choices = [];
    if (state.els) { setHidden(state.els.upgrade.layer, true); }
  }

  function closeResult() {
    var res = state.result;
    res.open = false;
    res.byApi = false;
    res.onRestart = null;
    res.key = '';
    res.type = '';
    if (state.els) { setHidden(state.els.result.layer, true); }
  }

  /* ---------------------------- 升级选择面板 ---------------------------- */

  function findUpgrade(id) {
    var list = config().upgrades || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === id) { return list[i]; }
    }
    return null;
  }

  /** 归一化选项：允许 upgradeId 字符串，或 progression 提供的完整对象。 */
  function normalizeChoices(choices) {
    if (!Array.isArray(choices)) { return []; }
    var out = [];
    for (var i = 0; i < choices.length; i += 1) {
      var raw = choices[i];
      if (typeof raw === 'string') {
        var def = findUpgrade(raw);
        out.push({
          id: raw,
          name: def && def.name ? def.name : raw,
          description: def && def.description ? def.description : '',
          weight: def ? num(def.weight, 0) : 0,
          maxStack: def ? num(def.maxStack, 0) : 0
        });
        continue;
      }
      if (!isObject(raw)) { continue; }
      var base = raw.id ? findUpgrade(raw.id) : null;
      var weight = num(raw.weight, base ? num(base.weight, 0) : 0);
      out.push({
        id: raw.id || raw.upgradeId || (base && base.id) || ('choice-' + i),
        name: raw.name || (base && base.name) || raw.title || '未知法门',
        description: raw.description || raw.desc || (base && base.description) || '',
        weight: weight,
        maxStack: num(raw.maxStack, base ? num(base.maxStack, 0) : 0)
      });
    }
    return out;
  }

  function choiceSignature(choices) {
    var parts = [];
    for (var i = 0; i < choices.length; i += 1) { parts.push(choices[i].id); }
    return parts.join('|');
  }

  /** 权重层级（纯表现分类，不参与抽取，不影响 progression 概率）。 */
  function weightTier(weight) {
    var list = config().upgrades || [];
    var max = 0;
    for (var i = 0; i < list.length; i += 1) {
      var w = num(list[i] && list[i].weight, 0);
      if (w > max) { max = w; }
    }
    if (!(weight > 0) || !(max > 0)) { return ''; }
    var ratio = weight / max;
    if (ratio >= 0.95) { return '常见'; }
    if (ratio >= 0.8) { return '少见'; }
    return '稀有';
  }

  function renderCards(choices) {
    if (!state.els) { return; }
    var cardsEl = state.els.upgrade.cards;
    while (cardsEl.firstChild) { cardsEl.removeChild(cardsEl.firstChild); }
    for (var i = 0; i < choices.length; i += 1) {
      var choice = choices[i];
      var card = h('button', 'wx-card');
      card.type = 'button';
      card.setAttribute('data-index', String(i));
      if (i === state.upgrade.focus) { card.classList.add('is-focused'); }

      var key = h('span', 'wx-card__key', String(i + 1));
      var name = h('h3', 'wx-card__name', choice.name);

      var tier = weightTier(choice.weight);
      var tierParts = [];
      if (tier) { tierParts.push(tier); }
      if (choice.weight > 0) { tierParts.push('权重 ' + Math.round(choice.weight)); }
      var tierText = tierParts.join(' · ');
      var tierEl = tierText ? h('span', 'wx-card__tier', tierText) : null;

      var desc = h('p', 'wx-card__desc', choice.description || '');
      var stackEl = choice.maxStack > 1
        ? h('span', 'wx-card__stack', '可叠 ' + Math.round(choice.maxStack) + ' 层')
        : null;

      append(card, key, name, tierEl, desc, stackEl);
      card.addEventListener('click', (function (index) {
        return function () { pickChoice(index); };
      })(i));
      card.addEventListener('mouseenter', (function (index) {
        return function () { setFocus(index); };
      })(i));
      cardsEl.appendChild(card);
    }
  }

  function setFocus(index) {
    var up = state.upgrade;
    var count = up.choices.length;
    if (!count) { return; }
    up.focus = ((Math.round(index) % count) + count) % count;
    var cards = state.els && state.els.upgrade ? state.els.upgrade.cards : null;
    if (!cards) { return; }
    for (var i = 0; i < cards.children.length; i += 1) {
      if (i === up.focus) {
        cards.children[i].classList.add('is-focused');
      } else {
        cards.children[i].classList.remove('is-focused');
      }
    }
  }

  function openUpgrade(choices, onPick, byApi) {
    var list = normalizeChoices(choices);
    if (!list.length) { return false; }
    var sig = choiceSignature(list);
    var same = state.upgrade.open && state.upgrade.key === sig;
    state.upgrade.choices = list;
    state.upgrade.onPick = typeof onPick === 'function' ? onPick : state.upgrade.onPick;
    state.upgrade.byApi = !!byApi;
    state.upgrade.key = sig;
    state.upgrade.open = true;

    if (!same) {
      state.upgrade.focus = 0;
      renderCards(list);
    } else {
      setFocus(state.upgrade.focus);
    }

    setHidden(state.els.upgrade.layer, false);
    setHidden(state.els.menu.layer, true);
    setHidden(state.els.hud.layer, false);
    setHidden(state.els.pause.layer, true);
    setHidden(state.els.result.layer, true);
    return true;
  }

  function pickChoice(index) {
    var up = state.upgrade;
    if (!up.open) { return; }
    var choice = up.choices[index];
    if (!choice) { return; }
    var id = choice.id;
    var callback = up.onPick;
    closeUpgrade();
    if (typeof callback === 'function') {
      callback(id, choice);
      return;
    }
    emitEvent('upgrade:chosen', { upgradeId: id });
  }

  /* ---------------------------- 结算面板 ---------------------------- */

  function normalizeResultType(value) {
    if (typeof value !== 'string') { return ''; }
    var v = value.toUpperCase();
    if (v === 'VICTORY' || v === 'WIN' || v === 'WON' || v === 'SUCCESS') { return 'victory'; }
    if (v === 'DEFEAT' || v === 'GAME_OVER' || v === 'GAMEOVER' ||
        v === 'LOSE' || v === 'LOST' || v === 'FAIL') { return 'defeat'; }
    return '';
  }

  /** 归一化结算数据：result 可为 'victory'|'defeat'、{result,stats} 或 stats 本体。 */
  function buildResultData(result, snapshot, fallbackType) {
    var type = '';
    var source = null;
    if (typeof result === 'string') {
      type = normalizeResultType(result);
    } else if (isObject(result)) {
      type = normalizeResultType(result.result) ||
        normalizeResultType(result.outcome) ||
        normalizeResultType(result.state) ||
        normalizeResultType(result.type);
      source = isObject(result.stats) ? result.stats : result;
    }
    if (!type) { type = normalizeResultType(fallbackType) || 'defeat'; }
    if (!source && snapshot && isObject(snapshot.stats)) { source = snapshot.stats; }

    var snap = snapshot || {};
    var stats = {
      kills: num(source && source.kills, num(snap.kills, 0)),
      level: num(source && source.level, num(snap.level, 1)),
      timeAlive: num(
        source && source.timeAlive,
        num(
          source && source.elapsed,
          num(source && source.duration, num(source && source.time, num(snap.elapsed, 0)))
        )
      )
    };
    if (stats.level < 1) { stats.level = 1; }
    if (stats.timeAlive < 0) { stats.timeAlive = 0; }
    return { type: type, stats: stats };
  }

  function resultKey(type, stats) {
    return type + '|' + Math.round(stats.kills) + '|' +
      Math.round(stats.level) + '|' + Math.floor(stats.timeAlive);
  }

  function statBlock(label, value) {
    var box = h('div', 'wx-result__stat');
    append(box, h('span', 'wx-result__stat-label', label),
      h('span', 'wx-result__stat-value', value));
    return box;
  }

  function renderResultView(type, stats) {
    var tx = getText();
    var els = state.els.result;
    var victory = type === 'victory';

    setText(els.title, victory ? tx.result.victoryTitle : tx.result.defeatTitle);
    if (els.title.classList) {
      els.title.classList.remove(victory ? 'is-defeat' : 'is-victory');
      els.title.classList.add(victory ? 'is-victory' : 'is-defeat');
    }
    setText(els.desc, victory ? tx.result.victoryDesc : tx.result.defeatDesc);

    while (els.stats.firstChild) { els.stats.removeChild(els.stats.firstChild); }
    append(
      els.stats,
      statBlock(tx.result.statsKills, formatInt(stats.kills)),
      statBlock(tx.result.statsLevel, formatInt(stats.level, 1)),
      statBlock(tx.result.statsTime, formatClock(stats.timeAlive))
    );
  }

  function openResult(data, onRestart, byApi) {
    var key = resultKey(data.type, data.stats);
    var same = state.result.open && state.result.key === key;
    state.result.open = true;
    state.result.byApi = !!byApi;
    state.result.onRestart = typeof onRestart === 'function' ? onRestart : state.result.onRestart;
    state.result.type = data.type;
    state.result.key = key;

    if (!same) { renderResultView(data.type, data.stats); }

    setHidden(state.els.result.layer, false);
    setHidden(state.els.menu.layer, true);
    setHidden(state.els.hud.layer, false);
    setHidden(state.els.pause.layer, true);
    setHidden(state.els.upgrade.layer, true);
    closeUpgrade();
    setHidden(state.els.result.layer, false);
  }

  /* ---------------------------- 交互 → App ---------------------------- */

  function tryEmitWith(target, name, payload) {
    if (!target) { return false; }
    if (typeof target.emit === 'function') { target.emit(name, payload); return true; }
    if (typeof target.publish === 'function') { target.publish(name, payload); return true; }
    if (typeof target.dispatch === 'function') { target.dispatch(name, payload); return true; }
    return false;
  }

  /** 仅发契约登记事件；优先 App 注入的回调，其次事件总线，最后什么都不做。 */
  function emitEvent(name, payload) {
    if (typeof state.emitSink === 'function') {
      state.emitSink(name, payload);
      return true;
    }
    if (tryEmitWith(state.emitSink, name, payload)) { return true; }

    var vs = state.viewSource;
    if (isObject(vs)) {
      if (tryEmitWith(vs, name, payload)) { return true; }
      if (tryEmitWith(vs.bus, name, payload)) { return true; }
      if (tryEmitWith(vs.events, name, payload)) { return true; }
      if (tryEmitWith(vs.app, name, payload)) { return true; }
    }

    var app = WX.App;
    if (app) {
      if (tryEmitWith(app, name, payload)) { return true; }
      if (tryEmitWith(app.bus, name, payload)) { return true; }
      if (tryEmitWith(app.events, name, payload)) { return true; }
      if (tryEmitWith(app.eventBus, name, payload)) { return true; }
    }
    return false;
  }

  /** 按常见命名尝试调用 App 公开方法（开始/重开/继续；不含 App.start 装配入口）。 */
  function tryAppMethods(names) {
    var app = WX.App;
    if (!app) { return false; }
    for (var i = 0; i < names.length; i += 1) {
      if (typeof app[names[i]] === 'function') {
        app[names[i]]();
        return true;
      }
    }
    return false;
  }

  function handleStart() {
    if (typeof state.handlers.onStart === 'function') {
      state.handlers.onStart();
      return;
    }
    if (tryAppMethods(['startRun', 'startGame', 'newRun', 'beginRun', 'enterRun'])) {
      return;
    }
    /* 开始未登记事件；回落到契约事件 run:restart（App 可等同“开新局”处理）。 */
    emitEvent('run:restart', {});
  }

  function handleRestart() {
    var callback = state.result.onRestart || state.handlers.onRestart;
    closeResult();
    state.lastWave = 0;
    if (typeof callback === 'function') {
      callback();
      return;
    }
    if (tryAppMethods(['restartRun', 'restart', 'newRun', 'startRun'])) {
      return;
    }
    emitEvent('run:restart', {});
  }

  function handleResume() {
    if (typeof state.handlers.onResume === 'function') {
      state.handlers.onResume();
      return;
    }
    tryAppMethods(['resume', 'resumeRun', 'unpause', 'togglePause']);
  }

  /* ---------------------------- 渲染与状态切换 ---------------------------- */

  function needsHud(snapshot) {
    return isObject(snapshot) && (
      typeof snapshot.hp === 'number' ||
      typeof snapshot.level === 'number' ||
      typeof snapshot.wave === 'number' ||
      typeof snapshot.state === 'string'
    );
  }

  function ensureUpgrade(snapshot) {
    var els = state.els;
    if (state.upgrade.open && state.upgrade.byApi) {
      setHidden(els.upgrade.layer, false);
      return;
    }
    var choices = snapshot.upgradeChoices;
    if (Array.isArray(choices) && choices.length) {
      var sig = choiceSignature(normalizeChoices(choices));
      if (!state.upgrade.open || state.upgrade.key !== sig) {
        openUpgrade(choices, state.handlers.onUpgrade, false);
      } else {
        setHidden(els.upgrade.layer, false);
      }
    } else if (state.upgrade.open) {
      setHidden(els.upgrade.layer, false);
    }
  }

  function ensureResult(uiState, snapshot) {
    var els = state.els;
    if (state.result.open && state.result.byApi) {
      setHidden(els.result.layer, false);
      return;
    }
    var fallbackType = uiState === STATES.VICTORY ? 'victory' : 'defeat';
    if (isObject(snapshot.result) || typeof snapshot.result === 'string') {
      var data = buildResultData(snapshot.result, snapshot, fallbackType);
      if (!state.result.open || state.result.key !== resultKey(data.type, data.stats)) {
        openResult(data, state.handlers.onRestart, false);
      } else {
        setHidden(els.result.layer, false);
      }
      return;
    }
    var data2 = buildResultData(null, snapshot, fallbackType);
    if (!state.result.open || state.result.key !== resultKey(data2.type, data2.stats)) {
      openResult(data2, state.handlers.onRestart, false);
    } else {
      setHidden(els.result.layer, false);
    }
  }

  function applyState(uiState, snapshot) {
    if (!state.els) { return; }
    var els = state.els;
    var menu = els.menu.layer;
    var hud = els.hud.layer;

    if (!uiState) {
      if (needsHud(snapshot)) {
        setHidden(menu, true);
        setHidden(hud, false);
      }
      return;
    }

    switch (uiState) {
      case STATES.BOOT:
        setHidden(menu, true);
        setHidden(hud, true);
        setHidden(els.pause.layer, true);
        closeUpgrade();
        closeResult();
        break;

      case STATES.MENU:
        setHidden(menu, false);
        setHidden(hud, true);
        setHidden(els.pause.layer, true);
        closeUpgrade();
        closeResult();
        state.lastWave = 0;
        break;

      case STATES.PLAYING:
        setHidden(menu, true);
        setHidden(hud, false);
        setHidden(els.pause.layer, true);
        closeUpgrade();
        closeResult();
        break;

      case STATES.LEVEL_UP:
        setHidden(menu, true);
        setHidden(hud, false);
        setHidden(els.pause.layer, true);
        setHidden(els.result.layer, true);
        ensureUpgrade(snapshot);
        break;

      case STATES.PAUSED:
        setHidden(menu, true);
        setHidden(hud, false);
        setHidden(els.pause.layer, false);
        closeUpgrade();
        closeResult();
        break;

      case STATES.GAME_OVER:
      case STATES.VICTORY:
        setHidden(menu, true);
        setHidden(hud, false);
        setHidden(els.pause.layer, true);
        closeUpgrade();
        ensureResult(uiState, snapshot);
        break;

      default:
        break;
    }
  }

  function render(snapshot) {
    if (!doc) { return NS; }
    if (!state.mounted) { mount(); }
    var snap = isObject(snapshot) ? snapshot : readSnapshot();
    if (!isObject(snap)) { return NS; }

    state.snapshot = snap;
    updateHud(snap);

    var uiState = normalizeState(snap.state) ||
      normalizeState(snap.phase) ||
      normalizeState(snap.mode) ||
      '';
    if (uiState) { state.uiState = uiState; } else { uiState = state.uiState || ''; }

    applyState(uiState, snap);
    maybeBanner(snap, uiState);
    return NS;
  }

  /* ---------------------------- 初始化与导出 ---------------------------- */

  function mergeHandlers(source) {
    if (!isObject(source)) { return; }
    var keys = ['onStart', 'onRestart', 'onUpgrade', 'onResume'];
    for (var i = 0; i < keys.length; i += 1) {
      if (typeof source[keys[i]] === 'function') {
        state.handlers[keys[i]] = source[keys[i]];
      }
    }
  }

  function init(viewSource, options) {
    if (!doc) { return NS; }
    var opts = isObject(options) ? options : {};
    var vs = viewSource;

    if (isObject(vs)) {
      if (opts.root === undefined && vs.root && vs.root.nodeType === 1) {
        state.root = vs.root;
      }
      if (opts.cssHref === undefined && typeof vs.cssHref === 'string') {
        state.cssHref = vs.cssHref;
      }
    }
    if (opts.root && opts.root.nodeType === 1) { state.root = opts.root; }
    if (typeof opts.cssHref === 'string') { state.cssHref = opts.cssHref; }
    if (opts.emit !== undefined) { state.emitSink = opts.emit; }
    else if (opts.emitSink !== undefined) { state.emitSink = opts.emitSink; }

    mergeHandlers(isObject(vs) ? vs.handlers : null);
    mergeHandlers(isObject(vs) ? vs : null);
    mergeHandlers(opts.handlers);
    mergeHandlers(opts);

    if (opts.viewSource) { vs = opts.viewSource; }
    if (typeof vs === 'function' || isObject(vs)) {
      state.viewSource = vs;
    } else if (state.viewSource === undefined) {
      state.viewSource = null;
    }

    mount();
    injectStyles(state.cssHref);

    var initial = opts.snapshot;
    if (!isObject(initial)) { initial = readSnapshot(); }
    if (isObject(initial)) { render(initial); }
    return NS;
  }

  function setHandlers(handlers) {
    mergeHandlers(handlers);
    return NS;
  }

  function setEventSink(sink) {
    state.emitSink = sink || null;
    return NS;
  }

  function destroy() {
    if (state.bannerTimer) { global.clearTimeout(state.bannerTimer); state.bannerTimer = 0; }
    if (state.toastTimer) { global.clearTimeout(state.toastTimer); state.toastTimer = 0; }
    if (state.root && state.root.parentNode && state.root.id === 'wx-ui') {
      state.root.parentNode.removeChild(state.root);
    }
    state.mounted = false;
    state.root = null;
    state.els = null;
    state.snapshot = null;
    state.uiState = null;
    state.lastWave = null;
    state.upgrade = { open: false, byApi: false, choices: [], onPick: null, focus: 0, key: '' };
    state.result = { open: false, byApi: false, onRestart: null, type: '', key: '' };
    return NS;
  }

  NS.VERSION = VERSION;
  NS.STATES = STATES;
  NS.init = init;
  NS.render = render;
  NS.showUpgrade = function (choices, onPick) {
    if (!doc) { return NS; }
    if (!state.mounted) { mount(); }
    openUpgrade(choices, onPick, true);
    return NS;
  };
  NS.hideUpgrade = function () {
    closeUpgrade();
    return NS;
  };
  NS.showResult = function (result, onRestart) {
    if (!doc) { return NS; }
    if (!state.mounted) { mount(); }
    var data = buildResultData(result, state.snapshot, state.uiState);
    openResult(data, onRestart, true);
    return NS;
  };
  NS.hideResult = function () {
    closeResult();
    return NS;
  };
  NS.showBanner = showBanner;
  NS.toast = toast;
  NS.setHandlers = setHandlers;
  NS.setEventSink = setEventSink;
  NS.getSnapshot = function () { return state.snapshot; };
  NS.isMounted = function () { return state.mounted; };
  NS.getRoot = function () { return state.root; };
  NS.destroy = destroy;

  WX.UI = NS;
})(typeof window !== 'undefined' ? window : this);
