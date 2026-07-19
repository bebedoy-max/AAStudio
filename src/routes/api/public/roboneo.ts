// Server proxy for Meitu Roboneo AI Engine Gateway.
// Browser calls to https://ai-engine-gateway-roboneo.meitu.com fail CORS
// (Origin must be https://www.roboneo.com). We forward from the edge here.
import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://ai-engine-gateway-roboneo.meitu.com";
const CLIENT_ID = "1189857647";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

type Body = {
  path: "nodeexecute" | "nodeexecutequery" | "vipshow";
  parameter: Record<string, unknown>;
};

export const Route = createFileRoute("/api/public/roboneo")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Roboneo-Token",
          },
        }),
      POST: async ({ request }) => {
        const token =
          request.headers.get("X-Roboneo-Token") ||
          request.headers.get("x-roboneo-token") ||
          "";
        if (!token) return json({ ok: false, error: "X-Roboneo-Token required" }, 400);
        const body = (await request.json().catch(() => null)) as Body | null;
        const allowed = ["nodeexecute", "nodeexecutequery", "vipshow"];
        if (!body || !allowed.includes(body.path)) {
          return json({ ok: false, error: "invalid path" }, 400);
        }

        // Web app uses a single endpoint; `path_scene` inside `parameter`
        // multiplexes the operation. Appending the path_scene to the URL
        // makes the gateway reply with "token error" even for valid tokens.
        const upstream = await fetch(`${GATEWAY}/roboneo/sync/request`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*",
            "access-token": token,
            "client-id": CLIENT_ID,
            Origin: "https://www.roboneo.com",
            Referer: "https://www.roboneo.com/ai_flow",
          },
          body: JSON.stringify({ parameter: body.parameter }),
        });
        const text = await upstream.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* ignore */
        }
        return new Response(
          JSON.stringify({ ok: upstream.ok, status: upstream.status, data: parsed, raw: parsed ? undefined : text.slice(0, 500) }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      },
    },
  },
});
