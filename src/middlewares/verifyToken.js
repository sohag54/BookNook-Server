const jwt = require("jsonwebtoken");

/**
 * Middleware to verify JWT token in incoming requests
 * Checks the Authorization header for "Bearer <token>"
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      message: "Unauthorized access: No token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded user info (email, name) to request
    next();
  } catch (error) {
    return res.status(401).send({
      message: "Unauthorized access: Invalid or expired token",
      error: error.message,
    });
  }
};

module.exports = verifyToken;
