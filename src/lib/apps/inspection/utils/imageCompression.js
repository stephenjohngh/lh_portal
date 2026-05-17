// src/lib/apps/inspection/utils/imageCompression.js
// Image compression utility for inspection photos.
// Uses browser-image-compression library.

import imageCompression from 'browser-image-compression';
import { getLogger }    from '$lib/utils/logger';

const logger = getLogger('ImageCompression');

/**
 * Compress an image blob to specified size and dimensions.
 * @param {Blob} imageBlob
 * @param {Object} options
 * @param {number} options.maxSizeMB          - Max file size in MB (default 0.5)
 * @param {number} options.maxWidthOrHeight   - Max dimension in px (default 1024)
 * @param {boolean} options.useWebWorker      - Use web worker (default true)
 * @returns {Promise<Blob>}
 */
export async function compressImage(imageBlob, options = {}) {
  const compressionOptions = {
    maxSizeMB:        0.5,
    maxWidthOrHeight: 1024,
    useWebWorker:     true,
    fileType:         'image/jpeg',
    initialQuality:   0.8,
    ...options,
  };

  try {
    const before        = (imageBlob.size / 1024).toFixed(2);
    const compressedBlob = await imageCompression(imageBlob, compressionOptions);
    const after         = (compressedBlob.size / 1024).toFixed(2);
    logger(`Compressed ${before} KB → ${after} KB`);
    return compressedBlob;
  } catch (error) {
    logger('❌ Compression failed:', error.message);
    throw new Error('Failed to compress image: ' + error.message);
  }
}

/**
 * Convert a File or Blob to a data URL (for previews).
 * @param {Blob|File} blob
 * @returns {Promise<string>}
 */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get image dimensions from a blob.
 * @param {Blob} blob
 * @returns {Promise<{width: number, height: number}>}
 */
export function getImageDimensions(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.width, height: img.height }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

/**
 * Validate image before compression.
 * @param {Blob} blob
 * @param {number} maxSize - Max bytes (default 10 MB)
 * @returns {Promise<boolean>}
 */
export async function validateImage(blob, maxSize = 10 * 1024 * 1024) {
  if (!blob.type.startsWith('image/')) throw new Error('File must be an image');
  if (blob.size > maxSize) throw new Error(`Image too large. Maximum: ${(maxSize / 1024 / 1024).toFixed(0)}MB`);
  const { width, height } = await getImageDimensions(blob);
  if (width < 100 || height < 100) throw new Error('Image too small. Minimum: 100×100 pixels');
  return true;
}
