import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import type { TransferOrderLine, InventoryLedgerEntry } from "@/types";
import { cn } from "@/lib/utils";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";

interface TransferOrderInventoryImpactProps {
  lines: TransferOrderLine[];
  sourceFacilityId: string;
  destinationFacilityId: string;
  sourceFacilityName: string | null;
  destinationFacilityName: string | null;
  sourceInventory: InventoryLedgerEntry[];
  destinationInventory: InventoryLedgerEntry[];
}

interface LineImpact {
  lineId: string;
  partId: string;
  partName: string | null;
  quantityRequested: number;
  quantityShipped: number;
  quantityReceived: number;
  sourceCurrentQty: number | null;
  sourceAfterShipQty: number | null;
  destCurrentQty: number | null;
  destAfterReceiveQty: number | null;
}

function calculateLineImpacts(
  lines: TransferOrderLine[],
  sourceInventory: InventoryLedgerEntry[],
  destinationInventory: InventoryLedgerEntry[]
): LineImpact[] {
  const sourceMap = new Map(sourceInventory.map((inv) => [inv.partId, inv]));
  const destMap = new Map(destinationInventory.map((inv) => [inv.partId, inv]));

  return lines.map((line) => {
    const sourceInv = sourceMap.get(line.partId);
    const destInv = destMap.get(line.partId);

    const sourceCurrentQty = sourceInv?.qtyOnHand ?? null;
    const sourceAfterShipQty = sourceCurrentQty !== null
      ? sourceCurrentQty - line.quantityShipped
      : null;

    const destCurrentQty = destInv?.qtyOnHand ?? null;
    const destAfterReceiveQty = destCurrentQty !== null
      ? destCurrentQty + line.quantityReceived
      : null;

    return {
      lineId: line.id,
      partId: line.partId,
      partName: line.partName ?? null,
      quantityRequested: line.quantityRequested,
      quantityShipped: line.quantityShipped,
      quantityReceived: line.quantityReceived,
      sourceCurrentQty,
      sourceAfterShipQty,
      destCurrentQty,
      destAfterReceiveQty,
    };
  });
}

function QuantityBadge({
  value,
  isPositive,
  className,
}: {
  value: number;
  isPositive?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
        isPositive === true && "bg-[hsl(var(--arda-success-light))] text-[hsl(var(--arda-success))]",
        isPositive === false && "bg-[hsl(var(--arda-warning-light))] text-[hsl(var(--arda-warning))]",
        isPositive === undefined && "bg-muted text-muted-foreground",
        className
      )}
    >
      {isPositive === true && <TrendingUp className="h-3 w-3" />}
      {isPositive === false && <TrendingDown className="h-3 w-3" />}
      {value}
    </span>
  );
}

export function TransferOrderInventoryImpact({
  lines,
  sourceFacilityName,
  destinationFacilityName,
  sourceInventory,
  destinationInventory,
}: TransferOrderInventoryImpactProps) {
  const lineImpacts = React.useMemo(
    () => calculateLineImpacts(lines, sourceInventory, destinationInventory),
    [lines, sourceInventory, destinationInventory]
  );

  if (lineImpacts.length === 0) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Inventory Impact</CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No line items to display.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Inventory Impact</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Per-line quantity changes at source and destination facilities
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Part</th>
                <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Requested</th>
                <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Shipped</th>
                <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Received</th>
                <th className="px-3 py-2 text-center font-semibold text-muted-foreground border-l border-border">
                  {sourceFacilityName || "Source"} Before
                </th>
                <th className="px-3 py-2 text-center font-semibold text-muted-foreground">
                  {sourceFacilityName || "Source"} After
                </th>
                <th className="px-3 py-2 text-center font-semibold text-muted-foreground border-l border-border">
                  {destinationFacilityName || "Destination"} Before
                </th>
                <th className="px-3 py-2 text-center font-semibold text-muted-foreground">
                  {destinationFacilityName || "Destination"} After
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lineImpacts.map((impact) => {
                const isPartialShip = impact.quantityShipped > 0 && impact.quantityShipped < impact.quantityRequested;
                const isPartialReceive = impact.quantityReceived > 0 && impact.quantityReceived < impact.quantityShipped;

                return (
                  <tr key={impact.lineId} className="hover:bg-muted/50">
                    <td className="px-3 py-2 font-medium">
                      {impact.partName || impact.partId}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {impact.quantityRequested}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          "tabular-nums",
                          impact.quantityShipped >= impact.quantityRequested
                            ? "text-[hsl(var(--arda-success))]"
                            : impact.quantityShipped > 0
                              ? "text-[hsl(var(--arda-warning))]"
                              : "text-muted-foreground"
                        )}
                      >
                        {impact.quantityShipped}
                      </span>
                      {isPartialShip && (
                        <span className="ml-1 text-[hsl(var(--arda-warning))]">⚠</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          "tabular-nums",
                          impact.quantityReceived >= impact.quantityRequested
                            ? "text-[hsl(var(--arda-success))]"
                            : impact.quantityReceived > 0
                              ? "text-[hsl(var(--arda-warning))]"
                              : "text-muted-foreground"
                        )}
                      >
                        {impact.quantityReceived}
                      </span>
                      {isPartialReceive && (
                        <span className="ml-1 text-[hsl(var(--arda-warning))]">⚠</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center border-l border-border">
                      {impact.sourceCurrentQty !== null ? (
                        <QuantityBadge value={impact.sourceCurrentQty} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {impact.sourceAfterShipQty !== null ? (
                        <div className="flex items-center justify-center gap-1">
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <QuantityBadge
                            value={impact.sourceAfterShipQty}
                            isPositive={impact.quantityShipped === 0 ? undefined : false}
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center border-l border-border">
                      {impact.destCurrentQty !== null ? (
                        <QuantityBadge value={impact.destCurrentQty} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {impact.destAfterReceiveQty !== null ? (
                        <div className="flex items-center justify-center gap-1">
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <QuantityBadge
                            value={impact.destAfterReceiveQty}
                            isPositive={impact.quantityReceived === 0 ? undefined : true}
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
