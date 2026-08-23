import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface UploadResult {
  url: string;
  media_type: 'image' | 'video';
  public_id: string;
  filename: string;
  size: number;
  provider: 'cloudinary' | 'local';
}

export class UploadService {
  private static isCloudinaryConfigured(): boolean {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
  }

  private static initCloudinary() {
    if (this.isCloudinaryConfigured()) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
  }

  /**
   * Uploads file buffer to Cloudinary (if configured) or saves locally to disk
   */
  static async uploadMedia(file: Express.Multer.File): Promise<UploadResult> {
    const isVideo = file.mimetype.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.originalname);
    const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

    // 1. Try Cloudinary if environment variables exist
    if (this.isCloudinaryConfigured()) {
      try {
        this.initCloudinary();

        const result = await new Promise<any>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'car_wash_media',
              resource_type: 'auto',
              transformation: isVideo
                ? [{ quality: 'auto', fetch_format: 'auto' }]
                : [{ quality: 'auto', fetch_format: 'auto', width: 1920, crop: 'limit' }],
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          uploadStream.end(file.buffer);
        });

        return {
          url: result.secure_url,
          media_type: result.resource_type === 'video' ? 'video' : 'image',
          public_id: result.public_id,
          filename: file.originalname,
          size: file.size,
          provider: 'cloudinary',
        };
      } catch (cloudErr: any) {
        console.warn('⚠️ Cloudinary upload failed, falling back to local storage:', cloudErr.message);
      }
    }

    // 2. Fallback to local storage in uploads/media
    const uploadsDir = path.join(process.cwd(), 'uploads', 'media');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = path.extname(file.originalname) || (isVideo ? '.mp4' : '.jpg');
    const randomName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const filePath = path.join(uploadsDir, randomName);

    await fs.promises.writeFile(filePath, file.buffer);

    return {
      url: `/uploads/media/${randomName}`,
      media_type: mediaType,
      public_id: randomName,
      filename: file.originalname,
      size: file.size,
      provider: 'local',
    };
  }
}
