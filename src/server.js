const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
require("dotenv").config();

const { connectDB, getDB } = require("./config/db");
const bookRoutes = require("./routes/bookRoutes");
const borrowRoutes = require("./routes/borrowRoutes");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Base Route
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

/**
 * POST /jwt - Issue a verified JWT token
 * SECURITY: Prevents impersonation by tying JWT issuance to a valid,
 * active BetterAuth database session. An arbitrary email cannot be spoofed.
 */
app.post("/jwt", async (req, res) => {
  try {
    const { sessionToken, email, name } = req.body;
    const db = getDB();

    // 1. Verify active BetterAuth session in the database
    if (sessionToken && db) {
      // BetterAuth session lookup (handles both 'session' and 'sessions' collections)
      const session =
        (await db.collection("session").findOne({
          token: sessionToken,
          expiresAt: { $gt: new Date() },
        })) ||
        (await db.collection("sessions").findOne({
          token: sessionToken,
          expiresAt: { $gt: new Date() },
        }));

      if (!session) {
        return res.status(401).send({
          message: "Unauthorized: Invalid or expired session",
        });
      }

      // Fetch authentic user from database
      const userQuery = {
        $or: [
          { _id: session.userId },
          { id: session.userId },
          ...(ObjectId.isValid(session.userId) ? [{ _id: new ObjectId(session.userId) }] : []),
        ],
      };

      const user =
        (await db.collection("user").findOne(userQuery)) ||
        (await db.collection("users").findOne(userQuery));

      if (!user) {
        return res.status(401).send({
          message: "Unauthorized: User account not found for this session",
        });
      }

      const token = jwt.sign(
        { email: user.email, name: user.name || "User", userId: user._id || user.id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.status(200).send({
        message: "Token generated successfully from verified session",
        token,
      });
    }

    // 2. Automated test environment fallback (isolated to test runner only)
    if (process.env.NODE_ENV === "test" && email) {
      const token = jwt.sign(
        { email, name: name || "Test User" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      return res.status(200).send({
        message: "Test token generated successfully",
        token,
      });
    }

    // 3. Reject any unauthenticated attempt to generate tokens
    return res.status(400).send({
      message: "Session token is required to issue a JWT",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to generate token",
      error: error.message,
    });
  }
});

// Main API Routes
app.use("/books", bookRoutes);
app.use("/borrows", borrowRoutes);

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`BookNook server running on port ${PORT}`);
  });
};

// Export app for testing purposes
if (process.env.NODE_ENV !== "test") {
  startServer();
}

module.exports = app;
