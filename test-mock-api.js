/**
 * Mock DB verification test for BookNook Server endpoints
 * This tests all 8 required routes + JWT verification + error handling
 * using an in-memory replica of MongoDB collection operations, ensuring
 * that the controllers and routes are completely functional.
 */
process.env.NODE_ENV = "test";
require("dotenv").config();
const jwt = require("jsonwebtoken");
const http = require("http");
const express = require("express");
const { ObjectId } = require("mongodb");

// Setup in-memory mock collection
const booksStore = new Map();
const borrowsStore = new Map();

function createMockCollection(store) {
  return {
    find: (query = {}) => ({
      sort: (sortObj) => ({
        limit: (n) => ({
          toArray: async () => {
            let items = Array.from(store.values());
            if (query.userEmail) {
              items = items.filter(i => i.userEmail === query.userEmail);
            }
            if (sortObj && sortObj.createdAt === -1) {
              items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }
            return items.slice(0, n);
          }
        }),
        toArray: async () => {
          let items = Array.from(store.values());
          if (query.userEmail) {
            items = items.filter(i => i.userEmail === query.userEmail);
          }
          if (sortObj && sortObj.createdAt === -1) {
            items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          }
          return items;
        }
      }),
      toArray: async () => {
        let items = Array.from(store.values());
        if (query.userEmail) {
          items = items.filter(i => i.userEmail === query.userEmail);
        }
        return items;
      }
    }),
    findOne: async (query) => {
      for (const item of store.values()) {
        let match = true;
        if (query._id && item._id.toString() !== query._id.toString()) match = false;
        if (query.bookId && item.bookId !== query.bookId) match = false;
        if (query.userEmail && item.userEmail !== query.userEmail) match = false;
        if (match) return { ...item };
      }
      return null;
    },
    insertOne: async (doc) => {
      const _id = new ObjectId();
      const saved = { ...doc, _id };
      store.set(_id.toString(), saved);
      return { insertedId: _id };
    },
    updateOne: async (filter, update) => {
      const id = filter._id.toString();
      const existing = store.get(id);
      if (existing) {
        if (update.$set) Object.assign(existing, update.$set);
        if (update.$inc) {
          for (const key of Object.keys(update.$inc)) {
            existing[key] = (existing[key] || 0) + update.$inc[key];
          }
        }
        store.set(id, existing);
      }
      return { matchedCount: existing ? 1 : 0 };
    },
    findOneAndUpdate: async (filter, update, options) => {
      const id = filter._id.toString();
      const existing = store.get(id);
      if (!existing) return null;
      if (filter.copies && filter.copies.$gt !== undefined && existing.copies <= filter.copies.$gt) {
        return null;
      }
      if (update.$inc) {
        for (const key of Object.keys(update.$inc)) {
          existing[key] = (existing[key] || 0) + update.$inc[key];
        }
      }
      store.set(id, existing);
      return { ...existing };
    },
    deleteOne: async (filter) => {
      const id = filter._id.toString();
      store.delete(id);
      return { deletedCount: 1 };
    }
  };
}

const mockDB = {
  collection: (name) => {
    if (name === "books") return createMockCollection(booksStore);
    if (name === "borrows") return createMockCollection(borrowsStore);
    throw new Error(`Unknown collection: ${name}`);
  }
};

// Override getDB in db config
const dbConfig = require("./src/config/db");
const originalGetDB = dbConfig.getDB;
dbConfig.getDB = () => mockDB;

const app = require("./src/server");

