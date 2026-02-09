/**
 * @arda/storage — Storage adapter factory
 *
 * Returns the correct StorageAdapter implementation based on configuration.
 */

import type { StorageAdapter, StorageConfig } from './types.js';
import { S3Adapter } from './s3-adapter.js';
import { LocalAdapter } from './local-adapter.js';

/**
 * Create a storage adapter based on the provided configuration.
 *
 * @param config - Storage configuration
 * @returns A configured StorageAdapter instance
 *
 * @example
 * ```ts
 * // S3 adapter
 * const storage = createStorageAdapter({
 *   provider: 's3',
 *   s3: { bucket: 'my-bucket', region: 'us-east-1' },
 * });
 *
 * // Local adapter (development)
 * const storage = createStorageAdapter({
 *   provider: 'local',
 *   local: { basePath: './uploads' },
 * });
 * ```
 */
export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  switch (config.provider) {
    case 's3': {
      if (!config.s3) {
        throw new Error('S3 configuration is required when provider is "s3"');
      }
      return new S3Adapter({
        bucket: config.s3.bucket,
        region: config.s3.region,
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
        endpoint: config.s3.endpoint,
        forcePathStyle: config.s3.forcePathStyle,
      });
    }

    case 'local': {
      if (!config.local) {
        throw new Error('Local configuration is required when provider is "local"');
      }
      return new LocalAdapter({
        basePath: config.local.basePath,
        baseUrl: config.local.baseUrl,
      });
    }

    default:
      throw new Error(`Unknown storage provider: ${(config as StorageConfig).provider}`);
  }
}
