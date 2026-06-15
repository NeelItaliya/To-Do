const bcrypt = require('bcryptjs');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

class UserStore {
  constructor({ tableName, docClient }) {
    this.tableName = tableName;
    this.docClient = docClient;
  }

  async create(username, password) {
    if (!username || typeof username !== 'string' || !username.trim()) {
      const err = new Error('username is required');
      err.statusCode = 400;
      throw err;
    }
    if (!password || password.length < 6) {
      const err = new Error('password must be at least 6 characters');
      err.statusCode = 400;
      throw err;
    }
    const normalised = username.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await this.docClient.send(new PutCommand({
        TableName: this.tableName,
        Item: { username: normalised, userId, passwordHash },
        ConditionExpression: 'attribute_not_exists(username)',
      }));
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        const e = new Error('username already taken');
        e.statusCode = 409;
        throw e;
      }
      throw err;
    }
    return { id: userId, username: normalised };
  }

  async verify(username, password) {
    if (!username || !password) return null;
    const res = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { username: username.trim().toLowerCase() },
    }));
    const user = res.Item;
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return { id: user.userId, username: user.username };
  }
}

module.exports = UserStore;
