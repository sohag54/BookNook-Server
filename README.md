# BookNook Server

BookNook is a small online library backend service built with Express.js and MongoDB. It powers user authentication, book catalog management, and an atomic borrowing/returning workflow.

## Features

- **Book Catalog CRUD**: Public routes to view all books and book details, with protected routes to add, update, and delete books.
- **Ownership Verification**: Users can only update or delete books that they personally added.
- **Atomic Borrow System**: Safely decrements book copies by 1 on borrow using MongoDB `$inc`, and increments copies back by 1 upon return.
- **Double Borrow Prevention**: Prevents users from borrowing the same book more than once simultaneously.
- **Zero-Copy Lock**: Disables borrowing when copies reach 0.
- **JWT Authorization**: Protects private routes with custom `verifyToken` middleware.

---

## API Documentation

### Public Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Root server health check |
| `GET` | `/books` | Get all books (supports `?limit=6`, `?sort=newest`, and `?email=...`) |
| `GET` | `/books/:id` | Get single book by MongoDB ObjectId |
| `POST` | `/jwt` | Generate a signed JWT token for authenticated users |

### Protected Endpoints (Requires `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/books` | Add a new book (with `title`, `author`, `category`, `image`, `description`, `copies`) |
| `PATCH` | `/books/:id` | Update an existing book (ownership verified) |
| `DELETE` | `/books/:id` | Delete a book (ownership verified) |
| `POST` | `/borrows` | Borrow a book (atomic copy decrement & duplicate prevention) |
| `GET` | `/borrows` | Get all borrows of the logged-in user |
| `DELETE` | `/borrows/:id` | Return a borrowed book (atomic copy increment & ownership check) |

---

## Environment Variables

Create a `.env` file in the root of `booknook-server` based on `.env.example`:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
DB_NAME=booknook
JWT_SECRET=your_jwt_secret_key
```

---

## Installation & Running

```bash
# Install dependencies
npm install

# Run in development mode (with nodemon)
npm run dev

# Run in production mode
npm start

# Run API test suite
npm test
```
