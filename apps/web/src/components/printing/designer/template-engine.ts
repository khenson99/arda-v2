import type { CardTemplateBindingToken, CardTemplateDefinition, CardTemplateElement } from '@arda/shared-types';
import type { KanbanPrintData, FormatConfig } from '../types';

const ICON_SVGS: Record<'minimum' | 'location' | 'order' | 'supplier', string> = {
  minimum:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
  location:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  order:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v3H9z"/><rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 11h6"/><path d="M9 15h4"/></svg>',
  supplier:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1 1 0 00.2 1.1l.1.1a1 1 0 010 1.4l-1 1a1 1 0 01-1.4 0l-.1-.1a1 1 0 00-1.1-.2 1 1 0 00-.6.9V20a1 1 0 01-1 1h-1.5a1 1 0 01-1-1v-.1a1 1 0 00-.6-.9 1 1 0 00-1.1.2l-.1.1a1 1 0 01-1.4 0l-1-1a1 1 0 010-1.4l.1-.1a1 1 0 00.2-1.1 1 1 0 00-.9-.6H4a1 1 0 01-1-1v-1.5a1 1 0 011-1h.1a1 1 0 00.9-.6 1 1 0 00-.2-1.1l-.1-.1a1 1 0 010-1.4l1-1a1 1 0 011.4 0l.1.1a1 1 0 001.1.2 1 1 0 00.6-.9V4a1 1 0 011-1h1.5a1 1 0 011 1v.1a1 1 0 00.6.9 1 1 0 001.1-.2l.1-.1a1 1 0 011.4 0l1 1a1 1 0 010 1.4l-.1.1a1 1 0 00-.2 1.1 1 1 0 00.9.6h.1a1 1 0 011 1V13a1 1 0 01-1 1h-.1a1 1 0 00-.9.6z"/></svg>',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function normalizeImageUrl(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveBindingToken(token: CardTemplateBindingToken, data: KanbanPrintData): string {
  switch (token) {
    case 'title':
      return data.partDescription || data.partNumber;
    case 'sku':
      return data.sku || data.partNumber;
    case 'minimumText':
      return data.minimumText || '';
    case 'locationText':
      return data.locationText || '';
    case 'orderText':
      return data.orderText || '';
    case 'supplierText':
      return data.supplierText || '';
    case 'notesText':
      return data.notesText || '';
    case 'imageUrl':
      return data.imageUrl || '';
    case 'qrCodeDataUrl':
      return data.qrCodeDataUrl || '';
    default:
      return '';
  }
}

function styleForElement(element: CardTemplateElement): string {
  const style = element.style ?? {};
  const declarations = [
    `position:absolute`,
    `left:${element.x}px`,
    `top:${element.y}px`,
    `width:${element.w}px`,
    `height:${element.h}px`,
    `z-index:${element.z}`,
    `box-sizing:border-box`,
    `overflow:hidden`,
  ];

  if (typeof element.rotation === 'number' && element.rotation !== 0) {
    declarations.push(`transform:rotate(${element.rotation}deg)`);
    declarations.push('transform-origin:center center');
  }
  if (style.fontFamily) declarations.push(`font-family:${style.fontFamily}`);
  if (style.fontSize) declarations.push(`font-size:${style.fontSize}px`);
  if (style.fontWeight) declarations.push(`font-weight:${style.fontWeight}`);
  if (style.color) declarations.push(`color:${style.color}`);
  if (style.textAlign) declarations.push(`text-align:${style.textAlign}`);
  if (style.lineHeight) declarations.push(`line-height:${style.lineHeight}`);
  if (style.backgroundColor) declarations.push(`background:${style.backgroundColor}`);
  if (style.borderColor && style.borderWidth) declarations.push(`border:${style.borderWidth}px solid ${style.borderColor}`);
  if (style.borderRadius) declarations.push(`border-radius:${style.borderRadius}px`);
  if (typeof style.padding === 'number') declarations.push(`padding:${style.padding}px`);
  if (typeof style.opacity === 'number') declarations.push(`opacity:${style.opacity}`);
  return declarations.join(';');
}

function renderElementHtml(element: CardTemplateElement, data: KanbanPrintData): string {
  const baseStyle = styleForElement(element);

  if (element.type === 'bound_text') {
    const value = resolveBindingToken(element.token, data) || element.fallbackText || '';
    return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};white-space:pre-wrap;">${escapeHtml(value)}</div>`;
  }

  if (element.type === 'text') {
    return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};white-space:pre-wrap;">${escapeHtml(element.text)}</div>`;
  }

  if (element.type === 'image') {
    const resolved = element.token ? resolveBindingToken(element.token, data) : (element.src ?? '');
    const imageUrl = normalizeImageUrl(resolved);
    if (!imageUrl) {
      return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};display:flex;align-items:center;justify-content:center;background:#efefef;color:#8a8a8a;font-size:11px;">No image</div>`;
    }
    const fit = element.fit ?? 'contain';
    return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};display:flex;align-items:center;justify-content:center;"><img src="${escapeHtml(imageUrl)}" alt="Item image" style="display:block;width:100%;height:100%;object-fit:${fit};"/></div>`;
  }

  if (element.type === 'qr') {
    return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};"><img src="${escapeHtml(data.qrCodeDataUrl)}" alt="QR Code" style="display:block;width:100%;height:100%;object-fit:contain;"/></div>`;
  }

  if (element.type === 'icon') {
    return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};display:flex;align-items:center;justify-content:center;">${ICON_SVGS[element.iconName]}</div>`;
  }

  if (element.type === 'line') {
    const stroke = element.style?.strokeColor ?? '#2F6FCC';
    const width = element.style?.strokeWidth ?? 1;
    if (element.orientation === 'horizontal') {
      return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};height:${width}px;background:${stroke};"></div>`;
    }
    return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};width:${width}px;background:${stroke};"></div>`;
  }

  if (element.type === 'rect') {
    const bg = element.style?.backgroundColor ?? '#2F6FCC';
    return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};background:${bg};"></div>`;
  }

  if (element.type === 'notes_box') {
    const value = element.token ? resolveBindingToken(element.token, data) : data.notesText || '';
    return `<div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};white-space:pre-wrap;">${escapeHtml(value)}</div>`;
  }

  if (element.type === 'field_row_group') {
    const value = resolveBindingToken(element.token, data);
    return `
      <div data-el-id="${escapeHtml(element.id)}" style="${baseStyle};display:flex;align-items:flex-start;gap:8px;">
        <div style="width:30px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;">
          ${ICON_SVGS[element.iconName]}
          <div style="margin-top:2px;font-size:8px;line-height:1;color:#2F6FCC;">${escapeHtml(element.label)}</div>
        </div>
        <div style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(value)}</div>
      </div>
    `;
  }

  return '';
}

export function renderTemplateToHtml(
  definition: CardTemplateDefinition,
  data: KanbanPrintData,
  config: FormatConfig,
): string {
  const elements = [...definition.elements].sort((a, b) => a.z - b.z);
  const children = elements.map((el) => renderElementHtml(el, data)).join('\n');

  return `
    <div class="print-card" style="position:relative;box-sizing:border-box;width:${config.widthPx}px;height:${config.heightPx}px;background:${escapeHtml(definition.canvas.background)};overflow:hidden;border:1px solid #ddd;font-family:'Open Sans',Arial,sans-serif;">
      ${children}
    </div>
  `;
}
