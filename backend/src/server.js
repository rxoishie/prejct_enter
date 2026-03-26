const app = require("./app");
const env = require("./config/env");

function parseDatabaseTarget(connectionString) {
  try {
    const url = new URL(connectionString);
    return {
      protocol: url.protocol.replace(":", ""),
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, "") || ""
    };
  } catch (error) {
    return {
      protocol: "unknown",
      host: "unknown",
      port: "unknown",
      database: "unknown"
    };
  }
}

function logStartupBanner() {
  const db = parseDatabaseTarget(env.databaseUrl);
  const startupInfo = {
    service: "smartirri-backend",
    nodeEnv: env.nodeEnv,
    port: env.port,
    trustProxy: env.trustProxy,
    logHttpRequests: env.logHttpRequests,
    corsOrigin: env.corsOrigin,
    rateLimits: {
      api: {
        windowMs: env.apiRateLimitWindowMs,
        max: env.apiRateLimitMax
      },
      authLogin: {
        windowMs: env.authLoginRateLimitWindowMs,
        max: env.authLoginRateLimitMax
      },
      authRefresh: {
        windowMs: env.authRefreshRateLimitWindowMs,
        max: env.authRefreshRateLimitMax
      }
    },
    authLoginPolicy: {
      maxFailedAttempts: env.authLoginMaxFailedAttempts,
      lockoutSeconds: env.authLoginLockoutSeconds,
      backoffBaseSeconds: env.authLoginBackoffBaseSeconds,
      backoffMaxSeconds: env.authLoginBackoffMaxSeconds
    },
    jwtAccessExpiresIn: env.jwtAccessExpiresIn,
    jwtRefreshExpiresIn: env.jwtRefreshExpiresIn,
    secrets: {
      jwtAccessSecretConfigured: Boolean(env.jwtAccessSecret),
      jwtRefreshSecretConfigured: Boolean(env.jwtRefreshSecret),
      deviceSharedKeyConfigured: Boolean(env.deviceSharedKey)
    },
    database: db,
    endpoints: {
      health: `http://localhost:${env.port}/health`,
      ready: `http://localhost:${env.port}/ready`
    }
  };

  console.log("=== SmartIrri Startup ===");
  console.log(JSON.stringify(startupInfo, null, 2));
  console.log("=========================");
}

app.listen(env.port, () => {
  console.log(`SmartIrri backend running on port ${env.port}`);
  if (env.logStartupBanner) {
    logStartupBanner();
  }
});
