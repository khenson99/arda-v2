import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Badge, Card, Input, Skeleton } from "@/components/ui";
import { toast } from "sonner";
import type { ReceivingException, ExceptionResolution, ExceptionType, ExceptionSeverity } from "@/types";

/* ── Color mappings ───────────────────────────────────────── */

const SEVERITY_STYLES: Record<ExceptionSeverity, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-gray-100", text: "text-gray-700", label: "Low" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", label: "Medium" },
  high: { bg: "bg-orange-50", text: "text-orange-700", label: "High" },
  critical: { bg: "bg-red-50", text: "text-red-700", label: "Critical" },
};

const TYPE_LABELS: Record<ExceptionType, string> = {
  overage: "Overage",
  shortage: "Shortage",
  damage: "Damage",
  wrong_item: "Wrong Item",
  quality: "Quality",
  other: "Other",
};

const RESOLUTION_OPTIONS: { value: ExceptionResolution; label: string }[] = [
  { value: "accepted", label: "Accept" },
  { value: "rejected", label: "Reject" },
  { value: "returned", label: "Return" },
  { value: "credited", label: "Credit" },
];

/* ── Helpers ──────────────────────────────────────────────── */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── Inline resolve form ──────────────────────────────────── */

interface ResolveFormProps {
  exception: ReceivingException;
  isResolving: boolean;
  onResolve: (exceptionId: string, resolution: ExceptionResolution, notes?: string) => Promise<boolean>;
  onCancel: () => void;
}

function ResolveForm({ exception, isResolving, onResolve, onCancel }: ResolveFormProps) {
  const [resolution, setResolution] = React.useState<ExceptionResolution>("accepted");
  const [notes, setNotes] = React.useState("");

  const handleSubmit = async () => {
    const success = await onResolve(exception.id, resolution, notes.trim() || undefined);
    if (success) {
      toast.success("Exception resolved");
    } else {
      toast.error("Failed to resolve exception");
    }
  };

  return (
    <tr className="border-b border-border bg-muted/30">
      <td colSpan={7} className="px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Resolution</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as ExceptionResolution)}
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {RESOLUTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Resolution notes..."
              className="h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={isResolving}
              className="h-9"
            >
              {isResolving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Resolve
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isResolving} className="h-9">
              Cancel
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ── Loading skeleton ─────────────────────────────────────── */

function ExceptionsSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="bg-muted px-4 py-3">
        <Skeleton className="h-4 w-48" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4 border-b border-border px-4 py-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-48 flex-1" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </Card>
  );
}

/* ── Props ─────────────────────────────────────────────────── */

interface Props {
  exceptions: ReceivingException[];
  isLoading: boolean;
  error: string | null;
  resolvingId: string | null;
  onRefresh: () => Promise<void>;
  onResolve: (exceptionId: string, resolution: ExceptionResolution, notes?: string) => Promise<boolean>;
}

/* ── Component ─────────────────────────────────────────────── */

export function ExceptionManagement({
  exceptions,
  isLoading,
  error,
  resolvingId,
  onRefresh,
  onResolve,
}: Props) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [resolveTarget, setResolveTarget] = React.useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const handleResolve = async (exceptionId: string, resolution: ExceptionResolution, notes?: string) => {
    const success = await onResolve(exceptionId, resolution, notes);
    if (success) {
      setResolveTarget(null);
    }
    return success;
  };

  if (isLoading && exceptions.length === 0) {
    return <ExceptionsSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void handleRefresh()}>
          Retry
        </Button>
      </div>
    );
  }

  if (exceptions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <ShieldAlert className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No exceptions</p>
        <p className="text-xs text-muted-foreground">
          Receiving exceptions will appear here when discrepancies are found.
        </p>
        <Button variant="outline" size="sm" onClick={() => void handleRefresh()} className="mt-2">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {exceptions.length} exception{exceptions.length === 1 ? "" : "s"}
          {" "}&middot;{" "}
          {exceptions.filter((e) => !e.resolution).length} unresolved
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Type</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Severity</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Description</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Order</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Resolution</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Created</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((ex) => {
                const sevStyle = SEVERITY_STYLES[ex.severity];
                const isResolvingThis = resolvingId === ex.id;

                return (
                  <React.Fragment key={ex.id}>
                    <tr className="border-b border-border transition-colors hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[ex.type] ?? ex.type}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                            sevStyle.bg,
                            sevStyle.text,
                          )}
                        >
                          {ex.severity === "critical" && <AlertTriangle className="h-3 w-3" />}
                          {sevStyle.label}
                        </span>
                      </td>
                      <td className="max-w-[300px] truncate px-3 py-3 text-foreground">
                        {ex.description}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {ex.orderId ? ex.orderId.slice(0, 8) + "..." : "-"}
                      </td>
                      <td className="px-3 py-3">
                        {ex.resolution ? (
                          <Badge variant="success">{ex.resolution}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatDate(ex.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {!ex.resolution && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setResolveTarget(resolveTarget === ex.id ? null : ex.id)}
                            disabled={isResolvingThis}
                            className="h-7 text-xs"
                          >
                            Resolve
                          </Button>
                        )}
                      </td>
                    </tr>
                    {resolveTarget === ex.id && !ex.resolution && (
                      <ResolveForm
                        exception={ex}
                        isResolving={isResolvingThis}
                        onResolve={handleResolve}
                        onCancel={() => setResolveTarget(null)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
