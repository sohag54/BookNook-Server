/**
 * Validate book input data for create and update
 */
const validateBookData = (data) => {
  const errors = [];
  const validCategories = ["Fiction", "Science", "History", "Kids", "Others"];

  if (!data.title || typeof data.title !== "string" || !data.title.trim()) {
    errors.push("Book title is required");
  }

  if (!data.author || typeof data.author !== "string" || !data.author.trim()) {
    errors.push("Author name is required");
  }

  if (!data.category || !validCategories.includes(data.category)) {
    errors.push(`Category must be one of: ${validCategories.join(", ")}`);
  }

  if (!data.image || typeof data.image !== "string" || !data.image.trim()) {
    errors.push("Book image URL is required");
  }

  if (!data.description || typeof data.description !== "string" || !data.description.trim()) {
    errors.push("Short description is required");
  }

  const copies = Number(data.copies);
  if (isNaN(copies) || copies < 0 || !Number.isInteger(copies)) {
    errors.push("Total copies must be a non-negative whole number");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate borrow input data
 */
const validateBorrowData = (data) => {
  const errors = [];

  if (!data.bookId || typeof data.bookId !== "string" || !data.bookId.trim()) {
    errors.push("Book ID is required");
  }

  if (!data.returnDate || typeof data.returnDate !== "string" || !data.returnDate.trim()) {
    errors.push("Return date is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateBookData,
  validateBorrowData,
};

