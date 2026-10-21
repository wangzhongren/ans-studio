// 滚动监听：给左侧导航的当前 section 加 aria-current。
// 这是增强功能——观察失败时页面内容与导航链接仍然完整可用。
(function () {
  "use strict";

  try {
    var links = {};
    var navLinks = document.querySelectorAll('.rail-nav a[href^="#"]');
    Array.prototype.forEach.call(navLinks, function (link) {
      links[link.getAttribute("href").slice(1)] = link;
    });

    var sections = document.querySelectorAll("main section[id]");
    if (!sections.length || !Object.keys(links).length || !("IntersectionObserver" in window)) {
      return;
    }

    var heights = {};
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.id;
          if (!(id in links)) {
            return;
          }
          heights[id] = entry.isIntersecting ? entry.intersectionRect.height : 0;
        });

        var currentId = null;
        var best = 0;
        Object.keys(heights).forEach(function (id) {
          if (heights[id] > best) {
            best = heights[id];
            currentId = id;
          }
        });
        if (!currentId) {
          return;
        }

        Object.keys(links).forEach(function (id) {
          if (id === currentId) {
            links[id].setAttribute("aria-current", "location");
          } else {
            links[id].removeAttribute("aria-current");
          }
        });
      },
      { rootMargin: "-30% 0px -45% 0px", threshold: [0, 0.05, 0.15, 0.3, 0.5, 0.75, 1] }
    );

    Array.prototype.forEach.call(sections, function (section) {
      observer.observe(section);
    });
  } catch (err) {
    // 忽略：静态内容不依赖脚本。
  }
})();
