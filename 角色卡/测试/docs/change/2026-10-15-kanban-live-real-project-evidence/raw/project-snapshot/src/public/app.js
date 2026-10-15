'use strict';

/**
 * 离线中文任务看板前端（原生 JS，无框架、无外链资源）。
 *
 * 安全约定：所有用户数据（标题、标签）一律用 textContent 写入 DOM，
 * 全程不拼接 HTML 字符串、不做 HTML 注入，特殊字符与脚本只会原样显示为文本。
 */
(function () {
  const STATUS_ORDER = ['todo', 'doing', 'done'];
  const STATUS_LABELS = { todo: '待办', doing: '进行中', done: '已完成' };
  const PRIORITY_LABELS = { low: '低', medium: '中', high: '高' };

  const state = {
    tasks: [],
    stats: null,
    warning: null,
    editingId: null,
    filters: { status: 'all', tag: 'all', q: '', sort: 'createdAt', order: 'desc' },
  };

  function $(id) {
    return document.getElementById(id);
  }

  const dom = {};

  function cacheDom() {
    dom.warning = $('warning-banner');
    dom.notice = $('notice');
    dom.board = $('board');
    dom.statsStatus = $('stats-status');
    dom.statsTags = $('stats-tags');
    dom.createForm = $('create-form');
    dom.createTitle = $('create-title');
    dom.createPriority = $('create-priority');
    dom.createTags = $('create-tags');
    dom.createError = $('create-error');
    dom.filterStatus = $('filter-status');
    dom.filterTag = $('filter-tag');
    dom.filterQ = $('filter-q');
    dom.filterSort = $('filter-sort');
    dom.filterOrder = $('filter-order');
    dom.filterReset = $('filter-reset');
    dom.refreshBtn = $('refresh-btn');
    dom.exportBtn = $('export-btn');
    dom.modal = $('edit-modal');
    dom.editForm = $('edit-form');
    dom.editTitle = $('edit-title');
    dom.editPriority = $('edit-priority');
    dom.editTags = $('edit-tags');
    dom.editError = $('edit-error');
    dom.editCancel = $('edit-cancel');
  }

  /** 统一的接口调用：解析 {error:{code,message}} 并抛出中文错误 */
  async function api(pathname, options) {
    let res;
    try {
      res = await fetch(pathname, options);
    } catch (err) {
      throw new Error('无法连接服务，请确认服务仍在运行');
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error('服务返回了无法解析的内容');
      }
    }
    if (!res.ok) {
      const message = data && data.error && data.error.message
        ? data.error.message
        : ('请求失败（HTTP ' + res.status + '）');
      const error = new Error(message);
      error.code = data && data.error ? data.error.code : null;
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function showNotice(message) {
    dom.notice.textContent = message || '';
    dom.notice.hidden = !message;
  }

  function showWarning(warning) {
    if (warning && warning.message) {
      let text = '【数据告警】' + warning.message;
      if (warning.backupPath) text += '（备份文件：' + warning.backupPath + '）';
      dom.warning.textContent = text;
      dom.warning.hidden = false;
    } else {
      dom.warning.textContent = '';
      dom.warning.hidden = true;
    }
  }

  function buildQuery() {
    const params = new URLSearchParams();
    const f = state.filters;
    if (f.status && f.status !== 'all') params.set('status', f.status);
    if (f.tag && f.tag !== 'all') params.set('tag', f.tag);
    if (f.q) params.set('q', f.q);
    params.set('sort', f.sort);
    params.set('order', f.order);
    return params.toString();
  }

  async function loadTasks() {
    const data = await api('/api/tasks?' + buildQuery());
    state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    state.warning = data.warning || null;
    showWarning(state.warning);
    renderBoard();
    await loadStats();
    refreshTagOptions();
  }

  async function loadStats() {
    state.stats = await api('/api/stats');
    renderStats();
  }

  async function loadStatus() {
    const data = await api('/api/status');
    showWarning(data.warning || null);
  }

  function renderStats() {
    const stats = state.stats || { total: 0, byStatus: { todo: 0, doing: 0, done: 0 }, byTag: {} };
    dom.statsStatus.textContent = '';
    dom.statsTags.textContent = '';

    const totalChip = document.createElement('span');
    totalChip.className = 'stat';
    totalChip.appendChild(document.createTextNode('全部任务 '));
    const totalB = document.createElement('b');
    totalB.textContent = String(stats.total || 0);
    totalChip.appendChild(totalB);
    dom.statsStatus.appendChild(totalChip);

    for (const status of STATUS_ORDER) {
      const chip = document.createElement('span');
      chip.className = 'stat';
      chip.appendChild(document.createTextNode(STATUS_LABELS[status] + ' '));
      const b = document.createElement('b');
      b.textContent = String((stats.byStatus && stats.byStatus[status]) || 0);
      chip.appendChild(b);
      dom.statsStatus.appendChild(chip);
    }

    const tags = Object.keys(stats.byTag || {});
    if (tags.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'stat';
      empty.textContent = '暂无标签统计';
      dom.statsTags.appendChild(empty);
      return;
    }
    for (const tag of tags) {
      const chip = document.createElement('span');
      chip.className = 'stat';
      chip.appendChild(document.createTextNode('标签「' + tag + '」 '));
      const b = document.createElement('b');
      b.textContent = String(stats.byTag[tag]);
      chip.appendChild(b);
      dom.statsTags.appendChild(chip);
    }
  }

  function refreshTagOptions() {
    const current = state.filters.tag;
    const tags = state.stats && state.stats.byTag ? Object.keys(state.stats.byTag) : [];
    dom.filterTag.textContent = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '全部';
    dom.filterTag.appendChild(allOption);
    for (const tag of tags) {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      dom.filterTag.appendChild(option);
    }
    dom.filterTag.value = tags.includes(current) ? current : 'all';
    state.filters.tag = dom.filterTag.value;
  }

  function formatTime(iso) {
    if (!iso) return '未知时间';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function renderBoard() {
    dom.board.textContent = '';
    const groups = { todo: [], doing: [], done: [] };
    for (const task of state.tasks) {
      const group = groups[task.status] || groups.todo;
      group.push(task);
    }

    for (const status of STATUS_ORDER) {
      const column = document.createElement('section');
      column.className = 'column column-' + status;

      const heading = document.createElement('h2');
      heading.textContent = STATUS_LABELS[status] + '（' + groups[status].length + '）';
      column.appendChild(heading);

      const list = document.createElement('div');
      list.className = 'card-list';

      if (groups[status].length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = '暂无任务';
        list.appendChild(empty);
      } else {
        for (const task of groups[status]) list.appendChild(renderCard(task));
      }

      column.appendChild(list);
      dom.board.appendChild(column);
    }
  }

  function renderCard(task) {
    const card = document.createElement('article');
    card.className = 'card priority-' + (PRIORITY_LABELS[task.priority] ? task.priority : 'medium');

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = task.title; // 用户数据只走 textContent
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const priorityBadge = document.createElement('span');
    priorityBadge.className = 'badge badge-priority-' + (task.priority || 'medium');
    priorityBadge.textContent = '优先级：' + (PRIORITY_LABELS[task.priority] || '中');
    meta.appendChild(priorityBadge);

    const statusBadge = document.createElement('span');
    statusBadge.className = 'badge';
    statusBadge.textContent = '状态：' + (STATUS_LABELS[task.status] || '待办');
    meta.appendChild(statusBadge);

    const timeBadge = document.createElement('span');
    timeBadge.className = 'badge';
    timeBadge.textContent = '创建于：' + formatTime(task.createdAt);
    meta.appendChild(timeBadge);

    card.appendChild(meta);

    if (Array.isArray(task.tags) && task.tags.length > 0) {
      const tagsRow = document.createElement('div');
      tagsRow.className = 'card-tags';
      for (const tag of task.tags) {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.textContent = tag; // 标签同样只走 textContent
        tagsRow.appendChild(tagEl);
      }
      card.appendChild(tagsRow);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const statusSelect = document.createElement('select');
    statusSelect.setAttribute('aria-label', '切换状态');
    for (const status of STATUS_ORDER) {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = STATUS_LABELS[status];
      if (status === task.status) option.selected = true;
      statusSelect.appendChild(option);
    }
    statusSelect.addEventListener('change', () => {
      changeStatus(task, statusSelect.value, statusSelect);
    });
    actions.appendChild(statusSelect);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-small';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => openEditModal(task));
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', () => removeTask(task));
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    return card;
  }

  async function changeStatus(task, status, selectEl) {
    if (status === task.status) return;
    try {
      await api('/api/tasks/' + encodeURIComponent(task.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      showNotice('任务「' + task.title + '」状态已更新为' + (STATUS_LABELS[status] || status));
      await loadTasks();
    } catch (err) {
      showNotice('状态更新失败：' + err.message);
      if (selectEl) selectEl.value = task.status;
    }
  }

  async function removeTask(task) {
    const ok = window.confirm('确定要删除任务「' + task.title + '」吗？删除后不可恢复。');
    if (!ok) return;
    try {
      await api('/api/tasks/' + encodeURIComponent(task.id), { method: 'DELETE' });
      showNotice('任务「' + task.title + '」已删除');
      await loadTasks();
    } catch (err) {
      showNotice('删除失败：' + err.message);
    }
  }

  function openEditModal(task) {
    state.editingId = task.id;
    dom.editTitle.value = task.title;
    dom.editPriority.value = PRIORITY_LABELS[task.priority] ? task.priority : 'medium';
    dom.editTags.value = Array.isArray(task.tags) ? task.tags.join(', ') : '';
    dom.editError.textContent = '';
    dom.modal.hidden = false;
    dom.editTitle.focus();
  }

  function closeEditModal() {
    state.editingId = null;
    dom.modal.hidden = true;
    dom.editError.textContent = '';
  }

  async function submitEdit(event) {
    event.preventDefault();
    const id = state.editingId;
    if (!id) return;

    const title = dom.editTitle.value.trim();
    if (!title) {
      dom.editError.textContent = '任务标题不能为空，请填写后再保存。';
      return;
    }
    if (title.length > 200) {
      dom.editError.textContent = '任务标题最多 200 个字符。';
      return;
    }

    try {
      await api('/api/tasks/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: dom.editPriority.value,
          tags: dom.editTags.value,
        }),
      });
      closeEditModal();
      showNotice('任务已保存');
      await loadTasks();
    } catch (err) {
      dom.editError.textContent = '保存失败：' + err.message;
    }
  }

  async function submitCreate(event) {
    event.preventDefault();
    const title = dom.createTitle.value.trim();

    // 界面层拒绝：空白标题不发请求
    if (!title) {
      dom.createError.textContent = '任务标题不能为空，请填写后再添加。';
      dom.createTitle.focus();
      return;
    }
    if (title.length > 200) {
      dom.createError.textContent = '任务标题最多 200 个字符。';
      return;
    }
    dom.createError.textContent = '';

    try {
      await api('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: dom.createPriority.value,
          tags: dom.createTags.value,
        }),
      });
      dom.createForm.reset();
      dom.createPriority.value = 'medium';
      showNotice('已新增任务：' + title);
      await loadTasks();
      dom.createTitle.focus();
    } catch (err) {
      dom.createError.textContent = '新增失败：' + err.message;
    }
  }

  function exportJson() {
    const link = document.createElement('a');
    link.href = '/api/export';
    link.download = 'kanban-export.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showNotice('已请求导出全部任务（JSON 文件下载）');
  }

  function bindEvents() {
    dom.createForm.addEventListener('submit', submitCreate);
    dom.editForm.addEventListener('submit', submitEdit);
    dom.editCancel.addEventListener('click', closeEditModal);
    dom.modal.addEventListener('click', (event) => {
      if (event.target === dom.modal) closeEditModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !dom.modal.hidden) closeEditModal();
    });

    dom.filterStatus.addEventListener('change', () => {
      state.filters.status = dom.filterStatus.value;
      loadTasks().catch((err) => showNotice('加载失败：' + err.message));
    });
    dom.filterTag.addEventListener('change', () => {
      state.filters.tag = dom.filterTag.value;
      loadTasks().catch((err) => showNotice('加载失败：' + err.message));
    });
    dom.filterSort.addEventListener('change', () => {
      state.filters.sort = dom.filterSort.value;
      loadTasks().catch((err) => showNotice('加载失败：' + err.message));
    });
    dom.filterOrder.addEventListener('change', () => {
      state.filters.order = dom.filterOrder.value;
      loadTasks().catch((err) => showNotice('加载失败：' + err.message));
    });

    let qTimer = null;
    dom.filterQ.addEventListener('input', () => {
      if (qTimer) clearTimeout(qTimer);
      qTimer = setTimeout(() => {
        state.filters.q = dom.filterQ.value.trim();
        loadTasks().catch((err) => showNotice('加载失败：' + err.message));
      }, 200);
    });

    dom.filterReset.addEventListener('click', () => {
      state.filters = { status: 'all', tag: 'all', q: '', sort: 'createdAt', order: 'desc' };
      dom.filterStatus.value = 'all';
      dom.filterQ.value = '';
      dom.filterSort.value = 'createdAt';
      dom.filterOrder.value = 'desc';
      loadTasks().catch((err) => showNotice('加载失败：' + err.message));
    });

    dom.refreshBtn.addEventListener('click', () => {
      loadStatus().catch(() => {});
      loadTasks().catch((err) => showNotice('加载失败：' + err.message));
    });

    dom.exportBtn.addEventListener('click', exportJson);
  }

  async function init() {
    cacheDom();
    bindEvents();
    try {
      await loadStatus();
      await loadTasks();
    } catch (err) {
      showNotice('初始化失败：' + err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
