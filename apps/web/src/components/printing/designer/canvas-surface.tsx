import * as React from 'react';
import type { CardTemplateDefinition, CardTemplateElement, CardTemplateTextElement } from '@arda/shared-types';
import type { KanbanPrintData } from '../types';
import { normalizeImageUrl, resolveBindingToken } from './template-engine';

type InteractionMode = 'drag' | 'resize';

interface CanvasSurfaceProps {
  definition: CardTemplateDefinition;
  data: KanbanPrintData;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onDefinitionChange: (definition: CardTemplateDefinition) => void;
  scale?: number;
}

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

function clampElementWithinBounds(definition: CardTemplateDefinition, element: CardTemplateElement): CardTemplateElement {
  const minX = definition.safeArea.left;
  const minY = definition.safeArea.top;
  const maxX = definition.canvas.width - definition.safeArea.right;
  const maxY = definition.canvas.height - definition.safeArea.bottom;

  let x = element.x;
  let y = element.y;
  let w = element.w;
  let h = element.h;

  if (x < minX) x = minX;
  if (y < minY) y = minY;
  if (x + w > maxX) x = Math.max(minX, maxX - w);
  if (y + h > maxY) y = Math.max(minY, maxY - h);

  w = Math.min(w, maxX - x);
  h = Math.min(h, maxY - y);
  w = Math.max(8, w);
  h = Math.max(8, h);

  return { ...element, x, y, w, h };
}

