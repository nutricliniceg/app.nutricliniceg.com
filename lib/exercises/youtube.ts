// EP-03: YouTube helpers. Only the URL is stored; video ID + thumbnail
// are derived at read time (portal embed lands in P19).

const WATCH = /(?:youtube\.com\/watch\?.*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(WATCH);
  return match ? match[1] : null;
}

export function youtubeThumbnail(videoId: string | null): string | null {
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function enrichYoutube(url: string | null | undefined): { url: string | null; videoId: string | null; thumbnail: string | null } {
  const videoId = extractYoutubeId(url);
  return { url: url ?? null, videoId, thumbnail: youtubeThumbnail(videoId) };
}
