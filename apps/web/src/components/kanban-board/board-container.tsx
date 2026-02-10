import * as React from "react";
import {
  DndContext,
  closestCorners,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { parseApiError } from "@/lib/api-client";
import { StageColumn } from "./stage-column";
import { BoardCard } from "./board-card";
import { isValidTransition } from "@/hooks/use-kanban-board";
import type { GroupedCards } from "@/hooks/use-kanban-board";
import type { KanbanCard, CardStage } from "@/types";
import { CARD_STAGES, CARD_STAGE_META } from "@/types";

/* ── Props ──────────────────────────────────────────────────── */

interface BoardContainerProps {
  grouped: GroupedCards;
  allCards: KanbanCard[];
  moveCard: (cardId: string, toStage: CardStage) => Promise<boolean>;
  onCardClick: (card: KanbanCard) => void;
}

/* ── BoardContainer ─────────────────────────────────────────── */

export function BoardContainer({
  grouped,
  allCards,
  moveCard,
  onCardClick,
}: BoardContainerProps) {
  const [activeCard, setActiveCard] = React.useState<KanbanCard | null>(null);

  /* ── DnD sensors (delay to distinguish click vs drag) ───── */

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 6 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  /* ── Drag handlers ──────────────────────────────────────── */

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const cardId = event.active.id as string;
      const card = allCards.find((c) => c.id === cardId) ?? null;
      setActiveCard(card);
    },
    [allCards],
  );

  const handleDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      setActiveCard(null);

      const { active, over } = event;
      if (!over) return;

      const cardId = active.id as string;
      const toStage = over.id as CardStage;

      // Find the card to validate the transition
      const card = allCards.find((c) => c.id === cardId);
      if (!card) return;

      // Same column -- no-op
      if (card.currentStage === toStage) return;

      // Validate: only forward-adjacent transitions allowed
      if (!isValidTransition(card.currentStage, toStage)) {
        const fromLabel = CARD_STAGE_META[card.currentStage].label;
        const toLabel = CARD_STAGE_META[toStage].label;
        toast.error(`Cannot move directly from ${fromLabel} to ${toLabel}. Only forward transitions to the next stage are allowed.`);
        return;
      }

      try {
        await moveCard(cardId, toStage);
        const toLabel = CARD_STAGE_META[toStage].label;
        toast.success(`Card #${card.cardNumber} moved to ${toLabel}`);
      } catch (err) {
        toast.error(parseApiError(err));
      }
    },
    [allCards, moveCard],
  );

  const handleDragCancel = React.useCallback(() => {
    setActiveCard(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={(e) => void handleDragEnd(e)}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {CARD_STAGES.map((stage) => (
          <div key={stage} className="w-[260px] shrink-0">
            <StageColumn
              stage={stage}
              cards={grouped[stage]}
              onCardClick={onCardClick}
            />
          </div>
        ))}
      </div>

      {/* Drag overlay — follows the pointer */}
      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="w-[240px]">
            <BoardCard
              card={activeCard}
              onClick={() => {}}
              isDragOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
