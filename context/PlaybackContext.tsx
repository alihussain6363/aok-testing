import React, { createContext, useContext, useState, useEffect } from 'react';
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
import { type DriveItem } from '@/services/googleDriveService';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { MusicPlayerModal } from '@/components/MusicPlayerModal';

export type DeletePreference = 'ask' | 'always_delete' | 'always_keep';

interface DownloadState {
  isDownloading: boolean;
  progressPercent: number;
  bytesWritten: number;
  totalBytes: number;
  title: string;
}

interface PlaybackContextType {
  currentVideo: LocalMediaItem | null;
  previousVideo: LocalMediaItem | null;
  pendingVideo: (LocalMediaItem | DriveItem) | null;
  showDeleteModal: boolean;
  downloadState: DownloadState;
  deletePreference: DeletePreference;
  setDeletePreference: (pref: DeletePreference) => Promise<void>;
  requestPlayVideo: (video: LocalMediaItem | DriveItem) => Promise<void>;
  confirmDeletePreviousAndPlayNext: () => Promise<void>;
  confirmKeepPreviousAndPlayNext: () => Promise<void>;
  cancelNextVideo: () => void;
  deleteCurrentVideoNow: () => Promise<void>;
  refreshLocalVideos: () => Promise<LocalMediaItem[]>;
  localVideos: LocalMediaItem[];
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
  const [pendingVideo, setPendingVideo] = useState<(LocalMediaItem | DriveItem) | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletePreference, setDeletePreferenceState] = useState<DeletePreference>('ask');
  const [localVideos, setLocalVideos] = useState<LocalMediaItem[]>([]);

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

  // Load preferences and initial local videos list
  useEffect(() => {
    (async () => {
      try {
        const savedPref = await AsyncStorage.getItem(PREFERENCE_KEY);
        if (savedPref) {
          setDeletePreferenceState(savedPref as DeletePreference);
        }
      } catch {}
      refreshLocalVideos();
    })();
  }, []);

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
   * Starts playback instantly via high-quality stream while downloading
   * in the background for permanent offline smoothness.
   */
  const processAndPlayVideo = async (targetVideo: LocalMediaItem | DriveItem) => {
    let playableItem: LocalMediaItem;

    if ('localUri' in targetVideo) {
      playableItem = targetVideo;
    } else {
      // Check if it was previously downloaded
      const existing = await findLocalMedia(targetVideo.id);
      if (existing) {
        playableItem = existing;
      } else {
        // Instant streaming playable item: starts right away!
        playableItem = {
          id: targetVideo.id,
          title: targetVideo.name,
          localUri: targetVideo.downloadUrl,
          sizeBytes: targetVideo.sizeBytes || 0,
          downloadedAt: Date.now(),
          remoteUrl: targetVideo.downloadUrl,
          googleDriveId: targetVideo.id,
          thumbnailUrl: targetVideo.thumbnailUrl,
          mediaKind: 'video',
        };

        // Start background download for caching and smooth performance
        (async () => {
          setDownloadState({
            isDownloading: true,
            progressPercent: 0,
            bytesWritten: 0,
            totalBytes: targetVideo.sizeBytes || 0,
            title: targetVideo.name,
          });

          try {
            const downloaded = await downloadMediaToLocal(
              targetVideo.downloadUrl,
              targetVideo.name,
              'video',
              targetVideo.id,
              targetVideo.thumbnailUrl,
              (percent, written, total) => {
                setDownloadState({
                  isDownloading: true,
                  progressPercent: percent,
                  bytesWritten: written,
                  totalBytes: total,
                  title: targetVideo.name,
                });
              }
            );
            await refreshLocalVideos();
          } catch (err) {
            console.warn('Background video caching notice:', err);
          } finally {
            setDownloadState((prev) => ({ ...prev, isDownloading: false }));
          }
        })();
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

  const requestPlayVideo = async (targetVideo: LocalMediaItem | DriveItem) => {
    // If a video is already playing and preference is 'ask', prompt user
    if (currentVideo && currentVideo.id !== targetVideo.id) {
      if (deletePreference === 'ask') {
        setPendingVideo(targetVideo);
        setShowDeleteModal(true);
        return;
      } else if (deletePreference === 'always_delete') {
        // Auto-delete previous from local phone storage only
        await deleteLocalMedia(currentVideo.localUri);
        await processAndPlayVideo(targetVideo);
        return;
      }
    }

    await processAndPlayVideo(targetVideo);
  };

  const confirmDeletePreviousAndPlayNext = async () => {
    if (currentVideo) {
      await deleteLocalMedia(currentVideo.localUri);
    }
    if (pendingVideo) {
      const next = pendingVideo;
      setPendingVideo(null);
      await processAndPlayVideo(next);
    }
  };

  const confirmKeepPreviousAndPlayNext = async () => {
    if (pendingVideo) {
      const next = pendingVideo;
      setPendingVideo(null);
      await processAndPlayVideo(next);
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

  // Music Player Launcher
  const requestPlayAudio = (item: DriveItem, playlist?: DriveItem[]) => {
    const list = playlist && playlist.length > 0 ? playlist : [item];
    const initialIdx = list.findIndex((i) => i.id === item.id);
    setMusicPlaylist(list);
    setMusicIndex(initialIdx >= 0 ? initialIdx : 0);
    setMusicModalVisible(true);
  };

  // Image Viewer Launcher
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
        requestPlayAudio,
        requestViewImages,
      }}>
      {children}

      {/* Global Image Viewer Modal */}
      <ImageViewerModal
        visible={imageModalVisible}
        images={imageGallery}
        initialIndex={imageIndex}
        onClose={() => setImageModalVisible(false)}
      />

      {/* Global Music Player Modal */}
      <MusicPlayerModal
        visible={musicModalVisible}
        playlist={musicPlaylist}
        currentIndex={musicIndex}
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
