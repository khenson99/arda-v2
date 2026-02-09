/**
 * @arda/search — Search type definitions
 */

/**
 * Search query parameters.
 */
export interface SearchQuery {
  /** Full-text search query string */
  query: string;
  /** Field-specific filters */
  filters?: Record<string, unknown>;
  /** Sort configuration */
  sort?: Array<{
    field: string;
    order: 'asc' | 'desc';
  }>;
  /** Pagination offset (0-based) */
  from?: number;
  /** Maximum number of results to return */
  size?: number;
  /** Fields to include in results (empty = all fields) */
  fields?: string[];
  /** Enable highlighting on matched fields */
  highlight?: boolean;
}

/**
 * Individual search result hit.
 */
export interface SearchHit<T = Record<string, unknown>> {
  /** Document ID */
  id: string;
  /** Relevance score */
  score: number;
  /** Document source data */
  source: T;
  /** Highlighted field fragments */
  highlights?: Record<string, string[]>;
}

/**
 * Search results envelope.
 */
export interface SearchResult<T = Record<string, unknown>> {
  /** Array of matching documents */
  hits: SearchHit<T>[];
  /** Total number of matching documents */
  total: number;
  /** Maximum relevance score */
  maxScore: number | null;
  /** Time taken in milliseconds */
  took: number;
}

/**
 * Index field mapping definition.
 */
export interface FieldMapping {
  type: 'text' | 'keyword' | 'integer' | 'long' | 'float' | 'double' | 'boolean' | 'date' | 'nested' | 'object';
  /** For text fields: analyzer name */
  analyzer?: string;
  /** Whether to index this field for search */
  index?: boolean;
  /** Nested field mappings (for object/nested types) */
  properties?: Record<string, FieldMapping>;
  /** Multi-field mappings (e.g., text + keyword) */
  fields?: Record<string, { type: string; ignore_above?: number }>;
}

/**
 * Index mapping definition.
 */
export interface IndexMapping {
  /** Field mappings */
  properties: Record<string, FieldMapping>;
  /** Dynamic mapping behavior */
  dynamic?: 'strict' | 'true' | 'false';
  /** Index settings (analyzers, shards, etc.) */
  settings?: {
    numberOfShards?: number;
    numberOfReplicas?: number;
    analysis?: Record<string, unknown>;
  };
}

/**
 * Search client interface.
 *
 * All search operations go through this interface, enabling
 * transparent switching between Elasticsearch and mock implementations.
 */
export interface SearchClient {
  /**
   * Index (create or update) a document.
   *
   * @param indexName - Target index name
   * @param id - Document ID
   * @param doc - Document body
   */
  index(indexName: string, id: string, doc: Record<string, unknown>): Promise<void>;

  /**
   * Search an index.
   *
   * @param indexName - Target index name
   * @param query - Search query parameters
   * @returns Search results
   */
  search<T = Record<string, unknown>>(indexName: string, query: SearchQuery): Promise<SearchResult<T>>;

  /**
   * Delete a document from an index.
   *
   * @param indexName - Target index name
   * @param id - Document ID
   */
  delete(indexName: string, id: string): Promise<void>;

  /**
   * Create an index with the specified mapping.
   *
   * @param indexName - Index name
   * @param mapping - Index mapping definition
   */
  createIndex(indexName: string, mapping: IndexMapping): Promise<void>;

  /**
   * Delete an index.
   *
   * @param indexName - Index name
   */
  deleteIndex(indexName: string): Promise<void>;

  /**
   * Check if an index exists.
   *
   * @param indexName - Index name
   * @returns True if the index exists
   */
  indexExists(indexName: string): Promise<boolean>;

  /**
   * Bulk index multiple documents.
   *
   * @param indexName - Target index name
   * @param docs - Array of { id, doc } pairs
   */
  bulkIndex(indexName: string, docs: Array<{ id: string; doc: Record<string, unknown> }>): Promise<void>;
}
