/**
 * @arda/storage — Storage type definitions
 */

import type { Readable } from 'node:stream';

/**
 * Options for file upload operations.
 */
export interface UploadOptions {
  /** MIME content type */
  contentType?: string;
  /** Custom metadata key-value pairs */
  metadata?: Record<string, string>;
  /** Access control: private (default) or public-read */
  acl?: 'private' | 'public-read';
}

/**
 * Options for signed URL generation.
 */
export interface SignedUrlOptions {
  /** Expiration time in seconds (default: 3600 = 1 hour) */
  expiresIn?: number;
  /** Content type for upload URLs */
  contentType?: string;
}

/**
 * File metadata returned from storage operations.
 */
export interface FileMetadata {
  /** Storage key / path */
  key: string;
  /** File size in bytes */
  size: number;
  /** MIME content type */
  contentType?: string;
  /** Last modified timestamp */
  lastModified?: Date;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

/**
 * Storage adapter interface.
 *
 * All storage operations go through this interface, allowing
 * transparent switching between S3, MinIO, and local filesystem.
 */
export interface StorageAdapter {
  /**
   * Upload a file to storage.
   *
   * @param key - Storage key / path
   * @param data - File content as Buffer or Readable stream
   * @param opts - Upload options
   * @returns The storage key of the uploaded file
   */
  upload(key: string, data: Buffer | Readable, opts?: UploadOptions): Promise<string>;

  /**
   * Download a file from storage.
   *
   * @param key - Storage key / path
   * @returns File content as Buffer
   */
  download(key: string): Promise<Buffer>;

  /**
   * Generate a pre-signed URL for temporary access to a file.
   *
   * @param key - Storage key / path
   * @param expiresIn - Expiration time in seconds (default: 3600)
   * @returns Pre-signed URL string
   */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * Delete a file from storage.
   *
   * @param key - Storage key / path
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a file exists in storage.
   *
   * @param key - Storage key / path
   * @returns True if the file exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get file metadata without downloading content.
   *
   * @param key - Storage key / path
   * @returns File metadata
   */
  getMetadata(key: string): Promise<FileMetadata>;
}

/**
 * Storage configuration.
 */
export interface StorageConfig {
  /** Storage provider type */
  provider: 's3' | 'local';

  /** S3 configuration (required when provider is 's3') */
  s3?: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    /** Custom endpoint for S3-compatible services (MinIO) */
    endpoint?: string;
    /** Force path-style URLs (required for MinIO) */
    forcePathStyle?: boolean;
  };

  /** Local filesystem configuration (required when provider is 'local') */
  local?: {
    /** Base directory for file storage */
    basePath: string;
    /** Base URL for generating file URLs */
    baseUrl?: string;
  };
}
