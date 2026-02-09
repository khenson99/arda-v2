/**
 * @arda/search — In-memory mock search client
 *
 * Implements the SearchClient interface with an in-memory store.
 * Suitable for unit testing and development without Elasticsearch.
 */

import type { SearchClient, SearchQuery, SearchResult, SearchHit, IndexMapping } from './types.js';

/**
 * In-memory document store for a single index.
 */
interface MockIndex {
  mapping: IndexMapping;
  documents: Map<string, Record<string, unknown>>;
}

export class MockSearchClient implements SearchClient {
  private readonly indices = new Map<string, MockIndex>();

  async index(indexName: string, id: string, doc: Record<string, unknown>): Promise<void> {
    const idx = this.indices.get(indexName);
    if (!idx) {
      // Auto-create index with loose mapping
      this.indices.set(indexName, {
        mapping: { properties: {}, dynamic: 'true' },
        documents: new Map([[id, doc]]),
      });
      return;
    }
    idx.documents.set(id, doc);
  }

  async search<T = Record<string, unknown>>(
    indexName: string,
    query: SearchQuery,
  ): Promise<SearchResult<T>> {
    const idx = this.indices.get(indexName);
    if (!idx) {
      return { hits: [], total: 0, maxScore: null, took: 0 };
    }

    const startTime = performance.now();
    let results: Array<{ id: string; doc: Record<string, unknown>; score: number }> = [];

    // Simple text matching across all string fields
    for (const [id, doc] of idx.documents) {
      let score = 0;
      let matches = true;

      // Text search
      if (query.query) {
        const queryLower = query.query.toLowerCase();
        let found = false;
        for (const value of Object.values(doc)) {
          if (typeof value === 'string' && value.toLowerCase().includes(queryLower)) {
            found = true;
            score += 1;
          }
        }
        if (!found) {
          matches = false;
        }
      }

      // Filter matching
      if (query.filters && matches) {
        for (const [field, filterValue] of Object.entries(query.filters)) {
          const docValue = this.getNestedValue(doc, field);
          if (docValue !== filterValue) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        results.push({ id, doc, score: score || 1 });
      }
    }

    // Sort
    if (query.sort && query.sort.length > 0) {
      const sortDef = query.sort[0]!;
      results.sort((a, b) => {
        const aVal = this.getNestedValue(a.doc, sortDef.field);
        const bVal = this.getNestedValue(b.doc, sortDef.field);
        const cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''));
        return sortDef.order === 'desc' ? -cmp : cmp;
      });
    } else {
      // Default: sort by score descending
      results.sort((a, b) => b.score - a.score);
    }

    const total = results.length;

    // Pagination
    const from = query.from ?? 0;
    const size = query.size ?? 10;
    results = results.slice(from, from + size);

    const took = performance.now() - startTime;

    const hits: SearchHit<T>[] = results.map((r) => {
      const source = query.fields && query.fields.length > 0
        ? this.pickFields(r.doc, query.fields) as T
        : r.doc as T;

      return {
        id: r.id,
        score: r.score,
        source,
        ...(query.highlight && {
          highlights: this.buildHighlights(r.doc, query.query ?? ''),
        }),
      };
    });

    return {
      hits,
      total,
      maxScore: hits.length > 0 ? Math.max(...hits.map((h) => h.score)) : null,
      took: Math.round(took),
    };
  }

  async delete(indexName: string, id: string): Promise<void> {
    const idx = this.indices.get(indexName);
    if (idx) {
      idx.documents.delete(id);
    }
  }

  async createIndex(indexName: string, mapping: IndexMapping): Promise<void> {
    if (!this.indices.has(indexName)) {
      this.indices.set(indexName, {
        mapping,
        documents: new Map(),
      });
    }
  }

  async deleteIndex(indexName: string): Promise<void> {
    this.indices.delete(indexName);
  }

  async indexExists(indexName: string): Promise<boolean> {
    return this.indices.has(indexName);
  }

  async bulkIndex(
    indexName: string,
    docs: Array<{ id: string; doc: Record<string, unknown> }>,
  ): Promise<void> {
    for (const { id, doc } of docs) {
      await this.index(indexName, id, doc);
    }
  }

  /**
   * Reset all indices (useful in test teardown).
   */
  clear(): void {
    this.indices.clear();
  }

  /**
   * Get document count for a specific index.
   */
  getDocCount(indexName: string): number {
    const idx = this.indices.get(indexName);
    return idx ? idx.documents.size : 0;
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private pickFields(doc: Record<string, unknown>, fields: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      const value = this.getNestedValue(doc, field);
      if (value !== undefined) {
        result[field] = value;
      }
    }
    return result;
  }

  private buildHighlights(doc: Record<string, unknown>, query: string): Record<string, string[]> {
    if (!query) return {};
    const highlights: Record<string, string[]> = {};
    const queryLower = query.toLowerCase();

    for (const [field, value] of Object.entries(doc)) {
      if (typeof value === 'string' && value.toLowerCase().includes(queryLower)) {
        const highlighted = value.replace(
          new RegExp(`(${this.escapeRegex(query)})`, 'gi'),
          '<mark>$1</mark>',
        );
        highlights[field] = [highlighted];
      }
    }
    return highlights;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
