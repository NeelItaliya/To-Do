const request = require('supertest');
const createApp = require('../src/app');
const TodoStore = require('../src/todoStore');
const UserStore = require('../src/userStore');

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST   = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function makeMockDocClient() {
  const tables = {};
  return {
    send(cmd) {
      const { input } = cmd;
      const cn = cmd.constructor.name;
      if (!tables[input.TableName]) tables[input.TableName] = new Map();
      const store = tables[input.TableName];

      if (cn === 'PutCommand') {
        const item = input.Item;
        const key = item.todoId ? `${item.userId}#${item.todoId}` : item.username;
        if (input.ConditionExpression && store.has(key)) {
          const err = new Error('ConditionalCheckFailedException');
          err.name = 'ConditionalCheckFailedException';
          return Promise.reject(err);
        }
        store.set(key, { ...item });
        return Promise.resolve({});
      }
      if (cn === 'GetCommand') {
        const key = input.Key.todoId
          ? `${input.Key.userId}#${input.Key.todoId}`
          : input.Key.username;
        return Promise.resolve({ Item: store.get(key) });
      }
      if (cn === 'DeleteCommand') {
        const key = `${input.Key.userId}#${input.Key.todoId}`;
        store.delete(key);
        return Promise.resolve({});
      }
      if (cn === 'QueryCommand') {
        const uid = input.ExpressionAttributeValues[':uid'];
        return Promise.resolve({ Items: [...store.values()].filter(i => i.userId === uid) });
      }
      return Promise.resolve({});
    },
  };
}

describe('To-Do API (integration)', () => {
  let app, token;

  beforeEach(async () => {
    const docClient = makeMockDocClient();
    const userStore = new UserStore({ tableName: 'users', docClient });
    const todoStore = new TodoStore({ tableName: 'todos', docClient });
    app = createApp({ userStore, todoStore });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', password: 'testpass123' });
    token = res.body.token;
  });

  function authed(req) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/todos returns 401 without auth', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(401);
  });

  test('GET /api/todos returns empty array initially', async () => {
    const res = await authed(request(app).get('/api/todos'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /api/todos creates a todo', async () => {
    const res = await authed(request(app).post('/api/todos').send({ title: 'write tests', deadline: FUTURE }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'write tests', completed: false });
    expect(typeof res.body.id).toBe('string');
  });

  test('POST /api/todos rejects missing title', async () => {
    const res = await authed(request(app).post('/api/todos').send({}));
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/todos rejects a missing deadline', async () => {
    const res = await authed(request(app).post('/api/todos').send({ title: 'task' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/todos rejects a past deadline', async () => {
    const res = await authed(request(app).post('/api/todos').send({ title: 'task', deadline: PAST }));
    expect(res.status).toBe(400);
  });

  test('POST /api/todos defaults priority to medium', async () => {
    const res = await authed(request(app).post('/api/todos').send({ title: 'task', deadline: FUTURE }));
    expect(res.body.priority).toBe('medium');
  });

  test('POST /api/todos accepts a priority', async () => {
    const res = await authed(request(app).post('/api/todos').send({ title: 'task', priority: 'high', deadline: FUTURE }));
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe('high');
  });

  test('POST /api/todos rejects an invalid priority', async () => {
    const res = await authed(request(app).post('/api/todos').send({ title: 'task', priority: 'extreme', deadline: FUTURE }));
    expect(res.status).toBe(400);
  });

  test('GET /api/todos/:id returns a created todo', async () => {
    const created = await authed(request(app).post('/api/todos').send({ title: 'task', deadline: FUTURE }));
    const res = await authed(request(app).get(`/api/todos/${created.body.id}`));
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('task');
  });

  test('GET /api/todos/:id 404s for unknown id', async () => {
    const res = await authed(request(app).get('/api/todos/nonexistent-id'));
    expect(res.status).toBe(404);
  });

  test('PUT /api/todos/:id updates a todo', async () => {
    const created = await authed(request(app).post('/api/todos').send({ title: 'task', deadline: FUTURE }));
    const res = await authed(request(app).put(`/api/todos/${created.body.id}`).send({ completed: true }));
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  test('DELETE /api/todos/:id removes a todo', async () => {
    const created = await authed(request(app).post('/api/todos').send({ title: 'task', deadline: FUTURE }));
    const del = await authed(request(app).delete(`/api/todos/${created.body.id}`));
    expect(del.status).toBe(204);
    const get = await authed(request(app).get(`/api/todos/${created.body.id}`));
    expect(get.status).toBe(404);
  });

  test('unknown route returns 404 json', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('route not found');
  });
});
