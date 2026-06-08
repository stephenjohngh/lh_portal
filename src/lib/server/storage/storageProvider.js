// src/lib/server/storage/storageProvider.js
// Type definitions for the storage provider interface.
// Both GoogleDrive and Supabase providers implement these methods.
// Import the active provider from ./index.js — never import providers directly.

/**
 * Result returned by uploadFile().
 *
 * @typedef {Object} UploadResult
 * @property {string}      fileId        Provider file identifier (Drive ID or Supabase path)
 * @property {string}      folderId      Provider folder identifier used for the upload
 * @property {string}      webViewUrl    URL to view the file in a browser
 * @property {string|null} thumbnailUrl  Thumbnail URL if available (images only)
 */

/**
 * A file entry returned by listFiles() or searchFiles().
 *
 * @typedef {Object} FileEntry
 * @property {string}      fileId
 * @property {string}      name
 * @property {string}      mimeType
 * @property {number}      size         Bytes
 * @property {string}      webViewUrl
 * @property {string|null} thumbnailUrl
 * @property {string}      createdAt    ISO timestamp
 * @property {string}      [modifiedAt] ISO timestamp
 * @property {boolean}     [isFolder]   True for folder entries
 */

/**
 * Storage provider interface — all providers must implement every method below.
 *
 * @typedef {Object} StorageProvider
 * @property {string} name  Identifier: 'google_drive' | 'onedrive' | 'supabase'
 *
 * @property {(
 *   buffer:   Buffer,
 *   filename: string,
 *   mimeType: string,
 *   folderId: string,
 *   metadata?: Object
 * ) => Promise<UploadResult>} uploadFile
 *   Upload a file buffer to the given folder.
 *
 * @property {(fileId: string) => Promise<string>} getFileUrl
 *   Return a fresh browser-viewable URL for a file.
 *
 * @property {(fileId: string) => Promise<FileEntry>} getFileMetadata
 *   Return full metadata for a file.
 *
 * @property {(fileId: string) => Promise<void>} deleteFile
 *   Permanently delete a file from storage.
 *
 * @property {(folderId: string, opts?: {
 *   mimeType?: string,
 *   query?: string,
 *   limit?: number,
 *   foldersOnly?: boolean
 * }) => Promise<FileEntry[]>} listFiles
 *   List files (and optionally folders) inside a folder.
 *
 * @property {(name: string, parentId: string) => Promise<string>} createFolder
 *   Create a new folder and return its provider ID.
 *
 * @property {(name: string, parentId: string) => Promise<string>} getOrCreateFolder
 *   Return an existing folder ID or create it if absent.
 *
 * @property {(segments: string[]) => Promise<string>} ensurePath
 *   Ensure a full path exists (creating missing folders) and return the leaf folder ID.
 *   Example: ensurePath(['LH', 'components', 'FD-042'])
 *
 * @property {(fileId: string, newFolderId: string) => Promise<void>} moveFile
 *   Move a file to a different folder.
 *
 * @property {(query: string, rootId?: string) => Promise<FileEntry[]>} searchFiles
 *   Full-text / name search within storage.
 *
 * @property {(fileId: string) => Promise<{ data: Buffer, mimeType: string }>} getFileStream
 *   Download a file's raw bytes for server-side proxying.
 *   Used by GET /api/media/file/[fileId] to serve images to the browser
 *   without cross-origin restrictions.
 */

// This file contains type definitions only — no runtime exports.
