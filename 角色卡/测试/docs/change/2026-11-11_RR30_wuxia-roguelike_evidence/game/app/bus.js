/**
 * game/app/bus.js
 * 模块：loop-app · 事件总线（挂 WX.App.Bus）
 *
 * 职责（架构契约 §5.4）：跨模块唯一通道，实现最小 pub/sub：on / off / once / emit / clear。
 * 只放行契约冻结的事件名；领域模块与 UI 都经同一总线通信，App 负责订阅与转交。
 *
 * 硬约束：经典 IIFE，无 ES Module / fetch / 外部依赖；不操作 DOM。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var App = WX.App || (WX.App = {});

  /**
   * 架构契约 v1 §5.4 冻结事件名。新增事件必须走架构新版本，不在此处私自扩展。
   */
  var EVENT_NAMES = [
    'enemy:killed',
    'exp:pickup',
    'level:up',
    'upgrade:chosen',
    'player:hp-changed',
    'wave:started',
    'wave:cleared',
    'run:ended',
    'run:restart'
  ];

  var EVENT_SET = Object.create(null);
  for (var i = 0; i < EVENT_NAMES.length; i += 1) {
    EVENT_SET[EVENT_NAMES[i]] = true;
  }

  function createBus(options) {
    options = options || {};
    var strict = options.strict === true;
    var handlers = Object.create(null);
    var bus = null;

    function listFor(name, create) {
      var list = handlers[name];
      if (!list && create) {
        list = [];
        handlers[name] = list;
      }
      return list || null;
    }

    function warnUnknown(name) {
      if (strict) {
        throw new Error('[WX.App.Bus] 未登记事件：' + name + '（架构契约 §5.4 冻结）');
      }
      if (global.console && typeof global.console.warn === 'function') {
        global.console.warn('[WX.App.Bus] 未登记事件（请走架构新版本）：' + name);
      }
    }

    function on(name, fn) {
      if (typeof fn !== 'function' || !name) { return function () {}; }
      if (!EVENT_SET[name]) { warnUnknown(name); }
      var list = listFor(name, true);
      list.push(fn);
      return function offOne() { off(name, fn); };
    }

    function once(name, fn) {
      if (typeof fn !== 'function' || !name) { return function () {}; }
      var wrapper = function (payload) {
        off(name, wrapper);
        fn(payload);
      };
      return on(name, wrapper);
    }

    function off(name, fn) {
      if (!name) { return false; }
      var list = handlers[name];
      if (!list || list.length === 0) { return false; }
      if (typeof fn !== 'function') {
        handlers[name] = [];
        return true;
      }
      for (var i = list.length - 1; i >= 0; i -= 1) {
        if (list[i] === fn) {
          list.splice(i, 1);
          return true;
        }
      }
      return false;
    }

    function emit(name, payload) {
      if (!name) { return 0; }
      if (!EVENT_SET[name]) { warnUnknown(name); }
      var list = handlers[name];
      if (!list || list.length === 0) { return 0; }
      /* 快照遍历：允许监听器在回调中 off/on，不影响本轮回放。 */
      var snapshot = list.slice();
      var called = 0;
      for (var i = 0; i < snapshot.length; i += 1) {
        try {
          snapshot[i](payload);
          called += 1;
        } catch (error) {
          /* 单个监听器异常不阻断主循环与其他订阅者；错误如实打到控制台。 */
          if (global.console && typeof global.console.error === 'function') {
            global.console.error('[WX.App.Bus] 监听器异常：' + name, error);
          }
        }
      }
      return called;
    }

    function clear(name) {
      if (name) {
        handlers[name] = [];
        return;
      }
      handlers = Object.create(null);
    }

    function listenerCount(name) {
      var list = handlers[name];
      return list ? list.length : 0;
    }

    bus = {
      on: on,
      off: off,
      once: once,
      emit: emit,
      clear: clear,
      listenerCount: listenerCount,
      events: EVENT_NAMES.slice()
    };

    return bus;
  }

  function isKnownEvent(name) {
    return EVENT_SET[name] === true;
  }

  App.Bus = {
    create: createBus,
    isKnownEvent: isKnownEvent,
    EVENT_NAMES: EVENT_NAMES.slice()
  };

  WX.App = App;
})(typeof window !== 'undefined' ? window : this);
