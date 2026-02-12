/**
 * TransferQueueFilters — Filter controls for Transfer Queue
 *
 * Provides filtering capabilities for the transfer queue including
 * destination facility, part search, priority range, and status chips.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import type { FacilityRecord, TransferQueuePriority } from "@/types";

// ─── Types ───────────────────────────────────────────────────────

export interface TransferQueueFiltersProps {
  facilities: FacilityRecord[];
  facilitiesLoading: boolean;
  destinationFacilityId: string;
  partSearch: string;
  statusFilter: string;
  priorityFilter: TransferQueuePriority | null;
  onDestinationChange: (facilityId: string) => void;
  onPartSearchChange: (search: string) => void;
  onStatusFilterChange: (status: string) => void;
  onPriorityFilterChange: (priority: TransferQueuePriority | null) => void;
  onClearFilters: () => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
];

const PRIORITY_OPTIONS: Array<{ value: TransferQueuePriority; label: string; count?: number }> = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// ─── Component ───────────────────────────────────────────────────

export function TransferQueueFilters({
  facilities,
  facilitiesLoading,
  destinationFacilityId,
  partSearch,
  statusFilter,
  priorityFilter,
  onDestinationChange,
  onPartSearchChange,
  onStatusFilterChange,
  onPriorityFilterChange,
  onClearFilters,
}: TransferQueueFiltersProps) {
  const hasActiveFilters =
    destinationFacilityId !== "" ||
    partSearch.trim() !== "" ||
    statusFilter !== "all" ||
    priorityFilter !== null;

  return (
    <div className="space-y-3">
      {/* Top row: Destination + Part Search */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Destination Facility */}
        <div className="w-56">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Destination Facility
          </label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={destinationFacilityId}
            onChange={(e) => onDestinationChange(e.target.value)}
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

        {/* Part Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Part Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by part number or name..."
              value={partSearch}
              onChange={(e) => onPartSearchChange(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-xs"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      {/* Bottom row: Status + Priority chips */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status chips */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onStatusFilterChange(option.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                statusFilter === option.value
                  ? "bg-primary text-white border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/50"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Priority chips */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground mr-1">Priority:</span>
          <button
            onClick={() => onPriorityFilterChange(null)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              priorityFilter === null
                ? "bg-primary text-white border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted/50"
            )}
          >
            All
          </button>
          {PRIORITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onPriorityFilterChange(option.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                priorityFilter === option.value
                  ? option.value === "critical"
                    ? "bg-red-600 text-white border-red-600"
                    : option.value === "high"
                      ? "bg-amber-600 text-white border-amber-600"
                      : option.value === "medium"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-gray-500 text-white border-gray-500"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/50"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
