# Search Index Specifications

Arda V2 uses Elasticsearch 8.x for full-text search and analytics across four primary indices.

## Index Overview

| Index Name | Description | Primary Use Cases |
|------------|-------------|-------------------|
| `arda-parts` | Parts/catalog items | Part number lookup, text search by name/description, supplier filtering |
| `arda-suppliers` | Supplier directory | Supplier name search, category filtering, geographic search |
| `arda-orders` | Order records | Order number search, status filtering, customer/supplier search |
| `arda-audit` | Audit log entries | Activity search, actor lookup, entity change history |

## Index: `arda-parts`

### Fields

| Field | Type | Searchable | Filterable | Notes |
|-------|------|-----------|------------|-------|
| `partNumber` | text + keyword | Yes | Yes (exact) | Custom analyzer for part number patterns |
| `name` | text + keyword | Yes | Yes (exact) | Full-text + exact match |
| `description` | text | Yes | No | Full-text only |
| `category` | keyword | No | Yes | Exact match only |
| `subcategory` | keyword | No | Yes | Exact match only |
| `manufacturer` | text + keyword | Yes | Yes | |
| `supplierId` | keyword | No | Yes | For filtering by supplier |
| `supplierName` | text + keyword | Yes | Yes | |
| `unitPrice` | float | No | Yes (range) | For price range filtering |
| `currency` | keyword | No | Yes | |
| `leadTimeDays` | integer | No | Yes (range) | |
| `moq` | integer | No | Yes (range) | Minimum order quantity |
| `status` | keyword | No | Yes | active, discontinued, etc. |
| `tags` | keyword | No | Yes | Multi-value |
| `tenantId` | keyword | No | Yes | Tenant isolation (required filter) |

### Example Queries

**Search by part number or name:**
```json
{
  "query": "ABC-123 widget",
  "filters": { "tenantId": "tenant-001", "status": "active" },
  "size": 20
}
```

**Filter by category with price range (Elasticsearch DSL):**
```json
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "tenantId": "tenant-001" } },
        { "term": { "category": "widgets" } },
        { "range": { "unitPrice": { "gte": 10, "lte": 100 } } }
      ]
    }
  }
}
```

## Index: `arda-suppliers`

### Fields

| Field | Type | Searchable | Filterable | Notes |
|-------|------|-----------|------------|-------|
| `name` | text + keyword | Yes | Yes | |
| `contactName` | text + keyword | Yes | Yes | |
| `contactEmail` | keyword | No | Yes | |
| `phone` | keyword | No | Yes | |
| `website` | keyword | No | Yes | |
| `address.city` | keyword | No | Yes | Nested object |
| `address.state` | keyword | No | Yes | |
| `address.country` | keyword | No | Yes | |
| `categories` | keyword | No | Yes | Multi-value |
| `rating` | float | No | Yes (range) | |
| `status` | keyword | No | Yes | |
| `notes` | text | Yes | No | |
| `tenantId` | keyword | No | Yes | |

### Example Queries

**Search suppliers by name:**
```json
{
  "query": "Acme Manufacturing",
  "filters": { "tenantId": "tenant-001" },
  "size": 10
}
```

## Index: `arda-orders`

### Fields

| Field | Type | Searchable | Filterable | Notes |
|-------|------|-----------|------------|-------|
| `orderNumber` | text + keyword | Yes | Yes | |
| `status` | keyword | No | Yes | pending, processing, shipped, etc. |
| `priority` | keyword | No | Yes | low, medium, high, urgent |
| `customerId` | keyword | No | Yes | |
| `customerName` | text + keyword | Yes | Yes | |
| `supplierId` | keyword | No | Yes | |
| `supplierName` | text + keyword | Yes | Yes | |
| `totalAmount` | float | No | Yes (range) | |
| `lineItems` | nested | Partial | Partial | Nested queries required |
| `riskLevel` | keyword | No | Yes | |
| `dueDate` | date | No | Yes (range) | |
| `tags` | keyword | No | Yes | Multi-value |
| `tenantId` | keyword | No | Yes | |

### Example Queries

**Search orders by customer name, filter by status:**
```json
{
  "query": "John Smith",
  "filters": { "tenantId": "tenant-001", "status": "processing" },
  "sort": [{ "field": "dueDate", "order": "asc" }],
  "size": 25
}
```

## Index: `arda-audit`

### Fields

| Field | Type | Searchable | Filterable | Notes |
|-------|------|-----------|------------|-------|
| `action` | keyword | No | Yes | create, update, delete, login, etc. |
| `entityType` | keyword | No | Yes | order, part, supplier, user |
| `entityId` | keyword | No | Yes | |
| `actorId` | keyword | No | Yes | |
| `actorName` | text + keyword | Yes | Yes | |
| `actorEmail` | keyword | No | Yes | |
| `changes` | object | No | No | Stored but not indexed by default |
| `description` | text | Yes | No | |
| `ipAddress` | keyword | No | Yes | |
| `tenantId` | keyword | No | Yes | |
| `timestamp` | date | No | Yes (range) | |

### Example Queries

**Find all changes to a specific order:**
```json
{
  "query": "",
  "filters": { "tenantId": "tenant-001", "entityType": "order", "entityId": "order-123" },
  "sort": [{ "field": "timestamp", "order": "desc" }]
}
```

## Tenant Isolation

All indices include a `tenantId` keyword field. Every query MUST include a `tenantId` filter to enforce tenant isolation. The search client does not automatically inject tenant filters; application code is responsible for including them.

## Index Lifecycle

- **Development**: Indices are created on application startup if they do not exist.
- **Production**: Indices should be created via migration scripts or deployment automation.
- **Re-indexing**: Use the `bulkIndex` method for bulk data migration. Process in batches of 500-1000 documents.
