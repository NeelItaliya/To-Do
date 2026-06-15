// In-memory To-Do store. Pure logic, no HTTP — easy to unit test.

const PRIORITIES = ['low', 'medium', 'high'];

function validatePriority(value) {
  if (!PRIORITIES.includes(value)) {
    const err = new Error(`priority must be one of: ${PRIORITIES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return value;
}

function validateDeadline(value, { required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) {
      const err = new Error('deadline is required');
      err.statusCode = 400;
      throw err;
    }
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error('deadline must be a valid date/time');
    err.statusCode = 400;
    throw err;
  }
  if (date.getTime() <= Date.now()) {
    const err = new Error('deadline must be in the future');
    err.statusCode = 400;
    throw err;
  }
  return date.toISOString();
}

class TodoStore {
  constructor() {
    this.todos = new Map();
    this.nextId = 1;
  }

  list() {
    return Array.from(this.todos.values());
  }

  get(id) {
    return this.todos.get(Number(id)) || null;
  }

  create({ title, completed = false, priority = 'medium', deadline = null }) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      const err = new Error('title is required and must be a non-empty string');
      err.statusCode = 400;
      throw err;
    }
    const validPriority = validatePriority(priority);
    const validDeadline = validateDeadline(deadline, { required: true });
    const todo = {
      id: this.nextId++,
      title: title.trim(),
      completed: Boolean(completed),
      priority: validPriority,
      deadline: validDeadline,
      createdAt: new Date().toISOString(),
    };
    this.todos.set(todo.id, todo);
    return todo;
  }

  update(id, { title, completed, priority, deadline }) {
    const todo = this.get(id);
    if (!todo) return null;
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        const err = new Error('title must be a non-empty string');
        err.statusCode = 400;
        throw err;
      }
      todo.title = title.trim();
    }
    if (completed !== undefined) {
      todo.completed = Boolean(completed);
    }
    if (priority !== undefined) {
      todo.priority = validatePriority(priority);
    }
    if (deadline !== undefined) {
      todo.deadline = validateDeadline(deadline, { required: true });
    }
    this.todos.set(todo.id, todo);
    return todo;
  }

  remove(id) {
    return this.todos.delete(Number(id));
  }

  clear() {
    this.todos.clear();
    this.nextId = 1;
  }
}

module.exports = TodoStore;
module.exports.PRIORITIES = PRIORITIES;
