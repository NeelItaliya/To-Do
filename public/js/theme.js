/* Loaded in <head> on every page, before first paint.
   1. Resolves light or dark (saved choice, else the system setting).
   2. Sets the backdrop hues from the viewer's local time of day. */
(function () {
  'use strict';

  const root = document.documentElement;
  const KEY = 'theme';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function saved() {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  function labelToggles() {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      btn.title = 'Switch to ' + next + ' theme';
    });
  }

  function applyTheme() {
    root.dataset.theme = saved() || (systemDark.matches ? 'dark' : 'light');
    labelToggles();
  }

  // [hour, three light-theme hues, three dark-theme hues]. Each palette holds
  // for a few hours, then blends into the next: night, dawn, day, dusk, night.
  // The dark set keeps to cool hues; the dark theme shows them only faintly.
  const NIGHT = [268, 236, 305, 275, 245, 320];
  const DAWN = [48, 352, 258, 310, 255, 355];
  const DAY = [245, 200, 75, 255, 210, 295];
  const DUSK = [28, 328, 286, 335, 285, 10];
  const SKY = [
    [0, ...NIGHT],
    [4.5, ...NIGHT],
    [6.5, ...DAWN],
    [8, ...DAWN],
    [10, ...DAY],
    [15.5, ...DAY],
    [17.5, ...DUSK],
    [19, ...DUSK],
    [21, ...NIGHT],
    [24, ...NIGHT],
  ];
  const HUE_VARS = ['--h1', '--h2', '--h3', '--d1', '--d2', '--d3'];

  // Interpolate along the shorter way round the hue wheel.
  function mixHue(from, to, t) {
    const delta = ((to - from + 540) % 360) - 180;
    return (from + delta * t + 360) % 360;
  }

  function applySky() {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    let i = 0;
    while (i < SKY.length - 2 && hour >= SKY[i + 1][0]) i += 1;
    const a = SKY[i];
    const b = SKY[i + 1];
    const t = (hour - a[0]) / (b[0] - a[0]);
    HUE_VARS.forEach(function (name, n) {
      root.style.setProperty(name, mixHue(a[n + 1], b[n + 1], t).toFixed(1));
    });
  }

  applyTheme();
  applySky();
  setInterval(applySky, 10 * 60 * 1000);

  systemDark.addEventListener('change', function () {
    if (!saved()) applyTheme();
  });

  document.addEventListener('DOMContentLoaded', labelToggles);

  document.addEventListener('click', function (event) {
    const btn = event.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage is unavailable; the choice lasts for this page only.
    }
    root.dataset.theme = next;
    labelToggles();
  });
})();
