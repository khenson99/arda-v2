/**
 * TOForm — Transfer Order create/edit form
 *
 * Follows Arda design system with proper form structure, validation,
 * and integration with facility/part lookups.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, MapPin } from "lucide-react";
import type { TransferOrder, FacilityRecord, PartRecord } from "@/types";

// ─── Types ───────────────────────────────────────────────────────────

export interface TOLineInput {
  partId: string;
  partName?: string;
  quantityRequested: number;
  notes?: string | null;
}

export interface TOFormInput {
  sourceFacilityId: string;
  destinationFacilityId: string;
  notes?: string;
  lines: TOLineInput[];
}

export interface TOFormProps {
  mode: "create" | "edit";
  to?: TransferOrder;
  facilities: FacilityRecord[];
  parts: PartRecord[];
  onSubmit: (data: TOFormInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

// ─── Component ───────────────────────────────────────────────────────

export function TOForm({
  mode,
  to,
  facilities,
  parts,
  onSubmit,
  onCancel,
  loading = false,
  error = null,
}: TOFormProps) {
  const [sourceFacilityId, setSourceFacilityId] = React.useState(to?.sourceFacilityId || "");
  const [destinationFacilityId, setDestinationFacilityId] = React.useState(to?.destinationFacilityId || "");
  const [notes, setNotes] = React.useState(to?.notes || "");
  const [lines, setLines] = React.useState<TOLineInput[]>(
    to?.lines?.map((line) => ({
      partId: line.partId,
      partName: line.partName,
      quantityRequested: line.quantityRequested,
      notes: line.notes,
    })) || []
  );
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload: TOFormInput = {
      sourceFacilityId,
      destinationFacilityId,
      notes: notes || undefined,
      lines,
    };

    const errors: Record<string, string> = {};
    if (!sourceFacilityId) errors.sourceFacilityId = "Source facility is required";
    if (!destinationFacilityId) errors.destinationFacilityId = "Destination facility is required";
    if (sourceFacilityId === destinationFacilityId) {
      errors.destinationFacilityId = "Source and destination must be different";
    }
    if (lines.length === 0) errors.lines = "At least one line item is required";
    lines.forEach((line, idx) => {
      if (!line.partId) errors[`line_${idx}_partId`] = "Part is required";
      if (line.quantityRequested <= 0) errors[`line_${idx}_quantity`] = "Quantity must be greater than 0";
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    await onSubmit(payload);
  };

  const handleAddLine = () => {
    setLines((prev) => [...prev, { partId: "", quantityRequested: 1, notes: null }]);
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateLine = (index: number, updates: Partial<TOLineInput>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...updates } : line)));
  };

  const handlePartChange = (index: number, partId: string) => {
    const part = parts.find((p) => p.id === partId);
    handleUpdateLine(index, {
      partId,
      partName: part?.name,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card className="card-arda">
        <CardHeader>
          <CardTitle>{mode === "create" ? "Create Transfer Order" : "Edit Transfer Order"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error message */}
          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Source & Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sourceFacilityId">
                <MapPin className="inline-block mr-1 h-3.5 w-3.5" />
                Source Facility *
              </Label>
              <Select value={sourceFacilityId} onValueChange={setSourceFacilityId}>
                <SelectTrigger id="sourceFacilityId" className={cn(validationErrors.sourceFacilityId && "border-red-500")}>
                  <SelectValue placeholder="Select source..." />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.sourceFacilityId && (
                <p className="text-xs text-red-500">{validationErrors.sourceFacilityId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="destinationFacilityId">
                <MapPin className="inline-block mr-1 h-3.5 w-3.5" />
                Destination Facility *
              </Label>
              <Select value={destinationFacilityId} onValueChange={setDestinationFacilityId}>
                <SelectTrigger id="destinationFacilityId" className={cn(validationErrors.destinationFacilityId && "border-red-500")}>
                  <SelectValue placeholder="Select destination..." />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.destinationFacilityId && (
                <p className="text-xs text-red-500">{validationErrors.destinationFacilityId}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes..."
              rows={3}
            />
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items *</Label>
              <Button type="button" size="sm" variant="outline" onClick={handleAddLine}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Line
              </Button>
            </div>

            {validationErrors.lines && (
              <p className="text-xs text-red-500">{validationErrors.lines}</p>
            )}

            {lines.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No line items yet. Click "Add Line" to add parts.
              </div>
            ) : (
              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <Card key={idx} className="rounded-lg">
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-muted-foreground">Line {idx + 1}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveLine(idx)}
                          className="h-6 w-6 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 space-y-1">
                          <Label htmlFor={`line_${idx}_partId`}>Part *</Label>
                          <Select
                            value={line.partId}
                            onValueChange={(val) => handlePartChange(idx, val)}
                          >
                            <SelectTrigger
                              id={`line_${idx}_partId`}
                              className={cn(validationErrors[`line_${idx}_partId`] && "border-red-500")}
                            >
                              <SelectValue placeholder="Select part..." />
                            </SelectTrigger>
                            <SelectContent>
                              {parts.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} {p.partNumber && `(${p.partNumber})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {validationErrors[`line_${idx}_partId`] && (
                            <p className="text-xs text-red-500">{validationErrors[`line_${idx}_partId`]}</p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`line_${idx}_quantity`}>Quantity *</Label>
                          <Input
                            id={`line_${idx}_quantity`}
                            type="number"
                            min={1}
                            value={line.quantityRequested}
                            onChange={(e) =>
                              handleUpdateLine(idx, { quantityRequested: parseInt(e.target.value, 10) || 0 })
                            }
                            className={cn(validationErrors[`line_${idx}_quantity`] && "border-red-500")}
                          />
                          {validationErrors[`line_${idx}_quantity`] && (
                            <p className="text-xs text-red-500">{validationErrors[`line_${idx}_quantity`]}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`line_${idx}_notes`}>Line Notes</Label>
                        <Input
                          id={`line_${idx}_notes`}
                          value={line.notes || ""}
                          onChange={(e) => handleUpdateLine(idx, { notes: e.target.value || null })}
                          placeholder="Optional notes..."
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : mode === "create" ? "Create Transfer Order" : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
