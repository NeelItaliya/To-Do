const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const client = require('prom-client');
const TodoStore = require('./todoStore');
const UserStore = require('./userStore');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRY = '7d';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'authentication required' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

function createApp({ userStore: injectedUserStore, todoStore: injectedTodoStore } = {}) {
  const userStore = injectedUserStore || new UserStore({
    tableName: process.env.USERS_TABLE || 'to-do-users',
    docClient,
  });
  const todoStore = injectedTodoStore || new TodoStore({
    tableName: process.env.TODOS_TABLE || 'to-do-todos',
    docClient,
  });

  const app = express();
  app.use(express.json());

  // metrics middleware
  app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
      const route = req.route ? req.route.path : req.path;
      const labels = { method: req.method, route, status_code: res.statusCode };
      end(labels);
      httpRequestTotal.inc(labels);
    });
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      const user = await userStore.create(username, password);
      res.status(201).json({ token: createToken(user), username: user.username });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      const user = await userStore.verify(username, password);
      if (!user) return res.status(401).json({ error: 'invalid username or password' });
      res.json({ token: createToken(user), username: user.username });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/todos', authMiddleware, async (req, res, next) => {
    try { res.json(await todoStore.list(req.user.id)); } catch (err) { next(err); }
  });

  app.get('/api/todos/:id', authMiddleware, async (req, res, next) => {
    try {
      const todo = await todoStore.get(req.user.id, req.params.id);
      if (!todo) return res.status(404).json({ error: 'todo not found' });
      res.json(todo);
    } catch (err) { next(err); }
  });

  app.post('/api/todos', authMiddleware, async (req, res, next) => {
    try {
      const todo = await todoStore.create(req.user.id, req.body || {});
      res.status(201).json(todo);
    } catch (err) { next(err); }
  });

  app.put('/api/todos/:id', authMiddleware, async (req, res, next) => {
    try {
      const todo = await todoStore.update(req.user.id, req.params.id, req.body || {});
      if (!todo) return res.status(404).json({ error: 'todo not found' });
      res.json(todo);
    } catch (err) { next(err); }
  });

  app.delete('/api/todos/:id', authMiddleware, async (req, res, next) => {
    try {
      const removed = await todoStore.remove(req.user.id, req.params.id);
      if (!removed) return res.status(404).json({ error: 'todo not found' });
      res.status(204).send();
    } catch (err) { next(err); }
  });

  app.use((req, res) => res.status(404).json({ error: 'route not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.message || 'internal server error' });
  });

  return app;
}

module.exports = createApp;
