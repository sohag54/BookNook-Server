const multer = require("multer");

// Use memory storage to avoid writing temporary files to disk
const storage = multer.memoryStorage();

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error("Invalid file type. Only JPEG, PNG, and WebP images are allowed.");
    error.code = "INVALID_FILE_TYPE";
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB limit
  },
  fileFilter,
});

// Support "image", "coverImage", or "file" field names
const uploadHandler = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

/**
 * Middleware for optional multipart book cover upload on POST /books.
 * - If the incoming request is multipart/form-data, parses files and form fields.
 * - Sets req.file if a matching file field was uploaded.
 * - If the request is application/json or no file is attached, passes through cleanly.
 */
const uploadBookCover = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return next();
  }

  uploadHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).send({
            message: "Image file size exceeds the 5MB limit. Please choose a smaller image.",
          });
        }
        return res.status(400).send({
          message: `Upload error: ${err.message}`,
        });
      }
      return res.status(400).send({
        message: err.message || "Invalid file upload.",
      });
    }

    // Normalize single file access to req.file
    if (req.files) {
      req.file =
        req.files.image?.[0] ||
        req.files.coverImage?.[0] ||
        req.files.file?.[0] ||
        null;
    }

    next();
  });
};

module.exports = { uploadBookCover };
