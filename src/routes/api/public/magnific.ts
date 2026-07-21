import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const MAGNIFIC_API = "https://api.magnific.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const MODEL_ENDPOINTS = {
  "mag:kling-v2-6-motion-control-std": {
    post: "/v1/ai/video/kling-v2-6-motion-control-std",
    status: "/v1/ai/image-to-video/kling-v2-6",
  },
  "mag:kling-v2-6-motion-control-pro": {
    post: "/v1/ai/video/kling-v2-6-motion-control-pro",
    status: "/v1/ai/image-to-video/kling-v2-6",
  },
  "mag:kling-v3-motion-control-std": {
    post: "/v1/ai/video/kling-v3-motion-control-std",
    status: "/v1/ai/video/kling-v3-motion-control-std",
  },
  "mag:kling-v3-motion-control-pro": {
    post: "/v1/ai/video/kling-v3-motion-control-pro",
    status: "/v1/ai/video/kling-v3-motion-control-pro",
  },
  "mag:image-upscaler-creative": {
    post: "/v1/ai/image-upscaler",
    status: "/v1/ai/image-upscaler",
  },
  "mag:image-upscaler-precision-v2": {
    post: "/v1/ai/image-upscaler-precision-v2",
    status: "/v1/ai/image-upscaler-precision-v2",
  },
} as const;

type ModelKey = keyof typeof MODEL_ENDPOINTS;

const SubmitBody = z.object({
  action: z.literal("submit"),
  apiKey: z.string().min(10),
  modelKey: z.enum(Object.keys(MODEL_ENDPOINTS) as [ModelKey, ...ModelKey[]]),
  payload: z.record(z.string(), z.unknown()),
});

const StatusBody = z.object({
  action: z.literal("status"),
  apiKey: z.string().min(10),
  modelKey: z.enum(Object.keys(MODEL_ENDPOINTS) as [ModelKey, ...ModelKey[]]),
  taskId: z.string().min(1).max(200),
});

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init?.headers || {}),
    },
  });
}

async function readMagnificJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function getMessageFromMagnific(data: unknown): string {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";

  const record = data as Record<string, unknown>;
  const messages = [record.message, record.error, record.detail, record.reason]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const invalidParams = record.invalid_params;
  if (Array.isArray(invalidParams)) {
    for (const item of invalidParams) {
      if (item && typeof item === "object") {
        const reason = (item as Record<string, unknown>).reason;
        if (typeof reason === "string" && reason.trim()) messages.push(reason.trim());
      }
    }
  }

  return messages.join(" | ");
}

function normalizeMagnificError(status: number, data: unknown) {
  const upstreamMessage = getMessageFromMagnific(data) || `HTTP ${status}`;
  const text = upstreamMessage.toLowerCase();

  if (
    status === 401 ||
    /invalid\s+api\s+key|missing\s+api\s+key|provided\s+api\s+key\s+is\s+invalid|unauthori[sz]ed|authenticate/.test(text)
  ) {
    return {
      providerErrorType: "invalid_api_key",
      error:
        "API key Magnific tidak valid/expired atau bukan API key server. Ini BUKAN credit habis. Verifikasi/generate ulang key di Magnific Dashboard → Organization → API Keys.",
      upstreamMessage,
    };
  }

  if (status === 402 || /credit|credits|balance|quota|cap|allowance|insufficient|exhausted|not\s+enough/.test(text)) {
    return {
      providerErrorType: "insufficient_credits",
      error:
        "Credit Magnific/API cap tidak cukup atau sudah habis. API key terbaca valid, tapi balance/cap organisasi perlu ditambah atau dinaikkan.",
      upstreamMessage,
    };
  }

  if (status === 429 || /rate\s*limit|too\s+many|rpm|rpd|throttl/.test(text)) {
    return {
      providerErrorType: "rate_limited",
      error: "Rate limit Magnific tercapai. Tunggu beberapa saat lalu coba lagi.",
      upstreamMessage,
    };
  }

  if (status === 403 || /not\s+authorized|not\s+owner|permission|privilege|forbidden/.test(text)) {
    return {
      providerErrorType: "forbidden",
      error: "API key Magnific valid, tapi tidak punya akses ke model/resource ini. Cek izin API key atau paket akun Magnific.",
      upstreamMessage,
    };
  }

  return { providerErrorType: "provider_failed", error: upstreamMessage, upstreamMessage };
}

function normalizeMagnificResponse(data: unknown, status: number) {
  if (status >= 200 && status < 300) return data;
  const base = data && typeof data === "object" && !Array.isArray(data) ? data : { message: getMessageFromMagnific(data) };
  return { ...(base as Record<string, unknown>), ...normalizeMagnificError(status, data), upstreamStatus: status };
}

export const Route = createFileRoute("/api/public/magnific")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body JSON tidak valid" }, { status: 400 });
        }

        const parsed = z.discriminatedUnion("action", [SubmitBody, StatusBody]).safeParse(body);
        if (!parsed.success) {
          return json({ error: "Request Magnific tidak valid", detail: parsed.error.flatten() }, { status: 400 });
        }

        const endpoint = MODEL_ENDPOINTS[parsed.data.modelKey];

        try {
          if (parsed.data.action === "submit") {
            const upstream = await fetch(`${MAGNIFIC_API}${endpoint.post}`, {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "x-magnific-api-key": parsed.data.apiKey,
              },
              body: JSON.stringify(parsed.data.payload),
              signal: AbortSignal.timeout(45_000),
            });

            const data = await readMagnificJson(upstream);
            return json(normalizeMagnificResponse(data, upstream.status), { status: upstream.status });
          }

          const upstream = await fetch(`${MAGNIFIC_API}${endpoint.status}/${encodeURIComponent(parsed.data.taskId)}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "x-magnific-api-key": parsed.data.apiKey,
            },
            signal: AbortSignal.timeout(45_000),
          });

          const data = await readMagnificJson(upstream);
          return json(normalizeMagnificResponse(data, upstream.status), { status: upstream.status });
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Gagal menghubungi Magnific" },
            { status: 502 },
          );
        }
      },
    },
  },
});