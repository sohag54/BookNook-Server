
const express = require("express");

const {
  getAllBooks,
  getBookById,
} = require("../controllers/bookController");

const router = express.Router();

// Get all books
router.get("/", getAllBooks);

// Get a single book by ID
router.get("/:id", getBookById);

module.exports = router;
