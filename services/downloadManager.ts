import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths, type DownloadProgress } from 'expo-file-system';
import { type MediaKind, detectMediaKind } from '@/services/googleDriveService';

export interface LocalMediaItem {
  id: string;
  title: string;
  localUri: string;
  sizeBytes: number;
  downloadedAt: number;
  remoteUrl: string;
  googleDriveId?: string;
  thumbnailUrl?: string;
  mediaKind: MediaKind;
}

export type LocalVideoItem = LocalMediaItem;

const STORAGE_INDEX_KEY = '@drive_player_media_index_v2';
const LEGACY_STORAGE_INDEX_KEY = '@drive_player_videos_index';

/**
 * Get or create the local media directory in document storage.
 */
function getMediaDirectory(folder: 'videos' | 'audio' | 'images' | 'media' = 'media'): Directory {
  const dir = new Directory(Paths.document, folder);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * Clean a string to be used safely as a filename with proper extension.
 */
function sanitizeFileName(name: string, defaultExt: string): string {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (clean.includes('.')) {
    return clean;
  }
  return `${clean}.${defaultExt}`;
}

/**
 * Format bytes into human-readable string (e.g. "14.2 MB").
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Retrieves all registered local media items from device storage.
 */
export async function getLocalMedia(): Promise<LocalMediaItem[]> {
  try {
    let raw = await AsyncStorage.getItem(STORAGE_INDEX_KEY);
    // Fallback to legacy index if new index is empty
    if (!raw) {
      const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_INDEX_KEY);
      if (legacyRaw) {
        const legacyItems = JSON.parse(legacyRaw);
        const upgraded: LocalMediaItem[] = legacyItems.map((item: any) => ({
          ...item,
          mediaKind: item.mediaKind || 'video',
        }));
        await AsyncStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(upgraded));
        raw = JSON.stringify(upgraded);
      }
    }

    if (!raw) return [];
    const items: LocalMediaItem[] = JSON.parse(raw);

    // Verify which files still physically exist on device storage
    const validItems: LocalMediaItem[] = [];
    for (const item of items) {
      try {
        const file = new File(item.localUri);
        if (file.exists) {
          validItems.push({
            ...item,
            sizeBytes: file.size ?? item.sizeBytes,
          });
        }
      } catch {
        // File does not exist anymore
      }
    }

    if (validItems.length !== items.length) {
      await AsyncStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(validItems));
    }

    return validItems;
  } catch (error) {
    console.error('Error getting local media:', error);
    return [];
  }
}

/**
 * Retrieves only local video items.
 */
export async function getLocalVideos(): Promise<LocalMediaItem[]> {
  const all = await getLocalMedia();
  return all.filter((item) => item.mediaKind === 'video');
}

/**
 * Retrieves only local audio / music items.
 */
export async function getLocalAudio(): Promise<LocalMediaItem[]> {
  const all = await getLocalMedia();
  return all.filter((item) => item.mediaKind === 'audio');
}

/**
 * Retrieves only local image items.
 */
export async function getLocalImages(): Promise<LocalMediaItem[]> {
  const all = await getLocalMedia();
  return all.filter((item) => item.mediaKind === 'image');
}

/**
 * Checks if a specific file is already downloaded to local device storage.
 */
export async function findLocalMedia(idOrUrl: string): Promise<LocalMediaItem | null> {
  const list = await getLocalMedia();
  return list.find((v) => v.id === idOrUrl || v.remoteUrl === idOrUrl || v.googleDriveId === idOrUrl) || null;
}

export const findLocalVideo = findLocalMedia;

/**
 * Downloads a media file (Video, Audio, or Image) from Google Drive / remote URL
 * directly into device local storage with real-time progress callback.
 */
