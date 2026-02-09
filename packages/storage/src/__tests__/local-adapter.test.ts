/**
 * @arda/storage — Local adapter unit tests
 *
 * Tests file upload, download, deletion, existence checks,
 * and metadata retrieval using the local filesystem adapter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { LocalAdapter } from '../local-adapter.js';

describe('LocalAdapter', () => {
  let adapter: LocalAdapter;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'arda-storage-test-'));
    adapter = new LocalAdapter({
      basePath: tempDir,
      baseUrl: 'http://localhost:3000/files',
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('should upload a Buffer', async () => {
      const data = Buffer.from('hello world');
      const key = await adapter.upload('test/hello.txt', data, {
        contentType: 'text/plain',
      });

      expect(key).toBe('test/hello.txt');
    });

    it('should upload a Readable stream', async () => {
      const stream = Readable.from(['hello', ' ', 'stream']);
      const key = await adapter.upload('test/stream.txt', stream, {
        contentType: 'text/plain',
      });

      expect(key).toBe('test/stream.txt');

      // Verify content
      const downloaded = await adapter.download('test/stream.txt');
      expect(downloaded.toString()).toBe('hello stream');
    });

    it('should create nested directories automatically', async () => {
      const data = Buffer.from('nested');
      const key = await adapter.upload('deep/nested/path/file.txt', data);

      expect(key).toBe('deep/nested/path/file.txt');
      expect(await adapter.exists('deep/nested/path/file.txt')).toBe(true);
    });

    it('should store metadata alongside the file', async () => {
      const data = Buffer.from('with metadata');
      await adapter.upload('meta-test.txt', data, {
        contentType: 'text/plain',
        metadata: { author: 'test-user' },
      });

      const meta = await adapter.getMetadata('meta-test.txt');
      expect(meta.contentType).toBe('text/plain');
      expect(meta.metadata).toEqual({ author: 'test-user' });
    });
  });

  describe('download', () => {
    it('should download a previously uploaded file', async () => {
      const content = 'download test content';
      await adapter.upload('download-test.txt', Buffer.from(content));

      const result = await adapter.download('download-test.txt');
      expect(result.toString()).toBe(content);
    });

    it('should throw for non-existent files', async () => {
      await expect(adapter.download('does-not-exist.txt')).rejects.toThrow();
    });
  });

  describe('getSignedUrl', () => {
    it('should return a URL with the base URL prefix', async () => {
      await adapter.upload('url-test.txt', Buffer.from('data'));

      const url = await adapter.getSignedUrl('url-test.txt');
      expect(url).toBe('http://localhost:3000/files/url-test.txt');
    });

    it('should handle nested paths', async () => {
      const url = await adapter.getSignedUrl('path/to/file.pdf');
      expect(url).toBe('http://localhost:3000/files/path/to/file.pdf');
    });
  });

  describe('delete', () => {
    it('should delete an existing file', async () => {
      await adapter.upload('delete-me.txt', Buffer.from('temporary'));
      expect(await adapter.exists('delete-me.txt')).toBe(true);

      await adapter.delete('delete-me.txt');
      expect(await adapter.exists('delete-me.txt')).toBe(false);
    });

    it('should not throw when deleting a non-existent file', async () => {
      await expect(adapter.delete('ghost-file.txt')).resolves.toBeUndefined();
    });
  });

  describe('exists', () => {
    it('should return true for existing files', async () => {
      await adapter.upload('exists-test.txt', Buffer.from('exists'));
      expect(await adapter.exists('exists-test.txt')).toBe(true);
    });

    it('should return false for non-existent files', async () => {
      expect(await adapter.exists('nope.txt')).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return file size and content type', async () => {
      const content = 'metadata test';
      await adapter.upload('metadata.txt', Buffer.from(content), {
        contentType: 'text/plain',
      });

      const meta = await adapter.getMetadata('metadata.txt');
      expect(meta.key).toBe('metadata.txt');
      expect(meta.size).toBe(content.length);
      expect(meta.contentType).toBe('text/plain');
      expect(meta.lastModified).toBeInstanceOf(Date);
    });
  });

  describe('path traversal prevention', () => {
    it('should sanitize paths with ..', async () => {
      const data = Buffer.from('safe');
      const key = await adapter.upload('../../../etc/passwd', data);

      // The file should be stored within basePath, not escape it
      expect(key).toBe('../../../etc/passwd');
      expect(await adapter.exists('../../../etc/passwd')).toBe(true);

      // Verify it's actually in our temp directory
      const downloaded = await adapter.download('../../../etc/passwd');
      expect(downloaded.toString()).toBe('safe');
    });
  });
});
