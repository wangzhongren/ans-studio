// 纯展示组件：临时浏览与已选引擎分离，业务提交由 renderer 提供。
(function (root) {
  "use strict";
  function placement(rect, viewport, width, height) {
    var margin = 8, gap = 6;
    var below = Math.max(1, viewport.height - rect.bottom - gap - margin);
    var above = Math.max(1, rect.top - gap - margin);
    var down = below >= height || below >= above;
    var maxHeight = Math.min(Math.max(1, viewport.height - margin * 2), down ? below : above);
    var actualHeight = Math.min(height, maxHeight);
    return { left: Math.max(margin, Math.min(rect.left, viewport.width - width - margin)),
      top: Math.max(margin, Math.min(down ? rect.bottom + gap : rect.top - gap - actualHeight, viewport.height - margin - actualHeight)),
      maxHeight: maxHeight, down: down };
  }
  function create(trigger, menu, onCommit) {
    var options = Array.prototype.slice.call(menu.querySelectorAll('[role="option"]'));
    var selected = 0, active = 0, opened = false;
    function paint() {
      var option = options[selected], label = option.querySelector(".engine-option-name").textContent;
      trigger.value = option.dataset.runtime;
      trigger.querySelector(".engine-value").textContent = label;
      trigger.title = label;
      trigger.setAttribute("aria-label", "会话引擎，当前 " + label);
      trigger.setAttribute("aria-expanded", String(opened));
      trigger.setAttribute("aria-disabled", String(trigger.disabled));
      if (opened) trigger.setAttribute("aria-activedescendant", options[active].id);
      else trigger.removeAttribute("aria-activedescendant");
      options.forEach(function (item, index) {
        item.setAttribute("aria-selected", String(index === selected));
        item.classList.toggle("active", opened && index === active);
        item.title = item.querySelector(".engine-option-name").textContent;
      });
    }
    function visibleActive() {
      if (!opened) return;
      var item = options[active], top = item.offsetTop, bottom = top + item.offsetHeight;
      if (top < menu.scrollTop) menu.scrollTop = top;
      else if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
    }
    function place() {
      if (!opened) return;
      menu.style.maxHeight = Math.max(1, root.innerHeight - 16) + "px";
      var rect = trigger.getBoundingClientRect();
      var height = menu.scrollHeight + menu.offsetHeight - menu.clientHeight;
      var pos = placement(rect, { width: root.innerWidth, height: root.innerHeight }, menu.offsetWidth, height);
      menu.style.left = pos.left + "px";
      menu.style.top = pos.top + "px";
      menu.style.maxHeight = pos.maxHeight + "px";
      menu.dataset.direction = pos.down ? "down" : "up";
      visibleActive();
    }
    function close(focus) {
      opened = false; menu.hidden = true; paint();
      if (focus && !trigger.disabled) trigger.focus();
    }
    function open(index) {
      if (trigger.disabled) return;
      opened = true; active = index == null ? selected : index;
      menu.hidden = false; paint(); place();
    }
    function commit() {
      var runtime = options[active].dataset.runtime, changed = active !== selected;
      close(true);
      if (changed) onCommit(runtime);
    }
    trigger.addEventListener("click", function () { if (opened) close(true); else open(); });
    trigger.addEventListener("keydown", function (event) {
      if (trigger.disabled) return;
      var key = event.key;
      if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].indexOf(key) >= 0) {
        event.preventDefault();
        if (event.repeat) return;
        if (!opened) { open(key === "Home" ? 0 : key === "End" ? options.length - 1 : null); return; }
        if (key === "ArrowDown") active = Math.min(options.length - 1, active + 1);
        else if (key === "ArrowUp") active = Math.max(0, active - 1);
        else if (key === "Home") active = 0;
        else if (key === "End") active = options.length - 1;
        else { commit(); return; }
        paint(); visibleActive();
      } else if (key === "Escape" && opened) { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (key === "Tab") close(false);
    });
    options.forEach(function (option, index) {
      option.addEventListener("pointermove", function () { active = index; paint(); });
      option.addEventListener("pointerdown", function (event) { event.preventDefault(); });
      option.addEventListener("click", function () { if (!opened || trigger.disabled) return; active = index; commit(); });
    });
    root.document.addEventListener("pointerdown", function (event) {
      if (opened && !menu.contains(event.target) && !trigger.contains(event.target)) close(false);
    });
    trigger.addEventListener("blur", function () { if (opened) close(false); });
    root.addEventListener("blur", function () { close(false); });
    root.addEventListener("resize", place);
    root.addEventListener("scroll", function (event) { if (event.target !== menu) place(); }, true);
    paint();
    return { close: close, sync: function (runtime, disabled) {
      var index = options.findIndex(function (option) { return option.dataset.runtime === runtime; });
      if (index < 0) return;
      if (index !== selected || disabled !== trigger.disabled) close(false);
      selected = index; trigger.disabled = disabled;
      if (disabled) { opened = false; menu.hidden = true; }
      paint();
    } };
  }
  root.ANSEngineSelector = { create: create, placement: placement };
})(typeof window !== "undefined" ? window : globalThis);
