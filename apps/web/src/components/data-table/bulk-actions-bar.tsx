import React from "react";
import { Printer, ShoppingCart, X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { createPrintJob, createPurchaseOrderFromCards, parseApiError } from "@/lib/api-client";
import type { AuthSession } from "@/types";

/* ── Types ──────────────────────────────────────────────────── */

type ActionState = "idle" | "loading" | "done";

export interface BulkActionsBarProps {
  selectedCount: number;
  selectedCardIds: string[];
  session: AuthSession;
  onDeselectAll: () => void;
  onComplete: () => void;
}

/* ── Component ──────────────────────────────────────────────── */

export function BulkActionsBar({
  selectedCount,
  selectedCardIds,
  session,
  onDeselectAll,
  onComplete,
}: BulkActionsBarProps) {
  const [printState, setPrintState] = React.useState<ActionState>("idle");
  const [poState, setPoState] = React.useState<ActionState>("idle");

  const hasCards = selectedCardIds.length > 0;
  const isVisible = selectedCount > 0;

  /* Reset button states when selection clears */
  React.useEffect(() => {
    if (!isVisible) {
      setPrintState("idle");
      setPoState("idle");
    }
  }, [isVisible]);

  const handlePrintLabels = React.useCallback(async () => {
    if (!hasCards || printState === "loading") return;

    setPrintState("loading");
    try {
      await createPrintJob(session.tokens.accessToken, {
        cardIds: selectedCardIds,
      });
      setPrintState("done");
      toast.success("Print job created");

      setTimeout(() => {
        onComplete();
        setPrintState("idle");
      }, 1500);
    } catch (err) {
      setPrintState("idle");
      toast.error(parseApiError(err));
    }
  }, [hasCards, printState, session.tokens.accessToken, selectedCardIds, onComplete]);

  const handleCreatePo = React.useCallback(async () => {
    if (!hasCards || poState === "loading") return;

    setPoState("loading");
    try {
      const result = await createPurchaseOrderFromCards(session.tokens.accessToken, {
        cardIds: selectedCardIds,
      });
      setPoState("done");
      toast.success(`PO ${result.poNumber} created`);

      setTimeout(() => {
        onComplete();
        setPoState("idle");
      }, 1500);
    } catch (err) {
      setPoState("idle");
      toast.error(parseApiError(err));
    }
  }, [hasCards, poState, session.tokens.accessToken, selectedCardIds, onComplete]);

  const handleDeselectAll = React.useCallback(() => {
    onDeselectAll();
  }, [onDeselectAll]);

  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 md:left-[228px] z-30",
        "bg-card border-t border-border shadow-lg",
        "min-h-[56px] px-4 py-3",
        "transition-transform duration-200 ease-out",
        isVisible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {/* Selected count */}
        <span className="text-sm font-semibold">
          {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
        </span>

        {/* Print Labels */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="accent"
                  size="sm"
                  disabled={!hasCards || printState === "loading"}
                  onClick={handlePrintLabels}
                >
                  {printState === "loading" && (
                    <>
                      <Loader2 className="animate-spin" />
                      Working...
                    </>
                  )}
                  {printState === "done" && (
                    <>
                      <Check />
                      Done!
                    </>
                  )}
                  {printState === "idle" && (
                    <>
                      <Printer />
                      Print Labels
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {!hasCards && (
              <TooltipContent side="top">
                Selected items have no kanban cards
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Create PO */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasCards || poState === "loading"}
                  onClick={handleCreatePo}
                >
                  {poState === "loading" && (
                    <>
                      <Loader2 className="animate-spin" />
                      Working...
                    </>
                  )}
                  {poState === "done" && (
                    <>
                      <Check />
                      Done!
                    </>
                  )}
                  {poState === "idle" && (
                    <>
                      <ShoppingCart />
                      Create PO
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {!hasCards && (
              <TooltipContent side="top">
                Selected items have no kanban cards
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Deselect All */}
        <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
          <X />
          Deselect All
        </Button>
      </div>
    </div>
  );
}
