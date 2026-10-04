// src/lib/apps/inspection/utils/imageCompression.js
// Image compression utility for inspection photos.
// Uses browser-image-compression library.

import imageCompression from 'browser-image-compression';
import { getLogger }    from '#lib/utils/logger.js';

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
    maxSizeMB:        2,
    maxWidthOrHeight: 1920,
    useWebWorker:     true,
    fileType:         'image/jpeg',
    initialQuality:   0.85,
    ...options,
  };

  try {
    const before        = (imageBlob.size / 1024).toFixed(2);
    const compressedBlob = await imageCompression(imageBlob, compressionOptions);
    const after         = (compressedBlob.size / 1024).toFixed(2);
    logger(`Compressed ${before} KB → ${after} KB`);
    return compressedBlob;
  } catch (/** @type {any} */ error) {
    logger('❌ Compression failed:', error.message);
    throw new Error('Failed to compress image: ' + error.message);
  }
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

