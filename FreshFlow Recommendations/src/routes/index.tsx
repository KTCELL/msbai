import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getRecommendation, sendDraftPo } from "../lib/recommendation.functions";
import { isUnlocked } from "../lib/gate.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { unlocked } = await isUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "FreshFlow AI — Recommendation Tester" },
      {
        name: "description",
        content:
          "Request an AI reorder recommendation for one ingredient, review action, quantity, cost and risk, then send a draft purchase order to your manager.",
      },
      { property: "og:title", content: "FreshFlow AI — Recommendation Tester" },
      {
        property: "og:description",
        content:
          "Request an AI reorder recommendation for one ingredient, review action, quantity, cost and risk, then send a draft purchase order to your manager.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Result = Record<string, unknown>;

function formatValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ActionBadge({ action }: { action: string }) {
  const green = /DO_NOT_ORDER/i.test(action);
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
        green ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {action || "UNKNOWN"}
    </span>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current/40 border-t-current"
      aria-hidden="true"
    />
  );
}

function Index() {
  const run = useServerFn(getRecommendation);
  const send = useServerFn(sendDraftPo);

  const [ingredientId, setIngredientId] = useState("");
  const [planningDate, setPlanningDate] = useState("2025-08-25");
  const [horizonDays, setHorizonDays] = useState(7);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  function cleanError(err: unknown) {
    return err instanceof Error
      ? err.message.replace(/^Server function.*?:\s*/i, "")
      : "Something went wrong. Please try again.";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSent(false);
    setSendError(null);
    setSendMessage(null);
    setLoading(true);
    try {
      const { raw } = await run({
        data: {
          ingredient_id: ingredientId.trim(),
          planning_date: planningDate,
          horizon_days: horizonDays,
          manager_email: email.trim(),
        },
      });
      const parsed = JSON.parse(raw) as Result | Result[];
      setResult(Array.isArray(parsed) ? (parsed[0] ?? null) : parsed);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSendDraftPo() {
    if (!result) return;
    const ok = window.confirm(
      "This creates a draft purchase order record and emails the manager. Continue?",
    );
    if (!ok) return;
    setSendError(null);
    setSendMessage(null);
    setSending(true);
    try {
      const { raw } = await send({
        data: {
          ingredient_id: ingredientId.trim(),
          planning_date: planningDate,
          forecast_horizon_days: horizonDays,
          recommended_action: String(result["recommended_action"] ?? ""),
          recommended_order_quantity: result["recommended_order_quantity"],
          estimated_purchase_cost: result["estimated_purchase_cost"],
          estimated_waste_cost_avoided: result["estimated_waste_cost_avoided"],
          risk_level: result["risk_level"],
          explanation: result["explanation"],
          data_quality_status: result["data_quality_status"],
          requires_manager_review: result["requires_manager_review"],
          supplier_id: result["supplier_id"],
          expected_delivery_date: result["expected_delivery_date"],
          manager_email: email.trim(),
        },
      });
      const parsedUnknown = JSON.parse(raw) as Result | Result[];
      const res = Array.isArray(parsedUnknown) ? (parsedUnknown[0] ?? {}) : parsedUnknown;
      setSent(true);
      setSendMessage(
        `Draft PO ${formatValue(res["draft_po_id"])} created and emailed to ${formatValue(res["emailed_to"])}.`,
      );
    } catch (err) {
      setSendError(cleanError(err));
    } finally {
      setSending(false);
    }
  }

  const action = result ? String(result["recommended_action"] ?? "") : "";
  const lowConfidence = Boolean(
    result &&
      ((result["data_quality_status"] !== undefined &&
        String(result["data_quality_status"]).toLowerCase() !== "ok") ||
        String(result["forecast_confidence"]).toLowerCase() === "low"),
  );

  const figures: [string, unknown][] = result
    ? [
        ["Order quantity", result["recommended_order_quantity"]],
        ["Estimated cost", result["estimated_purchase_cost"]],
        ["Supplier", result["supplier_id"]],
        ["Reorder point", result["reorder_point"]],
        ["On hand", result["current_on_hand"]],
        ["Usable inventory", result["usable_inventory"]],
        ["Expected delivery", result["expected_delivery_date"]],
        ["Risk level", result["risk_level"]],
      ]
    : [];

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-12 sm:py-20">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          FreshFlow AI — Recommendation Tester
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request an AI reorder recommendation for one ingredient.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="ingredient_id" className="block text-sm font-medium text-foreground">
              Ingredient ID
            </label>
            <input
              id="ingredient_id"
              type="text"
              required
              placeholder="ING-0001"
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="planning_date" className="block text-sm font-medium text-foreground">
                Planning date
              </label>
              <input
                id="planning_date"
                type="date"
                required
                value={planningDate}
                onChange={(e) => setPlanningDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Demo data runs through Aug 2025 — pick a date in that range for a meaningful forecast.
              </p>
            </div>
            <div>
              <label htmlFor="horizon_days" className="block text-sm font-medium text-foreground">
                Forecast horizon (days)
              </label>
              <input
                id="horizon_days"
                type="number"
                min={1}
                max={30}
                required
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label htmlFor="manager_email" className="block text-sm font-medium text-foreground">
              Your email <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="manager_email"
              type="text"
              placeholder="manager@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              The draft purchase order email will be sent here.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loading && <Spinner />}
            {loading ? "Getting recommendation…" : "Get Recommendation"}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {result && (
          <section className="mt-8 border-t border-border pt-6" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Recommended action</h2>
              <ActionBadge action={action} />
            </div>

            {lowConfidence && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                ⚠️ Low-confidence forecast — limited sales history for this date window.
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {figures.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>

            {result["explanation"] !== undefined && (
              <p className="mt-4 rounded-md bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
                {formatValue(result["explanation"])}
              </p>
            )}

            {/^ORDER$/i.test(action.trim()) && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={onSendDraftPo}
                  disabled={sending || sent}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-primary px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
                >
                  {sending && <Spinner />}
                  {sent ? "Draft PO sent" : sending ? "Sending…" : "Send Draft PO to Manager"}
                </button>
              </div>
            )}

            {sendMessage && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {sendMessage}
              </div>
            )}
            {sendError && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {sendError}
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setDetailsOpen((o) => !o)}
                aria-expanded={detailsOpen}
                className="text-sm font-medium text-primary hover:underline"
              >
                {detailsOpen ? "Hide Raw JSON" : "Show Raw JSON"}
              </button>
              {detailsOpen && (
                <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-4 text-xs text-foreground">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
