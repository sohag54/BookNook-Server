const express = require("express");
const {
  getAllBooks,
  getBookById,
  addBook,
  updateBook,
  deleteBook,
} = require("../controllers/bookController");
const verifyToken = require("../middlewares/verifyToken");
const { uploadBookCover } = require("../middlewares/uploadImage");

const router = express.Router();

// Public routes
router.get("/", getAllBooks);
router.get("/:id", getBookById);

// Protected routes (require valid JWT token)
router.post("/", verifyToken, uploadBookCover, addBook);
router.patch("/:id", verifyToken, updateBook);
router.delete("/:id", verifyToken, deleteBook);

module.exports = router;
