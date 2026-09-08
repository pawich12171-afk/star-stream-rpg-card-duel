/**
 * Utilities for client-side image processing, compression, and presets
 * Supports local file uploads from phone or computer and converts to compact Data URLs.
 */

export interface ProcessedImageResult {
  dataUrl: string;
  sizeKb: number;
  width: number;
  height: number;
  fileName: string;
}

/**
 * Resizes and compresses an image File from the user's device.
 * Scales down to max dimensions (e.g. 512x512) and encodes as JPEG data URL.
 * Keeps file size small (~30KB-70KB) so it saves seamlessly in Firestore/localStorage.
 */
export async function processImageFile(
  file: File,
  maxDimension = 512,
  quality = 0.88
): Promise<ProcessedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ กรุณาเลือกไฟล์รูปภาพ เช่น JPG, PNG, WEBP');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('เกิดข้อผิดพลาดในการอ่านไฟล์รูปภาพ'));
    };

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => {
        reject(new Error('ไม่สามารถประมวลผลรูปภาพนี้ได้ อาจเป็นรูปแบบที่ไม่รองรับ'));
      };

      img.onload = () => {
        try {
          let { width, height } = img;

          // Scale proportionally
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('ไม่สามารถสร้าง Canvas Context ได้'));
            return;
          }

          // Smooth rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Export as JPEG (or PNG if has alpha channel and desired, but JPEG is much smaller)
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          // Estimate size in KB from base64 length
          const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);

          resolve({
            dataUrl,
            sizeKb,
            width,
            height,
            fileName: file.name,
          });
        } catch (err: any) {
          reject(new Error(err.message || 'เกิดข้อผิดพลาดในการปรับขนาดภาพ'));
        }
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Fallback avatar URL if an external image fails to load (Star Stream Constellation SVG)
 */
export const DEFAULT_AVATAR_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='%230f172a'%3E%3Crect width='100' height='100' rx='20' fill='%23090d16'/%3E%3Ccircle cx='50' cy='38' r='18' fill='%2306b6d4' fill-opacity='0.25' stroke='%2306b6d4' stroke-width='1.5'/%3E%3Cpath d='M25 80 C25 64 36 58 50 58 C64 58 75 64 75 80 Z' fill='%2306b6d4' fill-opacity='0.25' stroke='%2306b6d4' stroke-width='1.5'/%3E%3Cpolygon points='50,14 52,22 60,24 54,29 56,37 50,32 44,37 46,29 40,24 48,22' fill='%23f59e0b'/%3E%3C/svg%3E";

/**
 * Curated Star Stream Avatar Presets
 */
export const CURATED_AVATARS: {
  id: string;
  name: string;
  url: string;
  character: string;
  frameColor: string;
  tag: string;
}[] = [];

