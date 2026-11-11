(function (global) {
  'use strict';

  var COLS = 20;
  var ROWS = 20;
  var CELL = 20;
  var STEP_MS = 120;

  var UP = { x: 0, y: -1 };
  var DOWN = { x: 0, y: 1 };
  var LEFT = { x: -1, y: 0 };
  var RIGHT = { x: 1, y: 0 };

  var els = null;
  var ctx = null;
  var initialized = false;
  var renderLoopStarted = false;

  var state = 'ready';
  var snake = [];
  var direction = RIGHT;
  var nextDirection = RIGHT;
  var food = null;
  var score = 0;
  var timerId = null;

  function cacheElements() {
    els = {
      canvas: document.getElementById('game'),
      score: document.getElementById('score'),
      status: document.getElementById('status'),
      overlay: document.getElementById('overlay'),
      restart: document.getElementById('restart'),
      finalScore: document.getElementById('final-score')
    };
    if (!els.canvas || typeof els.canvas.getContext !== 'function') {
      els = null;
      ctx = null;
      return false;
    }
    ctx = els.canvas.getContext('2d');
    return Boolean(ctx);
  }

  function statusText() {
    if (state === 'running') return '进行中';
    if (state === 'gameover') return '游戏结束';
    return '就绪';
  }

  function syncHud() {
    if (!els) return;
    if (els.score) els.score.textContent = String(score);
    if (els.status) els.status.textContent = statusText();
  }

  function hideOverlay() {
    if (!els) return;
    if (els.overlay) els.overlay.hidden = true;
    if (els.finalScore) els.finalScore.textContent = '0';
  }

  function showOverlay() {
    if (!els) return;
    if (els.finalScore) els.finalScore.textContent = String(score);
    if (els.overlay) els.overlay.hidden = false;
  }

  function spawnFood() {
    var occupied = {};
    var i;
    for (i = 0; i < snake.length; i += 1) {
      occupied[snake[i].x + ',' + snake[i].y] = true;
    }
    var cells = [];
    var x;
    var y;
    for (y = 0; y < ROWS; y += 1) {
      for (x = 0; x < COLS; x += 1) {
        if (!occupied[x + ',' + y]) {
          cells.push({ x: x, y: y });
        }
      }
    }
    if (cells.length === 0) {
      food = null;
      return false;
    }
    food = cells[Math.floor(Math.random() * cells.length)];
    return true;
  }

  function clearTimer() {
    if (timerId !== null) {
      global.clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    clearTimer();
    timerId = global.setInterval(step, STEP_MS);
  }

  function resetRound() {
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ];
    direction = RIGHT;
    nextDirection = RIGHT;
    score = 0;
    state = 'ready';
    food = null;
    spawnFood();
    hideOverlay();
    syncHud();
    render();
  }

  function endGame() {
    clearTimer();
    state = 'gameover';
    showOverlay();
    syncHud();
    render();
  }

  function start() {
    if (!initialized) {
      init();
      return;
    }
    if (state !== 'ready') return;
    state = 'running';
    syncHud();
    render();
    startTimer();
  }

  function restart() {
    if (!initialized) {
      init();
      return;
    }
    clearTimer();
    resetRound();
    startTimer();
  }

  function step() {
    if (!initialized || state === 'gameover') return;

    if (state === 'ready') {
      state = 'running';
      syncHud();
    }

    direction = nextDirection;

    var head = snake[0];
    var nx = head.x + direction.x;
    var ny = head.y + direction.y;

    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      endGame();
      return;
    }

    var eating = Boolean(food) && nx === food.x && ny === food.y;
    var limit = eating ? snake.length : snake.length - 1;
    var i;
    for (i = 0; i < limit; i += 1) {
      if (snake[i].x === nx && snake[i].y === ny) {
        endGame();
        return;
      }
    }

    snake.unshift({ x: nx, y: ny });
    if (eating) {
      score += 1;
      if (!spawnFood()) {
        endGame();
        return;
      }
    } else {
      snake.pop();
    }
    render();
  }

  function onKey(event) {
    if (!event) return;
    var key = typeof event.key === 'string' ? event.key.toLowerCase() : '';

    var dir = null;
    if (key === 'arrowup' || key === 'w') dir = UP;
    else if (key === 'arrowdown' || key === 's') dir = DOWN;
    else if (key === 'arrowleft' || key === 'a') dir = LEFT;
    else if (key === 'arrowright' || key === 'd') dir = RIGHT;

    if (dir) {
      if (event.preventDefault) event.preventDefault();
      if (state === 'gameover') return;
      if (dir.x + direction.x === 0 && dir.y + direction.y === 0) return;
      nextDirection = dir;
      return;
    }

    if (key === ' ' || key === 'spacebar' || key === 'enter') {
      if (state === 'gameover') {
        if (event.preventDefault) event.preventDefault();
        restart();
      }
    }
  }

  function drawGrid(width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    var x;
    var y;
    for (x = 1; x < COLS; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, height);
      ctx.stroke();
    }
    for (y = 1; y < ROWS; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(width, y * CELL + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFood() {
    if (!food) return;
    var cx = food.x * CELL + CELL / 2;
    var cy = food.y * CELL + CELL / 2;
    ctx.save();
    ctx.fillStyle = '#f87171';
    ctx.shadowColor = 'rgba(248, 113, 113, 0.65)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake() {
    var i;
    for (i = snake.length - 1; i >= 0; i -= 1) {
      var seg = snake[i];
      var isHead = i === 0;
      var pad = isHead ? 1 : 2;
      var size = CELL - pad * 2;
      var left = seg.x * CELL + pad;
      var top = seg.y * CELL + pad;
      ctx.save();
      ctx.fillStyle = isHead ? '#4ade80' : '#16a34a';
      ctx.fillRect(left, top, size, size);
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);
      ctx.restore();
    }
  }

  function render() {
    if (!ctx || !els) return;
    var width = els.canvas.width || COLS * CELL;
    var height = els.canvas.height || ROWS * CELL;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, width, height);

    drawGrid(width, height);
    drawFood();
    drawSnake();

    syncHud();
  }

  function startRenderLoop() {
    if (renderLoopStarted) return;
    renderLoopStarted = true;
    if (typeof global.requestAnimationFrame !== 'function') {
      render();
      return;
    }
    function frame() {
      render();
      global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
  }

  function bindEvents() {
    if (els.restart) {
      els.restart.addEventListener('click', function () {
        restart();
      });
    }
    global.addEventListener('keydown', onKey);
  }

  function init() {
    if (initialized) return;
    if (!cacheElements()) return;
    initialized = true;
    bindEvents();
    restart();
    startRenderLoop();
  }

  global.Game = {
    init: init,
    start: start,
    restart: restart,
    step: step,
    render: render,
    onKey: onKey
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : this);
