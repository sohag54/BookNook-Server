const { getDB } = require("../config/db");
const { ObjectId } = require("mongodb");
const { validateBorrowData } = require("../utils/verifyData");

/**
 * POST /borrows - Borrow a book (Protected route)
 * 1. Checks for double-borrowing (user cannot borrow the same book twice simultaneously)
 * 2. Checks available copies > 0
 * 3. Atomically decrements available copies by 1 with $inc
 * 4. Inserts borrow record into "borrows" collection
 */
const borrowBook = async (req, res) => {
  try {
    const db = getDB();
    const validation = validateBorrowData(req.body);

    if (!validation.isValid) {
      return res.status(400).send({
        message: "Validation failed",
        errors: validation.errors,
      });
    }

    const { bookId, returnDate } = req.body;
    const userEmail = req.user.email;
    const userName = req.body.userName || req.user.name || "Anonymous";

    if (!ObjectId.isValid(bookId)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    // 1. Prevent duplicate borrow: Check if user currently has this book borrowed
    const existingBorrow = await db.collection("borrows").findOne({
      bookId: bookId,
      userEmail: userEmail,
    });

    if (existingBorrow) {
      return res.status(400).send({
        message: "You have already borrowed this book. Please return it before borrowing again.",
      });
    }

    // 2. Safely decrement copies by 1 only if copies > 0 (atomic operation)
    const updateResult = await db.collection("books").findOneAndUpdate(
      {
        _id: new ObjectId(bookId),
        copies: { $gt: 0 },
      },
      {
        $inc: { copies: -1 },
      },
      {
        returnDocument: "after",
      }
    );

    // If updateResult is null (or .value is null depending on MongoDB driver version)
    const updatedBook = updateResult && updateResult.value !== undefined ? updateResult.value : updateResult;

    if (!updatedBook) {
      // Check if book exists at all or just out of copies
      const bookExists = await db.collection("books").findOne({
        _id: new ObjectId(bookId),
      });

      if (!bookExists) {
        return res.status(404).send({
          message: "Book not found",
        });
      }

      return res.status(400).send({
        message: "This book is not available (0 copies left)",
      });
    }

    // 3. Create borrow record
    const borrowRecord = {
      bookId: bookId,
      bookTitle: updatedBook.title,
      bookImage: updatedBook.image,
      userEmail: userEmail,
      userName: userName,
      borrowDate: new Date().toISOString().split("T")[0],
      returnDate: returnDate,
      createdAt: new Date(),
    };

    try {
      const result = await db.collection("borrows").insertOne(borrowRecord);

      res.status(201).send({
        message: "Book borrowed successfully",
        insertedId: result.insertedId,
        borrow: { ...borrowRecord, _id: result.insertedId },
        remainingCopies: updatedBook.copies,
      });
    } catch (insertError) {
      // Rollback copies decrement if insert fails
      await db.collection("books").updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { copies: 1 } }
      );
      throw insertError;
    }
  } catch (error) {
    res.status(500).send({
      message: "Failed to borrow book",
      error: error.message,
    });
  }
};

/**
 * GET /borrows - Get all borrows of the logged-in user (Protected route)
 */
const getUserBorrows = async (req, res) => {
  try {
    const db = getDB();
    const userEmail = req.user.email;

    const borrows = await db
      .collection("borrows")
      .find({ userEmail: userEmail })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(borrows);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch borrowed books",
      error: error.message,
    });
  }
};

/**
 * DELETE /borrows/:id - Return a borrowed book (Protected route)
 * 1. Verifies ownership (only user who borrowed can return)
 * 2. Deletes borrow record
 * 3. Increments book copies by 1 with $inc
 */
const returnBook = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid borrow record ID",
      });
    }

    // Find the borrow record
    const borrowRecord = await db.collection("borrows").findOne({
      _id: new ObjectId(id),
    });

    if (!borrowRecord) {
      return res.status(404).send({
        message: "Borrow record not found",
      });
    }

    // Ownership check: must be the user who borrowed it
    if (borrowRecord.userEmail !== req.user.email) {
      return res.status(403).send({
        message: "Forbidden: You can only return books that you borrowed",
      });
    }

    // Remove borrow record
    await db.collection("borrows").deleteOne({ _id: new ObjectId(id) });

    // Increment available copies on the book
    if (ObjectId.isValid(borrowRecord.bookId)) {
      await db.collection("books").updateOne(
        { _id: new ObjectId(borrowRecord.bookId) },
        { $inc: { copies: 1 } }
      );
    }

    res.status(200).send({
      message: "Book returned successfully",
      returnedId: id,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to return book",
      error: error.message,
    });
  }
};

module.exports = {
  borrowBook,
  getUserBorrows,
  returnBook,
};
