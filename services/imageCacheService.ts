import { Directory, File, Paths } from 'expo-file-system';
import { getValidAccessToken, buildDriveDownloadUrl, type DriveItem } from '@/services/googleDriveService';

/**
 * Ensures the image cache directory exists in document/cache storage.
 */
function getImageCacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'drive_images_cache');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * Returns a guaranteed local file URI for a Google Drive image.
 * If already cached or local, returns immediately.
 * Otherwise downloads it with Bearer token authentication and returns the local file URI.
 */
export async function getOrFetchCachedImage(item: DriveItem): Promise<string> {
  if (!item || !item.id) return '';

  // If it's already a local file
  if (item.downloadUrl && item.downloadUrl.startsWith('file://')) {
    return item.downloadUrl;
  }

  const cacheDir = getImageCacheDir();
  const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cachedFile = new File(cacheDir, `${safeId}.jpg`);

  // If already downloaded and exists, return immediately
  if (cachedFile.exists && (cachedFile.size ?? 0) > 0) {
    return cachedFile.uri;
  }

  // Otherwise, fetch using service account Bearer token
  try {
    const token = await getValidAccessToken();
    const cleanUrl = buildDriveDownloadUrl(item.id);

    await File.downloadFileAsync(cleanUrl, cachedFile, {
      idempotent: true,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (cachedFile.exists) {
      return cachedFile.uri;
    }
  } catch (err) {
    console.warn(`Could not cache image ${item.id} via auth token:`, err);
  }

  // Fallback to thumbnailUrl if available
  if (item.thumbnailUrl) {
    return item.thumbnailUrl;
  }

  return item.downloadUrl;
}

/**
 * Pre-fetches the next and previous image in background for instant swiping.
 */
export async function prefetchNeighborImages(images: DriveItem[], currentIndex: number) {
  const neighbors = [
    images[currentIndex - 1],
    images[currentIndex + 1],
  ].filter(Boolean);

  for (const neighbor of neighbors) {
    getOrFetchCachedImage(neighbor).catch(() => {});
  }
}
