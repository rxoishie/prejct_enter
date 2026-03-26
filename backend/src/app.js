const cors = require("cors");
const { randomUUID } = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const { query } = require("./db/pool");
const routes = require("./routes");
const { errorHandler, notFound } = require("./middleware/error");

const app = express();

app.use((req, res, next) => {
  const incomingRequestId = req.get("x-request-id");
  const requestId = incomingRequestId && incomingRequestId.trim() ? incomingRequestId : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

if (env.logHttpRequests) {
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

      // JSON logs are easier to index in managed log platforms.
      console.log(
        JSON.stringify({
          level: "info",
          event: "http_request",
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
          requestId: req.requestId,
          ip: req.ip,
          userAgent: req.get("user-agent") || "",
          timestamp: new Date().toISOString()
        })
      );
    });

    next();
  });
}

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin,
    credentials: true
  })
);
app.use(express.json());

app.use(
  "/api",
  rateLimit({
    windowMs: env.apiRateLimitWindowMs,
    max: env.apiRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/ready", async (req, res) => {
  try {
    await query("SELECT 1");
    return res.status(200).json({ status: "ready" });
  } catch (error) {
    return res.status(503).json({ status: "not_ready" });
  }
});

app.use("/api/v1", (req, res, next) => {
  res.setHeader("X-API-Version", env.apiVersion);
  res.setHeader("Sunset", env.apiSunset);
  res.setHeader("Deprecation", String(env.apiDeprecation));
  next();
});

app.use("/api/v1", routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
