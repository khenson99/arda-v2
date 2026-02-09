/**
 * @arda/search — Mock search client tests
 *
 * Tests the in-memory mock implementation of the SearchClient interface.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockSearchClient } from '../mock-client.js';
import { partsMapping, PARTS_INDEX } from '../mappings/parts.js';

describe('MockSearchClient', () => {
  let client: MockSearchClient;

  beforeEach(() => {
    client = new MockSearchClient();
  });

  describe('createIndex', () => {
    it('should create an index', async () => {
      await client.createIndex(PARTS_INDEX, partsMapping);
      expect(await client.indexExists(PARTS_INDEX)).toBe(true);
    });

    it('should not error when creating an existing index', async () => {
      await client.createIndex(PARTS_INDEX, partsMapping);
      await client.createIndex(PARTS_INDEX, partsMapping);
      expect(await client.indexExists(PARTS_INDEX)).toBe(true);
    });
  });

  describe('deleteIndex', () => {
    it('should delete an existing index', async () => {
      await client.createIndex(PARTS_INDEX, partsMapping);
      await client.deleteIndex(PARTS_INDEX);
      expect(await client.indexExists(PARTS_INDEX)).toBe(false);
    });

    it('should not error when deleting a non-existent index', async () => {
      await expect(client.deleteIndex('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('index', () => {
    it('should index a document', async () => {
      await client.createIndex(PARTS_INDEX, partsMapping);
      await client.index(PARTS_INDEX, 'part-1', {
        partNumber: 'ABC-123',
        name: 'Widget A',
        description: 'A standard widget',
      });

      expect(client.getDocCount(PARTS_INDEX)).toBe(1);
    });

    it('should auto-create index if it does not exist', async () => {
      await client.index('auto-index', 'doc-1', { name: 'test' });
      expect(await client.indexExists('auto-index')).toBe(true);
    });

    it('should update existing documents', async () => {
      await client.index(PARTS_INDEX, 'part-1', { name: 'Original' });
      await client.index(PARTS_INDEX, 'part-1', { name: 'Updated' });

      const result = await client.search(PARTS_INDEX, { query: 'Updated' });
      expect(result.total).toBe(1);
      expect(result.hits[0]!.source.name).toBe('Updated');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await client.createIndex(PARTS_INDEX, partsMapping);
      await client.index(PARTS_INDEX, 'part-1', {
        partNumber: 'ABC-123',
        name: 'Widget A',
        description: 'A standard widget for industrial use',
        category: 'widgets',
        status: 'active',
      });
      await client.index(PARTS_INDEX, 'part-2', {
        partNumber: 'DEF-456',
        name: 'Gadget B',
        description: 'A premium gadget with advanced features',
        category: 'gadgets',
        status: 'active',
      });
      await client.index(PARTS_INDEX, 'part-3', {
        partNumber: 'GHI-789',
        name: 'Widget C',
        description: 'Economy widget for basic applications',
        category: 'widgets',
        status: 'discontinued',
      });
    });

    it('should find documents by text query', async () => {
      const result = await client.search(PARTS_INDEX, { query: 'widget' });
      expect(result.total).toBe(2);
      expect(result.hits.map((h) => h.id)).toContain('part-1');
      expect(result.hits.map((h) => h.id)).toContain('part-3');
    });

    it('should filter by exact field values', async () => {
      const result = await client.search(PARTS_INDEX, {
        query: '',
        filters: { category: 'widgets' },
      });
      expect(result.total).toBe(2);
    });

    it('should combine text search and filters', async () => {
      const result = await client.search(PARTS_INDEX, {
        query: 'widget',
        filters: { status: 'active' },
      });
      expect(result.total).toBe(1);
      expect(result.hits[0]!.id).toBe('part-1');
    });

    it('should return all documents with empty query', async () => {
      const result = await client.search(PARTS_INDEX, { query: '' });
      expect(result.total).toBe(3);
    });

    it('should paginate results', async () => {
      const page1 = await client.search(PARTS_INDEX, { query: '', from: 0, size: 2 });
      expect(page1.hits.length).toBe(2);
      expect(page1.total).toBe(3);

      const page2 = await client.search(PARTS_INDEX, { query: '', from: 2, size: 2 });
      expect(page2.hits.length).toBe(1);
    });

    it('should sort results', async () => {
      const result = await client.search(PARTS_INDEX, {
        query: '',
        sort: [{ field: 'name', order: 'asc' }],
      });
      expect(result.hits[0]!.source.name).toBe('Gadget B');
      expect(result.hits[1]!.source.name).toBe('Widget A');
      expect(result.hits[2]!.source.name).toBe('Widget C');
    });

    it('should filter returned fields', async () => {
      const result = await client.search(PARTS_INDEX, {
        query: 'widget',
        fields: ['name', 'partNumber'],
        size: 1,
      });
      const source = result.hits[0]!.source;
      expect(source.name).toBeDefined();
      expect(source.partNumber).toBeDefined();
      expect(source.description).toBeUndefined();
    });

    it('should include highlights when requested', async () => {
      const result = await client.search(PARTS_INDEX, {
        query: 'widget',
        highlight: true,
      });
      expect(result.hits[0]!.highlights).toBeDefined();
    });

    it('should return empty results for non-existent index', async () => {
      const result = await client.search('nonexistent', { query: 'test' });
      expect(result.total).toBe(0);
      expect(result.hits).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete an existing document', async () => {
      await client.index(PARTS_INDEX, 'part-1', { name: 'Widget' });
      expect(client.getDocCount(PARTS_INDEX)).toBe(1);

      await client.delete(PARTS_INDEX, 'part-1');
      expect(client.getDocCount(PARTS_INDEX)).toBe(0);
    });

    it('should not error when deleting non-existent document', async () => {
      await client.createIndex(PARTS_INDEX, partsMapping);
      await expect(client.delete(PARTS_INDEX, 'ghost')).resolves.toBeUndefined();
    });
  });

  describe('bulkIndex', () => {
    it('should index multiple documents at once', async () => {
      await client.createIndex(PARTS_INDEX, partsMapping);
      await client.bulkIndex(PARTS_INDEX, [
        { id: 'bulk-1', doc: { name: 'Bulk Item 1' } },
        { id: 'bulk-2', doc: { name: 'Bulk Item 2' } },
        { id: 'bulk-3', doc: { name: 'Bulk Item 3' } },
      ]);

      expect(client.getDocCount(PARTS_INDEX)).toBe(3);
    });

    it('should handle empty array', async () => {
      await client.createIndex(PARTS_INDEX, partsMapping);
      await client.bulkIndex(PARTS_INDEX, []);
      expect(client.getDocCount(PARTS_INDEX)).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all indices', async () => {
      await client.createIndex('index-1', partsMapping);
      await client.createIndex('index-2', partsMapping);
      client.clear();

      expect(await client.indexExists('index-1')).toBe(false);
      expect(await client.indexExists('index-2')).toBe(false);
    });
  });
});
