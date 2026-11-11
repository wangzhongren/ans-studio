/*!
 * 贪吃蛇 · 游戏核心模块（game-core）
 * 文件：src/game.js
 * 职责：纯规则与状态机——移动推进、食物生成、碰撞判定（撞墙 / 撞自身）、计分、结束与重开复位。
 * 约束：不访问 DOM、不引用任何界面状态；仅通过 window.SnakeGame 对外暴露。
 * 公开契约：window.SnakeGame = { createGame(config), reset(), tick(), getState() }
 * 加载方式：经典 <script>（非 ES module），由 index.html 在 src/ui.js 之前加载。
 */
(function (global) {
  'use strict';

  /**
   * 可配置参数集中处：网格尺寸、帧间隔（速度）、蛇初始长度、每个食物的分值。
   * 后续调参只需修改此处或调用 createGame(config) 传入覆盖值。
   */
  var DEFAULT_CONFIG = {
    gridWidth: 20,
    gridHeight: 20,
    initialLength: 3,
    tickIntervalMs: 120,
    pointsPerFood: 1
  };

  /** 方向常量：名称 -> 单位向量；名称同时用于键盘映射与状态展示。 */
  var DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  /** 180° 反向映射：反向输入应被忽略。 */
  var OPPOSITE = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function toInt(value, fallback, min) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < min) {
      return fallback;
    }
    return n;
  }

  /** 归一化配置：接受扁平字段，也兼容 config.grid = { width, height }。 */
  function normalizeConfig(config) {
    var cfg = config || {};
    var grid = cfg.grid || {};
    var gridWidth = toInt(
      cfg.gridWidth != null ? cfg.gridWidth : grid.width,
      DEFAULT_CONFIG.gridWidth,
      5
    );
    var gridHeight = toInt(
      cfg.gridHeight != null ? cfg.gridHeight : grid.height,
      DEFAULT_CONFIG.gridHeight,
      5
    );
    var initialLength = toInt(cfg.initialLength, DEFAULT_CONFIG.initialLength, 2);
    if (initialLength > gridWidth) {
      initialLength = gridWidth;
    }
    var random = typeof cfg.random === 'function' ? cfg.random : Math.random;
    return {
      gridWidth: gridWidth,
      gridHeight: gridHeight,
      initialLength: initialLength,
      tickIntervalMs: toInt(cfg.tickIntervalMs, DEFAULT_CONFIG.tickIntervalMs, 1),
      pointsPerFood: toInt(cfg.pointsPerFood, DEFAULT_CONFIG.pointsPerFood, 1),
      random: random
    };
  }

  /**
   * 创建一局游戏的实例（工厂）。
   * 返回对象暴露 reset / tick / getState / setDirection / getConfig，供 ui.js 调用。
   */
  function createGameInstance(config) {
    var cfg = normalizeConfig(config);
    var state = null;

    function copyCell(cell) {
      return { x: cell.x, y: cell.y };
    }

    function copyConfig() {
      return {
        gridWidth: cfg.gridWidth,
        gridHeight: cfg.gridHeight,
        initialLength: cfg.initialLength,
        tickIntervalMs: cfg.tickIntervalMs,
        pointsPerFood: cfg.pointsPerFood
      };
    }

    /** 收集所有未被蛇身占用的空白格。 */
    function getEmptyCells(snake, grid) {
      var occupied = {};
      var i;
      for (i = 0; i < snake.length; i += 1) {
        occupied[snake[i].x + ',' + snake[i].y] = true;
      }
      var free = [];
      for (var y = 0; y < grid.height; y += 1) {
        for (var x = 0; x < grid.width; x += 1) {
          if (!occupied[x + ',' + y]) {
            free.push({ x: x, y: y });
          }
        }
      }
      return free;
    }

    /** 在空白格中随机生成唯一食物；棋盘已满时返回 null。 */
    function spawnFood(current) {
      var free = getEmptyCells(current.snake, current.grid);
      if (free.length === 0) {
        return null;
      }
      var index = Math.floor(cfg.random() * free.length);
      if (index < 0 || index >= free.length) {
        index = 0;
      }
      return free[index];
    }

    /** 构造初始状态：蛇水平居中朝右、分数 0、未结束、食物随机生成。 */
    function initialState() {
      var headX = Math.max(cfg.initialLength - 1, Math.floor(cfg.gridWidth / 2));
      var headY = Math.floor(cfg.gridHeight / 2);
      var snake = [];
      for (var i = 0; i < cfg.initialLength; i += 1) {
        snake.push({ x: headX - i, y: headY });
      }
      var next = {
        snake: snake,
        direction: 'right',
        pendingDirection: 'right',
        food: null,
        score: 0,
        gameOver: false,
        grid: { width: cfg.gridWidth, height: cfg.gridHeight }
      };
      next.food = spawnFood(next);
      return next;
    }

    /** 对外状态快照（深拷贝，调用方修改不会影响内部状态机）。 */
    function getState() {
      var snake = [];
      for (var i = 0; i < state.snake.length; i += 1) {
        snake.push(copyCell(state.snake[i]));
      }
      return {
        snake: snake,
        food: state.food ? copyCell(state.food) : null,
        score: state.score,
        gameOver: state.gameOver,
        direction: state.direction,
        pendingDirection: state.pendingDirection,
        grid: { width: state.grid.width, height: state.grid.height },
        config: copyConfig()
      };
    }

    function getConfig() {
      return copyConfig();
    }

    /**
     * 设置下一步移动方向。
     * 非法方向与 180° 直接反向被忽略（返回当前状态快照）。
     * 以“本帧待生效方向”为基准判定反向，避免同一帧内连续输入绕过反向限制。
     */
    function setDirection(direction) {
      if (state.gameOver) {
        return getState();
      }
      if (!hasOwn(DIRECTIONS, direction)) {
        return getState();
      }
      var base = state.pendingDirection || state.direction;
      if (OPPOSITE[base] === direction) {
        return getState();
      }
      state.pendingDirection = direction;
      return getState();
    }

    /** 复位：分数归零、蛇回到初始位置与长度、食物重新生成、结束态清除。 */
    function reset() {
      state = initialState();
      return getState();
    }

    /** 推进一帧：移动蛇头、吃食物 +1 分、撞墙或撞自身 -> 结束态。 */
    function tick() {
      if (state.gameOver) {
        return getState();
      }

      var directionName = state.pendingDirection || state.direction;
      var direction = DIRECTIONS[directionName];
      if (!direction) {
        direction = DIRECTIONS[state.direction];
        directionName = state.direction;
      }
      state.direction = directionName;

      var head = state.snake[0];
      var nextX = head.x + direction.x;
      var nextY = head.y + direction.y;

      // 撞墙（边界）判定：越界即结束，蛇头不进入墙外。
      if (nextX < 0 || nextX >= state.grid.width || nextY < 0 || nextY >= state.grid.height) {
        state.gameOver = true;
        return getState();
      }

      var willEat = !!state.food && nextX === state.food.x && nextY === state.food.y;

      // 撞自身判定：吃食物时尾节点保留，需要参与判定；否则尾节点本帧会移开。
      var selfLimit = willEat ? state.snake.length : state.snake.length - 1;
      for (var i = 0; i < selfLimit; i += 1) {
        if (state.snake[i].x === nextX && state.snake[i].y === nextY) {
          state.gameOver = true;
          return getState();
        }
      }

      state.snake.unshift({ x: nextX, y: nextY });

      if (willEat) {
        state.score += cfg.pointsPerFood;
        state.food = spawnFood(state);
      } else {
        state.snake.pop();
      }

      return getState();
    }

    // 初始化本局状态。
    state = initialState();

    return {
      reset: reset,
      tick: tick,
      getState: getState,
      setDirection: setDirection,
      getConfig: getConfig
    };
  }

  /**
   * 模块级默认实例管理：保证 window.SnakeGame 上的便捷方法始终有可操作的局。
   */
  var instance = null;

  function ensureInstance() {
    if (!instance) {
      instance = createGameInstance();
    }
    return instance;
  }

  var SnakeGame = {
    /** 创建并返回新的游戏状态对象（蛇、食物、分数、结束标记、网格尺寸）。 */
    createGame: function (config) {
      instance = createGameInstance(config);
      return instance;
    },
    /** 复位当前局：分数归零、蛇与食物复位、结束态清除。 */
    reset: function () {
      return ensureInstance().reset();
    },
    /** 推进一帧并返回新状态。 */
    tick: function () {
      return ensureInstance().tick();
    },
    /** 返回当前状态快照。 */
    getState: function () {
      return ensureInstance().getState();
    },
    /** 设置移动方向（忽略非法方向与 180° 反向）。 */
    setDirection: function (direction) {
      return ensureInstance().setDirection(direction);
    },
    /** 当前局的可配置参数副本（供界面层读取速度等）。 */
    getConfig: function () {
      return ensureInstance().getConfig();
    },
    /** 配置与方向常量，供界面层映射键盘与读取默认值。 */
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    DIRECTIONS: DIRECTIONS
  };

  global.SnakeGame = SnakeGame;
}(typeof globalThis !== 'undefined' ? globalThis : this));
