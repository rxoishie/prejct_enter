function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.errors.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    req.body = parsed.data;
    return next();
  };
}

module.exports = {
  validateBody
};
