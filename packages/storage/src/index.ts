/**
 * @arda/storage — Object storage abstraction
 *
 * Provides a unified interface for file storage operations,
 * with adapters for S3/MinIO and local filesystem.
 */

// Factory
export { createStorageAdapter } from './factory.js';

// Adapters
export { S3Adapter, type S3AdapterConfig } from './s3-adapter.js';
export { LocalAdapter, type LocalAdapterConfig } from './local-adapter.js';

// Types
export type {
  StorageAdapter,
  StorageConfig,
  UploadOptions,
  SignedUrlOptions,
  FileMetadata,
} from './types.js';
