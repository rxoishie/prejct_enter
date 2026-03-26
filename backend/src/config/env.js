const dotenv = require("dotenv");

dotenv.config();

function fail(message) {
  throw new Error(message);
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "undefined") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parsePositiveInt(value, fallback, label) {
  if (typeof value === "undefined" || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${label} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInt(value, fallback, label) {
  if (typeof value === "undefined" || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`${label} must be a non-negative integer`);
  }

  return parsed;
}

const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  deviceSharedKey: process.env.DEVICE_SHARED_KEY,
  corsOrigin: process.env.CORS_ORIGIN || "*",
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  logHttpRequests: parseBoolean(process.env.LOG_HTTP_REQUESTS, process.env.NODE_ENV === "production"),
  logStartupBanner: parseBoolean(process.env.LOG_STARTUP_BANNER, true),
  apiRateLimitWindowMs: parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, "API_RATE_LIMIT_WINDOW_MS"),
  apiRateLimitMax: parsePositiveInt(process.env.API_RATE_LIMIT_MAX, 1000, "API_RATE_LIMIT_MAX"),
  authLoginRateLimitWindowMs: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, "AUTH_LOGIN_RATE_LIMIT_WINDOW_MS"),
  authLoginRateLimitMax: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10, "AUTH_LOGIN_RATE_LIMIT_MAX"),
  authRefreshRateLimitWindowMs: parsePositiveInt(process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, "AUTH_REFRESH_RATE_LIMIT_WINDOW_MS"),
  authRefreshRateLimitMax: parsePositiveInt(process.env.AUTH_REFRESH_RATE_LIMIT_MAX, 30, "AUTH_REFRESH_RATE_LIMIT_MAX"),
  authLoginMaxFailedAttempts: parsePositiveInt(process.env.AUTH_LOGIN_MAX_FAILED_ATTEMPTS, 5, "AUTH_LOGIN_MAX_FAILED_ATTEMPTS"),
  authLoginLockoutSeconds: parsePositiveInt(process.env.AUTH_LOGIN_LOCKOUT_SECONDS, 15 * 60, "AUTH_LOGIN_LOCKOUT_SECONDS"),
  authLoginBackoffBaseSeconds: parseNonNegativeInt(process.env.AUTH_LOGIN_BACKOFF_BASE_SECONDS, 2, "AUTH_LOGIN_BACKOFF_BASE_SECONDS"),
  authLoginBackoffMaxSeconds: parsePositiveInt(process.env.AUTH_LOGIN_BACKOFF_MAX_SECONDS, 30, "AUTH_LOGIN_BACKOFF_MAX_SECONDS"),
  apiVersion: process.env.API_VERSION || "v1",
  apiDeprecation: parseBoolean(process.env.API_DEPRECATION, false),
  apiSunset: process.env.API_SUNSET || "TBD"
};

const required = [
  "databaseUrl",
  "jwtAccessSecret",
  "jwtRefreshSecret",
  "deviceSharedKey"
];

for (const key of required) {
  if (!env[key]) {
    fail(`Missing required environment variable: ${key}`);
  }
}

if (!Number.isInteger(env.port) || env.port <= 0 || env.port > 65535) {
  fail("PORT must be a valid integer between 1 and 65535");
}

if (!/^v\d+$/.test(env.apiVersion)) {
  fail("API_VERSION must follow format v<integer> (example: v1, v2)");
}

if (env.apiSunset !== "TBD" && Number.isNaN(Date.parse(env.apiSunset))) {
  fail("API_SUNSET must be 'TBD' or a valid date string");
}

if (env.apiDeprecation && env.apiSunset === "TBD") {
  fail("API_SUNSET must be set to a concrete date when API_DEPRECATION is true");
}

if (env.authLoginBackoffMaxSeconds < env.authLoginBackoffBaseSeconds) {
  fail("AUTH_LOGIN_BACKOFF_MAX_SECONDS must be greater than or equal to AUTH_LOGIN_BACKOFF_BASE_SECONDS");
}

if (!["development", "test", "production"].includes(env.nodeEnv)) {
  fail("NODE_ENV must be one of: development, test, production");
}

if (env.nodeEnv === "production") {
  if (env.corsOrigin === "*") {
    fail("CORS_ORIGIN cannot be '*' in production");
  }

  if (env.jwtAccessSecret.length < 32) {
    fail("JWT_ACCESS_SECRET must be at least 32 characters in production");
  }

  if (env.jwtRefreshSecret.length < 32) {
    fail("JWT_REFRESH_SECRET must be at least 32 characters in production");
  }

  if (env.deviceSharedKey.length < 16) {
    fail("DEVICE_SHARED_KEY must be at least 16 characters in production");
  }
}

module.exports = env;
