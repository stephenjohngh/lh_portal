// src/lib/server/storage/supabaseStorageProvider.js
// Supabase Storage provider implementation — alternative to Google Drive.
//
// Uses the 'documents' bucket (create it in the Supabase dashboard if absent).
// All paths are virtual prefixes — Supabase Storage has no real folder objects.
//
// Required environment variables (already present for Supabase):
//   PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient }          from '@supabase/supabase-js';
import { getLogger }             from '$lib/utils/logger';
import { PUBLIC_SUPABASE_URL }   from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const logger = getLogger('SupabaseStorageProvider');
const BUCKET = 'documents';

// Module-level singleton — avoids creating a new client on every storage call.
let _client = null;
function getClient() {
  if (!_client) {
    _client = createClient(
      PUBLIC_SUPABASE_URL       ?? '',
      SUPABASE_SERVICE_ROLE_KEY ?? '',
    );
  }
  return _client;
}

function publicUrl(supabase, path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** @type {import('./storageProvider.js').StorageProvider} */
export const supabaseStorageProvider = {
  name: 'supabase',

  async uploadFile(buffer, filename, mimeType, folderPath, _metadata = {}) {
    const supabase = getClient();
    // Prefix with a timestamp to prevent collisions when two files share
    // the same original name in the same virtual folder.
    const unique   = `${Date.now()}_${filename}`;
    const path     = folderPath ? `${folderPath}/${unique}` : unique;

    logger('Uploading to Supabase Storage:', path);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimeType, upsert: false });
    if (error) throw error;

    const url = publicUrl(supabase, data.path);
    return {
      fileId:       data.path,
      folderId:     folderPath ?? '',
      webViewUrl:   url,
      thumbnailUrl: mimeType.startsWith('image/') ? url : null,
    };
  },

  async getFileUrl(filePath) {
    return publicUrl(getClient(), filePath);
  },

  async getFileMetadata(filePath) {
    const supabase = getClient();
    const folder   = filePath.split('/').slice(0, -1).join('/');
    const name     = filePath.split('/').at(-1);

    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: name });
    if (error) throw error;
    const file = data?.find(f => f.name === name);
    if (!file) throw new Error(`File not found: ${filePath}`);

    return {
      fileId:       filePath,
      name:         file.name,
      mimeType:     file.metadata?.mimetype  ?? null,
      size:         file.metadata?.size      ?? 0,
      webViewUrl:   publicUrl(supabase, filePath),
      thumbnailUrl: null,
      createdAt:    file.created_at,
      modifiedAt:   file.updated_at,
    };
  },

  async deleteFile(filePath) {
    const { error } = await getClient().storage.from(BUCKET).remove([filePath]);
    if (error) throw error;
    logger('Deleted Supabase Storage file:', filePath);
  },

  async listFiles(folderPath, opts = {}) {
    const supabase = getClient();
    const { data, error } = await supabase.storage.from(BUCKET).list(folderPath || '', {
      limit:  opts.limit  ?? 100,
      search: opts.query  ?? undefined,
    });
    if (error) throw error;

    return (data ?? [])
      .filter(f => opts.foldersOnly ? !f.id : !!f.id) // folders have no id in Supabase
      .map(f => {
        const path = folderPath ? `${folderPath}/${f.name}` : f.name;
        return {
          fileId:       path,
          name:         f.name,
          mimeType:     f.metadata?.mimetype ?? null,
          size:         f.metadata?.size     ?? 0,
          webViewUrl:   f.id ? publicUrl(supabase, path) : null,
          thumbnailUrl: null,
          createdAt:    f.created_at,
          modifiedAt:   f.updated_at,
          isFolder:     !f.id,
        };
      });
  },

  // Supabase Storage has no real folders — paths are virtual prefixes.
  async createFolder(name, parentPath) {
    return parentPath ? `${parentPath}/${name}` : name;
  },
  async getOrCreateFolder(name, parentPath) {
    return parentPath ? `${parentPath}/${name}` : name;
  },
  async ensurePath(segments) {
    return segments.join('/');
  },

  async moveFile(filePath, newFolderPath) {
    const supabase  = getClient();
    const name      = filePath.split('/').at(-1);
    const newPath   = `${newFolderPath}/${name}`;
    const { error } = await supabase.storage.from(BUCKET).move(filePath, newPath);
    if (error) throw error;
  },

  async searchFiles(query, rootPath) {
    const supabase = getClient();
    const { data, error } = await supabase.storage.from(BUCKET).list(rootPath || '', {
      search: query,
      limit:  50,
    });
    if (error) throw error;

    return (data ?? []).filter(f => !!f.id).map(f => {
      const path = rootPath ? `${rootPath}/${f.name}` : f.name;
      return {
        fileId:     path,
        name:       f.name,
        mimeType:   f.metadata?.mimetype ?? null,
        size:       f.metadata?.size     ?? 0,
        webViewUrl: publicUrl(supabase, path),
        createdAt:  f.created_at,
      };
    });
  },
};
