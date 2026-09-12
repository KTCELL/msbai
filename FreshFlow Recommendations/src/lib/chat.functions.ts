import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callWebhook } from "./recommendation.functions";

// The chat webhook lives next to the recommendation and send-PO webhooks in
// the same n8n workflow. It can be pointed elsewhere without a code change.
const DEFAULT_CHAT_WEBHOOK_URL = "https://msbai.app.n8n.cloud/webhook/freshflow-poc-chat";

const askSchema = z.object({
  chatInput: z.string().trim().min(1, "Please type a question.").max(2000),
  sessionId: z.string().min(1),
  ingredient_id: z.string().min(1),
  planning_date: z.string().min(1),
  recommendation: z.record(z.string(), z.unknown()),
});

type AgentReply = {
  reply?: unknown;
  output?: unknown;
  text?: unknown;
  explanation?: unknown;
  message?: unknown;
};

// n8n's AI Agent node answers as { output }, a Respond-to-Webhook node may wrap
// that in an array or rename it. Accept the common shapes so the UI never has
// to know which node produced the answer.
function extractReply(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw.trim();
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (typeof first === "string") return first.trim();
  if (first && typeof first === "object") {
    const r = first as AgentReply;
    for (const candidate of [r.reply, r.output, r.text, r.explanation, r.message]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "";
}

export const askFreshflow = createServerFn({ method: "POST" })
  .inputValidator((data) => askSchema.parse(data))
  .handler(async ({ data }) => {
    const url = process.env["FRESHFLOW_CHAT_WEBHOOK_URL"] || DEFAULT_CHAT_WEBHOOK_URL;
    const { raw } = await callWebhook(url, data);
    const reply = extractReply(raw);
    if (!reply) {
      throw new Error("FreshFlow AI returned an empty answer. Please try again.");
    }
    return { reply };
  });
