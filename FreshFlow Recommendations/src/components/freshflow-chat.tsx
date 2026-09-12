import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { askFreshflow } from "../lib/chat.functions";

type Turn = { id: string; role: "user" | "assistant"; text: string };

const HELPER_LINE =
  "Ask about this recommendation — e.g. \u201cWhy not order more?\u201d, \u201cWhat\u2019s in current inventory?\u201d, \u201cAny open POs for this ingredient?\u201d";

const DISCLAIMER =
  "FreshFlow AI can look up live inventory, ingredient, and PO data. It won\u2019t place or approve orders.";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanError(err: unknown): string {
  return err instanceof Error
    ? err.message.replace(/^Server function.*?:\s*/i, "")
    : "Something went wrong. Please try again.";
}

function Bubble({ role, text }: { role: Turn["role"]; text: string }) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          mine
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-3.5 py-3"
        role="status"
        aria-label="FreshFlow AI is typing"
      >
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function FreshflowChat({
  ingredientId,
  planningDate,
  recommendation,
}: {
  ingredientId: string;
  planningDate: string;
  recommendation: Record<string, unknown>;
}) {
  const ask = useServerFn(askFreshflow);

  // One session per mounted panel. The panel unmounts whenever a new
  // recommendation is requested, so each recommendation gets a fresh thread
  // and the agent's server-side memory never mixes two ingredients.
  const [sessionId] = useState(newId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, sending]);

  async function send() {
    const question = input.trim();
    if (!question || sending) return;

    const userTurn: Turn = { id: newId(), role: "user", text: question };
    setTurns((prev) => [...prev, userTurn]);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const { reply } = await ask({
        data: {
          chatInput: question,
          sessionId,
          ingredient_id: ingredientId,
          planning_date: planningDate,
          recommendation,
        },
      });
      setTurns((prev) => [...prev, { id: newId(), role: "assistant", text: reply }]);
    } catch (err) {
      // Roll the failed turn back and hand the question back to the person,
      // so a transient failure never costs them their typing.
      setTurns((prev) => prev.filter((t) => t.id !== userTurn.id));
      setInput(question);
      setError(cleanError(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="text-sm font-medium text-muted-foreground">Ask FreshFlow AI</h2>

      <div
        className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded-md border border-border bg-background p-4"
        aria-live="polite"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">{HELPER_LINE}</p>
        {turns.map((turn) => (
          <Bubble key={turn.id} role={turn.role} text={turn.text} />
        ))}
        {sending && <TypingDots />}
        <div ref={endRef} />
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <label htmlFor="freshflow_chat_input" className="sr-only">
          Your question
        </label>
        <textarea
          id="freshflow_chat_input"
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a question…"
          className="min-h-[44px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="h-[44px] shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          Send
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{DISCLAIMER}</p>
    </section>
  );
}
