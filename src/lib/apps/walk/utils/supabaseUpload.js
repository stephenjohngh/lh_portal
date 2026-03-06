// src/lib/apps/walk/utils/supabaseUpload.js
// Upload inspection photos to Supabase Storage

import { supabase } from '$lib/supabaseClient';

/**
 * Upload image to Supabase Storage
 * @param {Blob} imageBlob - Compressed image blob
 * @param {string} fileName - File name
 * @param {string} sessionId - Walk session ID (for folder organization)
 * @returns {Promise<string>} Public URL of uploaded image
 */
export async function uploadToSupabase(imageBlob, fileName, sessionId) {
  try {
    // Create folder structure: walk-inspections/{sessionId}/{fileName}
    const filePath = `walk-inspections/${sessionId}/${fileName}`;
    
    console.log('Uploading to Supabase:', filePath);
    
    // Upload to storage bucket
    const { data, error } = await supabase.storage
      .from('inspection-photos') // Bucket name
      .upload(filePath, imageBlob, {
        contentType: 'image/jpeg',
        upsert: false // Don't overwrite existing files
      });
    
    if (error) {
      console.error('Supabase upload error:', error);
      throw error;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('inspection-photos')
      .getPublicUrl(filePath);
    
    console.log('✅ Uploaded to Supabase:', urlData.publicUrl);
    
    return urlData.publicUrl;
    
  } catch (error) {
    console.error('Supabase upload failed:', error);
    throw new Error('Supabase upload failed: ' + error.message);
  }
}

/**
 * Delete image from Supabase Storage
 * @param {string} filePath - Full path of file to delete
 * @returns {Promise<void>}
 */
export async function deleteFromSupabase(filePath) {
  try {
    const { error } = await supabase.storage
      .from('inspection-photos')
      .remove([filePath]);
    
    if (error) throw error;
    
    console.log('✅ Deleted from Supabase:', filePath);
  } catch (error) {
    console.error('Supabase delete failed:', error);
    throw error;
  }
}

/**
 * List all files for a session
 * @param {string} sessionId - Walk session ID
 * @returns {Promise<Array>} List of files
 */
export async function listSessionPhotos(sessionId) {
  try {
    const { data, error } = await supabase.storage
      .from('inspection-photos')
      .list(`walk-inspections/${sessionId}`);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('List photos failed:', error);
    return [];
  }
}
