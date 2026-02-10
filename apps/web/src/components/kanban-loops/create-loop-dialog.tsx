import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
  Input,
} from "@/components/ui";
import {
  isUnauthorized,
  parseApiError,
  createLoop,
} from "@/lib/api-client";
import type { LoopType } from "@/types";
import { LOOP_ORDER, LOOP_META } from "@/types";

/* ── Card mode options ──────────────────────────────────────── */

const CARD_MODE_OPTIONS = [
  { value: "fixed", label: "Fixed" },
  { value: "signal", label: "Signal" },
  { value: "electronic", label: "Electronic" },
] as const;

/* ── Main component ─────────────────────────────────────────── */

interface CreateLoopDialogProps {
  token: string;
  onUnauthorized: () => void;
  onCreated: () => void;
}

export function CreateLoopDialog({ token, onUnauthorized, onCreated }: CreateLoopDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Form state
  const [partId, setPartId] = React.useState("");
  const [facilityId, setFacilityId] = React.useState("");
  const [loopType, setLoopType] = React.useState<LoopType>("procurement");
  const [cardMode, setCardMode] = React.useState("fixed");
  const [numberOfCards, setNumberOfCards] = React.useState("3");
  const [minQuantity, setMinQuantity] = React.useState("");
  const [orderQuantity, setOrderQuantity] = React.useState("");
  const [leadTimeDays, setLeadTimeDays] = React.useState("");

  const resetForm = () => {
    setPartId("");
    setFacilityId("");
    setLoopType("procurement");
    setCardMode("fixed");
    setNumberOfCards("3");
    setMinQuantity("");
    setOrderQuantity("");
    setLeadTimeDays("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!partId.trim()) {
      toast.error("Part ID is required.");
      return;
    }
    if (!facilityId.trim()) {
      toast.error("Facility ID is required.");
      return;
    }

    setIsSaving(true);

    try {
      const input: Parameters<typeof createLoop>[1] = {
        partId: partId.trim(),
        facilityId: facilityId.trim(),
        loopType,
        cardMode,
      };

      const cardsNum = Number(numberOfCards);
      if (Number.isFinite(cardsNum) && cardsNum > 0) {
        input.numberOfCards = cardsNum;
      }

      const minQtyNum = Number(minQuantity);
      if (Number.isFinite(minQtyNum) && minQtyNum > 0) {
        input.minQuantity = minQtyNum;
      }

      const orderQtyNum = Number(orderQuantity);
      if (Number.isFinite(orderQtyNum) && orderQtyNum > 0) {
        input.orderQuantity = orderQtyNum;
      }

      const leadNum = Number(leadTimeDays);
      if (Number.isFinite(leadNum) && leadNum > 0) {
        input.leadTimeDays = leadNum;
      }

      await createLoop(token, input);
      toast.success("Loop created successfully.");
      resetForm();
      setOpen(false);
      onCreated();
    } catch (err) {
      if (isUnauthorized(err)) {
        onUnauthorized();
        return;
      }
      toast.error(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Create Loop
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Kanban Loop</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Part ID */}
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="create-partId">
              Part ID <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-partId"
              value={partId}
              onChange={(e) => setPartId(e.target.value)}
              placeholder="Enter part ID or search"
              required
              className="mt-1 h-9 text-sm"
            />
          </div>

          {/* Facility */}
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="create-facility">
              Facility <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-facility"
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              placeholder="Enter facility ID"
              required
              className="mt-1 h-9 text-sm"
            />
          </div>

          {/* Loop Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Loop Type
            </label>
            <div className="mt-1 flex gap-2">
              {LOOP_ORDER.map((lt) => {
                const meta = LOOP_META[lt];
                const Icon = meta.icon;
                const isActive = loopType === lt;
                return (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => setLoopType(lt)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-[hsl(var(--link))] bg-[hsl(var(--link)/0.08)] text-[hsl(var(--link))]"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card Mode */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Card Mode
            </label>
            <div className="mt-1 flex gap-2">
              {CARD_MODE_OPTIONS.map((opt) => {
                const isActive = cardMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCardMode(opt.value)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-[hsl(var(--link))] bg-[hsl(var(--link)/0.08)] text-[hsl(var(--link))]"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Numeric fields row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="create-cards">
                Number of Cards
              </label>
              <Input
                id="create-cards"
                type="number"
                min={1}
                value={numberOfCards}
                onChange={(e) => setNumberOfCards(e.target.value)}
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="create-minQty">
                Min Quantity
              </label>
              <Input
                id="create-minQty"
                type="number"
                min={0}
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                placeholder="0"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="create-orderQty">
                Order Quantity
              </label>
              <Input
                id="create-orderQty"
                type="number"
                min={0}
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(e.target.value)}
                placeholder="0"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="create-lead">
                Lead Time (days)
              </label>
              <Input
                id="create-lead"
                type="number"
                min={0}
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                placeholder="--"
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Create Loop
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
