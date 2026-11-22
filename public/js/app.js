/* Tasks page. Talks to /api/todos with the JWT saved at sign-in. */
(function () {
  'use strict';

  const UI = window.TodoUI;
  const API = '/api/todos';

  let token = null;
  try {
    token = localStorage.getItem('token');
  } catch {
    token = null;
  }
  if (!token) {
    window.location.replace('/login');
    return;
  }
  const username = localStorage.getItem('username') || '';

  const FILTERS = {
    all: {
      title: 'All tasks',
      match: () => true,
      empty: ['No tasks yet', 'Add your first one above. It needs a title and a deadline.'],
    },
    open: {
      title: 'Open',
      match: (state) => state !== 'done',
      empty: ['No open tasks', 'Everything on your list is done.'],
    },
    soon: {
      title: 'Due within the hour',
      match: (state) => state === 'soon',
      empty: ['Nothing due in the next hour', 'Tasks appear here when their deadline is less than 60 minutes away.'],
    },
    missed: {
      title: 'Missed',
      match: (state) => state === 'missed',
      empty: ['Nothing missed', 'Tasks appear here when their deadline passes before they are done.'],
    },
    done: {
      title: 'Done',
      match: (state) => state === 'done',
      empty: ['No finished tasks yet', 'Tick the circle next to a task to mark it done.'],
    },
  };

  const byDeadline = (a, b) => UI.time(a.deadline) - UI.time(b.deadline);
  const SORTERS = {
    deadline: byDeadline,
    priority: (a, b) => UI.PRIORITY_RANK[a.priority] - UI.PRIORITY_RANK[b.priority] || byDeadline(a, b),
    newest: (a, b) => UI.time(b.createdAt) - UI.time(a.createdAt),
    oldest: (a, b) => UI.time(a.createdAt) - UI.time(b.createdAt),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  };

  const $ = (id) => document.getElementById(id);
  const listEl = $('tasks');
  const emptyEl = $('empty');
  const emptyTitle = $('empty-title');
  const emptyBody = $('empty-body');
  const retryBtn = $('retry');
  const summaryEl = $('summary');
  const listTitle = $('list-title');
  const completeAllBtn = $('complete-all');
  const sortSelect = $('sort');
  const searchInput = $('search');
  const filterButtons = Array.from(document.querySelectorAll('.filter'));

  let tasks = [];
  let filter = 'all';
  let sort = 'deadline';
  let query = '';
  let status = 'loading'; // 'loading' | 'ready' | 'failed'
  const freshIds = new Set();

  /* ---------- Server ---------- */

  function signOut() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.assign('/login');
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) {
      signOut();
      throw new Error('signed out');
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'request failed');
    return data;
  }

  // "deadline must be in the future" -> "Deadline must be in the future."
  function sentence(message) {
    const text = String(message || '').trim();
    if (!text) return 'Something went wrong. Try again.';
    return text.charAt(0).toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? '' : '.');
  }

  async function load() {
    try {
      tasks = await api(API);
      status = 'ready';
    } catch (err) {
      if (err.message === 'signed out') return;
      if (status !== 'ready') status = 'failed';
    }
    render();
  }

  function replaceTask(updated) {
    const index = tasks.findIndex((task) => task.id === updated.id);
    if (index !== -1) tasks[index] = updated;
  }

  /* ---------- Toast ---------- */

  const toastEl = $('toast');
  let toastTimer = 0;

  function toast(message) {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
    toastEl.textContent = message;
    // Re-show on the next frame so the entrance animation restarts.
    requestAnimationFrame(() => {
      toastEl.hidden = false;
    });
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 4500);
  }

  /* ---------- Render ---------- */

  function rememberFocus() {
    const active = document.activeElement;
    if (!active || !listEl.contains(active)) return null;
    const row = active.closest('.task');
    if (!row) return null;
    const selector = active.classList.contains('check')
      ? '.check'
      : active.classList.contains('task-delete')
        ? '.task-delete'
        : '.task-main';
    return { id: row.dataset.id, selector };
  }

  function restoreFocus(memory) {
    if (!memory) return;
    const row = Array.from(listEl.children).find((li) => li.dataset.id === memory.id);
    const target = row && row.querySelector(memory.selector);
    if (target) target.focus({ preventScroll: true });
  }

  function visibleTasks(now) {
    const match = FILTERS[filter].match;
    const sorter = SORTERS[sort] || SORTERS.deadline;
    return tasks
      .filter((task) => match(UI.taskState(task, now)))
      .filter((task) => !query || task.title.toLowerCase().includes(query))
      .sort((a, b) => Number(a.completed) - Number(b.completed) || sorter(a, b));
  }

  function render() {
    const now = Date.now();
    const focus = rememberFocus();

    $('today').textContent = new Date(now).toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    const counts = { all: tasks.length, open: 0, soon: 0, missed: 0, done: 0 };
    tasks.forEach((task) => {
      const state = UI.taskState(task, now);
      if (state === 'done') counts.done += 1;
      else counts.open += 1;
      if (state === 'soon') counts.soon += 1;
      if (state === 'missed') counts.missed += 1;
    });
    filterButtons.forEach((btn) => {
      const key = btn.dataset.filter;
      btn.querySelector('.filter-count').textContent = counts[key];
      btn.setAttribute('aria-pressed', String(key === filter));
      btn.toggleAttribute('data-alert', (key === 'soon' || key === 'missed') && counts[key] > 0);
    });

    summaryEl.textContent = status === 'ready' ? UI.summarise(tasks, now) : '';
    listTitle.textContent = query ? `Results for “${searchInput.value.trim()}”` : FILTERS[filter].title;
    // It acts on every open task, so only offer it where every open task is listed.
    completeAllBtn.hidden = counts.open === 0 || Boolean(query) || !(filter === 'all' || filter === 'open');

    const visible = status === 'ready' ? visibleTasks(now) : [];
    listEl.replaceChildren(
      ...visible.map((task) => {
        const row = UI.renderTask(task, now, { onToggle: toggle, onOpen: openEdit, onDelete: remove });
        if (freshIds.delete(task.id)) row.classList.add('is-new');
        return row;
      })
    );

    emptyEl.hidden = visible.length > 0;
    retryBtn.hidden = status !== 'failed';
    if (status === 'loading') {
      emptyTitle.textContent = 'Loading your tasks…';
      emptyBody.textContent = '';
    } else if (status === 'failed') {
      emptyTitle.textContent = 'Can’t load your tasks';
      emptyBody.textContent = 'Check your connection, then try again.';
    } else if (query) {
      emptyTitle.textContent = `No tasks match “${searchInput.value.trim()}”`;
      emptyBody.textContent = 'Search looks at task titles.';
    } else {
      [emptyTitle.textContent, emptyBody.textContent] = FILTERS[filter].empty;
    }

    restoreFocus(focus);
  }

  /* ---------- Task actions ---------- */

  async function toggle(task) {
    const next = !task.completed;
    task.completed = next;
    render();
    try {
      replaceTask(await api(`${API}/${task.id}`, { method: 'PUT', body: { completed: next } }));
    } catch (err) {
      if (err.message === 'signed out') return;
      task.completed = !next;
      toast('Can’t update that task right now. Try again.');
    }
    render();
  }

  async function remove(task) {
    const ok = await confirmSheet({
      title: 'Delete this task?',
      message: `“${task.title}” will be deleted. This can’t be undone.`,
      confirmLabel: 'Delete task',
      danger: true,
    });
    if (!ok) return;
    const index = tasks.indexOf(task);
    if (index !== -1) tasks.splice(index, 1);
    render();
    try {
      await api(`${API}/${task.id}`, { method: 'DELETE' });
    } catch (err) {
      if (err.message === 'signed out') return;
      await load();
      toast('Can’t delete that task right now. Try again.');
    }
  }

  async function completeAll() {
    const open = tasks.filter((task) => !task.completed);
    if (open.length === 0) return;
    const noun = open.length === 1 ? '1 open task' : `${open.length} open tasks`;
    const ok = await confirmSheet({
      title: 'Mark all done?',
      message: `${noun} will be marked done.`,
      confirmLabel: 'Mark all done',
    });
    if (!ok) return;
    const results = await Promise.allSettled(
      open.map((task) => api(`${API}/${task.id}`, { method: 'PUT', body: { completed: true } }))
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    await load();
    toast(failed ? `${failed} of ${open.length} tasks couldn’t be updated. Try again.` : 'All tasks marked done.');
  }

  /* ---------- Confirm sheet ---------- */

  const confirmDialog = $('confirm-dialog');
  const confirmOk = $('confirm-ok');

  function confirmSheet({ title, message, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      $('confirm-heading').textContent = title;
      $('confirm-message').textContent = message;
      confirmOk.textContent = confirmLabel;
      confirmOk.classList.toggle('btn-destructive', danger);
      confirmDialog.returnValue = '';
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'ok'), { once: true });
      confirmDialog.showModal();
    });
  }

  confirmOk.addEventListener('click', () => confirmDialog.close('ok'));
  $('confirm-cancel').addEventListener('click', () => confirmDialog.close(''));

  // Close a sheet when the press starts and ends on its backdrop.
  function closeOnBackdrop(dialog) {
    let pressedBackdrop = false;
    dialog.addEventListener('pointerdown', (event) => {
      pressedBackdrop = event.target === dialog;
    });
    dialog.addEventListener('click', (event) => {
      if (pressedBackdrop && event.target === dialog) dialog.close('');
      pressedBackdrop = false;
    });
  }

  /* ---------- Edit sheet ---------- */

  const editDialog = $('edit-dialog');
  const editForm = $('edit-form');
  const editTitle = $('edit-title');
  const editDeadline = $('edit-deadline');
  const editError = $('edit-error');
  const editSave = $('edit-save');
  let editing = null;

  function checkedValue(name) {
    const input = document.querySelector(`input[name="${name}"]:checked`);
    return input ? input.value : 'medium';
  }

  function setChecked(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = input.value === value;
    });
  }

  function openEdit(task) {
    editing = task;
    editTitle.value = task.title;
    editDeadline.value = task.deadline ? UI.toLocalInput(task.deadline) : '';
    setChecked('edit-priority', task.priority || 'medium');
    editError.hidden = true;
    editDialog.showModal();
    editTitle.focus();
    editTitle.select();
  }

  function editFail(message, field) {
    editError.textContent = message;
    editError.hidden = false;
    if (field) field.focus();
  }

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editing) return;
    const task = editing;
    const title = editTitle.value.trim();
    if (!title) return editFail('Give the task a title.', editTitle);
    if (!editDeadline.value) return editFail('Pick a deadline. Every task needs one.', editDeadline);

    const changes = {};
    if (title !== task.title) changes.title = title;
    const priority = checkedValue('edit-priority');
    if (priority !== task.priority) changes.priority = priority;
    // Only send the deadline when it changed, so an overdue task can still be renamed.
    if (!task.deadline || editDeadline.value !== UI.toLocalInput(task.deadline)) {
      const deadline = new Date(editDeadline.value);
      if (Number.isNaN(deadline.getTime())) return editFail('Enter a valid date and time.', editDeadline);
      if (deadline.getTime() <= Date.now()) return editFail('Pick a deadline in the future.', editDeadline);
      changes.deadline = deadline.toISOString();
    }
    if (Object.keys(changes).length === 0) {
      editDialog.close('');
      return;
    }

    editSave.disabled = true;
    try {
      replaceTask(await api(`${API}/${task.id}`, { method: 'PUT', body: changes }));
      editDialog.close('');
      render();
    } catch (err) {
      if (err.message !== 'signed out') editFail(sentence(err.message));
    } finally {
      editSave.disabled = false;
    }
  });

  $('edit-cancel').addEventListener('click', () => editDialog.close(''));
  $('edit-delete').addEventListener('click', () => {
    const task = editing;
    editDialog.close('');
    if (task) remove(task);
  });
  editDialog.addEventListener('close', () => {
    editing = null;
  });

  closeOnBackdrop(editDialog);
  closeOnBackdrop(confirmDialog);

  /* ---------- Composer ---------- */

  const composer = $('composer');
  const composerMore = $('composer-more');
  const newTitle = $('new-title');
  const newDeadline = $('new-deadline');
  const chipsEl = $('due-chips');
  const composerError = $('composer-error');
  const composerSubmit = composer.querySelector('.composer-submit');

  // Each preset computes its date when clicked, so it is never stale.
  const PRESETS = [
    {
      label: 'In 1 hour',
      date: () => {
        const step = 5 * 60 * 1000;
        return new Date(Math.ceil((Date.now() + 60 * 60 * 1000) / step) * step);
      },
    },
    {
      label: 'This evening',
      date: () => {
        const d = new Date();
        d.setHours(18, 0, 0, 0);
        return d;
      },
      // Offered only while 6 PM is still comfortably ahead.
      available: () => new Date().getHours() < 17,
    },
    {
      label: 'Tomorrow',
      date: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
    {
      label: 'Next week',
      date: () => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];

  function clearComposerError() {
    composerError.hidden = true;
  }

  function buildChips() {
    chipsEl.replaceChildren(
      ...PRESETS.filter((preset) => !preset.available || preset.available()).map((preset) => {
        const chip = UI.el('button', 'chip', preset.label);
        chip.type = 'button';
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', () => {
          newDeadline.value = UI.toLocalInput(preset.date());
          chipsEl.querySelectorAll('.chip').forEach((other) => {
            other.setAttribute('aria-pressed', String(other === chip));
          });
          clearComposerError();
        });
        return chip;
      })
    );
  }

  function openComposer() {
    if (composer.classList.contains('is-open')) return;
    composer.classList.add('is-open');
    composerMore.inert = false;
    newDeadline.min = UI.toLocalInput(Date.now());
    if (!newDeadline.value) buildChips();
  }

  function closeComposer() {
    composer.classList.remove('is-open');
    composerMore.inert = true;
    clearComposerError();
  }

  function resetComposer() {
    newTitle.value = '';
    newDeadline.value = '';
    setChecked('new-priority', 'medium');
    buildChips();
    clearComposerError();
  }

  function composerFail(message, field) {
    composerError.textContent = message;
    composerError.hidden = false;
    if (field) field.focus();
  }

  newTitle.addEventListener('focus', openComposer);
  newTitle.addEventListener('input', () => {
    openComposer();
    clearComposerError();
  });
  composer.querySelector('.composer-row').addEventListener('click', () => newTitle.focus());
  newDeadline.addEventListener('input', () => {
    chipsEl.querySelectorAll('.chip').forEach((chip) => chip.setAttribute('aria-pressed', 'false'));
    clearComposerError();
  });

  // Fold the composer away when it is left empty.
  document.addEventListener('pointerdown', (event) => {
    if (composer.contains(event.target)) return;
    if (!newTitle.value.trim() && !newDeadline.value) closeComposer();
  });
  composer.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    resetComposer();
    closeComposer();
    document.activeElement.blur();
  });

  composer.addEventListener('submit', async (event) => {
    event.preventDefault();
    openComposer();
    const title = newTitle.value.trim();
    if (!title) return composerFail('Give the task a title.', newTitle);
    if (!newDeadline.value) return composerFail('Pick a deadline. Every task needs one.');
    const deadline = new Date(newDeadline.value);
    if (Number.isNaN(deadline.getTime())) return composerFail('Enter a valid date and time.', newDeadline);
    if (deadline.getTime() <= Date.now()) return composerFail('Pick a deadline in the future.', newDeadline);

    composerSubmit.disabled = true;
    try {
      const created = await api(API, {
        method: 'POST',
        body: { title, priority: checkedValue('new-priority'), deadline: deadline.toISOString() },
      });
      tasks.push(created);
      freshIds.add(created.id);
      // Make sure the new task is on screen.
      const state = UI.taskState(created, Date.now());
      if (!FILTERS[filter].match(state)) filter = 'all';
      if (query && !created.title.toLowerCase().includes(query)) {
        query = '';
        searchInput.value = '';
      }
      resetComposer();
      render();
      newTitle.focus();
    } catch (err) {
      if (err.message !== 'signed out') composerFail(sentence(err.message));
    } finally {
      composerSubmit.disabled = false;
    }
  });

  /* ---------- Filters, sort, search ---------- */

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      render();
    });
  });

  try {
    const savedSort = localStorage.getItem('sort');
    if (savedSort && SORTERS[savedSort]) sort = savedSort;
  } catch {
    // Keep the default sort.
  }
  sortSelect.value = sort;
  sortSelect.addEventListener('change', () => {
    sort = sortSelect.value;
    try {
      localStorage.setItem('sort', sort);
    } catch {
      // The choice lasts for this visit only.
    }
    render();
  });

  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    render();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && searchInput.value) {
      searchInput.value = '';
      query = '';
      render();
    }
  });

  completeAllBtn.addEventListener('click', completeAll);
  retryBtn.addEventListener('click', () => {
    status = 'loading';
    render();
    load();
  });

  // "/" jumps to search, "n" starts a new task.
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = event.target;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    if (event.key === '/') {
      event.preventDefault();
      searchInput.focus();
    } else if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      newTitle.focus();
    }
  });

  /* ---------- Account menu ---------- */

  const accountBtn = $('account-btn');
  const accountMenu = $('account-menu');

  $('avatar-initial').textContent = (username.charAt(0) || '?').toUpperCase();
  $('menu-username').textContent = username || 'unknown';

  function setMenu(open) {
    accountMenu.hidden = !open;
    accountBtn.setAttribute('aria-expanded', String(open));
  }

  accountBtn.addEventListener('click', () => setMenu(accountMenu.hidden));
  document.addEventListener('pointerdown', (event) => {
    if (accountMenu.hidden) return;
    if (accountMenu.contains(event.target) || accountBtn.contains(event.target)) return;
    setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !accountMenu.hidden) {
      setMenu(false);
      accountBtn.focus();
    }
  });
  $('sign-out').addEventListener('click', signOut);

  /* ---------- Start ---------- */

  render();
  load();
  // Deadlines move from open to due soon to missed as time passes.
  setInterval(render, 30 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status === 'ready') load();
  });
})();
