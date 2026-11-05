/**
 * Centralized error handling middleware
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).send({
    message: `Route not found: ${req.originalUrl}`,
  });
};

const errorHandler = (err, req, res, next) => {
  console.error("Server Error:", err);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).send({
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === "production" ? {} : err.stack,
  });
};

module.exports = { notFoundHandler, errorHandler };
