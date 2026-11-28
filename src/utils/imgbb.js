/**
 * Upload an image buffer to ImgBB API using native Node.js fetch
 * @param {Buffer} buffer - File buffer from Multer memoryStorage
 * @param {string} [filename] - Original filename
 * @returns {Promise<string>} Direct image URL
 */
const uploadToImgBB = async (buffer, filename) => {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    const error = new Error("Server configuration error: IMGBB_API_KEY is not configured.");
    error.status = 500;
    throw error;
  }

  const base64Image = buffer.toString("base64");
  const formData = new FormData();
  formData.append("image", base64Image);
  if (filename) {
    formData.append("name", filename.replace(/\.[^/.]+$/, ""));
  }

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data || !data.success) {
    const errorMsg =
      data?.error?.message ||
      data?.status_txt ||
      `ImgBB upload failed with status ${response.status}`;
    const error = new Error(`ImgBB upload failed: ${errorMsg}`);
    error.status = 502;
    throw error;
  }

  const imageUrl = data.data?.display_url || data.data?.url;
  if (!imageUrl) {
    const error = new Error("ImgBB response did not contain a valid image URL");
    error.status = 502;
    throw error;
  }

  return imageUrl;
};

module.exports = { uploadToImgBB };
