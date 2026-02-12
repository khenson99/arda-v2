/**
 * TransferQueueItemCard — Individual transfer queue item display
 *
 * Renders a single queue item from the transfer queue with priority
 * badge, destination/part info, and collapsible recommendation panel.
 * Follows Arda design system: rounded-xl, shadow-sm, name-value pairs.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, MapPin, Package, Clock, Ruler } from "lucide-react";
import type { TransferQueueItem, TransferQueuePriority } from "@/types";

// ─── Priority Mapping ────────────────────────────────────────────

const priorityConfig: Record<
  TransferQueuePriority,
  { variant: "destructive" | "warning" | "accent" | "secondary"; dot: string; label: string }
> = {
  critical: { variant: "destructive", dot: "bg-red-500", label: "Critical" },
  high: { variant: "warning", dot: "bg-amber-500", label: "High" },
  medium: { variant: "accent", dot: "bg-blue-500", label: "Medium" },
  low: { variant: "secondary", dot: "bg-gray-400", label: "Low" },
};

// ─── Component ───────────────────────────────────────────────────

export interface TransferQueueItemCardProps {
  item: TransferQueueItem;
  selected?: boolean;
  onSelect?: (itemId: string) => void;
  onCreateTO?: (item: TransferQueueItem) => void;
}

export function TransferQueueItemCard({
  item,
  selected = false,
  onSelect,
  onCreateTO,
}: TransferQueueItemCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const config = priorityConfig[item.priority];
  const hasRecommendation = item.recommendedSource !== null;

  return (
    <Card
      className={cn(
        "rounded-xl shadow-sm transition-colors",
        selected && "ring-2 ring-primary/50 bg-primary/5",
        !selected && "hover:bg-muted/30"
      )}
    >
      <CardContent className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Selection checkbox */}
          <div className="flex items-center pt-0.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect?.(item.id)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Priority dot */}
          <div className="flex items-center pt-1">
            <span className={cn("h-2.5 w-2.5 rounded-full", config.dot)} />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Top row: part info + badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-card-foreground truncate">
                  {item.partNumber}
                </span>
                <span className="text-sm text-muted-foreground truncate">
                  {item.partName}
                </span>
              </div>
              <Badge variant={config.variant} className="shrink-0">
                {config.label}
              </Badge>
            </div>

            {/* Detail row */}
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="name-value-pair">
                <span className="text-muted-foreground">Destination:</span>{" "}
                <span className="font-semibold">{item.destinationFacilityName}</span>
              </span>

              <span className="name-value-pair">
                <span className="text-muted-foreground">Qty Needed:</span>{" "}
                <span className="font-semibold">{item.quantityNeeded}</span>
              </span>

              {item.daysBelowReorder !== null && (
                <span className="name-value-pair">
                  <span className="text-muted-foreground">Days Below Reorder:</span>{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      item.daysBelowReorder >= 7 && "text-red-600",
                      item.daysBelowReorder >= 3 && item.daysBelowReorder < 7 && "text-amber-600"
                    )}
                  >
                    {item.daysBelowReorder}d
                  </span>
                </span>
              )}

              <span className="name-value-pair">
                <span className="text-muted-foreground">Priority Score:</span>{" "}
                <span className="font-semibold">{item.priorityScore.toFixed(1)}</span>
              </span>
            </div>

            {/* Recommendation toggle + action */}
            <div className="mt-2 flex items-center justify-between gap-2">
              {hasRecommendation ? (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-xs text-[hsl(var(--link))] hover:underline font-medium"
                >
                  {expanded ? (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Hide Recommendation
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-3.5 w-3.5" />
                      Show Recommendation
                    </>
                  )}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">No recommendation available</span>
              )}

              <Button
                size="sm"
                variant="default"
                onClick={() => onCreateTO?.(item)}
                className="h-7 text-xs"
              >
                Create TO
              </Button>
            </div>

            {/* Collapsible recommendation panel */}
            {expanded && hasRecommendation && item.recommendedSource && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Recommended Source</p>
                <div className="rounded-lg bg-accent/5 border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">{item.recommendedSource.facilityName}</span>
                      <span className="text-xs text-muted-foreground">({item.recommendedSource.facilityCode})</span>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Score: {item.recommendedSource.score.toFixed(1)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="name-value-pair">
                        <span className="text-muted-foreground">Available:</span>{" "}
                        <span className="font-semibold">{item.recommendedSource.availableQty}</span>
                      </span>
                    </div>
                    {item.recommendedSource.avgLeadTimeDays !== null && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="name-value-pair">
                          <span className="text-muted-foreground">Lead:</span>{" "}
                          <span className="font-semibold">{item.recommendedSource.avgLeadTimeDays}d</span>
                        </span>
                      </div>
                    )}
                    {item.recommendedSource.distanceKm !== null && (
                      <div className="flex items-center gap-1.5">
                        <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="name-value-pair">
                          <span className="text-muted-foreground">Distance:</span>{" "}
                          <span className="font-semibold">{Math.round(item.recommendedSource.distanceKm)}km</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
