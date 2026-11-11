/*!
 * game-core —— snake-game 规则层（模块 game-core，属主 game-logic）
 *
 * 纯状态机：不触碰 DOM / window / 计时器 / 渲染 / 网络；零依赖、零构建。
 * 以普通 <script> 按序装载即可使用（非 ES module、无 import/fetch/CDN）。
 *
 * 公开 API（docs/contracts/snake-game-architecture-v1.md §4.1）：
 *   createGame(config)        -> game
 *   queueDirection(game, dir) -> game
 *   stepGame(game)            -> game
 *   resetGame(game)           -> game
 *   snapshot(game)            -> 只读快照 {cols, rows, snake, dir, food, score, status}
 *
 * 普通脚本装载后上述函数即为全局函数（顶层函数声明），同时以全局对象
 * `SnakeCore` 暴露同一组函数，装配层可任选一种方式取用。
 *
 * 规则要点：
 *   - 网格 cols×rows（默认 20×20），坐标以格为单位，渲染缩放由渲染层负责。
 *   - 蛇身数组 snake[0] 为蛇头，初始长度 3、居中、初始向右。
 *   - 方向队列最多保留 1 个待处理方向（先到先得）；相对当前生效方向过滤 180° 反向。
 *   - 每 tick 由调用方驱动 stepGame 推进一格（节奏由 app-entry 的 130ms 固定 tick 决定）。
 *   - 吃食物：长度 +1、score +1、在空格重新生成食物。
 *   - 撞墙：新蛇头坐标越出 0..cols-1 / 0..rows-1 任一方向（触及即越界）→ status='over'；
 *     撞自身（不含下一步将让出的尾格）同样 → status='over'。
 *   - 结束态（status==='over'，同时 game.gameOver=true）不再推进、queueDirection 无效。
 *   - 满屏（蛇占满全部格子）时无空格可放食物：food=null，游戏不崩溃；
 *     之后按正常规则继续推进，直至撞墙/撞自身结束。
 */

'use strict';

/* ---------- 内部常量与工具（带前缀，避免污染全局名字） ---------- */

var CORE_VECTORS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 })
});

var CORE_OPPOSITES = Object.freeze({
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left'
});

/* 是否为合法方向字符串（只认自有键，避免 'toString' 之类命中原型） */
function coreIsDirection(dir) {
  return typeof dir === 'string' && Object.prototype.hasOwnProperty.call(CORE_VECTORS, dir);
}

