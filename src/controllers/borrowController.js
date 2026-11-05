const { getDB } = require("../config/db");
const { ObjectId } = require("mongodb");
const { validateBorrowData } = require("../utils/verifyData");

// Helper to ensure database-level unique index on borrows collection
let indexInitialized = false;
const ensureBorrowIndexes = async (db) => {
  if (indexInitialized || !db) return;
  try {
    // Unique compound index: a user can only have one borrow record per bookId
    await db.collection("borrows").createIndex(
      { bookId: 1, userEmail: 1 },
      { unique: true, background: true }
    );
    indexInitialized = true;
  } catch (err) {
    // Index may already exist or collection is empty/mocked
    indexInitialized = true;
  }
};

/**
 * POST /borrows - Borrow a book (Protected route)
 * 1. Database-level unique index prevents simultaneous duplicate borrows
 * 2. Checks available copies > 0
 * 3. Atomically decrements available copies by 1 with $inc
 * 4. Inserts borrow record into "borrows" collection
 * 5. Automatic rollback if insert fails
 */
const borrowBook = async (req, res) => {
  try {
    const db = getDB();
    await ensureBorrowIndexes(db);

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

    // 1. Pre-check: Check if user currently has this book borrowed
    const existingBorrow = await db.collection("borrows").findOne({
      bookId: bookId,
      userEmail: userEmail,
    });

    if (existingBorrow) {
      return res.status(400).send({
        message: "You have already borrowed this book. Please return it before borrowing again.",
      });
    }

    // 2. Atomically decrement copies by 1 ONLY if copies > 0
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

    const updatedBook = updateResult && updateResult.value !== undefined ? updateResult.value : updateResult;

    if (!updatedBook) {
      // Check if book exists or if it's completely out of stock
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
      // Compensating rollback: restore decremented copy count
      await db.collection("books").updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { copies: 1 } }
      );

      // Handle MongoDB E11000 duplicate key error (concurrency protection)
      if (insertError.code === 11000) {
        return res.status(400).send({
          message: "You have already borrowed this book. Please return it before borrowing again.",
        });
      }

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
 * 1. Atomically finds and deletes borrow record for the verified user
 * 2. Increments book copies by 1 with $inc
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

    // Atomic deletion: ensure it deletes only if owned by the logged-in user
    const deleteResult = await db.collection("borrows").findOneAndDelete({
      _id: new ObjectId(id),
      userEmail: req.user.email,
    });

    const deletedRecord = deleteResult && deleteResult.value !== undefined ? deleteResult.value : deleteResult;

    if (!deletedRecord) {
      // Check if record exists under a different user to provide exact 403 vs 404
      const otherBorrow = await db.collection("borrows").findOne({
        _id: new ObjectId(id),
      });

      if (otherBorrow) {
        return res.status(403).send({
          message: "Forbidden: You can only return books that you borrowed",
        });
      }

      return res.status(404).send({
        message: "Borrow record not found",
      });
    }

    // Atomically increment available copies on the book
    if (ObjectId.isValid(deletedRecord.bookId)) {
      await db.collection("books").updateOne(
        { _id: new ObjectId(deletedRecord.bookId) },
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
