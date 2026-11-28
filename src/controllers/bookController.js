const { getDB } = require("../config/db");
const { ObjectId } = require("mongodb");
const { validateBookData } = require("../utils/verifyData");
const { uploadToImgBB } = require("../utils/imgbb");

/**
 * GET /books - Get all books (public)
 * Supports optional queries:
 *  - ?limit=6 & ?sort=newest (for Home page New Arrivals)
 *  - ?email=user@example.com (for filtering books by author/uploader)
 */
const getAllBooks = async (req, res) => {
  try {
    const db = getDB();
    const { limit, sort, email } = req.query;

    const query = {};
    if (email) {
      query.userEmail = email;
    }

    let cursor = db.collection("books").find(query);

    // Sort newest first if requested
    if (sort === "newest") {
      cursor = cursor.sort({ createdAt: -1 });
    }

    // Limit number of books returned (e.g. 6 for Home page)
    if (limit && !isNaN(Number(limit))) {
      cursor = cursor.limit(Number(limit));
    }

    const books = await cursor.toArray();
    res.status(200).send(books);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch books",
      error: error.message,
    });
  }
};

/**
 * GET /books/:id - Get a single book by ID
 */
const getBookById = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const book = await db.collection("books").findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    res.status(200).send(book);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch book",
      error: error.message,
    });
  }
};

/**
 * POST /books - Add a new book (Protected route)
 * PDF fields: Book Title, Author Name, Category, Book Image, Short Description,
 * User Name, User Email, Total Copies (Challenge), Date added
 */
const addBook = async (req, res) => {
  try {
    const db = getDB();

    // If an image file was uploaded via multipart/form-data, upload it to ImgBB
    if (req.file) {
      try {
        const imageUrl = await uploadToImgBB(req.file.buffer, req.file.originalname);
        req.body.image = imageUrl;
      } catch (uploadError) {
        return res.status(uploadError.status || 500).send({
          message: uploadError.message || "Failed to upload image to ImgBB",
        });
      }
    }

    const validation = validateBookData(req.body);

    if (!validation.isValid) {
      return res.status(400).send({
        message: "Validation failed",
        errors: validation.errors,
      });
    }

    // Take user identity from verified JWT token
    const userEmail = req.user.email;
    const userName = req.body.userName || req.user.name || "Anonymous";

    const newBook = {
      title: req.body.title.trim(),
      author: req.body.author.trim(),
      category: req.body.category,
      image: req.body.image.trim(),
      description: req.body.description.trim(),
      copies: Number(req.body.copies),
      userName,
      userEmail,
      createdAt: new Date(),
    };

    const result = await db.collection("books").insertOne(newBook);

    res.status(201).send({
      message: "Book added successfully",
      insertedId: result.insertedId,
      book: { ...newBook, _id: result.insertedId },
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to add book",
      error: error.message,
    });
  }
};

/**
 * PATCH /books/:id - Update an existing book (Protected route)
 * Ensures book ownership: only the user who added the book can update it.
 */
const updateBook = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    // Find the existing book first
    const existingBook = await db.collection("books").findOne({
      _id: new ObjectId(id),
    });

    if (!existingBook) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    // Check ownership: logged in user email must match book's userEmail
    if (existingBook.userEmail !== req.user.email) {
      return res.status(403).send({
        message: "Forbidden: You can only edit books that you added",
      });
    }

    // Validate update data
    const validation = validateBookData(req.body);
    if (!validation.isValid) {
      return res.status(400).send({
        message: "Validation failed",
        errors: validation.errors,
      });
    }

    const updatedFields = {
      title: req.body.title.trim(),
      author: req.body.author.trim(),
      category: req.body.category,
      image: req.body.image.trim(),
      description: req.body.description.trim(),
      copies: Number(req.body.copies),
      updatedAt: new Date(),
    };

    await db.collection("books").updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedFields }
    );

    res.status(200).send({
      message: "Book updated successfully",
      book: { ...existingBook, ...updatedFields },
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to update book",
      error: error.message,
    });
  }
};

/**
 * DELETE /books/:id - Delete a book (Protected route)
 * 1. Ensures book ownership: only creator can delete
 * 2. Integrity check: verifies no users currently have the book borrowed
 */
const deleteBook = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    // Find existing book to verify ownership
    const existingBook = await db.collection("books").findOne({
      _id: new ObjectId(id),
    });

    if (!existingBook) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    // Check ownership
    if (existingBook.userEmail !== req.user.email) {
      return res.status(403).send({
        message: "Forbidden: You can only delete books that you added",
      });
    }

    // Check for active borrows before deletion
    const activeBorrows = await db.collection("borrows").countDocuments({
      bookId: id,
    });

    if (activeBorrows > 0) {
      return res.status(400).send({
        message: "Cannot delete this book because it is currently borrowed by active readers.",
      });
    }

    await db.collection("books").deleteOne({ _id: new ObjectId(id) });

    res.status(200).send({
      message: "Book deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete book",
      error: error.message,
    });
  }
};

module.exports = {
  getAllBooks,
  getBookById,
  addBook,
  updateBook,
  deleteBook,
};