async function runMockTests() {
  console.log("=== Running BookNook API Endpoint Unit & Integration Tests ===");
  const PORT = 5556;
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log("Server started on", baseUrl);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret";
  process.env.JWT_SECRET = JWT_SECRET;

  const userA = { email: "testerA@example.com", name: "Tester A" };
  const userB = { email: "testerB@example.com", name: "Tester B" };

  const tokenA = jwt.sign(userA, JWT_SECRET, { expiresIn: "1h" });
  const tokenB = jwt.sign(userB, JWT_SECRET, { expiresIn: "1h" });

  try {
    // 1. GET /
    const r1 = await fetch(`${baseUrl}/`);
    assert(r1.status === 200, "1. GET / responds with 200 status");

    // 2. POST /jwt
    const r2 = await fetch(`${baseUrl}/jwt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", name: "User" }),
    });
    const d2 = await r2.json();
    assert(r2.status === 200 && d2.token, "2. POST /jwt issues signed token successfully");

    // 3. GET /books (initially empty)
    const r3 = await fetch(`${baseUrl}/books`);
    const d3 = await r3.json();
    assert(r3.status === 200 && Array.isArray(d3), "3. GET /books returns array");

    // 4. POST /books without token (401)
    const r4 = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No Auth" }),
    });
    assert(r4.status === 401, "4. POST /books without token rejected with 401 Unauthorized");

    // 5. POST /books with invalid data (400)
    const r5 = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ title: "Only Title" }),
    });
    assert(r5.status === 400, "5. POST /books with incomplete fields rejected with 400 Bad Request");

    // 6. POST /books valid (201)
    const newBookPayload = {
      title: "The Great Novel",
      author: "Jane Doe",
      category: "Fiction",
      image: "https://i.ibb.co/example.jpg",
      description: "A wonderful novel about adventure.",
      copies: 2,
    };
    const r6 = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify(newBookPayload),
    });
    const d6 = await r6.json();
    assert(r6.status === 201 && d6.insertedId, "6. POST /books creates book and returns 201 Created");
    const bookId = d6.insertedId;

    // 7. GET /books/:id (200)
    const r7 = await fetch(`${baseUrl}/books/${bookId}`);
    const d7 = await r7.json();
    assert(r7.status === 200 && d7.title === newBookPayload.title, "7. GET /books/:id fetches the created book");

    // 8. PATCH /books/:id with non-owner User B (403 Forbidden)
    const r8 = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ ...newBookPayload, title: "Hacked" }),
    });
    assert(r8.status === 403, "8. PATCH /books/:id by non-owner rejected with 403 Forbidden");

    // 9. PATCH /books/:id with owner User A (200 OK)
    const r9 = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ ...newBookPayload, title: "The Great Novel (Updated)" }),
    });
    const d9 = await r9.json();
    assert(r9.status === 200 && d9.book.title === "The Great Novel (Updated)", "9. PATCH /books/:id by owner updates book");

    // 10. POST /borrows by User B (201 Created & copies decremented to 1)
    const r10 = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ bookId, returnDate: "2026-12-01" }),
    });
    const d10 = await r10.json();
    assert(r10.status === 201 && d10.remainingCopies === 1, "10. POST /borrows succeeds and atomically decrements copies to 1");
    const borrowId = d10.insertedId;

    // 11. POST /borrows duplicate attempt by User B (400 Double Borrow Error)
    const r11 = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ bookId, returnDate: "2026-12-01" }),
    });
    assert(r11.status === 400, "11. POST /borrows prevents double borrow with 400 Bad Request");

    // 12. GET /borrows by User B (returns User B's borrows)
    const r12 = await fetch(`${baseUrl}/borrows`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const d12 = await r12.json();
    assert(r12.status === 200 && d12.length === 1 && d12[0].bookId === bookId, "12. GET /borrows returns only the logged-in user's borrows");

    // 13. DELETE /borrows/:id by non-borrower User A (403 Forbidden)
    const r13 = await fetch(`${baseUrl}/borrows/${borrowId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(r13.status === 403, "13. DELETE /borrows/:id by non-borrower rejected with 403 Forbidden");

    // 14. DELETE /borrows/:id by borrower User B (200 OK & copies incremented back to 2)
    const r14 = await fetch(`${baseUrl}/borrows/${borrowId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(r14.status === 200, "14. DELETE /borrows/:id by borrower returns book with 200 OK");

    const rCheckCopies = await fetch(`${baseUrl}/books/${bookId}`);
    const dCheckCopies = await rCheckCopies.json();
    assert(dCheckCopies.copies === 2, "15. Copies incremented back to 2 upon returning book");

    // 16. DELETE /books/:id by non-owner User B (403 Forbidden)
    const r16 = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(r16.status === 403, "16. DELETE /books/:id by non-owner rejected with 403 Forbidden");

    // 17. DELETE /books/:id by owner User A (200 OK)
    const r17 = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(r17.status === 200, "17. DELETE /books/:id by owner deletes book with 200 OK");

    console.log(`\n=== Verification Summary: ${passed} PASSED, ${failed} FAILED ===\n`);
  } finally {
    server.close(() => {
      dbConfig.getDB = originalGetDB;
      process.exit(failed > 0 ? 1 : 0);
    });
  }
}

runMockTests().catch(err => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
