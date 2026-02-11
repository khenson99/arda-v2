import * as React from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import type { CreateProcurementDraftsInput } from "@/types";
import type { VendorQueueGroup } from "./vendor-queue";
import {
  PROCUREMENT_ORDER_METHODS,
  procurementOrderMethodLabel,
} from "./order-method";
import { validateVendorOrderConfig } from "./vendor-order-workflow";

interface VendorOrderConfigDialogProps {
  open: boolean;
  group: VendorQueueGroup | null;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateProcurementDraftsInput) => Promise<void> | void;
}

interface LocalLineState {
  cardId: string;
  partName: string;
  quantityOrdered: number;
  description: string;
  orderMethod: CreateProcurementDraftsInput["lines"][number]["orderMethod"] | null;
  sourceUrl: string;
  notes: string;
}

function methodRequiresSourceUrl(method: string) {
  return method === "online" || method === "shopping";
}

export function VendorOrderConfigDialog({
  open,
  group,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: VendorOrderConfigDialogProps) {
  const [recipientEmail, setRecipientEmail] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState("");
  const [shippingTerms, setShippingTerms] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [thirdPartyInstructions, setThirdPartyInstructions] = React.useState("");
  const [lines, setLines] = React.useState<LocalLineState[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!group) return;

    setRecipientEmail(group.supplierContactEmail ?? "");
    setPaymentTerms("");
    setShippingTerms("");
    setNotes("");
    setThirdPartyInstructions("");
    setLines(
      group.lines.map((line) => ({
        cardId: line.card.id,
        partName: line.partName,
        quantityOrdered: Math.max(1, line.card.orderQuantity),
        description: line.partName,
        orderMethod: line.orderMethod,
        sourceUrl: line.part?.primarySupplierLink ?? "",
        notes: "",
      })),
    );
    setErrors({});
  }, [group]);

  const methodSet = React.useMemo(() => {
    const set = new Set<string>();
    lines.forEach((line) => {
      if (line.orderMethod) {
        set.add(line.orderMethod);
      }
    });
    return set;
  }, [lines]);

  const validate = React.useCallback(() => {
    const nextErrors = validateVendorOrderConfig({
      recipientEmail,
      thirdPartyInstructions,
      supplierContactPhone: group?.supplierContactPhone ?? "",
      lines: lines.map((line) => ({
        quantityOrdered: line.quantityOrdered,
        orderMethod: line.orderMethod,
        sourceUrl: line.sourceUrl,
      })),
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [group?.supplierContactPhone, lines, recipientEmail, thirdPartyInstructions]);

  const handleLineChange = React.useCallback(
    (index: number, patch: Partial<LocalLineState>) => {
      setLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
    },
    [],
  );

  const handleSubmit = React.useCallback(async () => {
    if (!group) return;
    if (!validate()) return;

    const payload: CreateProcurementDraftsInput = {
      supplierId: group.supplierId ?? "",
      recipientEmail: recipientEmail.trim() || null,
      paymentTerms: paymentTerms.trim() || null,
      shippingTerms: shippingTerms.trim() || null,
      notes: notes.trim() || null,
      thirdPartyInstructions: thirdPartyInstructions.trim() || null,
      lines: lines.map((line) => ({
        cardId: line.cardId,
        quantityOrdered: Math.max(1, Math.floor(line.quantityOrdered)),
        description: line.description.trim() || null,
        orderMethod: line.orderMethod!,
        sourceUrl: line.sourceUrl.trim() || null,
        notes: line.notes.trim() || null,
      })),
    };

    await onSubmit(payload);
  }, [group, lines, notes, onSubmit, paymentTerms, recipientEmail, shippingTerms, thirdPartyInstructions, validate]);

  const hasUnknown = group?.hasUnknownMethods ?? false;
  const canSubmit = !!group?.supplierId && !hasUnknown;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Vendor Order</DialogTitle>
          <DialogDescription>
            Review and edit all lines before creating draft purchase orders grouped by facility.
          </DialogDescription>
        </DialogHeader>

        {!group ? null : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{group.supplierName}</Badge>
              <Badge variant="outline">{group.lines.length} lines</Badge>
              <Badge variant="outline">{Object.keys(group.facilityCounts).length} facilities</Badge>
              {group.hasUnknownMethods && <Badge variant="destructive">Unknown method detected</Badge>}
            </div>

            {errors.supplierContactPhone && (
              <p className="text-xs text-red-600">{errors.supplierContactPhone}</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-semibold">Recipient Email</span>
                <Input
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="buyer@vendor.com"
                />
                {errors.recipientEmail && <span className="text-red-600">{errors.recipientEmail}</span>}
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold">Payment Terms</span>
                <Input
                  value={paymentTerms}
                  onChange={(event) => setPaymentTerms(event.target.value)}
                  placeholder="Net 30"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold">Shipping Terms</span>
                <Input
                  value={shippingTerms}
                  onChange={(event) => setShippingTerms(event.target.value)}
                  placeholder="FOB Destination"
                />
              </label>
            </div>

            {methodSet.has("third_party") && (
              <label className="block space-y-1 text-xs">
                <span className="font-semibold">Third-Party Instructions</span>
                <textarea
                  className="min-h-[76px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={thirdPartyInstructions}
                  onChange={(event) => setThirdPartyInstructions(event.target.value)}
                  placeholder="Instructions for broker / logistics partner"
                />
                {errors.thirdPartyInstructions && (
                  <span className="text-red-600">{errors.thirdPartyInstructions}</span>
                )}
              </label>
            )}

            <label className="block space-y-1 text-xs">
              <span className="font-semibold">Notes</span>
              <textarea
                className="min-h-[76px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Header notes applied to this run"
              />
            </label>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[960px] text-left text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Card</th>
                    <th className="px-2 py-2 font-semibold">Part</th>
                    <th className="px-2 py-2 font-semibold">Qty</th>
                    <th className="px-2 py-2 font-semibold">Description</th>
                    <th className="px-2 py-2 font-semibold">Method</th>
                    <th className="px-2 py-2 font-semibold">Source URL</th>
                    <th className="px-2 py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.cardId} className="border-t align-top">
                      <td className="px-2 py-2 font-mono text-[11px]">{group.lines[index]?.card.cardNumber}</td>
                      <td className="px-2 py-2">{line.partName}</td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={1}
                          value={line.quantityOrdered}
                          onChange={(event) =>
                            handleLineChange(index, {
                              quantityOrdered: Number(event.target.value || 0),
                            })
                          }
                        />
                        {errors[`line-${index}-quantity`] && (
                          <div className="pt-1 text-[11px] text-red-600">{errors[`line-${index}-quantity`]}</div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          value={line.description}
                          onChange={(event) => handleLineChange(index, { description: event.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={line.orderMethod ?? ""}
                          onChange={(event) =>
                            handleLineChange(index, {
                              orderMethod: (event.target.value || null) as LocalLineState["orderMethod"],
                            })
                          }
                        >
                          <option value="">Select method</option>
                          {PROCUREMENT_ORDER_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {procurementOrderMethodLabel(method)}
                            </option>
                          ))}
                        </select>
                        {errors[`line-${index}-orderMethod`] && (
                          <div className="pt-1 text-[11px] text-red-600">{errors[`line-${index}-orderMethod`]}</div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          value={line.sourceUrl}
                          onChange={(event) => handleLineChange(index, { sourceUrl: event.target.value })}
                          placeholder={
                            line.orderMethod && methodRequiresSourceUrl(line.orderMethod)
                              ? "https://vendor.example/item"
                              : "Optional"
                          }
                        />
                        {errors[`line-${index}-sourceUrl`] && (
                          <div className="pt-1 text-[11px] text-red-600">{errors[`line-${index}-sourceUrl`]}</div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          value={line.notes}
                          onChange={(event) => handleLineChange(index, { notes: event.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit || isSubmitting}>
            Create Drafts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
