import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { OrderTab, DateRange } from "@/hooks/use-order-history";
import type { POStatus, WOStatus, TOStatus } from "@/types";
import { PO_STATUS_META } from "@/types";
import { ChevronDown, SlidersHorizontal, RefreshCw } from "lucide-react";
import { useState } from "react";

/* ── Tab config ──────────────────────────────────────────────── */

const TABS: { key: OrderTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "purchase", label: "Purchase Orders" },
  { key: "work", label: "Work Orders" },
  { key: "transfer", label: "Transfer Orders" },
];

/* ── Status options per tab ──────────────────────────────────── */

const PO_STATUSES: { value: POStatus; label: string }[] = Object.entries(PO_STATUS_META).map(
  ([value, { label }]) => ({ value: value as POStatus, label }),
);

const WO_STATUSES: { value: WOStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const TO_STATUSES: { value: TOStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "in_transit", label: "In Transit" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

function getStatusOptions(tab: OrderTab) {
  switch (tab) {
    case "purchase":
      return PO_STATUSES;
    case "work":
      return WO_STATUSES;
    case "transfer":
      return TO_STATUSES;
    case "all":
      /* Deduplicate across all types */
      const allMap = new Map<string, string>();
      for (const s of [...PO_STATUSES, ...WO_STATUSES, ...TO_STATUSES]) {
        if (!allMap.has(s.value)) allMap.set(s.value, s.label);
      }
      return Array.from(allMap, ([value, label]) => ({ value, label }));
  }
}

/* ── Date range options ──────────────────────────────────────── */

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

/* ── Props ───────────────────────────────────────────────────── */

interface OrderFiltersProps {
  activeTab: OrderTab;
  onTabChange: (tab: OrderTab) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  onRefresh: () => void;
  loading: boolean;
}

/* ── Simple dropdown ─────────────────────────────────────────── */

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? label;

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="h-8 text-xs gap-1 border-border"
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium">{value === "all" ? "All" : selectedLabel}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] max-h-[240px] overflow-y-auto rounded-md border border-border bg-background shadow-sm py-1">
            <button
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                value === "all" && "bg-muted font-medium",
              )}
            >
              All
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                  value === opt.value && "bg-muted font-medium",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Component ──────────────────────────────────────────────── */

export function OrderFilters({
  activeTab,
  onTabChange,
  statusFilter,
  onStatusFilterChange,
  dateRange,
  onDateRangeChange,
  onRefresh,
  loading,
}: OrderFiltersProps) {
  const statusOptions = getStatusOptions(activeTab);

  return (
    <div className="space-y-3">
      {/* Tab buttons */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium transition-colors relative",
              activeTab === tab.key
                ? "text-[hsl(var(--link))]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--link))] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <FilterDropdown
          label="Status"
          value={statusFilter}
          options={statusOptions}
          onChange={onStatusFilterChange}
        />

        {activeTab === "all" && (
          <FilterDropdown
            label="Date"
            value={dateRange}
            options={DATE_RANGES}
            onChange={(v) => onDateRangeChange(v as DateRange)}
          />
        )}

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="h-8 text-xs gap-1"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
