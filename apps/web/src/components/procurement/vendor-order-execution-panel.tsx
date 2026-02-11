import * as React from "react";
import { ExternalLink, Loader2, Mail, Phone, ShoppingCart, ShieldCheck } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import type { ProcurementOrderMethod } from "@/types";
import { EMAIL_BASED_METHODS, procurementOrderMethodLabel } from "./order-method";
import { isExecutionComplete } from "./vendor-order-workflow";

export interface VendorExecutionSession {
  supplierId: string;
  supplierName: string;
  recipientEmail: string | null;
  poIds: string[];
  cardIds: string[];
  methods: ProcurementOrderMethod[];
  lines: Array<{
    cardId: string;
    partName: string;
    orderMethod: ProcurementOrderMethod;
    sourceUrl: string | null;
  }>;
}

interface VendorOrderExecutionPanelProps {
  session: VendorExecutionSession | null;
  isVerifying?: boolean;
  onClose: () => void;
  onVerify: (input: { poIds: string[]; cardIds: string[] }) => Promise<void> | void;
  onSendEmail: (
    method: "email" | "purchase_order" | "rfq",
    input: {
      to: string;
      cc: string[];
      subject: string;
      bodyText: string;
      includeAttachment: boolean;
    },
  ) => Promise<void> | void;
}

interface EmailComposerState {
  to: string;
  cc: string;
  subject: string;
  bodyText: string;
}

type EmailMethod = "email" | "purchase_order" | "rfq";

function buildDefaultComposer(
  method: EmailMethod,
  session: VendorExecutionSession,
): EmailComposerState {
  const baseSubject =
    method === "purchase_order"
      ? `Purchase Order ${session.poIds.join(", ")} - ${session.supplierName}`
      : method === "rfq"
        ? `RFQ - ${session.supplierName}`
        : `Order Request - ${session.supplierName}`;

  const baseBody =
    method === "purchase_order"
      ? `Please review attached purchase order(s): ${session.poIds.join(", ")}.`
      : method === "rfq"
        ? "Please provide quote and lead time for the requested line items."
        : "Please process the following order request.";

  return {
    to: session.recipientEmail ?? "",
    cc: "",
    subject: baseSubject,
    bodyText: [
      `Hello ${session.supplierName},`,
      "",
      baseBody,
      "",
      "Thank you,",
      "Arda Procurement",
    ].join("\n"),
  };
}

