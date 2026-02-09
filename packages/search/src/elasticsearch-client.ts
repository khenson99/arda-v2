/**
 * @arda/search — Elasticsearch 8.x client implementation
 *
 * Implements the SearchClient interface using the official
 * Elasticsearch JavaScript client.
 */

import { Client } from '@elastic/elasticsearch';
import type { SearchClient, SearchQuery, SearchResult, SearchHit, IndexMapping } from './types.js';

export interface ElasticsearchClientConfig {
  /** Elasticsearch node URL (e.g., "http://localhost:9200") */
  node: string;
  /** Authentication (optional for local dev) */
  auth?: {
    username: string;
    password: string;
  };
  /** API key authentication */
  apiKey?: string;
  /** TLS configuration */
  tls?: {
    rejectUnauthorized: boolean;
  };
}

export class ElasticsearchSearchClient implements SearchClient {
  private readonly client: Client;

  constructor(config: ElasticsearchClientConfig) {
    this.client = new Client({
      node: config.node,
      ...(config.auth && { auth: config.auth }),
      ...(config.apiKey && { auth: { apiKey: config.apiKey } }),
      ...(config.tls && { tls: config.tls }),
    });
  }

  async index(indexName: string, id: string, doc: Record<string, unknown>): Promise<void> {
    await this.client.index({
      index: indexName,
      id,
      document: doc,
      refresh: 'wait_for',
    });
  }

  async search<T = Record<string, unknown>>(
    indexName: string,
    query: SearchQuery,
  ): Promise<SearchResult<T>> {
    const body: Record<string, unknown> = {};

    // Build query
    if (query.query) {
      if (query.filters && Object.keys(query.filters).length > 0) {
        // Combined text search + filters
        body.query = {
          bool: {
            must: [
              {
                multi_match: {
                  query: query.query,
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: Object.entries(query.filters).map(([field, value]) => ({
              term: { [field]: value },
            })),
          },
        };
      } else {
        // Text search only
        body.query = {
          multi_match: {
            query: query.query,
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        };
      }
    } else if (query.filters && Object.keys(query.filters).length > 0) {
      // Filters only
      body.query = {
        bool: {
          filter: Object.entries(query.filters).map(([field, value]) => ({
            term: { [field]: value },
          })),
        },
      };
    } else {
      body.query = { match_all: {} };
    }

    // Sort
    if (query.sort && query.sort.length > 0) {
      body.sort = query.sort.map((s) => ({ [s.field]: { order: s.order } }));
    }

    // Pagination
    if (query.from !== undefined) body.from = query.from;
    if (query.size !== undefined) body.size = query.size;

    // Source filtering
    if (query.fields && query.fields.length > 0) {
      body._source = query.fields;
    }

    // Highlighting
    if (query.highlight) {
      body.highlight = {
        fields: { '*': {} },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      };
    }

    const response = await this.client.search({
      index: indexName,
      ...body,
    });

    const hits: SearchHit<T>[] = response.hits.hits.map((hit) => ({
      id: hit._id!,
      score: hit._score ?? 0,
      source: hit._source as T,
      ...(hit.highlight && { highlights: hit.highlight as Record<string, string[]> }),
    }));

    const total = typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? 0;

    return {
      hits,
      total,
      maxScore: response.hits.max_score ?? null,
      took: response.took,
    };
  }

  async delete(indexName: string, id: string): Promise<void> {
    await this.client.delete({
      index: indexName,
      id,
      refresh: 'wait_for',
    });
  }

  async createIndex(indexName: string, mapping: IndexMapping): Promise<void> {
    const exists = await this.indexExists(indexName);
    if (exists) {
      return;
    }

    await this.client.indices.create({
      index: indexName,
      mappings: {
        dynamic: mapping.dynamic as 'strict' | 'true' | 'false' | undefined,
        properties: mapping.properties as Record<string, unknown>,
      },
      settings: mapping.settings
        ? {
            number_of_shards: mapping.settings.numberOfShards,
            number_of_replicas: mapping.settings.numberOfReplicas,
            analysis: mapping.settings.analysis,
          }
        : undefined,
    });
  }

  async deleteIndex(indexName: string): Promise<void> {
    const exists = await this.indexExists(indexName);
    if (!exists) {
      return;
    }

    await this.client.indices.delete({ index: indexName });
  }

  async indexExists(indexName: string): Promise<boolean> {
    return this.client.indices.exists({ index: indexName });
  }

  async bulkIndex(
    indexName: string,
    docs: Array<{ id: string; doc: Record<string, unknown> }>,
  ): Promise<void> {
    if (docs.length === 0) return;

    const operations = docs.flatMap(({ id, doc }) => [
      { index: { _index: indexName, _id: id } },
      doc,
    ]);

    const response = await this.client.bulk({
      refresh: 'wait_for',
      operations,
    });

    if (response.errors) {
      const errors = response.items
        .filter((item) => item.index?.error)
        .map((item) => item.index?.error?.reason)
        .slice(0, 5);
      throw new Error(`Bulk index errors: ${errors.join('; ')}`);
    }
  }
}
