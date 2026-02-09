import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  ExceptionWizard,
  type ReceivingException,
  type ResolutionType,
  type ExceptionType,
  type ExceptionSeverity,
} from './exception-wizard';

// ─── Label Maps ─────────────────────────────────────────────────────

const exceptionTypeLabels: Record<ExceptionType, string> = {
  short_shipment: 'Short Shipment',
  damaged: 'Damaged Goods',
  quality_reject: 'Quality Rejection',
  wrong_item: 'Wrong Item',
  overage: 'Overage',
};

const severityLabels: Record<ExceptionSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// ─── Props ──────────────────────────────────────────────────────────

export interface ExceptionListProps {
  exceptions: ReceivingException[];
  loading?: boolean;
  onResolve: (exceptionId: string, resolutionType: ResolutionType, notes?: string) => Promise<void>;
  onAutomate: (exceptionId: string) => Promise<void>;
  onAutomateAll?: () => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHrs < 1) return 'just now';
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function SeverityBadge({ severity }: { severity: ExceptionSeverity }) {
  const variant = severity === 'critical' || severity === 'high' ? 'destructive'
    : severity === 'medium' ? 'warning'
    : 'secondary';
  return <Badge variant={variant}>{severityLabels[severity]}</Badge>;
}

// ─── Exception Row ──────────────────────────────────────────────────

function ExceptionRow({
  exception,
  onResolveClick,
  onAutomateClick,
  processingId,
}: {
  exception: ReceivingException;
  onResolveClick: (exception: ReceivingException) => void;
  onAutomateClick: (exceptionId: string) => void;
  processingId: string | null;
}) {
  const isProcessing = processingId === exception.id;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl shadow-sm border border-border px-4 py-1">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={exception.exceptionType === 'overage' ? 'accent' : 'warning'}>
              {exceptionTypeLabels[exception.exceptionType]}
            </Badge>
            <SeverityBadge severity={exception.severity} />
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {exception.quantityAffected} units -- {formatRelativeTime(exception.createdAt)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAutomateClick(exception.id)}
          disabled={isProcessing}
          className="text-xs"
        >
          Auto
        </Button>
        <Button
          size="sm"
          onClick={() => onResolveClick(exception)}
          disabled={isProcessing}
          className="text-xs"
        >
          Resolve
        </Button>
      </div>
    </div>
  );
}

// ─── Resolved Section ───────────────────────────────────────────────

function ResolvedSection({ exceptions }: { exceptions: ReceivingException[] }) {
  const [expanded, setExpanded] = React.useState(false);

  if (exceptions.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={cn('transition-transform', expanded && 'rotate-90')}>
          {'>'}
        </span>
        Resolved ({exceptions.length})
      </button>

      {expanded && (
        <div className="space-y-2 pl-4">
          {exceptions.map((exc) => (
            <div
              key={exc.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 opacity-70"
            >
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="secondary">{exceptionTypeLabels[exc.exceptionType]}</Badge>
                <span className="text-muted-foreground">{exc.quantityAffected} units</span>
              </div>
              <Badge variant="success">Resolved</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function ExceptionList({
  exceptions,
  loading,
  onResolve,
  onAutomate,
  onAutomateAll,
}: ExceptionListProps) {
  const [selectedExc, setSelectedExc] = React.useState<ReceivingException | null>(null);
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  const openExceptions = exceptions.filter((e) => e.status === 'open' || e.status === 'in_progress');
  const resolvedExceptions = exceptions.filter((e) => e.status === 'resolved');

  async function handleAutomate(exceptionId: string) {
    setProcessingId(exceptionId);
    try {
      await onAutomate(exceptionId);
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Loading exceptions...
        </CardContent>
      </Card>
    );
  }

  if (exceptions.length === 0) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No receiving exceptions found.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">
            Receiving Exceptions ({openExceptions.length} open)
          </CardTitle>
          {onAutomateAll && openExceptions.length > 0 && (
            <Button variant="outline" size="sm" onClick={onAutomateAll} className="text-xs">
              Auto-Resolve All
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-2">
          {openExceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">All exceptions have been resolved.</p>
          ) : (
            openExceptions.map((exc) => (
              <ExceptionRow
                key={exc.id}
                exception={exc}
                onResolveClick={setSelectedExc}
                onAutomateClick={handleAutomate}
                processingId={processingId}
              />
            ))
          )}

          {resolvedExceptions.length > 0 && (
            <>
              <Separator className="my-3" />
              <ResolvedSection exceptions={resolvedExceptions} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Resolution Wizard Modal */}
      {selectedExc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <ExceptionWizard
            exception={selectedExc}
            onResolve={onResolve}
            onAutomate={onAutomate}
            onClose={() => setSelectedExc(null)}
          />
        </div>
      )}
    </>
  );
}
