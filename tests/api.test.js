const request = require('supertest');
const createApp = require('../src/app');

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('To-Do API (integration)', () => {
  let app;
  beforeEach(() => {
    app = createApp();
  });

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/todos returns empty array initially', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /api/todos creates a todo', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'write tests', deadline: FUTURE });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, title: 'write tests', completed: false });
  });

  test('POST /api/todos rejects missing title', async () => {
    const res = await request(app).post('/api/todos').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/todos rejects a missing deadline', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'task' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/todos rejects a past deadline', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'task', deadline: PAST });
    expect(res.status).toBe(400);
  });

  test('POST /api/todos defaults priority to medium', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'task', deadline: FUTURE });
    expect(res.body.priority).toBe('medium');
  });

  test('POST /api/todos accepts a priority', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'task', priority: 'high', deadline: FUTURE });
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe('high');
  });

  test('POST /api/todos rejects an invalid priority', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'task', priority: 'extreme', deadline: FUTURE });
    expect(res.status).toBe(400);
  });

  test('GET /api/todos/:id returns a created todo', async () => {
    await request(app).post('/api/todos').send({ title: 'task', deadline: FUTURE });
    const res = await request(app).get('/api/todos/1');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('task');
  });

  test('GET /api/todos/:id 404s for unknown id', async () => {
    const res = await request(app).get('/api/todos/999');
    expect(res.status).toBe(404);
  });

  test('PUT /api/todos/:id updates a todo', async () => {
    await request(app).post('/api/todos').send({ title: 'task', deadline: FUTURE });
    const res = await request(app).put('/api/todos/1').send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  test('DELETE /api/todos/:id removes a todo', async () => {
    await request(app).post('/api/todos').send({ title: 'task', deadline: FUTURE });
    const del = await request(app).delete('/api/todos/1');
    expect(del.status).toBe(204);
    const get = await request(app).get('/api/todos/1');
    expect(get.status).toBe(404);
  });

  test('unknown route returns 404 json', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('route not found');
  });
});
