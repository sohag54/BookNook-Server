/**
 * Mock DB verification test for BookNook Server endpoints
 * Tests all 8 required routes + JWT verification + error handling + security features
 */
process.env.NODE_ENV = "test";
require("dotenv").config();
const jwt = require("jsonwebtoken");
const http = require("http");
const express = require("express");
const { ObjectId } = require("mongodb");

// Setup in-memory mock collections
const booksStore = new Map();
const borrowsStore = new Map();
const sessionsStore = new Map();
const usersStore = new Map();

function createMockCollection(store, name) {
  return {
    createIndex: async () => true,
    countDocuments: async (query = {}) => {
      let count = 0;
      for (const item of store.values()) {
        let match = true;
        if (query.bookId && item.bookId !== query.bookId) match = false;
        if (match) count++;
      }
      return count;
    },
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
        if (query.token && item.token !== query.token) match = false;
        if (query.expiresAt && query.expiresAt.$gt && new Date(item.expiresAt) <= query.expiresAt.$gt) match = false;
        if (match) return { ...item };
      }
      return null;
    },
    insertOne: async (doc) => {
      // Simulate unique compound index for borrows: (bookId + userEmail)
      if (name === "borrows") {
        for (const item of store.values()) {
          if (item.bookId === doc.bookId && item.userEmail === doc.userEmail) {
            const err = new Error("E11000 duplicate key error collection");
            err.code = 11000;
            throw err;
          }
        }
      }
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
    findOneAndDelete: async (filter) => {
      const id = filter._id.toString();
      const existing = store.get(id);
      if (existing && (!filter.userEmail || existing.userEmail === filter.userEmail)) {
        store.delete(id);
        return { value: existing };
      }
      return null;
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
    if (name === "books") return createMockCollection(booksStore, "books");
    if (name === "borrows") return createMockCollection(borrowsStore, "borrows");
    if (name === "session" || name === "sessions") return createMockCollection(sessionsStore, "sessions");
    if (name === "user" || name === "users") return createMockCollection(usersStore, "users");
    throw new Error(`Unknown collection: ${name}`);
  }
};

// Override getDB in db config
const dbConfig = require("./src/config/db");
const originalGetDB = dbConfig.getDB;
dbConfig.getDB = () => mockDB;

const app = require("./src/server");

