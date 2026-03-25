function notFound(req, res) {
  return res.status(404).json({ message: "Route not found" });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.status || 500;
  const message = error.message || "Internal server error";

  if (status >= 500) {
    console.error("Unexpected error", error);
  }

  return res.status(status).json({ message });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = {
  notFound,
  errorHandler,
  asyncHandler
};
