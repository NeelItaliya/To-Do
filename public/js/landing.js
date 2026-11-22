/* Landing page: the hero demo list. */
(function () {
  'use strict';

  const UI = window.TodoUI;
  const list = document.getElementById('demo-tasks');
  const summary = document.getElementById('demo-summary');
  const panel = document.querySelector('.hero-demo');

  const start = Date.now();
  function minutesFromNow(mins) {
    return new Date(start + mins * 60 * 1000).toISOString();
  }
  const tomorrowMorning = new Date(start);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  // Deadlines are relative to now so the demo always shows every state.
  const demo = [
    { id: 'demo-1', title: 'Send the project report', priority: 'high', deadline: minutesFromNow(42), completed: false },
    { id: 'demo-2', title: 'Pay the electricity bill', priority: 'medium', deadline: minutesFromNow(-125), completed: false },
    { id: 'demo-3', title: 'Book train tickets home', priority: 'low', deadline: tomorrowMorning.toISOString(), completed: false },
    { id: 'demo-4', title: 'Call the dentist', priority: 'medium', deadline: minutesFromNow(-300), completed: true },
  ];

  function render(focusId) {
    const now = Date.now();
    list.replaceChildren.apply(
      list,
      demo.map(function (task) {
        return UI.renderTask(task, now, {
          onToggle: function (t) {
            t.completed = !t.completed;
            panel.classList.add('is-settled');
            render(t.id);
          },
        });
      })
    );
    summary.textContent = UI.summarise(demo, now);
    if (focusId) {
      const row = list.querySelector('[data-id="' + focusId + '"] .check');
      if (row) row.focus();
    }
  }

  document.getElementById('demo-date').textContent = new Date().toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  render();
  setInterval(function () {
    panel.classList.add('is-settled');
    const active = document.activeElement && document.activeElement.closest('.task');
    render(active ? active.dataset.id : null);
  }, 30 * 1000);
})();
