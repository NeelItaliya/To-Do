const { GetCommand, PutCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

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
  constructor({ tableName, docClient }) {
    this.tableName = tableName;
    this.docClient = docClient;
  }

  async list(userId) {
    const res = await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));
    return (res.Items || []).map(this._format);
  }

  async get(userId, todoId) {
    const res = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { userId, todoId },
    }));
    return res.Item ? this._format(res.Item) : null;
  }

  async create(userId, { title, completed = false, priority = 'medium', deadline = null }) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      const err = new Error('title is required and must be a non-empty string');
      err.statusCode = 400;
      throw err;
    }
    const validPriority = validatePriority(priority);
    const validDeadline = validateDeadline(deadline, { required: true });
    const item = {
      userId,
      todoId: crypto.randomUUID(),
      title: title.trim(),
      completed: Boolean(completed),
      priority: validPriority,
      deadline: validDeadline,
      createdAt: new Date().toISOString(),
    };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return this._format(item);
  }

  async update(userId, todoId, { title, completed, priority, deadline }) {
    const todo = await this.get(userId, todoId);
    if (!todo) return null;
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        const err = new Error('title must be a non-empty string');
        err.statusCode = 400;
        throw err;
      }
      todo.title = title.trim();
    }
    if (completed !== undefined) todo.completed = Boolean(completed);
    if (priority !== undefined) todo.priority = validatePriority(priority);
    if (deadline !== undefined) todo.deadline = validateDeadline(deadline, { required: true });
    const item = { userId, todoId, ...todo };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return this._format(item);
  }

  async remove(userId, todoId) {
    const existing = await this.get(userId, todoId);
    if (!existing) return false;
    await this.docClient.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { userId, todoId },
    }));
    return true;
  }

  _format(item) {
    return {
      id: item.todoId,
      title: item.title,
      completed: item.completed,
      priority: item.priority,
      deadline: item.deadline,
      createdAt: item.createdAt,
    };
  }
}

module.exports = TodoStore;
module.exports.PRIORITIES = PRIORITIES;
