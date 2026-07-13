// Weavy provider client — mirrors legacy aamotion.html behavior.
// All calls are made directly from the browser (same as legacy) to app.weavy.ai / api.weavy.ai.

export const WEAVY_API = "https://api.weavy.ai/api";
const FIREBASE_API_KEY = "AIzaSyC-qLy3TFyXMogJPfMkZJ9H_q46hEu1sxI";

export const LS_WEAVY_TOKENS = "aatools.weavy.tokens";
export const LS_WEAVY_ACTIVE = "aatools.weavy.activeId";

export type WeavyRefreshResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  uid?: string;
};

export type StoredWeavyTok = {
  id: string;
  token: string; // refresh token
  email?: string;
  credits: number | null;
  status: "active" | "empty" | "pending" | "failed";
  // runtime cache (persisted)
  accessToken?: string;
  expiry?: number; // Date.now() ms epoch
};

export async function refreshWeavyToken(refreshToken: string): Promise<WeavyRefreshResult | null> {
  try {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.id_token) return null;
    return {
      accessToken: d.id_token,
      refreshToken: d.refresh_token || refreshToken,
      expiresIn: Number(d.expires_in) || 3600,
      uid: d.user_id,
    };
  } catch {
    return null;
  }
}

export function extractEmailFromJwt(jwt: string): string | undefined {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    return payload.email || payload.user_id;
  } catch {
    return undefined;
  }
}

/** Probe credit balance for a valid access token. Returns null if all endpoints fail. */
export async function fetchWeavyCredits(accessToken: string): Promise<number | null> {
  const endpoints = [
    `${WEAVY_API}/v1/credits`,
    `${WEAVY_API}/v1/user/credits`,
    `${WEAVY_API}/v1/user/balance`,
    `${WEAVY_API}/v1/user`,
    `${WEAVY_API}/v1/account`,
    `${WEAVY_API}/v1/subscription`,
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) continue;
      const d = await r.json();
      const c =
        d.credits ??
        d.balance ??
        d.totalCredits ??
        d.creditsRemaining ??
        d.quota ??
        d.usage?.credits ??
        d.plan?.credits ??
        d.data?.credits ??
        d.user?.credits ??
        null;
      if (typeof c === "number") return c;
    } catch {
      /* try next endpoint */
    }
  }
  try {
    const r = await fetch(`${WEAVY_API}/v1/workspaces`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (r.ok) {
      const d = await r.json();
      const ws = d.workspaces?.[0] || d[0] || d;
      if (typeof ws?.credits === "number") return ws.credits;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function checkWeavyToken(
  refreshToken: string,
): Promise<{ ok: boolean; email?: string; credits: number | null; accessToken?: string }> {
  const r = await refreshWeavyToken(refreshToken);
  if (!r) return { ok: false, credits: null };
  const email = extractEmailFromJwt(r.accessToken);
  const credits = await fetchWeavyCredits(r.accessToken);
  return { ok: true, email, credits, accessToken: r.accessToken };
}

// ==================== Token Pool (localStorage-backed) ====================

function readTokens(): StoredWeavyTok[] {
  if (typeof window === "undefined") return [];
  try {
    const v = localStorage.getItem(LS_WEAVY_TOKENS);
    return v ? (JSON.parse(v) as StoredWeavyTok[]) : [];
  } catch {
    return [];
  }
}
function writeTokens(list: StoredWeavyTok[]) {
  if (typeof window !== "undefined") localStorage.setItem(LS_WEAVY_TOKENS, JSON.stringify(list));
}

/** Get a valid access token for a specific stored token by id, refreshing if needed. */
export async function getWeavyAccessTokenById(tokenId: string): Promise<string | null> {
  const list = readTokens();
  const t = list.find((x) => x.id === tokenId);
  if (!t) return null;
  if (t.accessToken && t.expiry && Date.now() < t.expiry - 30000) return t.accessToken;
  const r = await refreshWeavyToken(t.token);
  if (!r) {
    t.status = "failed";
    writeTokens(list);
    return null;
  }
  t.accessToken = r.accessToken;
  t.expiry = Date.now() + r.expiresIn * 1000;
  t.token = r.refreshToken;
  t.email = extractEmailFromJwt(r.accessToken) || t.email;
  writeTokens(list);
  return r.accessToken;
}

function readActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LS_WEAVY_ACTIVE);
    return v ? (JSON.parse(v) as string | null) : null;
  } catch {
    return null;
  }
}
function writeActiveId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(LS_WEAVY_ACTIVE, JSON.stringify(id));
  else localStorage.removeItem(LS_WEAVY_ACTIVE);
}

