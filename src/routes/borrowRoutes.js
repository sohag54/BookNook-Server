const express = require("express");
const {
  borrowBook,
  getUserBorrows,
  returnBook,
} = require("../controllers/borrowController");
const verifyToken = require("../middlewares/verifyToken");

const router = express.Router();

// All borrow routes are protected by JWT verification
router.post("/", verifyToken, borrowBook);
router.get("/", verifyToken, getUserBorrows);
router.delete("/:id", verifyToken, returnBook);

module.exports = router;

