import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Save PDF buffer to local disk (replaces Cloudinary upload)
 * @param {Buffer} buffer - file buffer from multer
 * @param {string} filename - original filename
 */
export const uploadToCloudinary = async (buffer, filename = 'resume.pdf') => {
  if (!buffer) throw new Error('No file buffer provided');

  const baseName = filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const publicId = `${baseName}_${Date.now()}.pdf`;
  const filePath = path.join(UPLOADS_DIR, publicId);

  fs.writeFileSync(filePath, buffer);

  return {
    secure_url: `http://localhost:5000/uploads/${publicId}`,
    public_id: publicId,
  };
};

/**
 * Delete file from local disk (replaces Cloudinary delete)
 * @param {string} publicId - filename stored locally
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) throw new Error('Public ID is required');
  const filePath = path.join(UPLOADS_DIR, publicId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return { result: 'ok' };
};