import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────

export type ExceptionType = 'short_shipment' | 'damaged' | 'quality_reject' | 'wrong_item' | 'overage';
export type ExceptionSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ExceptionStatus = 'open' | 'in_progress' | 'resolved' | 'escalated';
export type ResolutionType = 'follow_up_po' | 'replacement_card' | 'return_to_supplier' | 'credit' | 'accept_as_is';

export interface ReceivingException {
  id: string;
  receiptId: string;
  orderId: string;
  orderType: string;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  quantityAffected: number;
  description: string | null;
  resolutionType: ResolutionType | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ExceptionWizardProps {
  exception: ReceivingException;
  onResolve: (exceptionId: string, resolutionType: ResolutionType, notes?: string) => Promise<void>;
  onAutomate?: (exceptionId: string) => Promise<void>;
  onClose: () => void;
}

// ─── Label Helpers ──────────────────────────────────────────────────

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

const resolutionLabels: Record<ResolutionType, string> = {
  follow_up_po: 'Follow-up Purchase Order',
  replacement_card: 'Kanban Card Replacement',
  return_to_supplier: 'Return to Supplier',
  credit: 'Supplier Credit',
  accept_as_is: 'Accept As Is',
};

const resolutionDescriptions: Record<ResolutionType, string> = {
  follow_up_po: 'Create a new purchase order for the missing or damaged quantity.',
  replacement_card: 'Issue a replacement Kanban card to re-trigger the procurement loop.',
  return_to_supplier: 'Initiate a return-to-supplier process for defective goods.',
  credit: 'Request a credit from the supplier for the affected quantity.',
  accept_as_is: 'Accept the current state without further action.',
};

// ─── Sub-Components ─────────────────────────────────────────────────

function ExceptionTypeBadge({ type }: { type: ExceptionType }) {
  return (
    <Badge variant={type === 'overage' ? 'accent' : 'warning'}>
      {exceptionTypeLabels[type]}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: ExceptionSeverity }) {
  const variant = severity === 'critical' || severity === 'high' ? 'destructive'
    : severity === 'medium' ? 'warning'
    : 'secondary';
  return <Badge variant={variant}>{severityLabels[severity]}</Badge>;
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Applicable Resolutions ─────────────────────────────────────────

function getApplicableResolutions(type: ExceptionType): ResolutionType[] {
  switch (type) {
    case 'short_shipment':
      return ['follow_up_po', 'replacement_card', 'credit', 'accept_as_is'];
    case 'damaged':
      return ['return_to_supplier', 'credit', 'replacement_card', 'accept_as_is'];
    case 'quality_reject':
      return ['return_to_supplier', 'credit', 'replacement_card', 'accept_as_is'];
    case 'wrong_item':
      return ['return_to_supplier', 'follow_up_po', 'credit'];
    case 'overage':
      return ['accept_as_is', 'return_to_supplier'];
    default:
      return ['accept_as_is'];
  }
}

// ─── Wizard Steps ───────────────────────────────────────────────────

type WizardStep = 'review' | 'select_resolution' | 'confirm';

export function ExceptionWizard({ exception, onResolve, onAutomate, onClose }: ExceptionWizardProps) {
  const [step, setStep] = React.useState<WizardStep>('review');
  const [selectedResolution, setSelectedResolution] = React.useState<ResolutionType | null>(null);
  const [notes, setNotes] = React.useState('');
  const [processing, setProcessing] = React.useState(false);

  const isResolved = exception.status === 'resolved';
  const applicableResolutions = getApplicableResolutions(exception.exceptionType);

  async function handleAutomate() {
    if (!onAutomate) return;
    setProcessing(true);
    try {
      await onAutomate(exception.id);
      onClose();
    } finally {
      setProcessing(false);
    }
  }

  async function handleResolve() {
    if (!selectedResolution) return;
    setProcessing(true);
    try {
      await onResolve(exception.id, selectedResolution, notes || undefined);
      onClose();
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Card className="rounded-xl shadow-sm max-w-lg w-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base font-semibold">
          {isResolved ? 'Exception Details' : 'Resolve Exception'}
        </CardTitle>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm"
          aria-label="Close"
        >
          x
        </button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ─── Step 1: Review ─── */}
        {(step === 'review' || isResolved) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ExceptionTypeBadge type={exception.exceptionType} />
              <SeverityBadge severity={exception.severity} />
              {isResolved && <Badge variant="success">Resolved</Badge>}
            </div>

            <div className="space-y-1 text-sm">
              <div className="name-value-pair">
                <span className="text-muted-foreground">Quantity Affected:</span>{' '}
                <span className="font-semibold text-card-foreground">{exception.quantityAffected}</span>
              </div>
              {exception.description && (
                <div className="name-value-pair">
                  <span className="text-muted-foreground">Description:</span>{' '}
                  <span className="font-semibold text-card-foreground">{exception.description}</span>
                </div>
              )}
              {isResolved && exception.resolutionType && (
                <>
                  <div className="name-value-pair">
                    <span className="text-muted-foreground">Resolution:</span>{' '}
                    <span className="font-semibold text-card-foreground">
                      {resolutionLabels[exception.resolutionType]}
                    </span>
                  </div>
                  {exception.resolutionNotes && (
                    <div className="name-value-pair">
                      <span className="text-muted-foreground">Notes:</span>{' '}
                      <span className="font-semibold text-card-foreground">{exception.resolutionNotes}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {!isResolved && (
              <div className="flex gap-2 pt-2">
                {onAutomate && (
                  <Button variant="outline" size="sm" onClick={handleAutomate} disabled={processing}>
                    {processing ? <Spinner /> : 'Auto-Resolve'}
                  </Button>
                )}
                <Button size="sm" onClick={() => setStep('select_resolution')} disabled={processing}>
                  Resolve Manually
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ─── Step 2: Select Resolution ─── */}
        {step === 'select_resolution' && !isResolved && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select a resolution for this exception:</p>
            <div className="space-y-2">
              {applicableResolutions.map((rt) => (
                <label
                  key={rt}
                  className={cn(
                    'flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                    selectedResolution === rt
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <input
                    type="radio"
                    name="resolution"
                    value={rt}
                    checked={selectedResolution === rt}
                    onChange={() => setSelectedResolution(rt)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold">{resolutionLabels[rt]}</div>
                    <div className="text-xs text-muted-foreground">{resolutionDescriptions[rt]}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep('review')}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => setStep('confirm')}
                disabled={!selectedResolution}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Confirm ─── */}
        {step === 'confirm' && !isResolved && selectedResolution && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Confirm Resolution</p>
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div className="name-value-pair">
                <span className="text-muted-foreground">Exception:</span>{' '}
                <span className="font-semibold">{exceptionTypeLabels[exception.exceptionType]}</span>
              </div>
              <div className="name-value-pair">
                <span className="text-muted-foreground">Resolution:</span>{' '}
                <span className="font-semibold">{resolutionLabels[selectedResolution]}</span>
              </div>
              <div className="name-value-pair">
                <span className="text-muted-foreground">Quantity:</span>{' '}
                <span className="font-semibold">{exception.quantityAffected} units</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Notes (optional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add resolution notes..."
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep('select_resolution')}>
                Back
              </Button>
              <Button size="sm" onClick={handleResolve} disabled={processing}>
                {processing ? <Spinner /> : 'Confirm & Resolve'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
