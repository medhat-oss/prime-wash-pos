import { Router } from 'express';
import multer from 'multer';
import { UploadController } from './upload.controller.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { AppError } from '../../middleware/errorHandler.js';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMime = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-matroska',
    ];
    const allowedExt = /\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|mov|mkv)$/i;

    const isMimeValid = allowedMime.includes(file.mimetype?.toLowerCase());
    const isExtValid = allowedExt.test(file.originalname);

    if (isMimeValid && isExtValid) {
      cb(null, true);
    } else {
      cb(new AppError('نوع الملف غير مدعوم. الصيغ المسموحة: MP4, WebM, JPG, PNG, WebP', 400));
    }
  },

});

const router = Router();

// POST /api/upload/media - Protected with Admin PIN
router.post('/media', requireAdminAuth, upload.single('file'), UploadController.uploadMedia);

export default router;
