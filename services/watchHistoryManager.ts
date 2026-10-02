import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RecentVideoItem {
  id: string;
  title: string;
  positionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  lastWatchedAt: number;
  thumbnailUrl?: string;
  localUri: string;
  googleDriveId?: string;
}

const HISTORY_KEY = '@drive_player_watch_history_v1';

/**
 * Saves current playback position for resume and recent history.
 */
export async function saveWatchProgress(video: {
  id: string;
  title: string;
  positionSeconds: number;
  durationSeconds: number;
  localUri: string;
  thumbnailUrl?: string;
  googleDriveId?: string;
}): Promise<void> {
  if (!video.id || video.durationSeconds <= 0) return;

  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    let list: RecentVideoItem[] = raw ? JSON.parse(raw) : [];

    // Calculate progress percentage
    const progressPercent = Math.min(100, Math.round((video.positionSeconds / video.durationSeconds) * 100));

    const item: RecentVideoItem = {
      id: video.id,
      title: video.title,
      positionSeconds: Math.floor(video.positionSeconds),
      durationSeconds: Math.floor(video.durationSeconds),
      progressPercent,
      lastWatchedAt: Date.now(),
      thumbnailUrl: video.thumbnailUrl,
      localUri: video.localUri,
      googleDriveId: video.googleDriveId,
    };

    // Filter out existing and put newest first
    list = [item, ...list.filter((v) => v.id !== video.id)].slice(0, 10);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch (error) {
    console.warn('Error saving watch progress:', error);
  }
}

/**
 * Retrieves the saved watch position in seconds for a specific video.
 * Returns null if never watched or already completed.
 */
export async function getWatchProgress(videoId: string): Promise<number | null> {
  if (!videoId) return null;
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    const list: RecentVideoItem[] = JSON.parse(raw);
    const found = list.find((v) => v.id === videoId);

    // If watched more than 5s and has not reached the final 10s of the video
    if (found && found.positionSeconds > 5 && found.positionSeconds < found.durationSeconds - 10) {
      return found.positionSeconds;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Retrieves list of last played videos (default: last 3-5 videos).
 */
export async function getRecentVideos(limit = 5): Promise<RecentVideoItem[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list: RecentVideoItem[] = JSON.parse(raw);
    return list.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Removes an item from watch history.
 */
export async function removeFromHistory(videoId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return;
    const list: RecentVideoItem[] = JSON.parse(raw);
    const updated = list.filter((v) => v.id !== videoId);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}
