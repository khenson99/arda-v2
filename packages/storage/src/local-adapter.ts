/**
 * @arda/storage — Local filesystem storage adapter
 *
 * Implements the StorageAdapter interface using the local filesystem.
 * Intended for development and testing only.
 */

import { mkdir, readFile, writeFile, unlink, stat, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageAdapter, UploadOptions, FileMetadata } from './types.js';

export interface LocalAdapterConfig {
  /** Base directory for file storage */
  basePath: string;
  /** Base URL for generating signed URLs (default: file://) */
  baseUrl?: string;
}

export class LocalAdapter implements StorageAdapter {
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor(config: LocalAdapterConfig) {
    this.basePath = resolve(config.basePath);
    this.baseUrl = config.baseUrl ?? `file://${this.basePath}`;
  }

  private getFilePath(key: string): string {
    // Prevent path traversal attacks
    const normalized = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return join(this.basePath, normalized);
  }

  private getMetadataPath(key: string): string {
    return `${this.getFilePath(key)}.meta.json`;
  }

  async upload(key: string, data: Buffer | Readable, opts?: UploadOptions): Promise<string> {
    const filePath = this.getFilePath(key);
    const dir = dirname(filePath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Convert Readable stream to Buffer if needed
    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else {
      const chunks: Uint8Array[] = [];
      for await (const chunk of data) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      buffer = Buffer.concat(chunks);
    }

    await writeFile(filePath, buffer);

    // Store metadata alongside the file
    const metadata = {
      contentType: opts?.contentType ?? 'application/octet-stream',
      metadata: opts?.metadata ?? {},
      size: buffer.length,
      createdAt: new Date().toISOString(),
    };
    await writeFile(this.getMetadataPath(key), JSON.stringify(metadata, null, 2));

    return key;
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.getFilePath(key);
    return readFile(filePath);
  }

  async getSignedUrl(key: string, _expiresIn = 3600): Promise<string> {
    // For local adapter, return a direct file URL
    // In a real app, you might serve these through an Express static handler
    const normalized = key.replace(/^\/+/, '');
    return `${this.baseUrl}/${normalized}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const metaPath = this.getMetadataPath(key);

    try {
      await unlink(filePath);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code !== 'ENOENT') throw err;
    }

    try {
      await unlink(metaPath);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code !== 'ENOENT') throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    const filePath = this.getFilePath(key);
    const metaPath = this.getMetadataPath(key);

    const fileStat = await stat(filePath);

    let storedMeta: { contentType?: string; metadata?: Record<string, string> } = {};
    try {
      const metaContent = await readFile(metaPath, 'utf-8');
      storedMeta = JSON.parse(metaContent);
    } catch {
      // Metadata file may not exist for externally placed files
    }

    return {
      key,
      size: fileStat.size,
      contentType: storedMeta.contentType,
      lastModified: fileStat.mtime,
      metadata: storedMeta.metadata,
    };
  }
}
