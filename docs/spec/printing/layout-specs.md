# Kanban Card / Label Printing Layout Specifications

> Source of truth for all print format dimensions, field visibility, typography, and brand tokens.
> Referenced by `apps/web/src/components/printing/types.ts`.

---

## 1. Format Matrix

| Format Key      | Width (in) | Height (in) | Printer Class | Show Logo | Show Description | Extended Fields | Scan URL | Safe Inset (px) | QR Size (px) |
|-----------------|-----------|-------------|---------------|-----------|-----------------|-----------------|----------|-----------------|-------------|
| `3x5_card`      | 5         | 3           | standard      | yes       | yes             | no              | yes      | 12              | 96          |
| `4x6_card`      | 6         | 4           | standard      | yes       | yes             | yes             | yes      | 12              | 120         |
| `business_card` | 3.5       | 2           | standard      | yes       | yes             | no              | no       | 12              | 64          |
| `business_label`| 3.5       | 1.125       | thermal       | no        | yes             | no              | no       | 6               | 48          |
| `1x3_label`     | 3         | 1           | thermal       | no        | yes             | no              | no       | 6               | 48          |
| `bin_label`     | 2         | 1           | thermal       | no        | no              | no              | no       | 6               | 48          |
| `1x1_label`     | 1         | 1           | thermal       | no        | no              | no              | no       | 6               | 80          |

---

## 2. Printer Classes

### Standard (Laser / Inkjet)
- Full color support
- Paper sizes: Letter (8.5 x 11 in), A4
- Multiple cards per page (calculated from dimensions)
- Default margins: 10mm all sides

### Thermal (Zebra / Dymo)
- Monochrome only
- One label per print
- Default margins: 2mm all sides
- Loop type bands use pattern instead of color:
  - **Procurement**: solid line (`print-band-solid`)
  - **Production**: dashed line (`print-band-dashed`)
  - **Transfer**: dotted line (`print-band-dotted`)

---

## 3. Card Layout (3x5, 4x6, Business Card)

```
+--------------------------------------------------+
| [Loop Type Band — 4px colored bar]               |
| [Logo (if enabled)]                [QR Code]     |
|                                    [Scan URL]    |
| Part Number: PN-10042                            |
| Description: Stainless Steel Hex Bolt...         |
| Facility: Main Warehouse                         |
| Location: Aisle 4, Rack B                        |
| Supplier/Source: Acme Fasteners                  |
| Order Qty: 500  |  Min Qty: 200                  |
| [Lead Time] [Safety Stock]   (4x6 only)         |
| [Notes]                      (4x6 only)         |
| Card 1 of 3          [Stage Badge]              |
| [Arda watermark]                                 |
+--------------------------------------------------+
```

### Field Hierarchy (by format)

| Field              | 3x5 | 4x6 | Biz Card | Biz Label | 1x3 | Bin | 1x1 |
|--------------------|------|------|----------|-----------|------|-----|-----|
| Loop Type Band     | yes  | yes  | yes      | yes       | yes  | yes | no  |
| Logo               | yes  | yes  | yes      | no        | no   | no  | no  |
| QR Code            | yes  | yes  | yes      | yes       | yes  | yes | yes |
| Scan URL Text      | yes  | yes  | no       | no        | no   | no  | no  |
| Part Number        | yes  | yes  | yes      | yes       | yes  | yes | no  |
| Part Description   | yes  | yes  | yes      | yes       | yes  | no  | no  |
| Facility Name      | yes  | yes  | yes      | no        | no   | no  | no  |
| Storage Location   | yes  | yes  | opt      | no        | no   | no  | no  |
| Supplier/Source    | yes  | yes  | opt      | no        | no   | no  | no  |
| Order Quantity     | yes  | yes  | yes      | yes       | opt  | no  | no  |
| Min Quantity       | yes  | yes  | opt      | opt       | no   | no  | no  |
| Lead Time          | no   | yes  | no       | no        | no   | no  | no  |
| Safety Stock       | no   | yes  | no       | no        | no   | no  | no  |
| Notes              | no   | yes  | no       | no        | no   | no  | no  |
| Card X of Y        | yes  | yes  | yes      | yes       | yes  | yes | no  |
| Stage Badge        | yes  | yes  | yes      | yes       | opt  | no  | no  |
| Arda Watermark     | opt  | opt  | opt      | no        | no   | no  | no  |

---

## 4. Thermal Label Layout

```
+------------------------------+
| [Band]                       |
| [QR]  Part Number            |
|        Description (trunc)   |
|        Qty: 500 | 1 of 3    |
+------------------------------+
```

### QR-Only Label (1x1)

```
+----------+
|          |
|   [QR]   |
|          |
+----------+
```

---

## 5. Typography

All print output uses **Open Sans** (loaded via `@font-face` or system fallback).

| Element           | Size    | Weight    | Color              |
|-------------------|---------|-----------|--------------------|
| Part Number       | 14px    | Bold 700  | foreground         |
| Part Description  | 12px    | Normal 400| foreground         |
| Field Labels      | 10px    | SemiBold  | muted-foreground   |
| Field Values      | 11px    | SemiBold  | foreground         |
| Card X of Y       | 9px     | Normal    | muted-foreground   |
| Scan URL          | 8px     | Normal    | muted-foreground   |
| Stage Badge       | 8px     | SemiBold  | per-stage color    |
| Notes             | 10px    | Normal    | muted-foreground   |

### Print-Specific Adjustments

- Business card: Part number 11px, description 10px
- Thermal labels: Part number 11px, all other text 9px
- 1x1 label: QR code only, no text

---

## 6. Color & Brand Tokens

### Loop Type Band Colors

| Loop Type    | Screen Color              | Thermal Pattern       |
|-------------|---------------------------|-----------------------|
| Procurement | `hsl(var(--primary))`     | solid line            |
| Production  | `hsl(var(--link))`        | dashed line           |
| Transfer    | `hsl(var(--muted-foreground))` | dotted line      |

### Stage Badge Colors

| Stage       | Background          | Text                |
|-------------|--------------------|--------------------|
| Created     | blue/10%           | blue               |
| Triggered   | orange/10%         | orange             |
| Ordered     | purple/10%         | purple             |
| In Transit  | cyan/10%           | cyan               |
| Received    | green/10%          | green              |
| Restocked   | gray/10%           | gray               |

---

## 7. QR Code Specifications

- **Content**: `https://{tenant-slug}.arda.cards/scan/{card-uuid}` (production) or `{APP_URL}/scan/{card-uuid}` (development)
- **UUID Immutability**: The card UUID encoded in the QR code is the card's primary key (`kanban_cards.id`). It NEVER changes across reprints.
- **Error Correction**: M (standard), H (high — for printed cards subject to wear)
- **Quiet Zone**: 2 module margin minimum

---

## 8. Print CSS Rules

```css
@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { background: white !important; margin: 0; padding: 0; }
  .no-print { display: none !important; }
  .print-card { break-inside: avoid; box-shadow: none !important; }
}
```

### Page Size Configuration

Generated dynamically per format:
```css
@page {
  size: {widthIn}in {heightIn}in;
  margin: {margins};
}
```
