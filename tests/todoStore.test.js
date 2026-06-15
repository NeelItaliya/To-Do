const TodoStore = require('../src/todoStore');

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST   = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const UID    = 'test-user';

function makeMockDocClient() {
  const items = new Map();
  return {
    send(cmd) {
      const { input } = cmd;
      const cn = cmd.constructor.name;
      if (cn === 'PutCommand') {
        const key = `${input.Item.userId}#${input.Item.todoId}`;
        items.set(key, { ...input.Item });
        return Promise.resolve({});
      }
      if (cn === 'GetCommand') {
        const key = `${input.Key.userId}#${input.Key.todoId}`;
        return Promise.resolve({ Item: items.get(key) });
      }
      if (cn === 'DeleteCommand') {
        const key = `${input.Key.userId}#${input.Key.todoId}`;
        items.delete(key);
        return Promise.resolve({});
      }
      if (cn === 'QueryCommand') {
        const uid = input.ExpressionAttributeValues[':uid'];
        return Promise.resolve({ Items: [...items.values()].filter(i => i.userId === uid) });
      }
      return Promise.resolve({});
    },
  };
}

describe('TodoStore (unit)', () => {
  let store;
  beforeEach(() => {
    store = new TodoStore({ tableName: 'test', docClient: makeMockDocClient() });
  });

  test('starts empty', async () => {
    expect(await store.list(UID)).toEqual([]);
  });

  test('creates a todo with a uuid id', async () => {
    const a = await store.create(UID, { title: 'first', deadline: FUTURE });
    const b = await store.create(UID, { title: 'second', deadline: FUTURE });
    expect(typeof a.id).toBe('string');
    expect(a.id).not.toBe(b.id);
    expect(a.completed).toBe(false);
    expect(a.createdAt).toBeDefined();
  });

  test('trims the title', async () => {
    const t = await store.create(UID, { title: '  buy milk  ', deadline: FUTURE });
    expect(t.title).toBe('buy milk');
  });

  test('rejects empty title', async () => {
    await expect(store.create(UID, { title: '', deadline: FUTURE })).rejects.toThrow();
    await expect(store.create(UID, {})).rejects.toThrow();
  });

  test('defaults priority to medium', async () => {
    const t = await store.create(UID, { title: 'x', deadline: FUTURE });
    expect(t.priority).toBe('medium');
  });

  test('accepts a valid priority', async () => {
    const t = await store.create(UID, { title: 'x', priority: 'high', deadline: FUTURE });
    expect(t.priority).toBe('high');
  });

  test('rejects an invalid priority', async () => {
    await expect(store.create(UID, { title: 'x', priority: 'extreme', deadline: FUTURE })).rejects.toThrow();
  });

  test('updates priority', async () => {
    const t = await store.create(UID, { title: 'x', priority: 'low', deadline: FUTURE });
    const updated = await store.update(UID, t.id, { priority: 'high' });
    expect(updated.priority).toBe('high');
  });

  test('rejects invalid priority on update', async () => {
    const t = await store.create(UID, { title: 'x', deadline: FUTURE });
    await expect(store.update(UID, t.id, { priority: 'nope' })).rejects.toThrow();
  });

  test('gets a todo by id', async () => {
    const t = await store.create(UID, { title: 'x', deadline: FUTURE });
    expect(await store.get(UID, t.id)).toEqual(t);
    expect(await store.get(UID, 'nonexistent')).toBeNull();
  });

  test('requires a deadline on create', async () => {
    await expect(store.create(UID, { title: 'x' })).rejects.toThrow();
  });

  test('rejects a past deadline on create', async () => {
    await expect(store.create(UID, { title: 'x', deadline: PAST })).rejects.toThrow();
  });

  test('stores a valid future deadline as ISO', async () => {
    const t = await store.create(UID, { title: 'x', deadline: FUTURE });
    expect(t.deadline).toBe(new Date(FUTURE).toISOString());
  });

  test('rejects an invalid deadline', async () => {
    await expect(store.create(UID, { title: 'x', deadline: 'not-a-date' })).rejects.toThrow();
  });

  test('updates the deadline to a new future time', async () => {
    const t = await store.create(UID, { title: 'x', deadline: FUTURE });
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const updated = await store.update(UID, t.id, { deadline: later });
    expect(updated.deadline).toBe(later);
  });

  test('rejects a past deadline on update', async () => {
    const t = await store.create(UID, { title: 'x', deadline: FUTURE });
    await expect(store.update(UID, t.id, { deadline: PAST })).rejects.toThrow();
  });

  test('updates title and completed', async () => {
    const t = await store.create(UID, { title: 'x', deadline: FUTURE });
    const updated = await store.update(UID, t.id, { title: 'y', completed: true });
    expect(updated.title).toBe('y');
    expect(updated.completed).toBe(true);
  });

  test('update returns null for missing todo', async () => {
    expect(await store.update(UID, 'nonexistent', { title: 'z' })).toBeNull();
  });

  test('removes a todo', async () => {
    const t = await store.create(UID, { title: 'x', deadline: FUTURE });
    expect(await store.remove(UID, t.id)).toBe(true);
    expect(await store.get(UID, t.id)).toBeNull();
    expect(await store.remove(UID, t.id)).toBe(false);
  });
});
