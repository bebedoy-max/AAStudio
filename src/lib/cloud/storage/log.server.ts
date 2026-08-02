// Logging ringan untuk mengukur jalur mana yang masih memakai bandwidth server.
type Event = "upload.direct" | "upload.proxied" | "download.redirect" | "download.streamed" | "preview.redirect" | "archive.server" | "sync";

export function logTransfer(event: Event, info: Record<string, unknown> = {}) {
  try {
    console.log(`[transfer] ${event} ${JSON.stringify(info)}`);
  } catch {
    console.log(`[transfer] ${event}`);
  }
}