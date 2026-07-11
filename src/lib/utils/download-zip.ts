import JSZip from "jszip";

/**
 * Download multiple remote files as a single .zip.
 * Skips files that fail to fetch (CORS, network) and logs a warning.
 */
export async function downloadFilesAsZip(
  files: { url: string; filename: string }[],
  zipName: string,
): Promise<void> {
  if (!files.length) return;
  const zip = new JSZip();
  const results = await Promise.allSettled(
    files.map(async (f) => {
      // Try direct fetch first, fall back to proxy for CORS-blocked assets.
      let blob: Blob | null = null;
      try {
        const r = await fetch(f.url, { mode: "cors" });
        if (r.ok) blob = await r.blob();
      } catch {
        /* fallthrough */
      }
      if (!blob) {
        try {
          const r = await fetch(`/api/public/proxy-image?url=${encodeURIComponent(f.url)}`);
          if (r.ok) blob = await r.blob();
        } catch {
          /* ignore */
        }
      }
      if (!blob) throw new Error(`Fetch failed: ${f.url}`);
      zip.file(f.filename, blob);
    }),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) console.warn(`downloadFilesAsZip: ${failed}/${files.length} file(s) gagal diambil`);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
