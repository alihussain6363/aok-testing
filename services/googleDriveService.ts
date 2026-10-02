import forge from 'node-forge';

export type MediaKind = 'folder' | 'video' | 'audio' | 'image' | 'other';

export interface DriveItem {
  id: string;
  name: string;
  isFolder: boolean;
  kind: MediaKind;
  sizeBytes?: number;
  mimeType?: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  source: 'google_drive' | 'demo';
  description?: string;
  parentId?: string;
}

export type DriveVideoItem = DriveItem;

export const SERVICE_ACCOUNT = {
  client_email: 'drive-api-service@drive-access-510216.iam.gserviceaccount.com',
  private_key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQClrYyZarUiou4q
btLHw+35UogskZUSIyAezKw1bYuVB38JX0coEV4GBnIFlX7lszQZbgEE5sgFA+jt
ijkBUxNu3dOpvapbgVUFTCF1H+YJfeORnz0lYsORkbJnGqQC7QYHW0Xxrsu75TLi
SAiU3gl3ZKoMMIGlpwH30oZ/bI6G6Kl+e5zeDLxY4zdelnVdP1UjnoLbsReTUfKU
MRjtKtasEmKUBvw79ACQ06Yhtu2FESvL2BFx1zjkYU8BTt7VTBWqjnlOM6zTYIb8
fg8hxl+0JmTZIIxXaianLBg0/SFBkD7qYAdQHvU0mlFiqe4DemfjZcV/4Iu3DBYn
8g3PPbafAgMBAAECggEAGubawSCIB/c/x+kV1bUVQ5oonWAIPhkxAn9GaSh/9TNx
58IuSi3DwCO0yP5UzBR0nbp0dOjKSrIvVL7QccwdCDAByfqPmmseNI1/k0aaMilc
Vc1u/s6SJeVr+/zh682z4GbsLQmucDSPthlvN0j0bYwNZoxLyOuc0LJA/5jPbc0/
r/yopML3mbL3mcsRSu7nr8ZWMTwqK4BTKm5EDQjLAmY3xHziMn1XHVIWnbyIVnhG
9tnS8iNZFlADL2AvJ9mM94yLS0ua31fV5wmZJvsCDTEBur4/HrOGhs5cWvPtpOLl
l8E84n8AeFvNQfcAAgY2AD1X3T7CYmf8tVZgfo15RQKBgQDRpoVYgenUooiG5XsV
tEDeKNH+jBidmWx/dZW67ZlwYjqIYmMeQKTiUSNyyBEShvx7HI4+tSizw4tHMIWw
C8p6+0CgNUYAKDNicL1UT83F2aAxDhEbf/oYlWNEm6crOQgW+X3oQnZVJqLjCK19
nr0ygREI7QOER6svrwOJUO7OfQKBgQDKTlZDK8eTs74SmCXrpXoaAg0rkFX2Oa7T
JeK+eIFK4hfKij/h/Xw77lLNPthWNg7hzjfq9o4iXABShspZSFcvPrGzCx9MrvXU
koAxZOHCIcFAZJdUJKHiD8pcwEPLvvoylRlKyG0S0hhA8zKIBEQngSnaWpRi9HzW
5l0lh/GYSwKBgQC7Ultg6qtAV30/crmYefdfyP9gvlKcNmKwPCLt47Aur0X3aFmB
xWbN5IuU2lgOwtfDNI+QThOxEy5WDG/XDaH8YpSq0Q7bww+ujGdOdwO4HSw5yITW
mnGfF5Ob0Kv8PbgRtxidtwy+Johx7OX/ER+hiZrr68Ixpku5jlnNjqfhjQKBgGnP
QRTOwAqDdwU4qJSwLsWNjx/a1Or8TnDHHumqE018JR9c4X6sWp7pzkrk9LdafLwj
ZGGy5LIZ1l1TfF/oExl1u/E9/vfXhmHQ4dVzwxQLHY01T2TF6BlZUujh8lONJkTw
cJMJcurmEaNez24OdSsIRkCbIYMEBotLXypzCKwzAoGAVj3logt8UocRtQLOUwqT
UkTbVJwGYoj8J3LU8kvpH1cDF9D7xH3EGjOMjcgFjKZIEv9BRcmyGV2bBHA/kxKk
L/Qh0K7fAQQXMSjr8ZIanNnEZhob76Zty1sMuEttwt687sfMsSYt6PniFUB0qL5R
9anEqamqOZZNNOX7mDoVTLk=
-----END PRIVATE KEY-----`,
};

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

function base64url(bytes: string): string {
  return forge.util.encode64(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Classifies an item into video, audio, image, folder, or other.
 */
export function detectMediaKind(mimeType?: string, name?: string): MediaKind {
  if (mimeType === 'application/vnd.google-apps.folder') return 'folder';
  const lowerName = (name || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (
    lowerMime.includes('video/') ||
    lowerName.endsWith('.mp4') ||
    lowerName.endsWith('.mkv') ||
    lowerName.endsWith('.ts') ||
    lowerName.endsWith('.avi') ||
    lowerName.endsWith('.mov') ||
    lowerName.endsWith('.webm') ||
    lowerName.endsWith('.m4v') ||
    lowerName.endsWith('.flv') ||
    lowerName.endsWith('.3gp')
  ) {
    return 'video';
  }

  if (
    lowerMime.includes('audio/') ||
    lowerName.endsWith('.mp3') ||
    lowerName.endsWith('.wav') ||
    lowerName.endsWith('.flac') ||
    lowerName.endsWith('.m4a') ||
    lowerName.endsWith('.aac') ||
    lowerName.endsWith('.ogg') ||
    lowerName.endsWith('.opus') ||
    lowerName.endsWith('.wma')
  ) {
    return 'audio';
  }

  if (
    lowerMime.includes('image/') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.gif') ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.bmp')
  ) {
    return 'image';
  }

  return 'other';
}

/**
 * Generates and returns a valid Google OAuth access token using the Service Account key.
 */
export async function getValidAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedAccessToken && tokenExpiresAt > now + 300) {
    return cachedAccessToken;
  }

  try {
    const header = base64url(forge.util.encodeUtf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const claim = base64url(
      forge.util.encodeUtf8(
        JSON.stringify({
          iss: SERVICE_ACCOUNT.client_email,
          scope: 'https://www.googleapis.com/auth/drive',
          aud: 'https://oauth2.googleapis.com/token',
          exp: now + 3600,
          iat: now,
        })
      )
    );

    const pkey = forge.pki.privateKeyFromPem(SERVICE_ACCOUNT.private_key);
    const md = forge.md.sha256.create();
    md.update(header + '.' + claim, 'utf8');
    const sig = pkey.sign(md);
    const jwt = header + '.' + claim + '.' + base64url(sig);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to authenticate service account (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('Google OAuth did not return an access token');
    }

    cachedAccessToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600);
    return data.access_token;
  } catch (error: any) {
    console.error('Error getting Google Service Account token:', error);
    throw error;
  }
}

/**
 * Extracts a Google Drive file ID from various URL formats or returns the raw ID.
 */
export function extractDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fileDPattern = /\/file\/d\/([a-zA-Z0-9_-]+)/;
  const matchD = trimmed.match(fileDPattern);
  if (matchD && matchD[1]) return matchD[1];

  const idQueryPattern = /[?&]id=([a-zA-Z0-9_-]+)/;
  const matchQuery = trimmed.match(idQueryPattern);
  if (matchQuery && matchQuery[1]) return matchQuery[1];

  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Builds the official Google Drive direct media URL.
 * Requests must supply 'Authorization: Bearer <token>' header for authentication.
 */
export function buildDriveDownloadUrl(fileId: string): string {
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
}

/**
 * Fetches all items (folders, videos, music, images) from Google Drive.
 * Top-level lists all shared folders and files; navigating into a folder lists its contents.
 */
export async function fetchDriveItems(folderId?: string): Promise<{
  items: DriveItem[];
  folderName?: string;
}> {
  const accessToken = await getValidAccessToken();

  let query: string;
  if (folderId && folderId !== 'root') {
    query = `'${folderId}' in parents and trashed = false`;
  } else {
    // Top-level: all folders and items shared directly with the service account
    query = `sharedWithMe = true and trashed = false`;
  }

  const fields = encodeURIComponent('files(id, name, mimeType, size, thumbnailLink, parents, createdTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${fields}&pageSize=150&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=folder,name`;

  let response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errorText}`);
  }

  let data = await response.json();
  let rawFiles: any[] = data.files || [];

  // Fallback for root if sharedWithMe returned 0 (in case items are owned or organized differently)
  if ((!folderId || folderId === 'root') && rawFiles.length === 0) {
    const fallbackUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent('trashed = false')}&fields=${fields}&pageSize=150&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=folder,name`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      rawFiles = fbData.files || [];
    }
  }

  const items: DriveItem[] = rawFiles.map((file) => {
    const kind = detectMediaKind(file.mimeType, file.name);
    const isFolder = kind === 'folder';

    // For images, thumbnailLink can be upgraded to high resolution (=s1600)
    let highResThumb = file.thumbnailLink;
    if (highResThumb && kind === 'image') {
      highResThumb = highResThumb.replace(/=s\d+/, '=s1600');
    }

    return {
      id: file.id,
      name: file.name,
      isFolder,
      kind,
      sizeBytes: file.size ? parseInt(file.size, 10) : undefined,
      mimeType: file.mimeType,
      downloadUrl: buildDriveDownloadUrl(file.id),
      thumbnailUrl: highResThumb || file.thumbnailLink,
      source: 'google_drive',
      parentId: file.parents && file.parents.length > 0 ? file.parents[0] : undefined,
    };
  });

  // Sort folders first, then alphabetically by name
  items.sort((a, b) => {
    if (a.isFolder === b.isFolder) {
      return a.name.localeCompare(b.name);
    }
    return a.isFolder ? -1 : 1;
  });

  let folderName: string | undefined;
  if (folderId && folderId !== 'root') {
    try {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        folderName = meta.name;
      }
    } catch {}
  }

  return { items, folderName };
}

