/*!
 * game-core 自测脚本（开发自测用，不属于运行时装配；index.html 不装载本文件）
 *
 * 浏览器：先装载 game-core.js，再装载本文件，然后在控制台调用 runCoreSelfTest()
 * Node：  node src/core/self-test.js   （零依赖，进程退出码非 0 表示有断言失败）
 *
 * 覆盖：初始状态、方向队列与反向过滤、逐 tick 推进、吃食物 +1 分与增长 1 格、
 *       撞墙（触及/越过）立即 over、撞自身、尾格让出、重开清零重置、快照只读、
 *       注入 RNG 复现同一局、满屏无空格不崩溃。
 */

'use strict';

/* 取得 game-core API：浏览器取全局 SnakeCore，Node 下 require 同目录 game-core.js */
function coreSelfTestApi() {
  if (typeof SnakeCore !== 'undefined' && SnakeCore && typeof SnakeCore.createGame === 'function') {
    return SnakeCore;
  }
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    return require('./game-core.js');
  }
  throw new Error('game-core 尚未加载：请先装载 src/core/game-core.js');
}

function runCoreSelfTest() {
  var api = coreSelfTestApi();
  var results = [];
  var checkCount = 0;

  function check(name, condition, detail) {
    results.push({
      name: name,
      pass: !!condition,
      detail: condition ? '' : (detail || '断言失败')
    });
  }

  function cell(x, y) {
    return { x: x, y: y };
  }

  function sameCell(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y;
  }

  function onSnake(snake, point) {
    for (var i = 0; i < snake.length; i += 1) {
      if (sameCell(snake[i], point)) {
        return true;
      }
    }
    return false;
  }

  function foodIsOnEmptyCell(game) {
    var s = api.snapshot(game);
    if (s.food === null) {
      return s.snake.length === s.cols * s.rows; /* 只有满屏才允许无食物 */
    }
    if (s.food.x < 0 || s.food.x >= s.cols || s.food.y < 0 || s.food.y >= s.rows) {
      return false;
    }
    return !onSnake(s.snake, s.food);
  }

  function fixedRng(value) {
    return function () {
      return value;
    };
  }

  function sequenceRng(values) {
    var index = 0;
    return function () {
      var v = values[index % values.length];
      index += 1;
      return v;
    };
  }

  /* ---------- 1. 初始状态 ---------- */
  var g = api.createGame();
  var s = api.snapshot(g);
  check('初始 cols=20', s.cols === 20, 'cols=' + s.cols);
  check('初始 rows=20', s.rows === 20, 'rows=' + s.rows);
  check('初始长度 3', s.snake.length === 3, 'length=' + s.snake.length);
  check('初始方向 right', s.dir === 'right', 'dir=' + s.dir);
  check('初始分数 0', s.score === 0, 'score=' + s.score);
  check('初始状态 running', s.status === 'running', 'status=' + s.status);
  check('初始居中', sameCell(s.snake[0], cell(10, 10))
    && sameCell(s.snake[1], cell(9, 10))
    && sameCell(s.snake[2], cell(8, 10)),
  JSON.stringify(s.snake));
  check('初始食物在空格', s.food !== null && foodIsOnEmptyCell(g), JSON.stringify(s.food));

  /* ---------- 2. 方向队列：反向过滤 / 先到先得 / 重复同向 / 非法值 ---------- */
  var q = api.createGame();
  api.queueDirection(q, 'left'); /* right 的反向 → 忽略 */
  check('反向输入被过滤', q.pendingDir === null, 'pendingDir=' + q.pendingDir);
  api.queueDirection(q, 'up');
  check('合法方向入队', q.pendingDir === 'up', 'pendingDir=' + q.pendingDir);
  api.queueDirection(q, 'down');
  check('已有待处理方向时后续输入忽略（先到先得）', q.pendingDir === 'up', 'pendingDir=' + q.pendingDir);
  api.stepGame(q);
  check('下一 tick 应用队列方向', q.dir === 'up' && q.pendingDir === null, 'dir=' + q.dir);
  check('应用方向后蛇头前进一格', sameCell(api.snapshot(q).snake[0], cell(10, 9)), JSON.stringify(api.snapshot(q).snake[0]));
  var dup = api.createGame();
  api.queueDirection(dup, 'right');
  check('重复同向忽略', dup.pendingDir === null, 'pendingDir=' + dup.pendingDir);
  var bad = api.createGame();
  api.queueDirection(bad, 'diagonal');
  api.queueDirection(bad, 'toString');
  api.queueDirection(bad, '');
  check('非法方向忽略', bad.pendingDir === null, 'pendingDir=' + bad.pendingDir);

  /* ---------- 3. 逐 tick 推进 ---------- */
  var mover = api.createGame({ rng: fixedRng(0) });
  api.stepGame(mover);
  api.stepGame(mover);
  var ms = api.snapshot(mover);
  check('两 tick 后蛇头 x=12', ms.snake[0].x === 12 && ms.snake[0].y === 10, JSON.stringify(ms.snake[0]));
  check('未吃食物时长度不变', ms.snake.length === 3, 'length=' + ms.snake.length);
  check('未吃食物时分数不变', ms.score === 0, 'score=' + ms.score);

  /* ---------- 4. 吃食物：+1 分、增长 1 格、重新生成 ---------- */
  var eater = api.createGame({ rng: fixedRng(0) });
  eater.food = cell(11, 10); /* 白盒放置：正前方 */
  var beforeLength = eater.snake.length;
  api.stepGame(eater);
  var es = api.snapshot(eater);
  check('吃食物分数 +1', es.score === 1, 'score=' + es.score);
  check('吃食物长度 +1', es.snake.length === beforeLength + 1, 'length=' + es.snake.length);
  check('吃食物后蛇头落在原食物格', sameCell(es.snake[0], cell(11, 10)), JSON.stringify(es.snake[0]));
  check('吃食物后食物在空格重新生成', es.food !== null && foodIsOnEmptyCell(eater), JSON.stringify(es.food));
  check('吃食物后仍为 running', es.status === 'running', 'status=' + es.status);

  /* ---------- 5. 撞墙：触及/越过 → 立即 over 且不再推进 ---------- */
  var wall = api.createGame({ cols: 5, rows: 5, rng: fixedRng(0) });
  var wallGuard = 0;
  while (wall.status === 'running' && wallGuard < 20) {
    api.stepGame(wall);
    wallGuard += 1;
  }
  var ws = api.snapshot(wall);
  check('撞墙后 status=over', ws.status === 'over', 'status=' + ws.status);
  check('撞墙后 gameOver=true', wall.gameOver === true, 'gameOver=' + wall.gameOver);
  check('撞墙时蛇头停在边界内最后一格', sameCell(ws.snake[0], cell(4, 2)), JSON.stringify(ws.snake[0]));
  var wallSnapBefore = JSON.stringify(ws);
  api.stepGame(wall);
  check('结束态不再推进', JSON.stringify(api.snapshot(wall)) === wallSnapBefore);
  api.queueDirection(wall, 'up');
  check('结束态 queueDirection 无效', wall.pendingDir === null, 'pendingDir=' + wall.pendingDir);

  /* 立即撞墙（初始长度即贴边）：列数 3 时蛇头在 x=1 仍可安全测试越界语义 */
  var wall2 = api.createGame({ cols: 20, rows: 20, rng: fixedRng(0) });
  wall2.snake = [cell(19, 5), cell(18, 5), cell(17, 5)];
  wall2.dir = 'right';
  wall2.food = cell(0, 0);
  api.stepGame(wall2);
  check('越过右边界立即结束', wall2.status === 'over', 'status=' + wall2.status);

  /* ---------- 6. 撞自身与尾格让出 ---------- */
  var selfHit = api.createGame({ cols: 8, rows: 8, rng: fixedRng(0) });
  selfHit.snake = [cell(2, 2), cell(3, 2), cell(3, 3), cell(2, 3)];
  selfHit.dir = 'right';
  selfHit.food = cell(7, 7);
  api.stepGame(selfHit);
  check('撞自身立即结束', selfHit.status === 'over' && selfHit.gameOver === true, 'status=' + selfHit.status);

  var tailFollow = api.createGame({ cols: 8, rows: 8, rng: fixedRng(0) });
  tailFollow.snake = [cell(2, 2), cell(2, 3), cell(3, 3), cell(3, 2)];
  tailFollow.dir = 'right';
  tailFollow.food = cell(7, 7);
  api.stepGame(tailFollow);
  check('进入下一步将让出的尾格不算撞自身', tailFollow.status === 'running', 'status=' + tailFollow.status);
  check('尾格让出后长度不变', api.snapshot(tailFollow).snake.length === 4, 'length=' + api.snapshot(tailFollow).snake.length);

  /* ---------- 7. 重开：清零、复位、重新生成、清除结束态 ---------- */
  var ending = api.createGame({ cols: 5, rows: 5, rng: fixedRng(0) });
  ending.food = cell(3, 2);
  api.stepGame(ending); /* 吃一个食物 */
  while (ending.status === 'running') {
    api.stepGame(ending);
  }
  var scoreBeforeReset = ending.score;
  check('重开前有得分且已结束', scoreBeforeReset === 1 && ending.status === 'over', 'score=' + scoreBeforeReset);
  api.resetGame(ending);
  var rs = api.snapshot(ending);
  check('重开后分数清零', rs.score === 0, 'score=' + rs.score);
  check('重开后蛇身复位（长度 3、居中）', rs.snake.length === 3 && sameCell(rs.snake[0], cell(2, 2))
    && sameCell(rs.snake[1], cell(1, 2)) && sameCell(rs.snake[2], cell(0, 2)), JSON.stringify(rs.snake));
  check('重开后方向复位 right', rs.dir === 'right', 'dir=' + rs.dir);
  check('重开后 status=running', rs.status === 'running', 'status=' + rs.status);
  check('重开后 gameOver=false', ending.gameOver === false, 'gameOver=' + ending.gameOver);
  check('重开后食物重新生成在空格', rs.food !== null && foodIsOnEmptyCell(ending), JSON.stringify(rs.food));

  /* ---------- 8. 快照只读 ---------- */
  var frozen = api.createGame({ rng: fixedRng(0) });
  var fsnap = api.snapshot(frozen);
  check('快照本体冻结', Object.isFrozen(fsnap));
  check('快照 snake 数组冻结', Object.isFrozen(fsnap.snake));
  check('快照蛇身格子冻结', Object.isFrozen(fsnap.snake[0]) && Object.isFrozen(fsnap.snake[1]));
  check('快照食物冻结', fsnap.food === null || Object.isFrozen(fsnap.food));
  var mutateBlocked = false;
  try {
    fsnap.score = 999;
    fsnap.snake[0].x = 0;
  } catch (error) {
    mutateBlocked = true;
  }
  check('写入快照被拒绝（严格模式抛错）', mutateBlocked);
  var afterMutation = api.snapshot(frozen);
  check('写入快照不影响内部状态', afterMutation.score === 0 && sameCell(afterMutation.snake[0], cell(10, 10)),
  'score=' + afterMutation.score + ' head=' + JSON.stringify(afterMutation.snake[0]));

  /* ---------- 9. 注入 RNG 复现同一局 ---------- */
  function playScripted(game) {
    api.stepGame(game);
    api.queueDirection(game, 'up');
    api.stepGame(game);
    api.queueDirection(game, 'left');
    api.stepGame(game);
    api.queueDirection(game, 'down');
    api.stepGame(game);
    return JSON.stringify(api.snapshot(game));
  }

  var a = api.createGame({ rng: sequenceRng([0.9, 0.1, 0.5, 0.0, 0.3, 0.7]) });
  var b = api.createGame({ rng: sequenceRng([0.9, 0.1, 0.5, 0.0, 0.3, 0.7]) });
  var traceA = playScripted(a);
  var traceB = playScripted(b);
  check('注入同一 RNG 序列得到同一局', traceA === traceB, traceA + ' vs ' + traceB);
  check('注入 RNG 下食物仍不在蛇身', foodIsOnEmptyCell(a), JSON.stringify(api.snapshot(a).food));

  /* ---------- 10. 满屏无空格不崩溃 ---------- */
  var full = api.createGame({ cols: 2, rows: 2, initialLength: 2, rng: fixedRng(0) });
  full.snake = [cell(0, 0), cell(1, 0), cell(1, 1)];
  full.dir = 'down';
  full.food = cell(0, 1);
  api.stepGame(full); /* 吃到最后一格 → 满屏 */
  var fullSnap = api.snapshot(full);
  check('吃满最后一格：长度=4、分数=1、food=null', fullSnap.snake.length === 4 && fullSnap.score === 1 && fullSnap.food === null,
  'len=' + fullSnap.snake.length + ' score=' + fullSnap.score + ' food=' + JSON.stringify(fullSnap.food));
  api.stepGame(full); /* 满屏继续推进（进入让出的尾格），不崩溃 */
  check('满屏继续推进不崩溃', api.snapshot(full).status === 'running' || api.snapshot(full).status === 'over',
  'status=' + api.snapshot(full).status);

  /* ---------- 汇总 ---------- */
  checkCount = results.length;
  var failedList = [];
  var i;
  for (i = 0; i < results.length; i += 1) {
    if (!results[i].pass) {
      failedList.push(results[i]);
    }
  }
  return {
    total: checkCount,
    passed: checkCount - failedList.length,
    failed: failedList.length,
    results: results
  };
}

/* Node 下自动运行并打印结果（浏览器不自动运行，避免污染页面） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runCoreSelfTest: runCoreSelfTest };

  if (typeof console !== 'undefined' && console.log) {
    var coreSelfTestReport = runCoreSelfTest();
    var index;
    for (index = 0; index < coreSelfTestReport.results.length; index += 1) {
      var item = coreSelfTestReport.results[index];
      if (!item.pass) {
        console.log('FAIL  ' + item.name + '  ' + item.detail);
      }
    }
    console.log('[game-core self-test] total=' + coreSelfTestReport.total
      + ' passed=' + coreSelfTestReport.passed
      + ' failed=' + coreSelfTestReport.failed);
    if (coreSelfTestReport.failed > 0 && typeof process !== 'undefined') {
      process.exitCode = 1;
    }
  }
}
