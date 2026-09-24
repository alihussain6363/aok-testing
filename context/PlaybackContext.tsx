import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type LocalVideoItem,
  getLocalVideos,
  downloadVideoToLocal,
  deleteLocalVideo,
  findLocalVideo,
} from '@/services/downloadManager';
import { type DriveVideoItem } from '@/services/googleDriveService';

export type DeletePreference = 'ask' | 'always_delete' | 'always_keep';

interface DownloadState {
  isDownloading: boolean;
  progressPercent: number;
  bytesWritten: number;
  totalBytes: number;
  title: string;
}

interface PlaybackContextType {
  currentVideo: LocalVideoItem | null;
  previousVideo: LocalVideoItem | null;
  pendingVideo: (LocalVideoItem | DriveVideoItem) | null;
  showDeleteModal: boolean;
  downloadState: DownloadState;
  deletePreference: DeletePreference;
  setDeletePreference: (pref: DeletePreference) => Promise<void>;
  requestPlayVideo: (video: LocalVideoItem | DriveVideoItem) => Promise<void>;
  confirmDeletePreviousAndPlayNext: () => Promise<void>;
  confirmKeepPreviousAndPlayNext: () => Promise<void>;
  cancelNextVideo: () => void;
  deleteCurrentVideoNow: () => Promise<void>;
  refreshLocalVideos: () => Promise<LocalVideoItem[]>;
  localVideos: LocalVideoItem[];
}

const PlaybackContext = createContext<PlaybackContextType | undefined>(undefined);

const PREFERENCE_KEY = '@drive_player_delete_preference';

export const PlaybackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [currentVideo, setCurrentVideo] = useState<LocalVideoItem | null>(null);
  const [previousVideo, setPreviousVideo] = useState<LocalVideoItem | null>(null);
  const [pendingVideo, setPendingVideo] = useState<(LocalVideoItem | DriveVideoItem) | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletePreference, setDeletePreferenceState] = useState<DeletePreference>('ask');
  const [localVideos, setLocalVideos] = useState<LocalVideoItem[]>([]);

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

  const refreshLocalVideos = async (): Promise<LocalVideoItem[]> => {
    const list = await getLocalVideos();
    setLocalVideos(list);
    return list;
  };

  const setDeletePreference = async (pref: DeletePreference) => {
    setDeletePreferenceState(pref);
    await AsyncStorage.setItem(PREFERENCE_KEY, pref);
  };

  /**
   * Helper to ensure the target video is in local storage (downloads it if needed)
   * and starts playback.
   */
  const processAndPlayVideo = async (targetVideo: LocalVideoItem | DriveVideoItem) => {
    let playableItem: LocalVideoItem;

    if ('localUri' in targetVideo) {
      playableItem = targetVideo;
    } else {
      // Check if it was previously downloaded
      const existing = await findLocalVideo(targetVideo.id);
      if (existing) {
        playableItem = existing;
      } else {
        // Download from Google Drive / remote URL to local storage
        setDownloadState({
          isDownloading: true,
          progressPercent: 0,
          bytesWritten: 0,
          totalBytes: targetVideo.sizeBytes || 0,
          title: targetVideo.name,
        });

        try {
          playableItem = await downloadVideoToLocal(
            targetVideo.downloadUrl,
            targetVideo.name,
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
        } finally {
          setDownloadState((prev) => ({ ...prev, isDownloading: false }));
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
    await refreshLocalVideos();

    // Navigate to player tab
    router.push('/(tabs)/player');
  };

  /**
   * Main entry point when user taps ANY video from Google Drive or local list.
   */
  const requestPlayVideo = async (video: LocalVideoItem | DriveVideoItem) => {
    // If we are already playing a video and it's different from the new one
    if (currentVideo && currentVideo.id !== video.id) {
      if (deletePreference === 'always_delete') {
        // Auto delete previous video from local storage
        await deleteLocalVideo(currentVideo.localUri);
        await processAndPlayVideo(video);
        return;
      } else if (deletePreference === 'always_keep') {
        // Keep previous video and play next
        await processAndPlayVideo(video);
        return;
      } else {
        // Show smart prompt asking if user wants to delete previous video
        setPendingVideo(video);
        setShowDeleteModal(true);
        return;
      }
    }

    // No current video or same video
    await processAndPlayVideo(video);
  };

  /**
   * User chose "Delete Previous Video & Play Next" from the modal.
   */
  const confirmDeletePreviousAndPlayNext = async () => {
    if (currentVideo) {
      await deleteLocalVideo(currentVideo.localUri);
    }
    if (pendingVideo) {
      const next = pendingVideo;
      setShowDeleteModal(false);
      await processAndPlayVideo(next);
    }
  };

  /**
   * User chose "Keep Previous Video & Play Next" from the modal.
   */
  const confirmKeepPreviousAndPlayNext = async () => {
    if (pendingVideo) {
      const next = pendingVideo;
      setShowDeleteModal(false);
      await processAndPlayVideo(next);
    }
  };

  const cancelNextVideo = () => {
    setPendingVideo(null);
    setShowDeleteModal(false);
  };

  const deleteCurrentVideoNow = async () => {
    if (currentVideo) {
      await deleteLocalVideo(currentVideo.localUri);
      setCurrentVideo(null);
      await refreshLocalVideos();
    }
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
      }}>
      {children}
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
