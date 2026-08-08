// Pemutar video galeri yang tahan gagal-muat.
//
// Kenapa perlu: URL galeri (/api/public/cloud/file/:id) sengaja mengembalikan
// 302 ke storage supaya byte TIDAK melewati server (hemat kuota fast origin
// Vercel & egress). Tapi storage tujuan tidak mengirim header CORS, sehingga
// <video crossOrigin="anonymous"> gagal total dan galeri tampak kosong/hitam.
//
// Solusi hemat kuota:
//  1) putar langsung tanpa crossOrigin → redirect ke storage, 0 byte lewat server
//  2) hanya kalau gagal, fallback sekali ke ?stream=1 (proxy server, byte lewat
//     origin) — jadi biaya kuota hanya muncul untuk file yang bermasalah.
import { useCallback, useMemo, useState } from "react";

function withStreamFallback(url: string) {
  try {
    const u = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    if (!u.pathname.startsWith("/api/public/cloud/file/")) return null;
    u.searchParams.set("stream", "1");
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

export function GalleryVideo({
  src,
  className,
  poster,
}: {
  src: string;
  className?: string;
  poster?: string;
}) {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const streamUrl = useMemo(() => withStreamFallback(src), [src]);

  const onError = useCallback(() => {
    if (!fallback && streamUrl) {
      setFallback(true);
      return;
    }
    setFailed(true);
  }, [fallback, streamUrl]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-black/60 text-[11px] text-muted-foreground ${className ?? ""}`}>
        Video gagal dimuat
      </div>
    );
  }

  return (
    <video
      key={fallback ? "stream" : "direct"}
      src={fallback && streamUrl ? streamUrl : src}
      poster={poster}
      controls
      preload="metadata"
      playsInline
      onError={onError}
      className={className}
    />
  );
}
