// src/lib/apps/v2walk/utils/supabaseUpload.js
// Upload inspection photos to Supabase Storage.

import { supabase } from '$lib/supabaseClient';

/**
 * Upload image to Supabase Storage.
 * @param {Blob} imageBlob
 * @param {string} fileName
 * @param {string} sessionId - Walk session ID (used for folder path)
 * @returns {Promise<string>} Public URL of uploaded image
 */
export async function uploadToSupabase(imageBlob, fileName, sessionId) {
  const filePath = `walk-inspections/${sessionId}/${fileName}`;

  const { error } = await supabase.storage
    .from('inspection-photos')
    .upload(filePath, imageBlob, { contentType: 'image/jpeg', upsert: false });

  if (error) throw new Error('Supabase upload failed: ' + error.message);

  const { data: urlData } = supabase.storage
    .from('inspection-photos')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Delete image from Supabase Storage.
 * @param {string} filePath
 */
export async function deleteFromSupabase(filePath) {
  const { error } = await supabase.storage.from('inspection-photos').remove([filePath]);
  if (error) throw error;
}

/**
 * List all files for a session.
 * @param {string} sessionId
 * @returns {Promise<Array>}
 */
export async function listSessionPhotos(sessionId) {
  const { data, error } = await supabase.storage
    .from('inspection-photos')
    .list(`walk-inspections/${sessionId}`);
  if (error) return [];
  return data ?? [];
}
