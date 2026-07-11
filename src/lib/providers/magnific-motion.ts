// Magnific motion-control orchestrator — uses server proxy /api/public/magnific
// and public catbox uploader for image/video URLs.

export type MagnificMotionOpts = {
  modelKey: string; // must match mag:* keys in /api/public/magnific
  apiKey: string;
  imageFile: File;
  videoFile: File;
  orientation: "image" | "video";
  prompt?: string;
  onProgress?: (msg: string) => void;
};

async function uploadPublic(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, file.name || "upload.bin");
  const r = await fetch("/api/public/upload-catbox", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.url) throw new Error(j?.error || `Upload gagal (${r.status})`);
  return j.url as string;
}

async function magnificCall(action: "submit" | "status", body: Record<string, unknown>) {
  const r = await fetch("/api/public/magnific", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Magnific ${r.status}`);
  return j as Record<string, unknown>;
}

export async function runMagnificMotion(opts: MagnificMotionOpts): Promise<string> {
  const log = (m: string) => opts.onProgress?.(m);
  log("Upload image ke public host...");
  const image_url = await uploadPublic(opts.imageFile);
  log("Upload video ke public host...");
  const video_url = await uploadPublic(opts.videoFile);

  log("Submit ke Magnific...");
  const sub = await magnificCall("submit", {
    apiKey: opts.apiKey,
    modelKey: opts.modelKey,
    payload: {
      image_url,
      video_url,
      character_orientation: opts.orientation,
      ...(opts.prompt ? { prompt: opts.prompt } : {}),
    },
  });
  const taskId = (sub.task_id || sub.id || sub.taskId) as string | undefined;
  if (!taskId) throw new Error("Magnific: tidak ada task id di response");

  const started = Date.now();
  const timeout = 15 * 60 * 1000;
  while (Date.now() - started < timeout) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await magnificCall("status", {
      apiKey: opts.apiKey,
      modelKey: opts.modelKey,
      taskId,
    });
    const status = String(st.status || st.state || "").toLowerCase();
    log(`Poll: ${status || "unknown"}`);
    if (["completed", "success", "succeeded", "done", "finished"].includes(status)) {
      const url =
        (st.video_url as string | undefined) ||
        (st.output_url as string | undefined) ||
        ((st.output as { url?: string } | undefined)?.url) ||
        ((st.result as { url?: string; video_url?: string } | undefined)?.video_url) ||
        ((st.result as { url?: string; video_url?: string } | undefined)?.url);
      if (!url) throw new Error("Magnific: tidak ada URL output di response");
      return url;
    }
    if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      throw new Error("Magnific: task gagal — " + (st.error || st.message || "unknown"));
    }
  }
  throw new Error("Magnific: timeout menunggu hasil");
}
