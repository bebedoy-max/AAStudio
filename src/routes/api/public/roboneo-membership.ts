// Proxy Meitu Roboneo membership_info endpoint (credit balance).
// Browser can't call directly due to CORS (Origin must be roboneo.com).
import { createFileRoute } from "@tanstack/react-router";

const ENDPOINT = "https://agent-api-roboneo.meitu.com/api/commerce/membership_info";
const CLIENT_ID = "1189857647";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const PARAM_TOKEN = "45C30555F10E49629098A75F95828DA6";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
const genGid = () => {
  const rnd = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${rnd(14)}-${rnd(15)}-${rnd(7)}-${rnd(7)}-${rnd(14)}`;
};

function extractUid(token: string): string {
  try {
    let b64 = token.replace(/^_v\d+/, "");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const dec = Buffer.from(b64, "base64").toString("binary");
    const parts = dec.split("#");
    if (parts[2] && /^\d+$/.test(parts[2])) return parts[2];
  } catch {
    /* ignore */
  }
  return "0";
}

export const Route = createFileRoute("/api/public/roboneo-membership")({
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

        const body = {
          token: PARAM_TOKEN,
          gid: genGid(),
          uid: extractUid(token),
          trace_id: uuid(),
          client_id: CLIENT_ID,
          app_scene: "roboneo",
          area_code: "ID",
          lang: "en",
          time_zone: "Asia/Jakarta",
        };

        const upstream = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*",
            "access-token": token,
            "client-id": CLIENT_ID,
            Origin: "https://www.roboneo.com",
            Referer: "https://www.roboneo.com/",
            "User-Agent": UA,
          },
          body: JSON.stringify(body),
        });
        const text = await upstream.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* ignore */
        }
        return new Response(
          JSON.stringify({
            ok: upstream.ok,
            status: upstream.status,
            data: parsed,
            raw: parsed ? undefined : text.slice(0, 500),
          }),
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