export function VendorOrderExecutionPanel({
  session,
  isVerifying,
  onClose,
  onVerify,
  onSendEmail,
}: VendorOrderExecutionPanelProps) {
  const [completed, setCompleted] = React.useState<Record<string, boolean>>({});
  const [sendingMethods, setSendingMethods] = React.useState<Record<string, boolean>>({});
  const [emailForms, setEmailForms] = React.useState<
    Record<EmailMethod, EmailComposerState>
  >({
    email: { to: "", cc: "", subject: "", bodyText: "" },
    purchase_order: { to: "", cc: "", subject: "", bodyText: "" },
    rfq: { to: "", cc: "", subject: "", bodyText: "" },
  });

  React.useEffect(() => {
    if (!session) return;

    setCompleted({});
    setSendingMethods({});
    setEmailForms({
      email: buildDefaultComposer("email", session),
      purchase_order: buildDefaultComposer("purchase_order", session),
      rfq: buildDefaultComposer("rfq", session),
    });
  }, [session]);

  if (!session) return null;

  const markComplete = (method: ProcurementOrderMethod, value: boolean) => {
    setCompleted((prev) => ({ ...prev, [method]: value }));
  };

  const handleSendEmail = async (method: EmailMethod) => {
    const form = emailForms[method];
    if (!form.to.trim()) return;

    setSendingMethods((prev) => ({ ...prev, [method]: true }));
    try {
      await onSendEmail(method, {
        to: form.to.trim(),
        cc: form.cc
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        subject: form.subject,
        bodyText: form.bodyText,
        includeAttachment: method === "purchase_order",
      });
      markComplete(method, true);
    } finally {
      setSendingMethods((prev) => ({ ...prev, [method]: false }));
    }
  };

  const openMethodTabs = (method: "online" | "shopping") => {
    if (typeof window === "undefined") return;
    const urls = Array.from(
      new Set(
        session.lines
          .filter((line) => line.orderMethod === method)
          .map((line) => line.sourceUrl)
          .filter((value): value is string => !!value),
      ),
    );

    urls.forEach((url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
    if (urls.length > 0) {
      markComplete(method, true);
    }
  };

  const allComplete = isExecutionComplete(session.methods, completed);

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Execute Vendor Automation</h3>
          <p className="text-sm text-muted-foreground">
            {session.supplierName} • {session.poIds.length} draft PO(s) • {session.cardIds.length} card(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => void onVerify({ poIds: session.poIds, cardIds: session.cardIds })}
            disabled={!allComplete || isVerifying}
          >
            {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Verify Order Placed
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {session.methods.map((method) => (
          <Badge key={method} variant={completed[method] ? "accent" : "outline"}>
            {procurementOrderMethodLabel(method)}
          </Badge>
        ))}
      </div>

      <div className="space-y-3">
        {session.methods.map((method) => (
          <div key={method} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{procurementOrderMethodLabel(method)}</h4>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!completed[method]}
                  onChange={(event) => markComplete(method, event.target.checked)}
                />
                Complete
              </label>
            </div>

            {isEmailMethod(method) && (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span>To</span>
                    <Input
                      value={emailForms[method].to}
                      onChange={(event) =>
                        setEmailForms((prev) => ({
                          ...prev,
                          [method]: { ...prev[method], to: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span>CC</span>
                    <Input
                      value={emailForms[method].cc}
                      onChange={(event) =>
                        setEmailForms((prev) => ({
                          ...prev,
                          [method]: { ...prev[method], cc: event.target.value },
                        }))
                      }
                      placeholder="comma,separated@emails.com"
                    />
                  </label>
                </div>

                <label className="block space-y-1 text-xs">
                  <span>Subject</span>
                  <Input
                    value={emailForms[method].subject}
                    onChange={(event) =>
                      setEmailForms((prev) => ({
                        ...prev,
                        [method]: { ...prev[method], subject: event.target.value },
                      }))
                    }
                  />
                </label>

                <label className="block space-y-1 text-xs">
                  <span>Body</span>
                  <textarea
                    className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={emailForms[method].bodyText}
                    onChange={(event) =>
                      setEmailForms((prev) => ({
                        ...prev,
                        [method]: { ...prev[method], bodyText: event.target.value },
                      }))
                    }
                  />
                </label>

                <Button
                  size="sm"
                  onClick={() => void handleSendEmail(method)}
                  disabled={sendingMethods[method] || !emailForms[method].to.trim()}
                >
                  {sendingMethods[method] ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Send Draft Email
                </Button>
              </div>
            )}

            {(method === "online" || method === "shopping") && (
              <div className="space-y-2 text-xs">
                <p className="text-muted-foreground">
                  Open all source product pages, build the cart manually, then complete checkout.
                </p>
                <Button size="sm" variant="outline" onClick={() => openMethodTabs(method)}>
                  {method === "online" ? <ExternalLink className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                  Open Item Tabs
                </Button>
              </div>
            )}

            {(method === "phone" || method === "third_party") && (
              <div className="space-y-2 text-xs">
                <p className="text-muted-foreground">
                  {method === "phone"
                    ? "Call the vendor and place the order. Confirm pricing, quantity, and ETA."
                    : "Coordinate with the external partner and complete all required handoff steps."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markComplete(method, true)}
                >
                  {method === "phone" ? <Phone className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  Mark Complete
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function isEmailMethod(method: ProcurementOrderMethod): method is EmailMethod {
  return method === "email" || method === "purchase_order" || method === "rfq";
}
