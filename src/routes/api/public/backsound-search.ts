import { createFileRoute } from "@tanstack/react-router";

// Backsound library — musik gratis (Creative Commons).
// Sumber utama: Jamendo API (katalog besar, kualitas studio, streaming MP3 langsung).
// Fallback: archive.org (dipakai bila JAMENDO_CLIENT_ID belum diset / Jamendo error).
// Mode:
//   ?mood=cinematic      → kurasi per mood
//   ?q=epic+drums        → pencarian bebas
//   ?mood=moods          → daftar mood

type Track = {
  title: string;
  url: string;
  duration: number;
  source?: string;
  artist?: string;
  image?: string;
};

// Curated album identifiers per mood (Kevin MacLeod & koleksi netlabel CC).
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

// Query pencarian tambahan per mood → memperluas jangkauan ke seluruh archive.org.
const MOOD_QUERIES: Record<string, string> = {
  cinematic: "cinematic orchestral score",
  "dark-cinematic": "dark cinematic tension",
  horror: "horror ambient scary",
  inspiration: "inspirational uplifting piano",
  comedy: "comedy quirky fun",
  upbeat: "upbeat energetic electronic",
  documentary: "documentary ambient background",
  epic: "epic trailer drums",
  lofi: "lofi chill beats",
  ambient: "ambient atmospheric drone",
  acoustic: "acoustic guitar folk instrumental",
  electronic: "electronic synthwave instrumental",
  hiphop: "hip hop instrumental beat",
  emotional: "emotional sad piano",
  corporate: "corporate motivational background",
  travel: "travel vlog summer instrumental",
};

export const MOOD_LABELS: Record<string, string> = {
  cinematic: "🎬 Cinematic",
  "dark-cinematic": "🌑 Dark Cinematic",
  horror: "👻 Horror",
  inspiration: "✨ Inspirational",
  comedy: "😄 Comedy / Fun",
  upbeat: "⚡ Upbeat / Energetic",
  documentary: "📽️ Documentary",
  epic: "🥁 Epic Trailer",
  lofi: "🎧 Lo-Fi Chill",
  ambient: "🌫️ Ambient",
  acoustic: "🎸 Acoustic",
  electronic: "🛸 Electronic",
  hiphop: "🎤 Hip-Hop Beat",
  emotional: "💔 Emotional",
  corporate: "💼 Corporate",
  travel: "🌴 Travel / Vlog",
};

// ---------------------------------------------------------------- Jamendo
// Tag Jamendo per mood (tag resmi katalog Jamendo).
const MOOD_TAGS: Record<string, string> = {
  cinematic: "cinematic",
  "dark-cinematic": "dark",
  horror: "horror",
  inspiration: "inspiring",
  comedy: "funny",
  upbeat: "energetic",
  documentary: "documentary",
  epic: "epic",
  lofi: "lofi",
  ambient: "ambient",
  acoustic: "acoustic",
  electronic: "electronic",
  hiphop: "hiphop",
  emotional: "emotional",
  corporate: "corporate",
  travel: "travel",
};

type JamendoTrack = {
  name?: string;
  artist_name?: string;
  duration?: number | string;
  audio?: string;
  audiodownload?: string;
  image?: string;
};

async function fetchJamendo(opts: { tag?: string; query?: string; limit?: number }): Promise<Track[]> {
  const clientId = process.env["JAMENDO_CLIENT_ID"];
  if (!clientId) return [];
  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: String(opts.limit ?? 60),
    audioformat: "mp32",
    include: "musicinfo",
    order: "popularity_total",
    vocalinstrumental: "instrumental",
  });
  if (opts.query) params.set("search", opts.query);
  else if (opts.tag) params.set("tags", opts.tag);

  try {
    const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`);
    if (!res.ok) return [];
    const j = (await res.json()) as { results?: JamendoTrack[] };
    return (j.results || [])
      .map((t): Track | null => {
        const url = t.audiodownload || t.audio;
        if (!url) return null;
        return {
          title: (t.name || "Untitled").trim(),
          url,
          duration: Number(t.duration) || 0,
          artist: t.artist_name,
          image: t.image,
          source: "jamendo",
        };
      })
      .filter((t): t is Track => !!t && t.duration >= 20);
  } catch {
    return [];
  }
}


type ArchiveFile = { name: string; format?: string; length?: string | number };
type ArchiveMeta = { metadata?: { title?: string }; files?: ArchiveFile[] };

function cleanTitle(base: string): string {
  return base
    .replace(/^Kevin\s*MacLeod\s*-\s*\d+\s*-\s*/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAlbumTracks(id: string, limit = 40): Promise<Track[]> {
  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as ArchiveMeta;
    const files = data.files || [];
    const tracks: Track[] = [];
    for (const f of files) {
      const name = f.name || "";
      if (!name.toLowerCase().endsWith(".mp3")) continue;
      if (/vbr|64kb/i.test(name)) continue;
      const dur = Number(f.length) || 0;
      if (dur < 30 || dur > 480) continue;
      const parts = name.split("/");
      const base = parts[parts.length - 1].replace(/\.mp3$/i, "");
      const url = `https://archive.org/download/${encodeURIComponent(id)}/${name
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      tracks.push({ title: cleanTitle(base), url, duration: dur, source: id });
      if (tracks.length >= limit) break;
    }
    return tracks;
  } catch {
    return [];
  }
}

type SearchDoc = { identifier: string; title?: string };

async function searchArchive(query: string, rows = 8): Promise<string[]> {
  try {
    const q = `(${query}) AND mediatype:(audio) AND (licenseurl:(*creativecommons.org*) OR collection:(netlabels) OR collection:(audio_music))`;
    const url =
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
      `&fl%5B%5D=identifier&fl%5B%5D=title&rows=${rows}&page=1&output=json&sort%5B%5D=downloads+desc`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = (await res.json()) as { response?: { docs?: SearchDoc[] } };
    return (j.response?.docs || []).map((d) => d.identifier).filter(Boolean);
  } catch {
    return [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=1800",
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
        const q = (url.searchParams.get("q") || "").trim();

        if (mood === "moods") {
          return json({ moods: Object.entries(MOOD_LABELS).map(([k, v]) => ({ key: k, label: v })) });
        }

        // Pencarian bebas → Jamendo dulu, fallback archive.org.
        if (q) {
          const jam = await fetchJamendo({ query: q, limit: 60 });
          if (jam.length) return json({ query: q, provider: "jamendo", tracks: jam });
          const ids = await searchArchive(q, 8);
          const results = await Promise.all(ids.map((id) => fetchAlbumTracks(id, 12)));
          const tracks = shuffle(results.flat());
          return json({ query: q, provider: "archive", tracks: tracks.slice(0, 60) });
        }

        // Per mood → Jamendo dulu, fallback archive.org.
        const jam = await fetchJamendo({ tag: MOOD_TAGS[mood] || mood, limit: 60 });
        if (jam.length) return json({ mood, provider: "jamendo", tracks: jam });

        const curated = MOOD_ALBUMS[mood] || [];
        const searchIds = await searchArchive(MOOD_QUERIES[mood] || mood, curated.length ? 5 : 8);
        const ids = Array.from(new Set([...curated, ...searchIds]));
        const results = await Promise.all(ids.map((id) => fetchAlbumTracks(id, 12)));
        const tracks = shuffle(results.flat());
        return json({ mood, provider: "archive", tracks: tracks.slice(0, 60) });

      },
    },
  },
});