/* 正整数配置项：非法/缺省时用 fallback */
function coreToPositiveInt(value, fallback) {
  var n = typeof value === 'number' ? value : NaN;
  if (!isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.floor(n);
}

/* 构造初始蛇身：头部居中，身体向左延伸；返回 [头, ...] 的普通格子数组 */
function coreInitialSnake(cols, rows, initialLength) {
  var length = initialLength;
  if (length > cols) {
    length = cols; /* 水平摆放需要放得下；默认 20×20/长度 3 不触发 */
  }
  if (length < 1) {
    length = 1;
  }
  var headX = Math.floor(cols / 2);
  if (headX < length - 1) {
    headX = length - 1;
  }
  if (headX > cols - 1) {
    headX = cols - 1;
  }
  var headY = Math.floor(rows / 2);
  if (headY > rows - 1) {
    headY = rows - 1;
  }
  var snake = [];
  for (var i = 0; i < length; i += 1) {
    snake.push({ x: headX - i, y: headY });
  }
  return snake;
}

/* 在空格中随机放置食物（用注入的 rng）；满屏时 food=null，不崩溃 */
function coreSpawnFood(game) {
  var cols = game.cols;
  var rows = game.rows;
  var total = cols * rows;
  var occupied = [];
  var i;
  for (i = 0; i < total; i += 1) {
    occupied.push(false);
  }
  for (i = 0; i < game.snake.length; i += 1) {
    var seg = game.snake[i];
    if (seg.x >= 0 && seg.x < cols && seg.y >= 0 && seg.y < rows) {
      occupied[seg.y * cols + seg.x] = true;
    }
  }

  var empties = [];
  var x;
  var y;
  for (y = 0; y < rows; y += 1) {
    for (x = 0; x < cols; x += 1) {
      if (!occupied[y * cols + x]) {
        empties.push({ x: x, y: y });
      }
    }
  }

  if (empties.length === 0) {
    game.food = null;
    return;
  }

  var r = Number(game.rng());
  if (!isFinite(r) || r < 0) {
    r = 0;
  }
  if (r >= 1) {
    r = 0.9999999999;
  }
  var index = Math.floor(r * empties.length);
  if (index < 0) {
    index = 0;
  }
  if (index > empties.length - 1) {
    index = empties.length - 1;
  }
  game.food = empties[index];
}

/* 复位到「新开局」状态：分数/蛇身/方向/状态/食物全部重置（供 createGame 与 resetGame 共用） */
function coreResetState(game) {
  game.score = 0;
  game.dir = 'right';
  game.pendingDir = null;
  game.status = 'running';
  game.gameOver = false;
  game.snake = coreInitialSnake(game.cols, game.rows, game.initialLength);
  coreSpawnFood(game);
}

/* ---------- 公开 API ---------- */

/**
 * 创建一局新游戏。
 * @param {Object} [config] {cols=20, rows=20, initialLength=3, rng=Math.random}
 * @returns {Object} game 状态对象（只通过 snapshot 对外暴露只读视图）
 */
function createGame(config) {
  var cfg = config || {};
  var cols = coreToPositiveInt(cfg.cols, 20);
  var rows = coreToPositiveInt(cfg.rows, 20);
  var initialLength = coreToPositiveInt(cfg.initialLength, 3);
  if (initialLength > cols) {
    initialLength = cols;
  }
  var rng = typeof cfg.rng === 'function' ? cfg.rng : Math.random;

  var game = {
    cols: cols,
    rows: rows,
    initialLength: initialLength,
    rng: rng,
    snake: [],
    dir: 'right',
    pendingDir: null,
    food: null,
    score: 0,
    status: 'running',
    gameOver: false
  };

  coreResetState(game);
  return game;
}

/**
 * 排队一个方向意图。相对当前生效方向过滤 180° 反向；最多保留 1 个待处理方向
 * （先到先得，后续输入在本次 tick 应用前一律忽略；重复同向忽略）；
 * 结束态或非法方向直接忽略。
 * @returns {Object} game（便于链式调用）
 */
function queueDirection(game, dir) {
  if (!game || game.status !== 'running') {
    return game;
  }
  if (!coreIsDirection(dir)) {
    return game;
  }
  if (game.pendingDir !== null) {
    return game; /* 先到先得：已有待处理方向，本次输入忽略 */
  }
  if (dir === game.dir) {
    return game; /* 重复同向忽略 */
  }
  if (CORE_OPPOSITES[dir] === game.dir) {
    return game; /* 180° 反向过滤（相对当前生效方向） */
  }
  game.pendingDir = dir;
  return game;
}

/**
 * 推进一格：先应用待处理方向，再移动蛇头；撞墙/撞自身 → status='over' 且不移动。
 * 落在食物格 → 长度 +1、score +1、在空格重新生成食物。
 * 非 running 状态调用为空操作。
 * @returns {Object} game
 */
function stepGame(game) {
  if (!game || game.status !== 'running') {
    return game;
  }

  if (game.pendingDir !== null) {
    game.dir = game.pendingDir;
    game.pendingDir = null;
  }

  var vector = CORE_VECTORS[game.dir];
  var head = game.snake[0];
  var nextX = head.x + vector.x;
  var nextY = head.y + vector.y;

  /* 撞墙：触及或越过边界（新蛇头坐标越出网格） */
  if (nextX < 0 || nextX >= game.cols || nextY < 0 || nextY >= game.rows) {
    game.status = 'over';
    game.gameOver = true;
    return game;
  }

  var eating = !!game.food && game.food.x === nextX && game.food.y === nextY;

  /* 撞自身：未吃食物时尾格会在同一 tick 让出，可进入 */
  var limit = eating ? game.snake.length : game.snake.length - 1;
  for (var i = 0; i < limit; i += 1) {
    if (game.snake[i].x === nextX && game.snake[i].y === nextY) {
      game.status = 'over';
      game.gameOver = true;
      return game;
    }
  }

  var newSnake = [{ x: nextX, y: nextY }];
  var keep = eating ? game.snake.length : game.snake.length - 1;
  for (var j = 0; j < keep; j += 1) {
    newSnake.push({ x: game.snake[j].x, y: game.snake[j].y });
  }
  game.snake = newSnake;

  if (eating) {
    game.score += 1;
    coreSpawnFood(game);
  }

  return game;
}

/**
 * 重开：分数清零、蛇身回到初始长度与位置、方向回初始、状态回 running、食物重新生成。
 * @returns {Object} game
 */
function resetGame(game) {
  if (!game) {
    return game;
  }
  coreResetState(game);
  return game;
}

/**
 * 只读快照：深冻结的纯数据副本，渲染层与测试只读该对象，不接触内部状态。
 * @returns {{cols:number, rows:number, snake:Array<{x:number,y:number}>, dir:string, food:{x:number,y:number}|null, score:number, status:string}}
 */
function snapshot(game) {
  var snake = [];
  var i;
  for (i = 0; i < game.snake.length; i += 1) {
    snake.push(Object.freeze({ x: game.snake[i].x, y: game.snake[i].y }));
  }
  var food = game.food
    ? Object.freeze({ x: game.food.x, y: game.food.y })
    : null;

  return Object.freeze({
    cols: game.cols,
    rows: game.rows,
    snake: Object.freeze(snake),
    dir: game.dir,
    food: food,
    score: game.score,
    status: game.status
  });
}

/* ---------- 全局暴露（普通脚本，无需 window） ---------- */

var SnakeCore = Object.freeze({
  createGame: createGame,
  queueDirection: queueDirection,
  stepGame: stepGame,
  resetGame: resetGame,
  snapshot: snapshot
});

/* Node 下可作为 CommonJS 模块加载（仅用于自测；浏览器不依赖） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SnakeCore;
}
