// src/lib/apps/walk/utils/imageCompression.js
// Image compression utility for door inspection photos
// Uses browser-image-compression library

import imageCompression from 'browser-image-compression';

/**
 * Compress an image blob to specified size and dimensions
 * @param {Blob} imageBlob - Original image blob
 * @param {Object} options - Compression options
 * @param {number} options.maxSizeMB - Maximum file size in MB (default: 0.5)
 * @param {number} options.maxWidthOrHeight - Maximum dimension (default: 1024)
 * @param {boolean} options.useWebWorker - Use web worker for compression (default: true)
 * @returns {Promise<Blob>} Compressed image blob
 */
export async function compressImage(imageBlob, options = {}) {
  const defaultOptions = {
    maxSizeMB: 0.5,              // Max 500KB
    maxWidthOrHeight: 1024,      // Max dimension 1024px
    useWebWorker: true,          // Use web worker (faster)
    fileType: 'image/jpeg',      // Output format
    initialQuality: 0.8          // Initial quality
  };
  
  const compressionOptions = { ...defaultOptions, ...options };
  
  try {
    console.log('Original image size:', (imageBlob.size / 1024).toFixed(2), 'KB');
    
    const compressedBlob = await imageCompression(imageBlob, compressionOptions);
    
    console.log('Compressed image size:', (compressedBlob.size / 1024).toFixed(2), 'KB');
    console.log('Compression ratio:', ((1 - compressedBlob.size / imageBlob.size) * 100).toFixed(1), '%');
    
    return compressedBlob;
  } catch (error) {
    console.error('Image compression failed:', error);
    throw new Error('Failed to compress image: ' + error.message);
  }
}

/**
 * Convert a File or Blob to a data URL
 * Useful for previews
 * @param {Blob|File} blob - Image blob
 * @returns {Promise<string>} Data URL
 */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get image dimensions from a blob
 * @param {Blob} blob - Image blob
 * @returns {Promise<{width: number, height: number}>}
 */
export function getImageDimensions(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Validate image before compression
 * @param {Blob} blob - Image blob
 * @param {number} maxSize - Max size in bytes
 * @returns {Promise<boolean>} True if valid
 */
export async function validateImage(blob, maxSize = 10 * 1024 * 1024) {
  // Check file type
  if (!blob.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }
  
  // Check size (before compression)
  if (blob.size > maxSize) {
    throw new Error(`Image too large. Maximum size: ${(maxSize / 1024 / 1024).toFixed(0)}MB`);
  }
  
  // Check dimensions
  const { width, height } = await getImageDimensions(blob);
  if (width < 100 || height < 100) {
    throw new Error('Image too small. Minimum: 100x100 pixels');
  }
  
  return true;
}
