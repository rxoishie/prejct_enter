import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

function withTempEnv(overrides, fn) {
  const original = {};

  for (const [key, value] of Object.entries(overrides)) {
    original[key] = process.env[key];
    process.env[key] = value;
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(overrides)) {
        if (typeof original[key] === "undefined") {
          delete process.env[key];
        } else {
          process.env[key] = original[key];
        }
      }
    });
}

async function startServer(app) {
  const server = createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine test server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

function clearAppModules() {
  delete require.cache[require.resolve("../src/config/env")];
  delete require.cache[require.resolve("../src/routes/auth")];
  delete require.cache[require.resolve("../src/routes/index")];
  delete require.cache[require.resolve("../src/app")];
}

test("api rate limiter returns 429 and Retry-After when threshold is exceeded", async () => {
  await withTempEnv(
    {
      NODE_ENV: "test",
      PORT: "4000",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smartirri",
      JWT_ACCESS_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      JWT_REFRESH_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      DEVICE_SHARED_KEY: "abcdefghijklmnop",
      CORS_ORIGIN: "http://localhost:5500",
      API_RATE_LIMIT_WINDOW_MS: "60000",
      API_RATE_LIMIT_MAX: "1",
      AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_LOGIN_RATE_LIMIT_MAX: "10",
      AUTH_REFRESH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_REFRESH_RATE_LIMIT_MAX: "10"
    },
    async () => {
      clearAppModules();

      const app = require("../src/app");
      const server = await startServer(app);

      try {
        const probePath = "/api/v1/__rate_limit_probe__";

        const first = await fetch(`${server.baseUrl}${probePath}`);
        assert.equal(first.status, 404);

        const second = await fetch(`${server.baseUrl}${probePath}`);
        assert.equal(second.status, 429);

        const retryAfter = second.headers.get("retry-after");
        assert.equal(typeof retryAfter, "string");
        assert.ok(Number.parseInt(retryAfter, 10) >= 1);
      } finally {
        await server.close();
      }
    }
  );
});

test("auth/login rate limiter returns 429 and Retry-After when threshold is exceeded", async () => {
  await withTempEnv(
    {
      NODE_ENV: "test",
      PORT: "4000",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smartirri",
      JWT_ACCESS_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      JWT_REFRESH_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      DEVICE_SHARED_KEY: "abcdefghijklmnop",
      CORS_ORIGIN: "http://localhost:5500",
      API_RATE_LIMIT_WINDOW_MS: "60000",
      API_RATE_LIMIT_MAX: "100",
      AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_LOGIN_RATE_LIMIT_MAX: "1",
      AUTH_REFRESH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_REFRESH_RATE_LIMIT_MAX: "100"
    },
    async () => {
      clearAppModules();

      const app = require("../src/app");
      const server = await startServer(app);

      try {
        const loginPath = "/api/v1/auth/login";
        const payload = JSON.stringify({});
        const headers = { "content-type": "application/json" };

        const first = await fetch(`${server.baseUrl}${loginPath}`, {
          method: "POST",
          headers,
          body: payload
        });
        assert.equal(first.status, 400);

        const second = await fetch(`${server.baseUrl}${loginPath}`, {
          method: "POST",
          headers,
          body: payload
        });
        assert.equal(second.status, 429);

        const retryAfter = second.headers.get("retry-after");
        assert.equal(typeof retryAfter, "string");
        assert.ok(Number.parseInt(retryAfter, 10) >= 1);
      } finally {
        await server.close();
      }
    }
  );
});

test("auth/refresh rate limiter returns 429 and Retry-After when threshold is exceeded", async () => {
  await withTempEnv(
    {
      NODE_ENV: "test",
      PORT: "4000",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smartirri",
      JWT_ACCESS_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      JWT_REFRESH_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      DEVICE_SHARED_KEY: "abcdefghijklmnop",
      CORS_ORIGIN: "http://localhost:5500",
      API_RATE_LIMIT_WINDOW_MS: "60000",
      API_RATE_LIMIT_MAX: "100",
      AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_LOGIN_RATE_LIMIT_MAX: "100",
      AUTH_REFRESH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_REFRESH_RATE_LIMIT_MAX: "1"
    },
    async () => {
      clearAppModules();

      const app = require("../src/app");
      const server = await startServer(app);

      try {
        const refreshPath = "/api/v1/auth/refresh";
        const payload = JSON.stringify({});
        const headers = { "content-type": "application/json" };

        const first = await fetch(`${server.baseUrl}${refreshPath}`, {
          method: "POST",
          headers,
          body: payload
        });
        assert.equal(first.status, 400);

        const second = await fetch(`${server.baseUrl}${refreshPath}`, {
          method: "POST",
          headers,
          body: payload
        });
        assert.equal(second.status, 429);

        const retryAfter = second.headers.get("retry-after");
        assert.equal(typeof retryAfter, "string");
        assert.ok(Number.parseInt(retryAfter, 10) >= 1);
      } finally {
        await server.close();
      }
    }
  );
});
