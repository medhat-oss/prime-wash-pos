/**
 * Prime Wash POS - Canvas-based Base64 Image Compressor & Resizer
 * Shrinks large camera/gallery photos before Base64 serialization to protect localStorage quotas.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputFormat?: 'image/jpeg' | 'image/webp' | 'image/png';
}

/**
 * Resizes and compresses an image file using an off-screen HTML5 Canvas.
 * Reduces a multi-megabyte image (3MB - 8MB) to ~25KB - 60KB.
 */
export const compressImageFile = async (
  file: File,
  options: CompressionOptions = {}
): Promise<string> => {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.75,
    outputFormat = 'image/jpeg',
  } = options;

  // If running in non-DOM environment (e.g. Node tests), return basic DataURL
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Non-image files or GIFs (preserve animation) should pass through
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect-ratio-preserving dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback if 2d context unavailable
          resolve(readerEvent.target?.result as string);
          return;
        }

        // Fill white background for transparent PNG converted to JPEG
        if (outputFormat === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        // Draw and smoothly scale
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to compact DataURL
        const compressedDataUrl = canvas.toDataURL(outputFormat, quality);
        resolve(compressedDataUrl);
      };

      img.onerror = () => {
        // Fallback to original DataURL if image loading fails
        resolve(readerEvent.target?.result as string);
      };

      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

/**
 * Helper to estimate the byte size of a Base64 string
 */
export const getBase64SizeBytes = (base64String: string): number => {
  if (!base64String) return 0;
  const padding = (base64String.match(/=+$/) || [''])[0].length;
  const base64Length = base64String.length - (base64String.indexOf(',') + 1);
  return Math.floor((base64Length * 3) / 4) - padding;
};

/**
 * Format bytes to readable string (e.g. "45.2 KB")
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