export async function downloadMediaToLocal(
  remoteUrl: string,
  title: string,
  mediaKind: MediaKind = 'video',
  googleDriveId?: string,
  thumbnailUrl?: string,
  onProgress?: (progressPercent: number, bytesWritten: number, totalBytes: number) => void
): Promise<LocalMediaItem> {
  const folder = mediaKind === 'video' ? 'videos' : mediaKind === 'audio' ? 'audio' : 'images';
  const mediaDir = getMediaDirectory(folder);
  const defaultExt = mediaKind === 'video' ? 'mp4' : mediaKind === 'audio' ? 'mp3' : 'jpg';
  const safeName = `${Date.now()}_${sanitizeFileName(title, defaultExt)}`;
  const destinationFile = new File(mediaDir, safeName);

  let downloadedFile: File;

  let headers: Record<string, string> | undefined;
  if (remoteUrl.includes('googleapis.com') || googleDriveId) {
    try {
      const { getValidAccessToken } = await import('@/services/googleDriveService');
      const token = await getValidAccessToken();
      headers = { Authorization: `Bearer ${token}` };
    } catch (e) {
      console.warn('Could not attach Google Drive auth header:', e);
    }
  }

  try {
    downloadedFile = await File.downloadFileAsync(remoteUrl, destinationFile, {
      idempotent: true,
      headers,
      onProgress: (progress: DownloadProgress) => {
        if (onProgress) {
          const percent = progress.totalBytes > 0
            ? Math.min(100, Math.round((progress.bytesWritten / progress.totalBytes) * 100))
            : 0;
          onProgress(percent, progress.bytesWritten, progress.totalBytes);
        }
      },
    });
  } catch (error) {
    console.error('Error during media download:', error);
    try {
      if (destinationFile.exists) {
        destinationFile.delete();
      }
    } catch {}
    throw error;
  }

  const newItem: LocalMediaItem = {
    id: googleDriveId || `media_${Date.now()}`,
    title,
    localUri: downloadedFile.uri,
    sizeBytes: downloadedFile.size ?? 0,
    downloadedAt: Date.now(),
    remoteUrl,
    googleDriveId,
    thumbnailUrl,
    mediaKind,
  };

  // Save to index
  const currentList = await getLocalMedia();
  const updatedList = [newItem, ...currentList.filter((v) => v.id !== newItem.id)];
  await AsyncStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(updatedList));

  return newItem;
}

export const downloadVideoToLocal = (
  remoteUrl: string,
  title: string,
  googleDriveId?: string,
  thumbnailUrl?: string,
  onProgress?: (progressPercent: number, bytesWritten: number, totalBytes: number) => void
) => downloadMediaToLocal(remoteUrl, title, 'video', googleDriveId, thumbnailUrl, onProgress);

/**
 * Deletes a file ONLY from local mobile phone device storage.
 * GUARANTEE: Never touches or deletes anything from Google Drive!
 */
export async function deleteLocalMedia(localUriOrId: string): Promise<boolean> {
  try {
    const list = await getLocalMedia();
    const target = list.find((v) => v.id === localUriOrId || v.localUri === localUriOrId);

    if (target) {
      try {
        const file = new File(target.localUri);
        if (file.exists) {
          file.delete();
        }
      } catch (err) {
        console.warn('Physical file delete warning:', err);
      }

      const updated = list.filter((v) => v.id !== target.id);
      await AsyncStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(updated));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting local file:', error);
    return false;
  }
}

export const deleteLocalVideo = deleteLocalMedia;

/**
 * Calculates total storage used by all downloaded files on device.
 */
export async function getTotalLocalStorageUsed(): Promise<number> {
  const items = await getLocalMedia();
  return items.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);
}

/**
 * Clears all locally cached media from device storage.
 */
export async function clearAllLocalMedia(): Promise<void> {
  try {
    const items = await getLocalMedia();
    for (const item of items) {
      try {
        const file = new File(item.localUri);
        if (file.exists) {
          file.delete();
        }
      } catch {}
    }
    await AsyncStorage.removeItem(STORAGE_INDEX_KEY);
  } catch (error) {
    console.error('Error clearing local media storage:', error);
  }
}