function isUsable(t: StoredWeavyTok): boolean {
  return t.status !== "failed" && t.status !== "empty";
}

/** Get the currently active token or the first non-exhausted one. */
export async function getActiveWeavyAccessToken(): Promise<{ id: string; accessToken: string } | null> {
  if (typeof window === "undefined") return null;
  const list = readTokens();
  if (list.length === 0) return null;
  const activeId = readActiveId();
  const activeTok = activeId ? list.find((t) => t.id === activeId) : undefined;
  // Only prefer the active token when it is still usable — otherwise it would
  // keep handing back an exhausted token in an infinite rotate loop.
  const preferActive = activeTok && isUsable(activeTok);
  const order = [
    ...(preferActive ? [activeTok!] : []),
    ...list.filter((t) => t.id !== activeId && isUsable(t)),
    ...list.filter((t) => t.status === "empty"), // last resort
  ];
  for (const t of order) {
    const at = await getWeavyAccessTokenById(t.id);
    if (at) {
      writeActiveId(t.id);
      return { id: t.id, accessToken: at };
    }
  }
  return null;
}

/**
 * Mark a token exhausted, then re-scan ALL tokens, probe their real credit
 * balance, and activate the first one that still has credits. This guarantees
 * rotation never returns the same exhausted token and always lands on a token
 * with usable credits (or null when every token is empty).
 */
export async function rotateWeavyToken(exhaustedId: string): Promise<{ id: string; accessToken: string } | null> {
  {
    const list = readTokens();
    const t = list.find((x) => x.id === exhaustedId);
    if (t) {
      t.status = "empty";
      t.credits = 0;
      writeTokens(list);
    }
    if (readActiveId() === exhaustedId) writeActiveId(null);
  }

  // Re-read fresh and probe each remaining candidate for real credits.
  const candidates = readTokens().filter((x) => x.id !== exhaustedId && isUsable(x));
  for (const c of candidates) {
    const at = await getWeavyAccessTokenById(c.id);
    if (!at) continue;
    const credits = await fetchWeavyCredits(at);
    const list = readTokens();
    const stored = list.find((x) => x.id === c.id);
    if (credits !== null && credits <= 0) {
      // No credits — mark empty and keep scanning.
      if (stored) {
        stored.status = "empty";
        stored.credits = 0;
        writeTokens(list);
      }
      continue;
    }
    // credits > 0 or unknown (null) → usable. Activate it.
    if (stored) {
      stored.credits = credits;
      stored.status = "active";
      writeTokens(list);
    }
    writeActiveId(c.id);
    return { id: c.id, accessToken: at };
  }
  return null;
}


// ==================== Upload ====================

export async function compressImage(file: File, maxW = 1280, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = (h * maxW) / w;
          w = maxW;
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        c.toBlob(
          (b) => resolve(b ? new File([b], file.name, { type: "image/jpeg" }) : file),
          "image/jpeg",
          quality,
        );
      };
      img.src = String(e.target?.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export type UploadResult = { id?: string; url?: string; download?: string; raw?: { url?: string } };

export async function uploadWeavyAsset(file: File, filename: string, accessToken: string): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file, filename);
  if (file.type) fd.append("type", file.type);
  const r = await fetch(`${WEAVY_API}/v1/assets/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
  });
  if (!r.ok) throw new Error(`Weavy upload failed (${r.status})`);
  return (await r.json()) as UploadResult;
}

export async function uploadWeavyAssetWithRetry(
  file: File,
  filename: string,
  accessToken: string,
  retries = 2,
): Promise<UploadResult> {
  let f = file;
  for (let a = 0; a <= retries; a++) {
    try {
      return await uploadWeavyAsset(f, filename, accessToken);
    } catch (e) {
      const msg = (e as Error).message;
      if (a >= retries) throw e;
      if (msg.includes("413") && f.type.startsWith("image/")) f = await compressImage(f, 800, 0.5);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("upload retries exhausted");
}

export function resolveWeavyAssetUrl(result: UploadResult | string, ext: "image" | "video"): string {
  if (typeof result === "string") return result;
  if (result.url) return result.url;
  if (result.download) return result.download;
  if (result.id) return `https://media.weavy.ai/${ext}/upload/uploads/${result.id}.${ext === "video" ? "mp4" : "jpg"}`;
  if (result.raw?.url) return result.raw.url;
  throw new Error("Weavy: cannot resolve asset URL");
}

// ==================== Recipe primitives ====================

