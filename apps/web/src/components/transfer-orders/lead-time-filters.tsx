/**
 * LeadTimeFilters — Filter controls for lead-time analytics
 *
 * Provides date range, source facility, destination facility, and part filters
 */

import * as React from "react";
import { Button, Input } from "@/components/ui";
import { X } from "lucide-react";
import type { FacilityRecord, PartRecord, LeadTimeFilters } from "@/types";

interface LeadTimeFiltersProps {
  filters: LeadTimeFilters;
  facilities: FacilityRecord[];
  parts: PartRecord[];
  facilitiesLoading: boolean;
  partsLoading: boolean;
  onFiltersChange: (filters: Partial<LeadTimeFilters>) => void;
  onClearFilters: () => void;
}

export function LeadTimeFilters({
  filters,
  facilities,
  parts,
  facilitiesLoading,
  partsLoading,
  onFiltersChange,
  onClearFilters,
}: LeadTimeFiltersProps) {
  const hasActiveFilters =
    filters.dateFrom ||
    filters.dateTo ||
    filters.sourceFacilityId ||
    filters.destinationFacilityId ||
    filters.partId;

  return (
    <div className="space-y-3">
      {/* Top row: Date range */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Date From
          </label>
          <Input
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) => onFiltersChange({ dateFrom: e.target.value || undefined })}
            className="text-sm"
          />
        </div>
        <div className="w-48">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Date To
          </label>
          <Input
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) => onFiltersChange({ dateTo: e.target.value || undefined })}
            className="text-sm"
          />
        </div>
      </div>

      {/* Bottom row: Facilities + Part */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Source Facility
          </label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={filters.sourceFacilityId || ""}
            onChange={(e) =>
              onFiltersChange({ sourceFacilityId: e.target.value || undefined })
            }
            disabled={facilitiesLoading}
          >
            <option value="">All Facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-56">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Destination Facility
          </label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={filters.destinationFacilityId || ""}
            onChange={(e) =>
              onFiltersChange({ destinationFacilityId: e.target.value || undefined })
            }
            disabled={facilitiesLoading}
          >
            <option value="">All Facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[240px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Part</label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={filters.partId || ""}
            onChange={(e) => onFiltersChange({ partId: e.target.value || undefined })}
            disabled={partsLoading}
          >
            <option value="">All Parts</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.partNumber} — {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={onClearFilters} className="text-xs">
              <X className="mr-1 h-3.5 w-3.5" />
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