function snap(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function CanvasSurface({
  definition,
  data,
  selectedElementId,
  onSelectElement,
  onDefinitionChange,
  scale = 1,
}: CanvasSurfaceProps) {
  const [interaction, setInteraction] = React.useState<{
    id: string;
    mode: InteractionMode;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null);

  const updateElement = React.useCallback((id: string, updater: (element: CardTemplateElement) => CardTemplateElement) => {
    const nextElements = definition.elements.map((element) => {
      if (element.id !== id) return element;
      const updated = updater(element);
      return clampElementWithinBounds(definition, updated);
    });
    onDefinitionChange({ ...definition, elements: nextElements });
  }, [definition, onDefinitionChange]);

  React.useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dx = (event.clientX - interaction.startClientX) / scale;
      const dy = (event.clientY - interaction.startClientY) / scale;

      updateElement(interaction.id, (element) => {
        if (interaction.mode === 'drag') {
          return {
            ...element,
            x: snap(interaction.startX + dx, definition.grid.size, definition.grid.enabled),
            y: snap(interaction.startY + dy, definition.grid.size, definition.grid.enabled),
          };
        }

        return {
          ...element,
          w: snap(Math.max(8, interaction.startW + dx), definition.grid.size, definition.grid.enabled),
          h: snap(Math.max(8, interaction.startH + dy), definition.grid.size, definition.grid.enabled),
        };
      });
    };

    const handlePointerUp = () => setInteraction(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [definition.grid.enabled, definition.grid.size, interaction, scale, updateElement]);

  const sortedElements = React.useMemo(
    () => [...definition.elements].sort((a, b) => a.z - b.z),
    [definition.elements],
  );

  const selectedElement = definition.elements.find((element) => element.id === selectedElementId) ?? null;

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedElement || selectedElement.locked) return;

    const step = event.shiftKey ? 10 : 1;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;

    event.preventDefault();
    updateElement(selectedElement.id, (element) => {
      if (event.key === 'ArrowUp') return { ...element, y: element.y - step };
      if (event.key === 'ArrowDown') return { ...element, y: element.y + step };
      if (event.key === 'ArrowLeft') return { ...element, x: element.x - step };
      return { ...element, x: element.x + step };
    });
  }, [selectedElement, updateElement]);

  return (
    <div className="overflow-auto rounded-md border border-border bg-muted/10 p-3">
      <div
        className="mx-auto"
        style={{
          width: definition.canvas.width * scale,
          height: definition.canvas.height * scale,
        }}
      >
        <div
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={() => onSelectElement(null)}
          style={{
            position: 'relative',
            width: definition.canvas.width,
            height: definition.canvas.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: definition.canvas.background,
            border: '1px solid #d1d5db',
            boxSizing: 'border-box',
            backgroundImage: definition.grid.enabled
              ? `linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)`
              : undefined,
            backgroundSize: definition.grid.enabled ? `${definition.grid.size}px ${definition.grid.size}px` : undefined,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: definition.safeArea.left,
              top: definition.safeArea.top,
              width: definition.canvas.width - definition.safeArea.left - definition.safeArea.right,
              height: definition.canvas.height - definition.safeArea.top - definition.safeArea.bottom,
              border: '1px dashed rgba(47,111,204,0.4)',
              pointerEvents: 'none',
            }}
          />

          {sortedElements.map((element) => {
            const style = element.style ?? {};
            const isSelected = selectedElementId === element.id;
            const valueForBoundText = element.type === 'bound_text' ? resolveBindingToken(element.token, data) : '';
            const valueForFieldRow = element.type === 'field_row_group' ? resolveBindingToken(element.token, data) : '';
            const imageUrl = element.type === 'image'
              ? normalizeImageUrl(element.token ? resolveBindingToken(element.token, data) : element.src)
              : null;

            return (
              <div
                key={element.id}
                role="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectElement(element.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (element.type === 'text') {
                    setInlineEditId(element.id);
                  }
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  onSelectElement(element.id);
                  if (element.locked) return;
                  setInteraction({
                    id: element.id,
                    mode: 'drag',
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startX: element.x,
                    startY: element.y,
                    startW: element.w,
                    startH: element.h,
                  });
                }}
                style={{
                  position: 'absolute',
                  left: element.x,
                  top: element.y,
                  width: element.w,
                  height: element.h,
                  zIndex: element.z,
                  border: isSelected ? '1px solid #2F6FCC' : '1px solid transparent',
                  boxSizing: 'border-box',
                  cursor: element.locked ? 'default' : 'move',
                  overflow: 'hidden',
                  fontFamily: style.fontFamily,
                  fontSize: style.fontSize,
                  fontWeight: style.fontWeight,
                  color: style.color,
                  textAlign: style.textAlign,
                  lineHeight: style.lineHeight,
                  background: style.backgroundColor,
                  borderRadius: style.borderRadius,
                  padding: style.padding,
                  opacity: style.opacity,
                }}
              >
                {element.type === 'bound_text' && (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{valueForBoundText || element.fallbackText || ''}</div>
                )}

                {element.type === 'text' && inlineEditId === element.id && (
                  <textarea
                    autoFocus
                    defaultValue={(element as CardTemplateTextElement).text}
                    className="h-full w-full resize-none border border-primary bg-white p-1 text-xs"
                    onBlur={(event) => {
                      updateElement(element.id, (current) => {
                        if (current.type !== 'text') return current;
                        return { ...current, text: event.target.value };
                      });
                      setInlineEditId(null);
                    }}
                  />
                )}

                {element.type === 'text' && inlineEditId !== element.id && (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{element.text}</div>
                )}

                {element.type === 'image' && (
                  imageUrl
                    ? <img src={imageUrl} alt="Template element" style={{ width: '100%', height: '100%', objectFit: element.fit ?? 'contain' }} />
                    : <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">No image</div>
                )}

                {element.type === 'qr' && (
                  <img src={data.qrCodeDataUrl} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                )}

                {element.type === 'icon' && (
                  <div className="flex h-full w-full items-center justify-center" dangerouslySetInnerHTML={{ __html: ICON_SVGS[element.iconName] }} />
                )}

                {element.type === 'line' && (
                  <div
                    style={{
                      width: element.type === 'line' && element.orientation === 'horizontal' ? '100%' : (style.strokeWidth ?? 1),
                      height: element.type === 'line' && element.orientation === 'vertical' ? '100%' : (style.strokeWidth ?? 1),
                      background: style.strokeColor ?? '#2F6FCC',
                    }}
                  />
                )}

                {element.type === 'rect' && (
                  <div className="h-full w-full" style={{ background: style.backgroundColor ?? '#2F6FCC' }} />
                )}

                {element.type === 'notes_box' && (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{resolveBindingToken('notesText', data)}</div>
                )}

                {element.type === 'field_row_group' && (
                  <div className="flex h-full items-start gap-2">
                    <div className="flex w-8 flex-col items-center" dangerouslySetInnerHTML={{ __html: ICON_SVGS[element.iconName] }} />
                    <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{valueForFieldRow}</div>
                  </div>
                )}

                {isSelected && !element.locked && (
                  <button
                    type="button"
                    aria-label="Resize element"
                    className="absolute bottom-0 right-0 h-2.5 w-2.5 cursor-se-resize border border-primary bg-white"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setInteraction({
                        id: element.id,
                        mode: 'resize',
                        startClientX: event.clientX,
                        startClientY: event.clientY,
                        startX: element.x,
                        startY: element.y,
                        startW: element.w,
                        startH: element.h,
                      });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
