const path = require('path');
const express = require('express');
const TodoStore = require('./todoStore');

function createApp(store = new TodoStore()) {
  const app = express();
  app.use(express.json());

  // Serve the single-page web UI from /public
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Health + readiness endpoints (used by Docker/K8s probes and CI smoke tests)
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/api/todos', (req, res) => {
    res.json(store.list());
  });

  app.get('/api/todos/:id', (req, res) => {
    const todo = store.get(req.params.id);
    if (!todo) return res.status(404).json({ error: 'todo not found' });
    res.json(todo);
  });

  app.post('/api/todos', (req, res, next) => {
    try {
      const todo = store.create(req.body || {});
      res.status(201).json(todo);
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/todos/:id', (req, res, next) => {
    try {
      const todo = store.update(req.params.id, req.body || {});
      if (!todo) return res.status(404).json({ error: 'todo not found' });
      res.json(todo);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/todos/:id', (req, res) => {
    const removed = store.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'todo not found' });
    res.status(204).send();
  });

  // 404 for unknown routes
  app.use((req, res) => {
    res.status(404).json({ error: 'route not found' });
  });

  // Centralized error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.message || 'internal server error' });
  });

  return app;
}

module.exports = createApp;
