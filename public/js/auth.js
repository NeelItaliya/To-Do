/* Sign in and create account. Both use the same form; the mode picks the
   endpoint: POST /api/auth/login or POST /api/auth/register. */
(function () {
  'use strict';

  const COPY = {
    login: {
      title: 'Sign in',
      sub: 'Your tasks are where you left them.',
      submit: 'Sign in',
      busy: 'Signing in…',
      doc: 'Sign in to To-Do',
    },
    register: {
      title: 'Create your account',
      sub: 'Pick a username and a password. No email needed.',
      submit: 'Create account',
      busy: 'Creating account…',
      doc: 'Create your To-Do account',
    },
  };

  // Server messages, rewritten to say what to do next.
  const ERRORS = {
    'invalid username or password': 'That username and password don’t match. Check both and try again.',
    'username already taken': 'That username is taken. Try another one.',
    'username is required': 'Enter a username.',
    'password must be at least 6 characters': 'Use at least 6 characters for your password.',
  };

  const form = document.getElementById('auth-form');
  const title = document.getElementById('auth-title');
  const sub = document.getElementById('auth-sub');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const hint = document.getElementById('password-hint');
  const toggle = document.getElementById('password-toggle');
  const error = document.getElementById('auth-error');
  const submit = document.getElementById('auth-submit');
  const modeInputs = document.querySelectorAll('input[name="mode"]');

  let mode = 'login';
  let busy = false;

  function showError(message, field) {
    error.textContent = message;
    error.hidden = false;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    username.removeAttribute('aria-invalid');
    password.removeAttribute('aria-invalid');
  }

  function setMode(next, updateUrl) {
    mode = next === 'register' ? 'register' : 'login';
    const copy = COPY[mode];
    title.textContent = copy.title;
    sub.textContent = copy.sub;
    submit.textContent = copy.submit;
    document.title = copy.doc;
    hint.hidden = mode !== 'register';
    password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    modeInputs.forEach(function (input) {
      input.checked = input.value === mode;
    });
    clearError();
    if (updateUrl) {
      const url = mode === 'register' ? '/login?mode=signup' : '/login';
      window.history.replaceState(null, '', url);
    }
  }

  modeInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked) setMode(input.value, true);
    });
  });

  toggle.addEventListener('click', function () {
    const reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(reveal));
  });

  [username, password].forEach(function (input) {
    input.addEventListener('input', clearError);
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    clearError();

    const name = username.value.trim();
    const pass = password.value;
    if (!name) return showError('Enter a username.', username);
    if (!pass) return showError('Enter a password.', password);
    if (mode === 'register' && pass.length < 6) {
      return showError('Use at least 6 characters for your password.', password);
    }

    busy = true;
    submit.disabled = true;
    submit.textContent = COPY[mode].busy;
    try {
      const res = await fetch('/api/auth/' + mode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password: pass }),
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        const field = res.status === 409 ? username : null;
        showError(ERRORS[data.error] || 'Something went wrong on our side. Try again in a moment.', field);
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      window.location.assign('/app');
    } catch {
      showError('Can’t reach the server. Check your connection and try again.');
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = COPY[mode].submit;
    }
  });

  const params = new URLSearchParams(window.location.search);
  setMode(params.get('mode') === 'signup' ? 'register' : 'login', false);
  username.focus();
})();
