import * as React from "react";
import {
  Truck,
  ClipboardCheck,
  AlertTriangle,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReceiving } from "@/hooks/use-receiving";
import type { ReceivingTab } from "@/hooks/use-receiving";
import {
  ExpectedDeliveries,
  ReceiveForm,
  ExceptionManagement,
  ReceivingMetrics,
  ReceiptHistory,
} from "@/components/receiving-workflow";
import type { AuthSession } from "@/types";

/* ── Tab definitions ──────────────────────────────────────── */

const TABS: { id: ReceivingTab; label: string; icon: React.ElementType }[] = [
  { id: "expected", label: "Expected", icon: Truck },
  { id: "receive", label: "Receive", icon: ClipboardCheck },
  { id: "exceptions", label: "Exceptions", icon: AlertTriangle },
  { id: "history", label: "History", icon: ClipboardList },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
];

/* ── Props ─────────────────────────────────────────────────── */

interface Props {
  session: AuthSession;
  onUnauthorized: () => void;
}

/* ── Page ──────────────────────────────────────────────────── */

export function ReceivingRoute({ session, onUnauthorized }: Props) {
  const token = session.tokens.accessToken;
  const hook = useReceiving(token, onUnauthorized);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-bold text-foreground">Receiving</h1>
        <p className="text-xs text-muted-foreground">
          Manage incoming deliveries, receive against POs, and track exceptions.
        </p>
      </div>

      {/* Tab navigation (pill-style buttons) */}
      <nav className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const isActive = hook.activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => hook.setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div>
        {hook.activeTab === "expected" && (
          <ExpectedDeliveries
            purchaseOrders={hook.expectedPOs}
            isLoading={hook.expectedLoading}
            error={hook.expectedError}
            onRefresh={hook.refreshExpected}
            onStartReceiving={hook.selectPOForReceiving}
          />
        )}

        {hook.activeTab === "receive" && (
          <ReceiveForm
            selectedPO={hook.selectedPO}
            purchaseOrders={hook.expectedPOs}
            receiveLines={hook.receiveLines}
            receiveNotes={hook.receiveNotes}
            isLoading={hook.receiveLoading}
            isSubmitting={hook.receiveSubmitting}
            error={hook.receiveError}
            onSelectPO={hook.selectPOForReceiving}
            onClearPO={hook.clearSelectedPO}
            onUpdateLine={hook.updateReceiveLine}
            onSetNotes={hook.setReceiveNotes}
            onSubmit={hook.submitReceipt}
            onReceiptCreated={() => {
              // Refresh expected + history after a receipt is created
              void hook.refreshExpected();
            }}
          />
        )}

        {hook.activeTab === "exceptions" && (
          <ExceptionManagement
            exceptions={hook.exceptions}
            isLoading={hook.exceptionsLoading}
            error={hook.exceptionsError}
            resolvingId={hook.resolvingId}
            onRefresh={hook.refreshExceptions}
            onResolve={hook.resolveException}
          />
        )}

        {hook.activeTab === "history" && (
          <ReceiptHistory
            receipts={hook.receipts}
            isLoading={hook.historyLoading}
            error={hook.historyError}
            onRefresh={hook.refreshHistory}
            selectedReceipt={hook.selectedReceipt}
            onSelectReceipt={hook.selectReceipt}
          />
        )}

        {hook.activeTab === "metrics" && (
          <ReceivingMetrics
            metrics={hook.metrics}
            isLoading={hook.metricsLoading}
            error={hook.metricsError}
            onRefresh={hook.refreshMetrics}
          />
        )}
      </div>
    </div>
  );
}
