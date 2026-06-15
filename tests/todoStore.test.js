const TodoStore = require('../src/todoStore');

// A safely-future deadline for tests that just need a valid one.
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('TodoStore (unit)', () => {
  let store;
  beforeEach(() => {
    store = new TodoStore();
  });

  test('starts empty', () => {
    expect(store.list()).toEqual([]);
  });

  test('creates a todo with incrementing ids', () => {
    const a = store.create({ title: 'first', deadline: FUTURE });
    const b = store.create({ title: 'second', deadline: FUTURE });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a.completed).toBe(false);
    expect(a.createdAt).toBeDefined();
  });

  test('trims the title', () => {
    const t = store.create({ title: '  buy milk  ', deadline: FUTURE });
    expect(t.title).toBe('buy milk');
  });

  test('rejects empty title', () => {
    expect(() => store.create({ title: '', deadline: FUTURE })).toThrow();
    expect(() => store.create({})).toThrow();
  });

  test('defaults priority to medium', () => {
    const t = store.create({ title: 'x', deadline: FUTURE });
    expect(t.priority).toBe('medium');
  });

  test('accepts a valid priority', () => {
    const t = store.create({ title: 'x', priority: 'high', deadline: FUTURE });
    expect(t.priority).toBe('high');
  });

  test('rejects an invalid priority', () => {
    expect(() => store.create({ title: 'x', priority: 'extreme', deadline: FUTURE })).toThrow();
  });

  test('updates priority', () => {
    const t = store.create({ title: 'x', priority: 'low', deadline: FUTURE });
    const updated = store.update(t.id, { priority: 'high' });
    expect(updated.priority).toBe('high');
  });

  test('rejects invalid priority on update', () => {
    const t = store.create({ title: 'x', deadline: FUTURE });
    expect(() => store.update(t.id, { priority: 'nope' })).toThrow();
  });

  test('gets a todo by id', () => {
    const t = store.create({ title: 'x', deadline: FUTURE });
    expect(store.get(t.id)).toEqual(t);
    expect(store.get(999)).toBeNull();
  });

  test('requires a deadline on create', () => {
    expect(() => store.create({ title: 'x' })).toThrow();
  });

  test('rejects a past deadline on create', () => {
    expect(() => store.create({ title: 'x', deadline: PAST })).toThrow();
  });

  test('stores a valid future deadline as ISO', () => {
    const t = store.create({ title: 'x', deadline: FUTURE });
    expect(t.deadline).toBe(new Date(FUTURE).toISOString());
  });

  test('rejects an invalid deadline', () => {
    expect(() => store.create({ title: 'x', deadline: 'not-a-date' })).toThrow();
  });

  test('updates the deadline to a new future time', () => {
    const t = store.create({ title: 'x', deadline: FUTURE });
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const updated = store.update(t.id, { deadline: later });
    expect(updated.deadline).toBe(later);
  });

  test('rejects a past deadline on update', () => {
    const t = store.create({ title: 'x', deadline: FUTURE });
    expect(() => store.update(t.id, { deadline: PAST })).toThrow();
  });

  test('updates title and completed', () => {
    const t = store.create({ title: 'x', deadline: FUTURE });
    const updated = store.update(t.id, { title: 'y', completed: true });
    expect(updated.title).toBe('y');
    expect(updated.completed).toBe(true);
  });

  test('update returns null for missing todo', () => {
    expect(store.update(123, { title: 'z' })).toBeNull();
  });

  test('removes a todo', () => {
    const t = store.create({ title: 'x', deadline: FUTURE });
    expect(store.remove(t.id)).toBe(true);
    expect(store.get(t.id)).toBeNull();
    expect(store.remove(t.id)).toBe(false);
  });
});
