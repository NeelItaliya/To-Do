/* Task helpers shared by the tasks page and the landing-page demo. */
window.TodoUI = (function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SOON_MS = 60 * 60 * 1000; // "due soon" means within the next hour
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;

  const PRIORITIES = ['low', 'medium', 'high'];
  const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '/img/icons.svg#' + name);
    svg.appendChild(use);
    return svg;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function time(iso) {
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }

  // 'done' | 'missed' | 'soon' | 'open'
  function taskState(task, now) {
    if (task.completed) return 'done';
    if (!task.deadline) return 'open';
    const left = time(task.deadline) - (now || Date.now());
    if (left < 0) return 'missed';
    if (left <= SOON_MS) return 'soon';
    return 'open';
  }

  function span(ms) {
    const mins = Math.max(1, Math.round(Math.abs(ms) / MINUTE));
    if (mins < 60) return mins + ' min';
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + ' h';
    const days = Math.round(hours / 24);
    return days + (days === 1 ? ' day' : ' days');
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function dayLabel(date, now) {
    const diff = Math.round((startOfDay(date) - startOfDay(new Date(now))) / DAY);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    if (date.getFullYear() !== new Date(now).getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString([], options);
  }

  function clockTime(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function fullDate(iso) {
    return new Date(iso).toLocaleString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  // Short line shown under the title.
  function dueText(task, now) {
    if (!task.deadline) return task.completed ? 'Done' : 'No deadline';
    const date = new Date(task.deadline);
    const when = dayLabel(date, now) + ', ' + clockTime(date);
    const state = taskState(task, now);
    const left = date.getTime() - now;
    if (state === 'done') return 'Done';
    if (state === 'soon') return 'Due in ' + span(left);
    if (state === 'missed') return 'Missed ' + span(left) + ' ago';
    return when;
  }

  // Value for <input type="datetime-local">, in the viewer's time zone.
  function toLocalInput(value) {
    const d = new Date(value);
    const pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
  }

  function priorityPill(priority) {
    const level = priority in PRIORITY_LABEL ? priority : 'medium';
    const pill = el('span', 'prio');
    const bars = el('span', 'bars');
    bars.dataset.level = String(PRIORITIES.indexOf(level) + 1);
    bars.setAttribute('aria-hidden', 'true');
    bars.append(el('i'), el('i'), el('i'));
    pill.append(bars, el('span', '', PRIORITY_LABEL[level]));
    pill.title = PRIORITY_LABEL[level] + ' priority';
    return pill;
  }

  /* Builds one <li>. handlers: { onToggle(task), onOpen(task), onDelete(task) }.
     onOpen and onDelete are optional; without them the row is read-only apart
     from the checkbox. */
  function renderTask(task, now, handlers) {
    const state = taskState(task, now);
    const li = el('li', 'task');
    li.dataset.id = task.id;
    li.dataset.state = state;

    const check = el('button', 'check');
    check.type = 'button';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(Boolean(task.completed)));
    check.setAttribute('aria-label', 'Done: ' + task.title);
    check.appendChild(icon('check'));
    check.addEventListener('click', function () {
      handlers.onToggle(task);
    });

    const main = el(handlers.onOpen ? 'button' : 'div', 'task-main');
    if (handlers.onOpen) {
      main.type = 'button';
      main.title = 'Edit task';
      main.addEventListener('click', function () {
        handlers.onOpen(task);
      });
    }
    const due = el('span', 'task-due');
    if (state === 'soon') due.appendChild(icon('clock'));
    if (state === 'missed') due.appendChild(icon('alert'));
    due.appendChild(document.createTextNode(dueText(task, now)));
    if (task.deadline) due.title = 'Due ' + fullDate(task.deadline);
    main.append(el('span', 'task-title', task.title), due);

    li.append(check, main, priorityPill(task.priority));

    if (handlers.onDelete) {
      const del = el('button', 'icon-btn task-delete');
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete: ' + task.title);
      del.title = 'Delete task';
      del.appendChild(icon('trash'));
      del.addEventListener('click', function () {
        handlers.onDelete(task);
      });
      li.appendChild(del);
    }
    return li;
  }

  // "3 open, 1 due within the hour, 1 missed"
  function summarise(tasks, now) {
    if (tasks.length === 0) return 'No tasks yet.';
    const counts = { open: 0, soon: 0, missed: 0, done: 0 };
    tasks.forEach(function (task) {
      counts[taskState(task, now)] += 1;
    });
    const open = counts.open + counts.soon + counts.missed;
    if (open === 0) return 'Everything is done.';
    const parts = [open + ' open'];
    if (counts.soon) parts.push(counts.soon + ' due within the hour');
    if (counts.missed) parts.push(counts.missed + ' missed');
    return parts.join(', ');
  }

  return {
    SOON_MS: SOON_MS,
    PRIORITY_RANK: PRIORITY_RANK,
    icon: icon,
    el: el,
    time: time,
    taskState: taskState,
    dueText: dueText,
    fullDate: fullDate,
    toLocalInput: toLocalInput,
    renderTask: renderTask,
    summarise: summarise,
  };
})();