/**
 * Backward compatibility helper that returns video items only.
 */
export async function fetchGoogleDriveVideos(customToken?: string): Promise<DriveVideoItem[]> {
  const { items } = await fetchDriveItems();
  return items.filter((item) => item.kind === 'video');
}

/**
 * Curated sample videos ready to download and play immediately.
 */
export const SAMPLE_VIDEOS: DriveVideoItem[] = [
  {
    id: 'sample_big_buck_bunny',
    name: 'Big Buck Bunny (Sample)',
    isFolder: false,
    kind: 'video',
    sizeBytes: 5510872,
    mimeType: 'video/mp4',
    downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    source: 'demo',
    description: 'Blender Foundation open animated movie (HD)',
  },
  {
    id: 'sample_elephants_dream',
    name: "Elephant's Dream (Sample)",
    isFolder: false,
    kind: 'video',
    sizeBytes: 4200192,
    mimeType: 'video/mp4',
    downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
    source: 'demo',
    description: "The world's first open movie project",
  },
  {
    id: 'sample_for_bigger_blazes',
    name: 'For Bigger Blazes (Sample)',
    isFolder: false,
    kind: 'video',
    sizeBytes: 3100450,
    mimeType: 'video/mp4',
    downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg',
    source: 'demo',
    description: 'High energy action clip demonstration',
  },
  {
    id: 'sample_tears_of_steel',
    name: 'Tears of Steel (Sample)',
    isFolder: false,
    kind: 'video',
    sizeBytes: 6800000,
    mimeType: 'video/mp4',
    downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
    source: 'demo',
    description: 'Sci-fi visual effects open film',
  },
];
