import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths, type DownloadProgress } from 'expo-file-system';

export interface LocalVideoItem {
  id: string;
  title: string;
  localUri: string;
  sizeBytes: number;
  downloadedAt: number;
  remoteUrl: string;
  googleDriveId?: string;
  thumbnailUrl?: string;
}

const STORAGE_INDEX_KEY = '@drive_player_videos_index';

/**
 * Get or create the local videos directory in document storage.
 */
function getVideosDirectory(): Directory {
  const dir = new Directory(Paths.document, 'videos');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * Clean a string to be used safely as a filename.
 */
function sanitizeFileName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.endsWith('.mp4') ? clean : `${clean}.mp4`;
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
 * Retrieves all registered local videos from AsyncStorage and verifies their file existence.
 */
export async function getLocalVideos(): Promise<LocalVideoItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_INDEX_KEY);
    if (!raw) return [];
    const items: LocalVideoItem[] = JSON.parse(raw);

    // Verify which files still physically exist on disk
    const validItems: LocalVideoItem[] = [];
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
    console.error('Error getting local videos:', error);
    return [];
  }
}

/**
 * Checks if a specific video is already downloaded to local storage.
 */
export async function findLocalVideo(idOrUrl: string): Promise<LocalVideoItem | null> {
  const list = await getLocalVideos();
  return list.find((v) => v.id === idOrUrl || v.remoteUrl === idOrUrl || v.googleDriveId === idOrUrl) || null;
}

/**
 * Downloads a video from Google Drive / URL to local device storage with progress callback.
 */
export async function downloadVideoToLocal(
  remoteUrl: string,
  title: string,
  googleDriveId?: string,
  thumbnailUrl?: string,
  onProgress?: (progressPercent: number, bytesWritten: number, totalBytes: number) => void
): Promise<LocalVideoItem> {
  const videosDir = getVideosDirectory();
  const safeName = `${Date.now()}_${sanitizeFileName(title)}`;
  const destinationFile = new File(videosDir, safeName);

  let downloadedFile: File;

  try {
    downloadedFile = await File.downloadFileAsync(remoteUrl, destinationFile, {
      idempotent: true,
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
    console.error('Error during video download:', error);
    // Cleanup if partial file exists
    try {
      if (destinationFile.exists) {
        destinationFile.delete();
      }
    } catch {}
    throw error;
  }

  const newItem: LocalVideoItem = {
    id: googleDriveId || `vid_${Date.now()}`,
    title,
    localUri: downloadedFile.uri,
    sizeBytes: downloadedFile.size ?? 0,
    downloadedAt: Date.now(),
    remoteUrl,
    googleDriveId,
    thumbnailUrl,
  };

  // Save to index
  const currentList = await getLocalVideos();
  const updatedList = [newItem, ...currentList.filter((v) => v.id !== newItem.id)];
  await AsyncStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(updatedList));

  return newItem;
}

/**
 * Deletes a video file from local storage and removes it from the index.
 */
export async function deleteLocalVideo(localUriOrId: string): Promise<boolean> {
  try {
    const list = await getLocalVideos();
    const target = list.find((v) => v.id === localUriOrId || v.localUri === localUriOrId);

    if (target) {
      try {
        const file = new File(target.localUri);
        if (file.exists) {
          file.delete();
        }
      } catch (err) {
        console.warn('Could not delete physical file:', err);
      }
      const updatedList = list.filter((v) => v.id !== target.id && v.localUri !== target.localUri);
      await AsyncStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(updatedList));
      return true;
    } else {
      // Direct file path attempt
      try {
        const file = new File(localUriOrId);
        if (file.exists) {
          file.delete();
          return true;
        }
      } catch {}
    }
    return false;
  } catch (error) {
    console.error('Error deleting local video:', error);
    return false;
  }
}

/**
 * Clears all downloaded videos from local storage.
 */
export async function clearAllLocalVideos(): Promise<void> {
  try {
    const dir = getVideosDirectory();
    if (dir.exists) {
      dir.delete();
    }
    await AsyncStorage.removeItem(STORAGE_INDEX_KEY);
  } catch (error) {
    console.error('Error clearing local videos:', error);
  }
}

/**
 * Calculates total storage used by all downloaded videos.
 */
export async function getTotalStorageUsed(): Promise<{ totalBytes: number; formatted: string }> {
  const list = await getLocalVideos();
  const totalBytes = list.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
  return {
    totalBytes,
    formatted: formatBytes(totalBytes),
  };
}
