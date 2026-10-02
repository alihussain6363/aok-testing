import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type LocalMediaItem,
  type LocalVideoItem,
  getLocalVideos,
  getLocalAudio,
  getLocalImages,
  getLocalMedia,
  downloadMediaToLocal,
  deleteLocalMedia,
  findLocalMedia,
} from '@/services/downloadManager';
import { type DriveItem, getValidAccessToken } from '@/services/googleDriveService';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { MusicPlayerModal } from '@/components/MusicPlayerModal';

export type DeletePreference = 'ask' | 'always_delete' | 'always_keep';
export type PlaybackMode = 'stream' | 'stream_and_download' | 'download_only';

export interface DownloadState {
  isDownloading: boolean;
  progressPercent: number;
  bytesWritten: number;
  totalBytes: number;
  title: string;
}

export type PlayableVideo = LocalMediaItem | DriveItem;

interface PlaybackContextType {
  currentVideo: LocalMediaItem | null;
  previousVideo: LocalMediaItem | null;
  pendingVideo: PlayableVideo | null;
  showDeleteModal: boolean;
  downloadState: DownloadState;
  deletePreference: DeletePreference;
  setDeletePreference: (pref: DeletePreference) => Promise<void>;
  requestPlayVideo: (video: PlayableVideo, playlist?: PlayableVideo[], mode?: PlaybackMode) => Promise<void>;
  confirmDeletePreviousAndPlayNext: () => Promise<void>;
  confirmKeepPreviousAndPlayNext: () => Promise<void>;
  cancelNextVideo: () => void;
  deleteCurrentVideoNow: () => Promise<void>;
  refreshLocalVideos: () => Promise<LocalMediaItem[]>;
  localVideos: LocalMediaItem[];
  // Active Folder Continuous Playlist
  activeFolderPlaylist: PlayableVideo[];
  activeFolderIndex: number;
  playNextVideoInFolder: () => Promise<void>;
  playPrevVideoInFolder: () => Promise<void>;
  // Auth Token for media requests
  authToken: string | null;
  getAuthToken: () => Promise<string>;
  // Music & Image player methods
  requestPlayAudio: (item: DriveItem, playlist?: DriveItem[]) => void;
  requestViewImages: (images: DriveItem[], initialIndex?: number) => void;
}

const PlaybackContext = createContext<PlaybackContextType | undefined>(undefined);

const PREFERENCE_KEY = '@drive_player_delete_preference';