export type WeavyRecipeBody = { nodes: unknown[]; edges: unknown[]; modelId?: string };

export async function createWeavyRecipe(accessToken: string): Promise<{ id: string; v3?: string }> {
  const r = await fetch(`${WEAVY_API}/v1/recipes/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "PERSONAL" }),
  });
  if (!r.ok) throw new Error(`Weavy create recipe failed (${r.status})`);
  const d = await r.json();
  return { id: d.id || d.recipeId, v3: d.v3 };
}

export async function saveWeavyRecipe(
  recipeId: string,
  body: { nodes: unknown[]; edges: unknown[]; v3?: string },
  accessToken: string,
): Promise<void> {
  const r = await fetch(`${WEAVY_API}/v1/recipes/${recipeId}/save`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, v3: body.v3 || "", lastUpdatedAt: new Date().toISOString() }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Weavy save recipe failed (${r.status}): ${t.substring(0, 200)}`);
  }
}

export async function approveWeavyModel(modelId: string, accessToken: string): Promise<void> {
  try {
    await fetch(`${WEAVY_API}/v1/workspaces/models/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ modelIds: [modelId] }),
    });
  } catch {
    /* legacy ignores errors */
  }
}

export async function executeWeavyBatch(
  recipeId: string,
  nodes: unknown[],
  edges: unknown[],
  accessToken: string,
  modelId?: string,
): Promise<{ batchId: string }> {
  const body: Record<string, unknown> = { numberOfRuns: 1, nodes, edges };
  if (modelId) body.model = modelId;
  const r = await fetch(`${WEAVY_API}/v1/batches/recipes/${recipeId}/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Weavy execute failed (${r.status}): ${t.substring(0, 200)}`);
  const d = JSON.parse(t);
  const bid = d.batchId || d.id;
  if (!bid) throw new Error("Weavy: no batchId returned");
  return { batchId: bid };
}

export type PollProgress = (info: { attempt: number; status: string }) => void;

export async function pollWeavyBatchVideo(
  recipeId: string,
  batchId: string,
  accessToken: string,
  opts: { inputVideoUrl?: string; maxAttempts?: number; onProgress?: PollProgress } = {},
): Promise<string | null> {
  const maxAttempts = opts.maxAttempts ?? 180;
  for (let a = 0; a < maxAttempts; a++) {
    const delay = a < 30 ? 8000 : a < 60 ? 10000 : 15000;
    await new Promise((r) => setTimeout(r, delay));
    try {
      const r = await fetch(`${WEAVY_API}/v1/batches/recipes/${recipeId}/batches/${batchId}/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) continue;
      const d = await r.json();
      const st = String(d.recipeRuns?.[0]?.status || d.status || d.state || "unknown");
      opts.onProgress?.({ attempt: a + 1, status: st });
      const done = ["completed", "COMPLETED", "done", "success"].includes(st);
      if (done) {
        if (d.recipeRuns?.[0]?.nodeRuns) {
          for (let i = d.recipeRuns[0].nodeRuns.length - 1; i >= 0; i--) {
            const nr = d.recipeRuns[0].nodeRuns[i];
            let ro = nr.result;
            if (Array.isArray(ro) && ro.length > 0) ro = ro[0];
            const candidates = [
              ro?.url,
              ro?.video_url,
              nr.output?.file?.url,
              nr.output?.video_url,
              nr.output?.url,
              ...((nr.generations || []) as { url?: string; video_url?: string }[]).map(
                (g) => g.url || g.video_url,
              ),
            ].filter(
              (u): u is string =>
                !!u && u.includes(".mp4") && !u.includes("/video/upload/v1781970233/") && u !== opts.inputVideoUrl,
            );
            if (candidates.length > 0) return candidates[0];
          }
        }
        return d.output?.video_url || d.output?.url || d.video_url || d.url || null;
      }
      if (["failed", "FAILED", "error", "ERROR"].includes(st)) {
        const ne = (d.recipeRuns?.[0]?.nodeRuns || [])
          .map((nr: { error?: string; errorMessage?: string; status?: string }) => nr.error || nr.errorMessage)
          .filter(Boolean)
          .join(" | ");
        throw new Error((d.error || d.message || "Weavy generation failed") + (ne ? " | " + ne : ""));
      }
    } catch (e) {
      // Always surface real generation failures; only swallow transient network errors early
      if (e instanceof Error && /Weavy generation failed|failed \|/i.test(e.message)) throw e;
      if (a > 10) throw e;
    }
  }
  throw new Error("Weavy timeout: generation took too long");
}