async function runMockTests() {
  console.log("=== Running BookNook API Endpoint Unit & Security Tests ===");
  const PORT = 5556;
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${PORT}`;

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

    // 2. SECURITY TEST: POST /jwt with verified BetterAuth session
    const mockUserId = new ObjectId();
    usersStore.set(mockUserId.toString(), {
      _id: mockUserId,
      email: "authenticated_user@example.com",
      name: "Verified User",
    });
    sessionsStore.set("session_123", {
      token: "valid_session_token",
      userId: mockUserId,
      expiresAt: new Date(Date.now() + 86400000), // 24h from now
    });

    const r2Session = await fetch(`${baseUrl}/jwt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: "valid_session_token" }),
    });
    const d2Session = await r2Session.json();
    assert(r2Session.status === 200 && d2Session.token, "2. POST /jwt verifies BetterAuth session and issues token");

    // Verify token content matches database user, not arbitrary spoofing
    const decoded = jwt.verify(d2Session.token, JWT_SECRET);
    assert(decoded.email === "authenticated_user@example.com", "3. JWT payload securely matches the verified session user");

    // 3. SECURITY TEST: POST /jwt with invalid session token (401 Unauthorized)
    const rInvalidSession = await fetch(`${baseUrl}/jwt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: "invalid_hacker_token" }),
    });
    assert(rInvalidSession.status === 401, "4. POST /jwt with invalid session rejected with 401");

    // 4. GET /books (public)
    const r3 = await fetch(`${baseUrl}/books`);
    const d3 = await r3.json();
    assert(r3.status === 200 && Array.isArray(d3), "5. GET /books returns array");

    // 5. POST /books without token (401)
    const r4 = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No Auth" }),
    });
    assert(r4.status === 401, "6. POST /books without token rejected with 401 Unauthorized");

    // 6. POST /books with invalid data (400)
    const r5 = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ title: "Only Title" }),
    });
    assert(r5.status === 400, "7. POST /books with incomplete fields rejected with 400 Bad Request");

    // 7. POST /books valid (201)
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
    assert(r6.status === 201 && d6.insertedId, "8. POST /books creates book and returns 201 Created");
    const bookId = d6.insertedId;

    // 8. GET /books/:id (200)
    const r7 = await fetch(`${baseUrl}/books/${bookId}`);
    const d7 = await r7.json();
    assert(r7.status === 200 && d7.title === newBookPayload.title, "9. GET /books/:id fetches the created book");

    // 9. PATCH /books/:id with non-owner User B (403 Forbidden)
    const r8 = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ ...newBookPayload, title: "Hacked" }),
    });
    assert(r8.status === 403, "10. PATCH /books/:id by non-owner rejected with 403 Forbidden");

    // 10. PATCH /books/:id with owner User A (200 OK)
    const r9 = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ ...newBookPayload, title: "The Great Novel (Updated)" }),
    });
    const d9 = await r9.json();
    assert(r9.status === 200 && d9.book.title === "The Great Novel (Updated)", "11. PATCH /books/:id by owner updates book");

    // 11. POST /borrows by User B (201 Created & copies decremented to 1)
    const r10 = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ bookId, returnDate: "2026-12-01" }),
    });
    const d10 = await r10.json();
    assert(r10.status === 201 && d10.remainingCopies === 1, "12. POST /borrows succeeds and atomically decrements copies to 1");
    const borrowId = d10.insertedId;

    // 12. CONCURRENCY & DUPLICATE BORROW PROTECTION: Simultaneous attempt rejected
    const r11 = await fetch(`${baseUrl}/borrows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ bookId, returnDate: "2026-12-01" }),
    });
    assert(r11.status === 400, "13. POST /borrows prevents duplicate borrow with 400 Bad Request");

    // 13. GET /borrows by User B (returns User B's borrows)
    const r12 = await fetch(`${baseUrl}/borrows`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const d12 = await r12.json();
    assert(r12.status === 200 && d12.length === 1 && d12[0].bookId === bookId, "14. GET /borrows returns only the logged-in user's borrows");

    // 14. DATA INTEGRITY: Attempting to delete a book with active borrows rejected
    const rDeleteActiveBook = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(rDeleteActiveBook.status === 400, "15. DELETE /books/:id blocked if book currently has active borrows");

    // 15. DELETE /borrows/:id by non-borrower User A (403 Forbidden)
    const r13 = await fetch(`${baseUrl}/borrows/${borrowId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(r13.status === 403, "16. DELETE /borrows/:id by non-borrower rejected with 403 Forbidden");

    // 16. DELETE /borrows/:id by borrower User B (200 OK & copies incremented back to 2)
    const r14 = await fetch(`${baseUrl}/borrows/${borrowId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(r14.status === 200, "17. DELETE /borrows/:id by borrower returns book with 200 OK");

    const rCheckCopies = await fetch(`${baseUrl}/books/${bookId}`);
    const dCheckCopies = await rCheckCopies.json();
    assert(dCheckCopies.copies === 2, "18. Copies correctly restored to 2 upon returning book");

    // 17. DELETE /books/:id by non-owner User B (403 Forbidden)
    const r16 = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(r16.status === 403, "19. DELETE /books/:id by non-owner rejected with 403 Forbidden");

    // 18. DELETE /books/:id by owner User A (200 OK now that borrows are 0)
    const r17 = await fetch(`${baseUrl}/books/${bookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(r17.status === 200, "20. DELETE /books/:id by owner succeeds once all borrows are returned");

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
