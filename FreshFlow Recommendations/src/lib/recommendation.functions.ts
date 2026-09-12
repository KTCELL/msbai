import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  ingredient_id: z.string().min(1, "ingredient_id is required"),
  planning_date: z.string().min(1, "planning_date is required"),
  horizon_days: z.number().int().min(1).max(30),
  manager_email: z.string().optional(),
});

const draftPoSchema = z.object({
  ingredient_id: z.string().min(1),
  planning_date: z.string().min(1),
  forecast_horizon_days: z.number().int().min(1).max(30),
  recommended_action: z.string().optional(),
  recommended_order_quantity: z.unknown().optional(),
  estimated_purchase_cost: z.unknown().optional(),
  estimated_waste_cost_avoided: z.unknown().optional(),
  risk_level: z.unknown().optional(),
  explanation: z.unknown().optional(),
  data_quality_status: z.unknown().optional(),
  requires_manager_review: z.unknown().optional(),
  supplier_id: z.unknown().optional(),
  expected_delivery_date: z.unknown().optional(),
  manager_email: z.string().optional(),
});

async function callWebhook(url: string, payload: unknown) {
  const { getGateSession } = await import("./gate.server");
  const gate = await getGateSession();
  if (gate.data.unlocked !== true) {
    throw new Error("Your session has expired. Please enter the access password again.");
  }

  const headerName = process.env["FRESHFLOW_AUTH_HEADER_NAME"];
  const headerValue = process.env["FRESHFLOW_AUTH_HEADER_VALUE"];
  if (!headerName || !headerValue) {
    throw new Error("Recommendation service is not configured.");
  }

  const call = async () =>
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [headerName]: headerValue,
      },
      body: JSON.stringify(payload),
    });

  let res: Response;
  let bodyText = "";
  try {
    res = await call();
    bodyText = await res.text();
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await call();
      bodyText = await res.text();
    }
  } catch {
    throw new Error("Could not reach the service. Check your network and try again.");
  }

  if (!res.ok) {
    let detail = bodyText.slice(0, 300);
    try {
      const parsed = JSON.parse(bodyText) as { message?: string; error?: string };
      detail = parsed.message ?? parsed.error ?? detail;
    } catch {
      /* keep raw text */
    }
    if (res.status === 403 || res.status === 401) {
      throw new Error("The service rejected our credentials (auth header mismatch). Please check the saved access details.");
    }
    throw new Error(
      `The service could not complete this request (HTTP ${res.status}).${detail ? ` ${detail}` : ""}`,
    );
  }

  try {
    JSON.parse(bodyText);
  } catch {
    throw new Error("The service returned an unreadable response.");
  }
  return { raw: bodyText };
}

export const getRecommendation = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) =>
    callWebhook("https://msbai.app.n8n.cloud/webhook/freshflow-poc-recommendation", data),
  );

export const sendDraftPo = createServerFn({ method: "POST" })
  .inputValidator((data) => draftPoSchema.parse(data))
  .handler(async ({ data }) =>
    callWebhook("https://msbai.app.n8n.cloud/webhook/freshflow-poc-send-po", data),
  );
