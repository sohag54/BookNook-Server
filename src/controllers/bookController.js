
const { getDB } = require("../config/db");
const { ObjectId } = require("mongodb");

// Get all books
const getAllBooks = async (req, res) => {
  try {
    const db = getDB();

    const books = await db.collection("books").find().toArray();

    res.status(200).send(books);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch books",
      error: error.message,
    });
  }
};

// Get a single book by ID
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

module.exports = { getAllBooks, getBookById };
