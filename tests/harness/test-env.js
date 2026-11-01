// tests/harness/test-env.js
// Test environment manager managing test isolation, server lifecycle, and clients.

const { ReferenceServer } = require('./reference-server.js');
const { TestApiClient } = require('./client.js');

/**
 * Initializes a clean test environment for a test suite or scenario.
 * If APP_URL is specified, connects to the running live server.
 * Otherwise, spins up an isolated in-memory reference server.
 */
async function setupTestEnv() {
  const liveUrl = process.env.APP_URL;
  if (liveUrl) {
    const client = new TestApiClient(liveUrl);
    return {
      client,
      server: null,
      cleanup: async () => {},
    };
  }

  const server = new ReferenceServer(0);
  const serverUrl = await server.start();
  const client = new TestApiClient(serverUrl);

  return {
    client,
    server,
    cleanup: async () => {
      await server.stop();
    },
  };
}

module.exports = {
  setupTestEnv,
};
