export type WatchedInterval = readonly [number, number];

/** Watching is an introduction, never a mastery claim. Short chapters require
 * 80% coverage; longer chapters require 10%, bounded to 15–30 unique seconds. */
export function explorationThreshold(start: number, end: number): number {
  const duration = Math.max(0, end - start);
  return Math.min(duration * 0.8, Math.max(15, Math.min(30, duration * 0.1)));
}

/** Merge watched ranges so replaying the same few seconds earns no extra credit. */
export function mergeWatchedInterval(intervals: readonly WatchedInterval[], start: number, end: number): WatchedInterval[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [...intervals];
  const sorted = [...intervals, [start, end] as WatchedInterval].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

export function watchedSeconds(intervals: readonly WatchedInterval[]): number {
  return intervals.reduce((sum, [start, end]) => sum + end - start, 0);
}

/** Native timeupdate follows playback and seeking. Only small, wall-clock
 * consistent forward changes count, so dragging the seek bar cannot explore. */
export function isPlaybackAdvance(mediaDelta: number, wallDelta: number, playbackRate: number): boolean {
  return Number.isFinite(mediaDelta) && Number.isFinite(wallDelta) && Number.isFinite(playbackRate)
    && playbackRate > 0 && mediaDelta > 0 && wallDelta > 0 && wallDelta < 3
    && mediaDelta <= wallDelta * playbackRate + 0.5 && mediaDelta <= 3 * playbackRate;
}
