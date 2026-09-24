export interface DriveVideoItem {
  id: string;
  name: string;
  sizeBytes?: number;
  mimeType?: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  source: 'google_drive' | 'demo';
  description?: string;
}

/**
 * Extracts a Google Drive file ID from various URL formats or returns the raw ID.
 * Supports:
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID
 * - Direct ID
 */
export function extractDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check for /file/d/ID pattern
  const fileDPattern = /\/file\/d\/([a-zA-Z0-9_-]+)/;
  const matchD = trimmed.match(fileDPattern);
  if (matchD && matchD[1]) return matchD[1];

  // Check for id=ID query parameter
  const idQueryPattern = /[?&]id=([a-zA-Z0-9_-]+)/;
  const matchQuery = trimmed.match(idQueryPattern);
  if (matchQuery && matchQuery[1]) return matchQuery[1];

  // If input contains no slashes or protocols and looks like an ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Builds a direct download URL from a Google Drive File ID.
 */
export function buildDriveDownloadUrl(fileId: string, accessToken?: string): string {
  if (accessToken) {
    return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }
  // Public drive direct stream / download link
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

/**
 * Fetches video files from Google Drive using an OAuth Access Token.
 */
export async function fetchGoogleDriveVideos(accessToken: string): Promise<DriveVideoItem[]> {
  const query = encodeURIComponent("mimeType contains 'video/' and trashed = false");
  const fields = encodeURIComponent('files(id, name, mimeType, size, thumbnailLink, createdTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=30`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const files: any[] = data.files || [];

  return files.map((file) => ({
    id: file.id,
    name: file.name,
    sizeBytes: file.size ? parseInt(file.size, 10) : undefined,
    mimeType: file.mimeType || 'video/mp4',
    downloadUrl: buildDriveDownloadUrl(file.id, accessToken),
    thumbnailUrl: file.thumbnailLink,
    source: 'google_drive',
  }));
}

/**
 * Curated sample videos ready to download and play immediately.
 * Users can test downloading to local storage, playing, and the smart delete-previous-video flow.
 */
export const SAMPLE_VIDEOS: DriveVideoItem[] = [
  {
    id: 'sample_big_buck_bunny',
    name: 'Big Buck Bunny (Sample)',
    sizeBytes: 5510872, // ~5.5 MB
    mimeType: 'video/mp4',
    downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    source: 'demo',
    description: 'Blender Foundation open animated movie (HD)',
  },
  {
    id: 'sample_elephants_dream',
    name: "Elephant's Dream (Sample)",
    sizeBytes: 4200192, // ~4.2 MB
    mimeType: 'video/mp4',
    downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
    source: 'demo',
    description: 'The world\'s first open movie project',
  },
  {
    id: 'sample_for_bigger_blazes',
    name: 'For Bigger Blazes (Sample)',
    sizeBytes: 3100450, // ~3.1 MB
    mimeType: 'video/mp4',
    downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg',
    source: 'demo',
    description: 'High energy action clip demonstration',
  },
  {
    id: 'sample_tears_of_steel',
    name: 'Tears of Steel (Sample)',
    sizeBytes: 6800000, // ~6.8 MB
    mimeType: 'video/mp4',
    downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
    source: 'demo',
    description: 'Sci-fi visual effects open film',
  },
];
