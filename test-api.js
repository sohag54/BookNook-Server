require("dotenv").config();
const { connectDB, getDB } = require("./src/config/db");
const app = require("./src/server");
const jwt = require("jsonwebtoken");
const http = require("http");

async function runTests() {
  console.log("--- Starting BookNook Backend API Tests ---");

  // Connect to DB
  try {
    await connectDB();
    console.log("✓ MongoDB Connected");
  } catch (err) {
    console.error("✗ DB Connection Failed:", err.message);
    process.exit(1);
  }

  const PORT = 5555;
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(PORT, resolve));
  const baseUrl = `http://localhost:${PORT}`;
  console.log(`✓ Test Server listening on ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // Test 1: GET / (Root health check)
    const resRoot = await fetch(`${baseUrl}/`);
    const textRoot = await resRoot.text();
    assert(resRoot.status === 200 && textRoot.includes("BookNook Server is Running!"), "GET / returns 200 and running message");

    // Test 2: Token generation for User A and User B
    const userA = { email: "testerA@example.com", name: "Tester A" };
    const userB = { email: "testerB@example.com", name: "Tester B" };

    const tokenA = jwt.sign(userA, process.env.JWT_SECRET, { expiresIn: "1h" });
    const tokenB = jwt.sign(userB, process.env.JWT_SECRET, { expiresIn: "1h" });
    assert(tokenA && tokenB, "Generated JWT tokens for test users");

    // Test 3: GET /books (public)
    const resBooks = await fetch(`${baseUrl}/books`);
    const booksList = await resBooks.json();
    assert(resBooks.status === 200 && Array.isArray(booksList), "GET /books returns 200 with an array");

    // Test 4: POST /books without token (should be 401 Unauthorized)
    const resNoAuth = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No Auth Book" }),
    });
    assert(resNoAuth.status === 401, "POST /books without token rejected with 401");

    // Test 5: POST /books with invalid data
    const resInvalidData = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ title: "Incomplete Book" }),
    });
    assert(resInvalidData.status === 400, "POST /books with invalid data rejected with 400");

    // Test 6: POST /books with valid data by User A
    const validBook = {
      title: "Automated Test Book",
      author: "Test Author",
      category: "Fiction",
      image: "https://i.ibb.co/test-image.jpg",
      description: "A test book created during automated verification.",
      copies: 2,
    };

    const resCreate = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify(validBook),
    });
    const createdBookData = await resCreate.json();
    assert(resCreate.status === 201 && createdBookData.insertedId, "POST /books with valid data returns 201 Created");
    const bookId = createdBookData.insertedId;

    // Test 7: GET /books/:id
    const resGetOne = await fetch(`${baseUrl}/books/${bookId}`);
    const fetchedBook = await resGetOne.json();
    assert(resGetOne.status === 200 && fetchedBook.title === validBook.title, "GET /books/:id returns 200 with correct book");

    // Test 8: PATCH /books/:id by User B (Forbidden ownership check)
    const resPatchUserB = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ ...validBook, title: "Hacked Title" }),
    });
    assert(resPatchUserB.status === 403, "PATCH /books/:id by non-owner rejected with 403 Forbidden");

    // Test 9: PATCH /books/:id by User A (Owner update)
    const resPatchUserA = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ ...validBook, title: "Updated Test Book Title" }),
    });
    const updatedBook = await resPatchUserA.json();
    assert(resPatchUserA.status === 200 && updatedBook.book.title === "Updated Test Book Title", "PATCH /books/:id by owner returns 200 Updated");

    // Test 10: POST /borrows by User B (copies should decrement from 2 to 1)
    const resBorrow1 = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        bookId: bookId,
        returnDate: "2026-12-31",
      }),
    });
    const borrowData1 = await resBorrow1.json();
    assert(resBorrow1.status === 201 && borrowData1.remainingCopies === 1, "POST /borrows succeeds and decrements copies to 1");
    const borrowId = borrowData1.insertedId;

    // Test 11: Double Borrow Prevention (User B tries to borrow the same book again)
    const resDoubleBorrow = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        bookId: bookId,
        returnDate: "2026-12-31",
      }),
    });
    assert(resDoubleBorrow.status === 400, "POST /borrows rejects duplicate borrow with 400 Bad Request");

    // Test 12: GET /borrows by User B
    const resGetBorrowsB = await fetch(`${baseUrl}/borrows`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const userBBorrows = await resGetBorrowsB.json();
    assert(resGetBorrowsB.status === 200 && userBBorrows.length >= 1 && userBBorrows.some(b => b.bookId === bookId), "GET /borrows returns User B's borrowed books");

    // Test 13: DELETE /borrows/:id by User A (non-borrower -> 403 Forbidden)
    const resReturnWrongUser = await fetch(`${baseUrl}/borrows/${borrowId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(resReturnWrongUser.status === 403, "DELETE /borrows/:id by non-borrower rejected with 403 Forbidden");

    // Test 14: DELETE /borrows/:id by User B (Borrower returns book -> copies back to 2)
    const resReturnUserB = await fetch(`${baseUrl}/borrows/${borrowId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(resReturnUserB.status === 200, "DELETE /borrows/:id by borrower returns 200 OK");

    // Verify copies incremented back to 2
    const resBookAfterReturn = await fetch(`${baseUrl}/books/${bookId}`);
    const bookAfterReturn = await resBookAfterReturn.json();
    assert(bookAfterReturn.copies === 2, "Book copies correctly incremented back to 2 after return");

    // Test 15: DELETE /books/:id by User B (non-owner -> 403 Forbidden)
    const resDeleteWrongUser = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(resDeleteWrongUser.status === 403, "DELETE /books/:id by non-owner rejected with 403 Forbidden");

    // Test 16: DELETE /books/:id by User A (owner -> 200 Deleted)
    const resDeleteOwner = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(resDeleteOwner.status === 200, "DELETE /books/:id by owner returns 200 OK");

    console.log(`\n--- Test Results: ${passed} PASSED, ${failed} FAILED ---`);
  } finally {
    server.close();
    const db = getDB();
    if (db) {
      // Clean up test records if any remain
      await db.collection("books").deleteMany({ title: /Test Book/ });
      await db.collection("borrows").deleteMany({ userEmail: { $in: ["testerA@example.com", "testerB@example.com"] } });
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
