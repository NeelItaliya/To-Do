const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const createApp = require('./app');

const PORT = process.env.PORT || 3000;

async function fetchSecret(secretName, region) {
  const client = new SecretsManagerClient({ region });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  return response.SecretString;
}

async function start() {
  const secretName = process.env.JWT_SECRET_NAME;
  if (secretName) {
    const region = process.env.AWS_REGION || 'ap-south-1';
    process.env.JWT_SECRET = await fetchSecret(secretName, region);
  }

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`To-Do API listening on port ${PORT}`);
  });

  function shutdown(signal) {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(() => process.exit(0));
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

module.exports = start();
