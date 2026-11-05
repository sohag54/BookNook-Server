const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { connectDB } = require("./config/db");
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

// Authentication / JWT Issue endpoint
app.post("/jwt", (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).send({
        message: "Email is required to generate a token",
      });
    }

    const token = jwt.sign(
      { email, name: name || "User" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).send({
      message: "Token generated successfully",
      token,
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
