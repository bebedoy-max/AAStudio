import { createFileRoute } from "@tanstack/react-router";

// Backsound library — sumber musik public-domain (Kevin MacLeod) di archive.org.
// Endpoint mengembalikan daftar track {title, url, duration} per mood.
// Client bisa shuffle / play preview / pakai saat merge video naratif.

type Track = { title: string; url: string; duration: number };

// Curated album identifiers per mood. Semua Kevin MacLeod, license CC-BY / public domain.
const MOOD_ALBUMS: Record<string, string[]> = {
  cinematic: [
    "Kevin-MacLeod_Netherworld-Shanty_2014_FullAlbum",
    "Kevin-MacLeod_Silent-Film-Light-Collection_2014_FullAlbum",
  ],
  "dark-cinematic": [
    "Kevin-MacLeod_Falcon-Banner_2006_FullAlbum",
    "Kevin-MacLeod_Netherworld-Shanty_2014_FullAlbum",
  ],
  horror: ["Kevin-MacLeod_Falcon-Banner_2006_FullAlbum"],
  inspiration: ["Kevin-MacLeod_Rollin-at-5_2014_FullAlbum", "Kevin-MacLeod_Ferret_2017_FullAlbum"],
  comedy: ["Kevin-MacLeod_Comedy-Scoring_2014_FullAlbum"],
  upbeat: ["Kevin-MacLeod_Mad-Pianist_2008_FullAlbum", "Kevin-MacLeod_Ferret_2017_FullAlbum"],
  documentary: [
    "Kevin-MacLeod_Utility_Vadodara_2014_FullAlbum",
    "Kevin-MacLeod_Silent-Film-Light-Collection_2014_FullAlbum",
  ],
};

export const MOOD_LABELS: Record<string, string> = {
  cinematic: "🎬 Cinematic",
  "dark-cinematic": "🌑 Dark Cinematic",
  horror: "👻 Horror",
  inspiration: "✨ Inspirational",
  comedy: "😄 Comedy / Fun",
  upbeat: "⚡ Upbeat / Energetic",
  documentary: "📽️ Documentary",
};

type ArchiveFile = { name: string; format?: string; length?: string | number };
type ArchiveMeta = { metadata?: { title?: string }; files?: ArchiveFile[] };

async function fetchAlbumTracks(id: string): Promise<Track[]> {
  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as ArchiveMeta;
    const files = data.files || [];
    const tracks: Track[] = [];
    for (const f of files) {
      const name = f.name || "";
      if (!name.toLowerCase().endsWith(".mp3")) continue;
      if (/vbr|64kb/i.test(name)) continue; // skip low-bitrate duplicates
      const dur = Number(f.length) || 0;
      if (dur < 30 || dur > 360) continue; // 30s..6min sweet spot
      const parts = name.split("/");
      const base = parts[parts.length - 1].replace(/\.mp3$/i, "");
      const title = base
        .replace(/^Kevin\s*MacLeod\s*-\s*\d+\s*-\s*/i, "")
        .replace(/[_-]+/g, " ")
        .trim();
      const url = `https://archive.org/download/${encodeURIComponent(id)}/${name.split("/").map(encodeURIComponent).join("/")}`;
      tracks.push({ title, url, duration: dur });
    }
    return tracks;
  } catch {
    return [];
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const Route = createFileRoute("/api/public/backsound-search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mood = (url.searchParams.get("mood") || "cinematic").toLowerCase();
        if (mood === "moods") {
          return json({
            moods: Object.entries(MOOD_LABELS).map(([k, v]) => ({ key: k, label: v })),
          });
        }
        const albums = MOOD_ALBUMS[mood] || MOOD_ALBUMS.cinematic;
        const results = await Promise.all(albums.map(fetchAlbumTracks));
        const tracks = results.flat();
        // shuffle
        for (let i = tracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
        }
        return json({ mood, tracks: tracks.slice(0, 40) });
      },
    },
  },
});