export const PlaybackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [currentVideo, setCurrentVideo] = useState<LocalMediaItem | null>(null);
  const [previousVideo, setPreviousVideo] = useState<LocalMediaItem | null>(null);
  const [pendingVideo, setPendingVideo] = useState<PlayableVideo | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletePreference, setDeletePreferenceState] = useState<DeletePreference>('ask');
  const [localVideos, setLocalVideos] = useState<LocalMediaItem[]>([]);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // In-Folder Playlist State
  const [activeFolderPlaylist, setActiveFolderPlaylist] = useState<PlayableVideo[]>([]);
  const [activeFolderIndex, setActiveFolderIndex] = useState<number>(0);

  // Music Player State
  const [musicModalVisible, setMusicModalVisible] = useState(false);
  const [musicPlaylist, setMusicPlaylist] = useState<DriveItem[]>([]);
  const [musicIndex, setMusicIndex] = useState(0);

  // Image Viewer State
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [imageGallery, setImageGallery] = useState<DriveItem[]>([]);
  const [imageIndex, setImageIndex] = useState(0);

  const [downloadState, setDownloadState] = useState<DownloadState>({
    isDownloading: false,
    progressPercent: 0,
    bytesWritten: 0,
    totalBytes: 0,
    title: '',
  });

  const fetchAuthToken = useCallback(async (): Promise<string> => {
    try {
      const token = await getValidAccessToken();
      setAuthToken(token);
      return token;
    } catch (e) {
      console.warn('PlaybackContext: could not fetch auth token', e);
      return '';
    }
  }, []);

  // Load preferences, token, and local items on mount
  useEffect(() => {
    (async () => {
      try {
        const savedPref = await AsyncStorage.getItem(PREFERENCE_KEY);
        if (savedPref) {
          setDeletePreferenceState(savedPref as DeletePreference);
        }
      } catch {}
      await refreshLocalVideos();
      await fetchAuthToken();
    })();
  }, [fetchAuthToken]);

  const refreshLocalVideos = async (): Promise<LocalMediaItem[]> => {
    const list = await getLocalVideos();
    setLocalVideos(list);
    return list;
  };

  const setDeletePreference = async (pref: DeletePreference) => {
    setDeletePreferenceState(pref);
    await AsyncStorage.setItem(PREFERENCE_KEY, pref);
  };

  /**
   * Starts playback via high-quality direct stream and optionally downloads in background.
   */
  const processAndPlayVideo = async (
    targetVideo: PlayableVideo,
    playlist?: PlayableVideo[],
    mode: PlaybackMode = 'stream'
  ) => {
    // If user selected "download_only", start background download and return without navigating
    if (mode === 'download_only') {
      const remoteUrl = 'downloadUrl' in targetVideo ? targetVideo.downloadUrl : targetVideo.remoteUrl;
      const title = 'name' in targetVideo ? targetVideo.name : targetVideo.title;
      const gId = 'id' in targetVideo ? targetVideo.id : undefined;

      setDownloadState({
        isDownloading: true,
        progressPercent: 0,
        bytesWritten: 0,
        totalBytes: targetVideo.sizeBytes || 0,
        title,
      });

      downloadMediaToLocal(
        remoteUrl,
        title,
        'video',
        gId,
        targetVideo.thumbnailUrl,
        (percent, written, total) => {
          setDownloadState({
            isDownloading: true,
            progressPercent: percent,
            bytesWritten: written,
            totalBytes: total,
            title,
          });
        }
      )
        .then(async () => {
          await refreshLocalVideos();
        })
        .catch((err) => {
          console.warn('Background download failed:', err);
        })
        .finally(() => {
          setDownloadState((prev) => ({ ...prev, isDownloading: false }));
        });

      return;
    }

    // Update in-folder playlist
    if (playlist && playlist.length > 0) {
      setActiveFolderPlaylist(playlist);
      const targetId = 'id' in targetVideo ? targetVideo.id : '';
      const foundIdx = playlist.findIndex((p) => ('id' in p ? p.id === targetId : false));
      setActiveFolderIndex(foundIdx >= 0 ? foundIdx : 0);
    }

    let playableItem: LocalMediaItem;

    if ('localUri' in targetVideo && targetVideo.localUri.startsWith('file://')) {
      playableItem = targetVideo as LocalMediaItem;
    } else {
      // Check if it was already downloaded to local storage
      const existing = await findLocalMedia(targetVideo.id);
      if (existing) {
        playableItem = existing;
      } else {
        const streamUrl = 'downloadUrl' in targetVideo ? targetVideo.downloadUrl : (targetVideo as LocalMediaItem).remoteUrl;
        const videoTitle = 'name' in targetVideo ? targetVideo.name : (targetVideo as LocalMediaItem).title;

        playableItem = {
          id: targetVideo.id,
          title: videoTitle,
          localUri: streamUrl,
          sizeBytes: targetVideo.sizeBytes || 0,
          downloadedAt: Date.now(),
          remoteUrl: streamUrl,
          googleDriveId: targetVideo.id,
          thumbnailUrl: targetVideo.thumbnailUrl,
          mediaKind: 'video',
        };

        // If mode is 'stream_and_download', download in background while streaming
        if (mode === 'stream_and_download') {
          setDownloadState({
            isDownloading: true,
            progressPercent: 0,
            bytesWritten: 0,
            totalBytes: targetVideo.sizeBytes || 0,
            title: videoTitle,
          });

          downloadMediaToLocal(
            streamUrl,
            videoTitle,
            'video',
            targetVideo.id,
            targetVideo.thumbnailUrl,
            (percent, written, total) => {
              setDownloadState({
                isDownloading: true,
                progressPercent: percent,
                bytesWritten: written,
                totalBytes: total,
                title: videoTitle,
              });
            }
          )
            .then(async (downloaded) => {
              await refreshLocalVideos();
              // If the user is still watching this exact video, seamlessly point to local file
              setCurrentVideo((prev) => {
                if (prev && prev.id === downloaded.id) {
                  return downloaded;
                }
                return prev;
              });
            })
            .catch((err) => {
              console.warn('Background video caching notice:', err);
            })
            .finally(() => {
              setDownloadState((prev) => ({ ...prev, isDownloading: false }));
            });
        }
      }
    }

    // Set new video as current
    if (currentVideo && currentVideo.id !== playableItem.id) {
      setPreviousVideo(currentVideo);
    }
    setCurrentVideo(playableItem);
    setPendingVideo(null);
    setShowDeleteModal(false);

    // Navigate to player tab
    router.push('/(tabs)/player');
  };

  const requestPlayVideo = async (
    targetVideo: PlayableVideo,
    playlist?: PlayableVideo[],
    mode: PlaybackMode = 'stream'
  ) => {
    // If downloading only, process immediately without delete prompt
    if (mode === 'download_only') {
      await processAndPlayVideo(targetVideo, playlist, mode);
      return;
    }

    // If a video is already playing and preference is 'ask', prompt user
    if (currentVideo && currentVideo.id !== targetVideo.id) {
      if (deletePreference === 'ask') {
        setPendingVideo(targetVideo);
        if (playlist) setActiveFolderPlaylist(playlist);
        setShowDeleteModal(true);
        return;
      } else if (deletePreference === 'always_delete') {
        // Auto-delete previous from local phone storage only
        await deleteLocalMedia(currentVideo.localUri);
        await processAndPlayVideo(targetVideo, playlist, mode);
        return;
      }
    }

    await processAndPlayVideo(targetVideo, playlist, mode);
  };

  const playNextVideoInFolder = async () => {
    if (activeFolderPlaylist.length <= 1) return;
    const nextIdx = (activeFolderIndex + 1) % activeFolderPlaylist.length;
    setActiveFolderIndex(nextIdx);
    const nextItem = activeFolderPlaylist[nextIdx];
    await processAndPlayVideo(nextItem, activeFolderPlaylist, 'stream');
  };

  const playPrevVideoInFolder = async () => {
    if (activeFolderPlaylist.length <= 1) return;
    const prevIdx = activeFolderIndex - 1 < 0 ? activeFolderPlaylist.length - 1 : activeFolderIndex - 1;
    setActiveFolderIndex(prevIdx);
    const prevItem = activeFolderPlaylist[prevIdx];
    await processAndPlayVideo(prevItem, activeFolderPlaylist, 'stream');
  };

  const confirmDeletePreviousAndPlayNext = async () => {
    if (currentVideo) {
      await deleteLocalMedia(currentVideo.localUri);
    }
    if (pendingVideo) {
      const next = pendingVideo;
      setPendingVideo(null);
      await processAndPlayVideo(next, activeFolderPlaylist, 'stream');
    }
  };

  const confirmKeepPreviousAndPlayNext = async () => {
    if (pendingVideo) {
      const next = pendingVideo;
      setPendingVideo(null);
      await processAndPlayVideo(next, activeFolderPlaylist, 'stream');
    }
  };

  const cancelNextVideo = () => {
    setPendingVideo(null);
    setShowDeleteModal(false);
  };

  const deleteCurrentVideoNow = async () => {
    if (currentVideo) {
      await deleteLocalMedia(currentVideo.localUri);
      setCurrentVideo(null);
      await refreshLocalVideos();
    }
  };

  // Music Player Launcher (with in-folder continuous playlist)
  const requestPlayAudio = (item: DriveItem, playlist?: DriveItem[]) => {
    const list = playlist && playlist.length > 0 ? playlist : [item];
    const initialIdx = list.findIndex((i) => i.id === item.id);
    setMusicPlaylist(list);
    setMusicIndex(initialIdx >= 0 ? initialIdx : 0);
    setMusicModalVisible(true);
  };

  // Image Viewer Launcher (with in-folder continuous gallery)
  const requestViewImages = (images: DriveItem[], initialIndex = 0) => {
    setImageGallery(images);
    setImageIndex(initialIndex);
    setImageModalVisible(true);
  };

  return (
    <PlaybackContext.Provider
      value={{
        currentVideo,
        previousVideo,
        pendingVideo,
        showDeleteModal,
        downloadState,
        deletePreference,
        setDeletePreference,
        requestPlayVideo,
        confirmDeletePreviousAndPlayNext,
        confirmKeepPreviousAndPlayNext,
        cancelNextVideo,
        deleteCurrentVideoNow,
        refreshLocalVideos,
        localVideos,
        activeFolderPlaylist,
        activeFolderIndex,
        playNextVideoInFolder,
        playPrevVideoInFolder,
        authToken,
        getAuthToken: fetchAuthToken,
        requestPlayAudio,
        requestViewImages,
      }}>
      {children}

      {/* Global Image Viewer Modal */}
      <ImageViewerModal
        visible={imageModalVisible}
        images={imageGallery}
        initialIndex={imageIndex}
        authToken={authToken}
        onClose={() => setImageModalVisible(false)}
      />

      {/* Global Music Player Modal */}
      <MusicPlayerModal
        visible={musicModalVisible}
        playlist={musicPlaylist}
        currentIndex={musicIndex}
        authToken={authToken}
        onClose={() => setMusicModalVisible(false)}
        onTrackChange={(idx) => setMusicIndex(idx)}
      />
    </PlaybackContext.Provider>
  );
};

export const usePlayback = (): PlaybackContextType => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
};
