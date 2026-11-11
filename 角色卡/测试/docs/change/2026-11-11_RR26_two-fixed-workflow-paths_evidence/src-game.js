/*!
 * src/game.js —— snake-game 游戏实现（game 模块）
 *
 * 依赖：架构契约 docs/contracts/snake-game-architecture-v1.md 第 4 节（DOM id 与脚本契约）。
 * 加载：传统 <script src="src/game.js"></script>（非 module，零依赖、零构建）。
 * 对外：window.SnakeGame.init(options?) / getState() / reset()，常量 GRID / CELL / TICK_MS。
 *
 * 内部分区（自上而下，禁止反向依赖）：
 *   1. 规则层：纯函数，不触碰 DOM / Web Storage / 网络。
 *   2. 应用层：状态机、固定步长主循环、重开复位。
 *   3. 渲染层：只读状态绘制 Canvas 与同步 HUD。
 *   4. 输入层：keydown 映射到 pendingDirection；仅运行态接受方向输入。
 */
(function (global) {
  'use strict';

  // ============================================================
  // 配置常量（架构契约 4.2：固定步长，不随分数递增）
  // ============================================================
  const GRID = 20;
  const CELL = 20;
  const TICK_MS = 130;
  const CANVAS_SIZE = GRID * CELL; // 400

  const STATUS_RUNNING = 'running';
  const STATUS_OVER = 'over';

  // ============================================================
  // 1. 规则层：纯函数（无 DOM / 无存储 / 无网络）
  // ============================================================
  const DIRECTIONS = Object.freeze({
    up: Object.freeze({ x: 0, y: -1 }),
    down: Object.freeze({ x: 0, y: 1 }),
    left: Object.freeze({ x: -1, y: 0 }),
    right: Object.freeze({ x: 1, y: 0 }),
  });

  function cloneCell(cell) {
    return { x: cell.x, y: cell.y };
  }

  function sameCell(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y;
  }

  function isDirection(name) {
    return Object.prototype.hasOwnProperty.call(DIRECTIONS, name);
  }

  /** 是否 180 度反向（禁止：反向输入忽略，不改变方向、不致死）。 */
  function isReversal(fromDir, toDir) {
    if (!isDirection(fromDir) || !isDirection(toDir)) return false;
    return (
      DIRECTIONS[fromDir].x + DIRECTIONS[toDir].x === 0 &&
      DIRECTIONS[fromDir].y + DIRECTIONS[toDir].y === 0
    );
  }

  /** 取合法方向：非法名或反向输入一律保留当前方向。 */
  function resolveDirection(currentDir, candidate) {
    if (!isDirection(candidate)) return currentDir;
    if (isReversal(currentDir, candidate)) return currentDir;
    return candidate;
  }

  function inBounds(cell) {
    return cell.x >= 0 && cell.x < GRID && cell.y >= 0 && cell.y < GRID;
  }

  function hitsBody(body, cell) {
    return body.some(function (segment) {
      return sameCell(segment, cell);
    });
  }

  function randomIndex(random, length) {
    const value = Number(random());
    const normalized = Number.isFinite(value) ? value : 0;
    const clamped = Math.min(Math.max(normalized, 0), 0.9999999999);
    return Math.floor(clamped * length);
  }

  /**
   * 食物生成：枚举「非蛇身且非最外圈边界」的空格（x、y ∈ [1, GRID-2]）并随机取一格；
   * 与意图 A4「食物在非蛇身、非边界的随机空格重新生成」一致。
   * 无合法空格（棋盘填满 / 仅剩边界格）返回 null，由调用方按默认处理结束本局。
   */
  function spawnFood(snake, random) {
    const occupied = new Set(snake.map(function (segment) {
      return segment.y * GRID + segment.x;
    }));
    const free = [];
    for (let y = 1; y < GRID - 1; y += 1) {
      for (let x = 1; x < GRID - 1; x += 1) {
        if (!occupied.has(y * GRID + x)) free.push({ x: x, y: y });
      }
    }
    if (free.length === 0) return null;
    return free[randomIndex(random, free.length)];
  }

  /** 初始状态：蛇长 3、棋盘中央、朝右；食物由 spawnFood 在非蛇身非边界空格生成；score=0。 */
  function createInitialState(random) {
    const startX = Math.floor(GRID / 2);
    const startY = Math.floor(GRID / 2);
    const snake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
    const direction = 'right';
    return {
      snake: snake,
      food: spawnFood(snake, random),
      direction: direction,
      pendingDirection: direction,
      score: 0,
      status: STATUS_RUNNING,
    };
  }

  /**
   * 单步推进（纯函数）：返回新状态，不修改入参。
   * 规则：按 direction 前进（pendingDirection 每 tick 仅采用最后一个合法方向）；
   * 吃食物 +1 分且不删尾；撞墙 / 撞自身立即 over；棋盘填满按当前得分结束。
   */
  function computeStep(state, random) {
    if (!state || state.status !== STATUS_RUNNING) return state;

    const direction = resolveDirection(state.direction, state.pendingDirection);
    const vector = DIRECTIONS[direction];
    const head = state.snake[0];
    const nextHead = { x: head.x + vector.x, y: head.y + vector.y };

    // 撞墙（不穿墙）：x<0 / x>=GRID / y<0 / y>=GRID
    if (!inBounds(nextHead)) {
      return {
        snake: state.snake,
        food: state.food,
        direction: direction,
        pendingDirection: direction,
        score: state.score,
        status: STATUS_OVER,
      };
    }

    const ate = sameCell(nextHead, state.food);
    const snake = ate
      ? [nextHead].concat(state.snake)
      : [nextHead].concat(state.snake.slice(0, state.snake.length - 1));

    // 撞自身：尾格在未进食时已移开，因此只和移动后的身体段比较
    if (hitsBody(snake.slice(1), nextHead)) {
      return {
        snake: snake,
        food: state.food,
        direction: direction,
        pendingDirection: direction,
        score: state.score,
        status: STATUS_OVER,
      };
    }

    if (!ate) {
      return {
        snake: snake,
        food: state.food,
        direction: direction,
        pendingDirection: direction,
        score: state.score,
        status: STATUS_RUNNING,
      };
    }

    const food = spawnFood(snake, random);
    return {
      snake: snake,
      food: food,
      direction: direction,
      pendingDirection: direction,
      score: state.score + 1,
      // 无合法空格（棋盘填满 / 仅剩边界格）：本局按当前得分结束（默认边界处理）
      status: food === null ? STATUS_OVER : STATUS_RUNNING,
    };
  }

  // ============================================================
  // 应用层状态（内存变量；不使用任何持久化存储）
  // ============================================================
  let state = null;            // 当前局面
  let highScore = 0;           // 会话内最高分（刷新页面即重置）
  let timerId = null;          // 主循环定时器
  let lastTickAt = 0;          // 上次推进时间戳（页面隐藏恢复后只推进单步）
  let randomSource = Math.random;
  let dom = null;              // 缓存的 DOM 引用
  let ctx = null;              // Canvas 2D 上下文
  let initialized = false;
  let eventsBound = false;

  function now() {
    return Date.now();
  }

  // ============================================================
  // 3. 渲染层：只读状态绘制 Canvas 与 HUD（不修改规则状态）
  // ============================================================
  function drawGrid(context) {
    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    context.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    context.lineWidth = 1;
    for (let i = 1; i < GRID; i += 1) {
      const pos = i * CELL;
      context.beginPath();
      context.moveTo(pos + 0.5, 0);
      context.lineTo(pos + 0.5, CANVAS_SIZE);
      context.stroke();
      context.beginPath();
      context.moveTo(0, pos + 0.5);
      context.lineTo(CANVAS_SIZE, pos + 0.5);
      context.stroke();
    }

    context.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    context.strokeRect(0.5, 0.5, CANVAS_SIZE - 1, CANVAS_SIZE - 1);
  }

  function drawSnake(context, snake) {
    for (let i = 0; i < snake.length; i += 1) {
      const cell = snake[i];
      const pad = i === 0 ? 1 : 2;
      context.fillStyle = i === 0 ? '#86efac' : '#22c55e';
      context.fillRect(
        cell.x * CELL + pad,
        cell.y * CELL + pad,
        CELL - pad * 2,
        CELL - pad * 2
      );
    }
  }

  function drawFood(context, food) {
    if (!food) return;
    const centerX = food.x * CELL + CELL / 2;
    const centerY = food.y * CELL + CELL / 2;
    context.fillStyle = '#f97316';
    context.beginPath();
    context.arc(centerX, centerY, CELL * 0.32, 0, Math.PI * 2);
    context.fill();
  }

  function drawOverLayer(context) {
    context.fillStyle = 'rgba(2, 6, 23, 0.55)';
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  function render() {
    if (!ctx || !state) return;
    drawGrid(ctx);
    drawFood(ctx, state.food);
    drawSnake(ctx, state.snake);
    if (state.status === STATUS_OVER) drawOverLayer(ctx);
  }

  function setText(element, value) {
    if (element && element.textContent !== value) {
      element.textContent = value;
    }
  }

  function showOverlay() {
    if (!dom || !dom.overlay) return;
    dom.overlay.classList.remove('hidden');
    dom.overlay.hidden = false;
  }

  function hideOverlay() {
    if (!dom || !dom.overlay) return;
    dom.overlay.classList.add('hidden');
    dom.overlay.hidden = true;
  }

  /** HUD 同步：分数 / 会话最高分 / 结束页分数 / 结束层显隐 / 操作提示。 */
  function syncHud() {
    if (!dom || !state) return;
    const isOver = state.status === STATUS_OVER;
    setText(dom.score, String(state.score));
    setText(dom.highScore, String(highScore));
    setText(dom.finalScore, String(state.score));
    setText(dom.finalHighScore, String(highScore));
    setText(
      dom.hint,
      isOver ? '本局结束，按 R 或点击「重新开始」再开一局' : '方向键 / WASD 控制方向，R 键重新开始'
    );
    if (isOver) showOverlay();
    else hideOverlay();
  }

  // ============================================================
  // 应用层：主循环、推进、最高分、重开
  // ============================================================
  function stopLoop() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startLoop() {
    stopLoop();
    lastTickAt = 0;
    timerId = setInterval(tick, TICK_MS);
  }

  function tick() {
    if (!state || state.status !== STATUS_RUNNING) {
      stopLoop();
      return;
    }
    // 页面隐藏时浏览器会节流定时器：恢复后只推进单步，不做多步追赶
    const current = now();
    if (lastTickAt !== 0 && current - lastTickAt < TICK_MS * 0.5) return;
    lastTickAt = current;

    state = computeStep(state, randomSource);
    if (state.score > highScore) highScore = state.score;
    syncHud();
    render();

    if (state.status === STATUS_OVER) stopLoop();
  }

  // ============================================================
  // 输入层：keydown → pendingDirection；R 仅结束态重开
  // ============================================================
  const KEY_DIRECTIONS = Object.freeze({
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  });

  function isArrowKey(key) {
    return (
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight'
    );
  }

  function onKeyDown(event) {
    if (!initialized || !state) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const rawKey = typeof event.key === 'string' ? event.key : '';
    if (!rawKey) return;

    // 方向键 preventDefault，避免页面滚动
    if (isArrowKey(rawKey)) event.preventDefault();

    const normalized = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;

    if (normalized === 'r') {
      // R 重开：仅结束态响应
      if (state.status === STATUS_OVER) reset();
      return;
    }

    const candidate = KEY_DIRECTIONS[normalized];
    if (!candidate) return;

    // 结束态忽略方向输入（画面保持结束状态）
    if (state.status !== STATUS_RUNNING) return;

    // 反向输入忽略：不改变方向、不致死；其余输入写 pendingDirection，
    // 每 tick 仅采用最后一个合法方向，输入在下一移动步生效。
    if (isReversal(state.direction, candidate)) return;
    if (state.pendingDirection !== candidate) {
      state = {
        snake: state.snake,
        food: state.food,
        direction: state.direction,
        pendingDirection: candidate,
        score: state.score,
        status: state.status,
      };
    }
  }

  function onRestartClick() {
    reset();
  }

  /** 页面隐藏时暂停主循环；恢复后重新开始计时，只推进单步、不追赶。 */
  function onVisibilityChange() {
    if (!initialized || !dom || !dom.document) return;
    if (dom.document.hidden) {
      stopLoop();
    } else if (state && state.status === STATUS_RUNNING) {
      startLoop();
    }
  }

  function bindEvents() {
    if (eventsBound || !dom) return;
    if (dom.document && typeof dom.document.addEventListener === 'function') {
      dom.document.addEventListener('keydown', onKeyDown);
      dom.document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (dom.restartBtn && typeof dom.restartBtn.addEventListener === 'function') {
      dom.restartBtn.addEventListener('click', onRestartClick);
    }
    eventsBound = true;
  }

  // ============================================================
  // 公开接口：init / getState / reset（架构契约 4.2）
  // ============================================================
  function resolveDom(documentRef) {
    const doc = documentRef || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.getElementById !== 'function') return null;
    return {
      document: doc,
      canvas: doc.getElementById('game-canvas'),
      score: doc.getElementById('score'),
      highScore: doc.getElementById('high-score'),
      overlay: doc.getElementById('overlay'),
      finalScore: doc.getElementById('final-score'),
      finalHighScore: doc.getElementById('final-high-score'),
      restartBtn: doc.getElementById('restart-btn'),
      hint: doc.getElementById('hint'),
    };
  }

  /** 绑定 DOM/键盘、启动主循环；重复调用幂等。 */
  function init(options) {
    if (initialized) return getState();

    const opts = options && typeof options === 'object' ? options : {};
    const nextDom = resolveDom(opts.document);
    if (!nextDom || !nextDom.canvas || typeof nextDom.canvas.getContext !== 'function') {
      return null;
    }
    const nextCtx = nextDom.canvas.getContext('2d');
    if (!nextCtx) return null;

    dom = nextDom;
    ctx = nextCtx;
    if (typeof opts.random === 'function') randomSource = opts.random;

    state = createInitialState(randomSource);
    highScore = 0;
    initialized = true;

    bindEvents();
    syncHud();
    render();
    startLoop();
    return getState();
  }

  /** 返回只读快照（副本，外部修改不影响内部状态）。 */
  function getState() {
    if (!state) return null;
    return {
      snake: state.snake.map(cloneCell),
      food: state.food ? cloneCell(state.food) : null,
      direction: state.direction,
      pendingDirection: state.pendingDirection,
      score: state.score,
      highScore: highScore,
      status: state.status,
    };
  }

  /** 开新局：复位蛇/食物/分数/pendingDirection，保留 highScore，重启主循环。 */
  function reset() {
    if (!initialized) {
      init();
      if (!initialized) return null;
    }
    state = createInitialState(randomSource);
    hideOverlay();
    syncHud();
    render();
    startLoop();
    return getState();
  }

  // 对外契约
  const SnakeGame = Object.freeze({
    init: init,
    getState: getState,
    reset: reset,
    GRID: GRID,
    CELL: CELL,
    TICK_MS: TICK_MS,
  });

  // 传统 script 加载：暴露到 window；若入口页未显式调用 init，则 DOM 就绪后自动启动
  if (global) global.SnakeGame = SnakeGame;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        init();
      });
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : null);
