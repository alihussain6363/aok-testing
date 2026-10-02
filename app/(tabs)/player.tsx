import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  Modal,
  StatusBar,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
  BackHandler,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback, type PlayableVideo } from '@/context/PlaybackContext';
import { formatBytes } from '@/services/downloadManager';
import { SAMPLE_VIDEOS } from '@/services/googleDriveService';
import {
  saveWatchProgress,
  getWatchProgress,
  getRecentVideos,
  type RecentVideoItem,
} from '@/services/watchHistoryManager';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type VideoQuality = 'Original (HD)' | '1080p' | '720p' | '480p' | 'Auto';

export default function PlayerScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const {
    currentVideo,
    requestPlayVideo,
    deleteCurrentVideoNow,
    localVideos,
    downloadState,
    activeFolderPlaylist,
    activeFolderIndex,
    playNextVideoInFolder,
    playPrevVideoInFolder,
    authToken,
    getAuthToken,
  } = usePlayback();

  // Playback States
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [contentFit, setContentFit] = useState<'contain' | 'cover'>('contain');
  const [isLocked, setIsLocked] = useState(false);

  // On-Screen Controls & Fullscreen States
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('Original (HD)');
  const [showQualityModal, setShowQualityModal] = useState(false);

  // Resume Playback States
  const [resumePromptPos, setResumePromptPos] = useState<number | null>(null);
  const [recentVideos, setRecentVideos] = useState<RecentVideoItem[]>([]);

  // Gesture HUD States
  const [hudType, setHudType] = useState<'volume' | 'seek' | null>(null);
  const [hudValue, setHudValue] = useState<number>(0);
  const [seekDelta, setSeekDelta] = useState<number>(0);
  const [seekTarget, setSeekTarget] = useState<number>(0);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const lastTapRef = useRef<number>(0);
  const startVolumeRef = useRef<number>(volume);
  const startPosRef = useRef<number>(currentTime);
  const gestureModeRef = useRef<'none' | 'vertical_right' | 'horizontal'>('none');
  const isGestureActiveRef = useRef<boolean>(false);

  // Helper to build source with Google Drive auth header
  const buildVideoSource = (video: typeof currentVideo, token: string | null) => {
    if (!video || !video.localUri) return null;
    if (video.localUri.startsWith('file://')) {
      return video.localUri;
    }
    const isGoogleApi = video.localUri.includes('googleapis.com');
    if (isGoogleApi && token) {
      return {
        uri: video.localUri,
        headers: { Authorization: `Bearer ${token}` },
      };
    }
    return video.localUri;
  };

  // Initialize expo-video player
  const player = useVideoPlayer(currentVideo ? (buildVideoSource(currentVideo, authToken) as any) : null, (p) => {
    p.loop = false;
    p.play();
  });

  // Load Recent Videos on mount and video changes
  const refreshRecentHistory = useCallback(async () => {
    const list = await getRecentVideos(5);
    setRecentVideos(list);
  }, []);

  useEffect(() => {
    refreshRecentHistory();
  }, [currentVideo?.id, refreshRecentHistory]);

  // Check for resume progress when video changes
  useEffect(() => {
    if (!currentVideo) return;
    (async () => {
      const savedSec = await getWatchProgress(currentVideo.id);
      if (savedSec && savedSec > 5) {
        setResumePromptPos(savedSec);
      } else {
        setResumePromptPos(null);
      }
    })();
  }, [currentVideo?.id]);

  // Keep player source synchronized with currentVideo & token
  useEffect(() => {
    if (player && currentVideo) {
      (async () => {
        let token = authToken;
        if (!token && currentVideo.localUri.includes('googleapis.com')) {
          token = await getAuthToken();
        }
        const src = buildVideoSource(currentVideo, token);
        if (src) {
          player.replace(src as any);
          player.play();
          setIsPlaying(true);
        }
      })();
    }
  }, [currentVideo?.localUri, authToken]);

  // Auto-hide controls timer
  const resetControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isLocked) {
        setShowControls(false);
      }
    }, 4500);
  }, [isLocked]);

  useEffect(() => {
    if (showControls && isPlaying) {
      resetControlsTimer();
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls, isPlaying, resetControlsTimer]);

  // Listen for playback state and time updates
  useEffect(() => {
    if (!player) return;

    const subPlaying = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
      if (!event.isPlaying) {
        setShowControls(true);
      }
    });

    const subTime = player.addListener('timeUpdate', (event) => {
      setCurrentTime(event.currentTime);
      if (player.duration) {
        setDuration(player.duration);
      }

      // Save watch progress every 4 seconds
      const now = Date.now();
      if (currentVideo && player.duration > 0 && now - lastSaveTimeRef.current > 4000) {
        lastSaveTimeRef.current = now;
        saveWatchProgress({
          id: currentVideo.id,
          title: currentVideo.title,
          positionSeconds: event.currentTime,
          durationSeconds: player.duration,
          localUri: currentVideo.localUri,
          thumbnailUrl: currentVideo.thumbnailUrl,
          googleDriveId: currentVideo.googleDriveId,
        }).then(refreshRecentHistory);
      }
    });

    const subStatus = player.addListener('statusChange', (event) => {
      // Auto-advance to next video in folder when finished
      if (event.status === 'idle' && duration > 0 && currentTime >= duration - 1) {
        if (activeFolderPlaylist.length > 1) {
          playNextVideoInFolder();
        }
      }
    });

    return () => {
      subPlaying.remove();
      subTime.remove();
      subStatus.remove();
    };
  }, [player, duration, currentTime, currentVideo, activeFolderPlaylist.length, playNextVideoInFolder, refreshRecentHistory]);

  // Hardware Android Back button handling
  useEffect(() => {
    const onBackPress = () => {
      if (isFullscreen) {
        setIsFullscreen(false);
        return true;
      }
      handleBackNavigation();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isFullscreen]);

  // Back Navigation: stops playback and returns to Drive Explorer
  const handleBackNavigation = () => {
    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }
    if (player) {
      player.pause();
    }
    router.push('/(tabs)');
  };

  const togglePlayPause = () => {
    if (!player || isLocked) return;
    resetControlsTimer();
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const seekRelative = (seconds: number) => {
    if (!player || isLocked) return;
    resetControlsTimer();
    const target = Math.max(0, Math.min(duration || 1000, player.currentTime + seconds));
    player.currentTime = target;
  };

  const handleSeekTo = (newSeconds: number) => {
    if (!player || isLocked) return;
    resetControlsTimer();
    player.currentTime = newSeconds;
  };

  const handleVolumeChange = (newVol: number) => {
    if (!player || isLocked) return;
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    player.volume = clamped;
    setIsMuted(clamped === 0);
  };

  const handleCycleSpeed = () => {
    if (!player || isLocked) return;
    resetControlsTimer();
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackSpeed(newSpeed);
    player.playbackRate = newSpeed;
  };

  const toggleContentFit = () => {
    resetControlsTimer();
    setContentFit((prev) => (prev === 'contain' ? 'cover' : 'contain'));
  };

  const toggleMute = () => {
    if (!player || isLocked) return;
    resetControlsTimer();
    player.muted = !player.muted;
    setIsMuted(player.muted);
  };

  const toggleFullscreen = () => {
    resetControlsTimer();
    setIsFullscreen((prev) => !prev);
  };

  // Resume Handler
  const handleResumePlayback = () => {
    if (player && resumePromptPos) {
      player.currentTime = resumePromptPos;
      player.play();
    }
    setResumePromptPos(null);
  };

  const handleStartFromBeginning = () => {
    if (player) {
      player.currentTime = 0;
      player.play();
    }
    setResumePromptPos(null);
  };

  // PanResponder for MX Player touch gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 12 || Math.abs(gestureState.dy) > 12;
      },
      onPanResponderGrant: () => {
        isGestureActiveRef.current = false;
        gestureModeRef.current = 'none';
        startVolumeRef.current = volume;
        startPosRef.current = currentTime;
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (isLocked) return;
        const dx = gestureState.dx;
        const dy = gestureState.dy;

        if (gestureModeRef.current === 'none') {
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 14) {
            gestureModeRef.current = 'horizontal';
            isGestureActiveRef.current = true;
          } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 14) {
            gestureModeRef.current = 'vertical_right';
            isGestureActiveRef.current = true;
          }
        }

        if (gestureModeRef.current === 'vertical_right') {
          const deltaVolume = -dy / 180;
          const newVol = Math.max(0, Math.min(1, startVolumeRef.current + deltaVolume));
          setHudType('volume');
          setHudValue(Math.round(newVol * 100));
          handleVolumeChange(newVol);
        } else if (gestureModeRef.current === 'horizontal') {
          const deltaSec = Math.round(dx * 0.4);
          const target = Math.max(0, Math.min(duration || 1000, startPosRef.current + deltaSec));
          setHudType('seek');
          setSeekDelta(deltaSec);
          setSeekTarget(target);
        }
      },
      onPanResponderRelease: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (isGestureActiveRef.current) {
          if (gestureModeRef.current === 'horizontal') {
            const deltaSec = Math.round(gestureState.dx * 0.4);
            const target = Math.max(0, Math.min(duration || 1000, startPosRef.current + deltaSec));
            handleSeekTo(target);
          }
          setTimeout(() => setHudType(null), 600);
        } else {
          // Tap handling
          const now = Date.now();
          if (now - lastTapRef.current < 280) {
            // Double tap: skip ±10s
            const touchX = evt.nativeEvent.locationX;
            const screenW = Dimensions.get('window').width;
            const isRightSide = touchX > screenW / 2;
            seekRelative(isRightSide ? 10 : -10);
            setHudType('seek');
            setSeekDelta(isRightSide ? 10 : -10);
            setSeekTarget(Math.max(0, currentTime + (isRightSide ? 10 : -10)));
            setTimeout(() => setHudType(null), 700);
            lastTapRef.current = 0;
          } else {
            lastTapRef.current = now;
            setShowControls((prev) => !prev);
          }
        }
        gestureModeRef.current = 'none';
        isGestureActiveRef.current = false;
      },
    })
  ).current;

  const formatSeconds = (sec: number) => {
    if (!sec || isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  // If no video is selected yet
  if (!currentVideo) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.emptyIconBadge, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="videocam-outline" size={48} color={theme.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No Video Selected</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Select any video from your Google Drive folders to start instant streaming.
        </Text>
        <TouchableOpacity
          style={[styles.emptyButton, { backgroundColor: theme.primary }]}
          onPress={() => router.push('/(tabs)')}
          activeOpacity={0.8}>
          <Ionicons name="cloud-outline" size={20} color="#fff" />
          <Text style={styles.emptyButtonText}>Browse Google Drive Folders</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLocalOnDisk = localVideos.some(
    (l) => l.id === currentVideo.id || l.localUri === currentVideo.localUri
  );

  const playlistToDisplay = activeFolderPlaylist.length > 0 ? activeFolderPlaylist : (SAMPLE_VIDEOS as PlayableVideo[]);

  // Renders the Video Viewport and On-Screen Controller Overlay
  const renderVideoViewport = (isFull: boolean) => {
    return (
      <View
        style={[
          isFull ? styles.fullscreenViewport : styles.standardViewport,
          { backgroundColor: '#000' },
        ]}
        {...panResponder.panHandlers}>
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          nativeControls={false}
          contentFit={contentFit}
          allowsPictureInPicture
          startsPictureInPictureAutomatically
        />

        {/* Gesture HUD Displays (Volume & Scrub) */}
        {hudType === 'volume' && (
          <View style={styles.hudOverlay}>
            <View style={styles.hudCard}>
              <Ionicons
                name={hudValue === 0 ? 'volume-mute' : hudValue > 60 ? 'volume-high' : 'volume-medium'}
                size={32}
                color="#38bdf8"
              />
              <Text style={styles.hudText}>{hudValue}%</Text>
            </View>
          </View>
        )}

        {hudType === 'seek' && (
          <View style={styles.hudOverlay}>
            <View style={styles.hudCard}>
              <Ionicons name={seekDelta >= 0 ? 'play-forward' : 'play-back'} size={32} color="#38bdf8" />
              <Text style={styles.hudText}>
                {seekDelta >= 0 ? `+${seekDelta}s` : `${seekDelta}s`}
              </Text>
              <Text style={styles.hudSubText}>{formatSeconds(seekTarget)}</Text>
            </View>
          </View>
        )}

        {/* Floating Resume Playback Banner */}
        {resumePromptPos !== null && (
          <View style={styles.resumeToast}>
            <View style={styles.resumeToastContent}>
              <Ionicons name="time" size={18} color="#38bdf8" />
              <Text style={styles.resumeToastTitle}>
                Resume playback at <Text style={{ fontWeight: '700', color: '#38bdf8' }}>{formatSeconds(resumePromptPos)}</Text>?
              </Text>
            </View>
            <View style={styles.resumeToastBtnRow}>
              <TouchableOpacity style={styles.resumeBtnPrimary} onPress={handleResumePlayback}>
                <Ionicons name="play" size={14} color="#0a0a0c" />
                <Text style={styles.resumeBtnPrimaryText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resumeBtnSecondary} onPress={handleStartFromBeginning}>
                <Text style={styles.resumeBtnSecondaryText}>Start Over</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* On-Screen Touch Controls Overlay */}
        {showControls && (
          <View style={styles.controlsOverlay}>
            {/* Top Bar */}
            <View style={[styles.overlayTopBar, isFull && { paddingTop: insets.top + 8 }]}>
              {/* Back Button */}
              <TouchableOpacity onPress={handleBackNavigation} style={styles.overlayIconBtn}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>

              {/* Title & Folder Context */}
              <View style={styles.overlayTitleBox}>
                <Text style={styles.overlayVideoTitle} numberOfLines={1}>
                  {currentVideo.title}
                </Text>
                {activeFolderPlaylist.length > 0 && (
                  <Text style={styles.overlayFolderSubtitle}>
                    Video {activeFolderIndex + 1} of {activeFolderPlaylist.length}
                  </Text>
                )}
              </View>

              {/* Right Action Icons */}
              <View style={styles.overlayRightIcons}>
                {/* Quality Selector Chip */}
                <TouchableOpacity
                  onPress={() => setShowQualityModal(true)}
                  style={styles.overlayChipBtn}>
                  <Ionicons name="sparkles" size={14} color="#38bdf8" />
                  <Text style={styles.overlayChipText}>
                    {selectedQuality.replace(' (HD)', '')}
                  </Text>
                </TouchableOpacity>

                {/* Aspect Ratio Fit */}
                <TouchableOpacity onPress={toggleContentFit} style={styles.overlayIconBtn}>
                  <Ionicons
                    name={contentFit === 'contain' ? 'scan-outline' : 'contract-outline'}
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>

                {/* Lock Controls */}
                <TouchableOpacity
                  onPress={() => setIsLocked(!isLocked)}
                  style={[styles.overlayIconBtn, isLocked && { backgroundColor: 'rgba(245, 158, 11, 0.3)' }]}>
                  <Ionicons
                    name={isLocked ? 'lock-closed' : 'lock-open-outline'}
                    size={20}
                    color={isLocked ? '#f59e0b' : '#fff'}
                  />
                </TouchableOpacity>

                {/* Fullscreen Button */}
                <TouchableOpacity onPress={toggleFullscreen} style={styles.overlayIconBtn}>
                  <Ionicons
                    name={isFull ? 'contract' : 'expand'}
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Center Transport Buttons */}
            {!isLocked && (
              <View style={styles.overlayCenterControls}>
                {/* Previous Video in Folder */}
                <TouchableOpacity
                  onPress={playPrevVideoInFolder}
                  disabled={activeFolderPlaylist.length <= 1}
                  style={[styles.transportBtn, activeFolderPlaylist.length <= 1 && { opacity: 0.3 }]}>
                  <Ionicons name="play-skip-back" size={26} color="#fff" />
                </TouchableOpacity>

                {/* Rewind -10s */}
                <TouchableOpacity onPress={() => seekRelative(-10)} style={styles.transportBtn}>
                  <Ionicons name="refresh" size={26} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
                  <Text style={styles.transportSubText}>10</Text>
                </TouchableOpacity>

                {/* Big Center Play / Pause */}
                <TouchableOpacity onPress={togglePlayPause} style={styles.bigPlayPauseBtn} activeOpacity={0.8}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={38} color="#0a0a0c" />
                </TouchableOpacity>

                {/* Forward +10s */}
                <TouchableOpacity onPress={() => seekRelative(10)} style={styles.transportBtn}>
                  <Ionicons name="refresh" size={26} color="#fff" />
                  <Text style={styles.transportSubText}>10</Text>
                </TouchableOpacity>

                {/* Next Video in Folder */}
                <TouchableOpacity
                  onPress={playNextVideoInFolder}
                  disabled={activeFolderPlaylist.length <= 1}
                  style={[styles.transportBtn, activeFolderPlaylist.length <= 1 && { opacity: 0.3 }]}>
                  <Ionicons name="play-skip-forward" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* Bottom Timeline & Controls Bar */}
            {!isLocked && (
              <View style={[styles.overlayBottomBar, isFull && { paddingBottom: insets.bottom + 8 }]}>
                {/* Scrub Progress Bar */}
                <View style={styles.timelineRow}>
                  <Text style={styles.timelineText}>{formatSeconds(currentTime)}</Text>
                  <TouchableOpacity
                    activeOpacity={1}
                    style={styles.scrubTrackBg}
                    onPress={(e) => {
                      const screenW = Dimensions.get('window').width;
                      const trackW = screenW - 140;
                      const clickX = e.nativeEvent.locationX;
                      const ratio = Math.max(0, Math.min(1, clickX / trackW));
                      handleSeekTo(ratio * (duration || 100));
                    }}>
                    <View style={[styles.scrubTrackFill, { width: `${progressPercent}%` }]} />
                    <View style={[styles.scrubThumb, { left: `${Math.max(0, progressPercent - 2)}%` }]} />
                  </TouchableOpacity>
                  <Text style={styles.timelineText}>{formatSeconds(duration)}</Text>
                </View>

                {/* Bottom Row Controls */}
                <View style={styles.bottomButtonsRow}>
                  {/* Speed Toggle */}
                  <TouchableOpacity onPress={handleCycleSpeed} style={styles.speedChip}>
                    <Text style={styles.speedChipText}>{playbackSpeed}x</Text>
                  </TouchableOpacity>

                  {/* Volume Mute */}
                  <TouchableOpacity onPress={toggleMute} style={styles.overlayIconBtn}>
                    <Ionicons
                      name={isMuted ? 'volume-mute' : 'volume-high'}
                      size={20}
                      color={isMuted ? '#ef4444' : '#fff'}
                    />
                  </TouchableOpacity>

                  {/* Expand Fullscreen */}
                  <TouchableOpacity onPress={toggleFullscreen} style={styles.overlayIconBtn}>
                    <Ionicons name={isFull ? 'contract' : 'expand'} size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.screenWrapper, { backgroundColor: theme.background }]}>
      <StatusBar hidden={isFullscreen} />

      {/* 100% TRUE FULLSCREEN MODAL (0% APP VISIBILITY) */}
      <Modal
        visible={isFullscreen}
        transparent={false}
        animationType="fade"
        hardwareAccelerated
        onRequestClose={() => setIsFullscreen(false)}>
        {renderVideoViewport(true)}
      </Modal>

      {/* Standard In-App Viewport */}
      {!isFullscreen && renderVideoViewport(false)}

      {/* Scrollable Information, History, and Folder Queue */}
      {!isFullscreen && (
        <ScrollView
          style={styles.scrollDetails}
          contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}>
          {/* Background Caching Indicator */}
          {downloadState.isDownloading && (
            <View style={[styles.cachingBanner, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <Ionicons name="cloud-download" size={20} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cachingTitle, { color: theme.text }]}>
                  Caching for offline smoothness ({downloadState.progressPercent}%)
                </Text>
                <View style={styles.cachingBarBg}>
                  <View style={[styles.cachingBarFill, { width: `${downloadState.progressPercent}%` }]} />
                </View>
              </View>
            </View>
          )}

          {/* Video Information & Local Storage Status */}
          <View style={[styles.detailsCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <View style={styles.detailsHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.videoTitle, { color: theme.text }]} numberOfLines={2}>
                  {currentVideo.title}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.statusBadge, { backgroundColor: isLocalOnDisk ? theme.successLight : theme.primaryLight }]}>
                    <Ionicons name={isLocalOnDisk ? 'checkmark-circle' : 'cloud-outline'} size={14} color={isLocalOnDisk ? theme.success : theme.primary} />
                    <Text style={[styles.statusBadgeText, { color: isLocalOnDisk ? theme.success : theme.primary }]}>
                      {isLocalOnDisk ? 'Saved in Device Storage' : 'Streaming from Google Drive'}
                    </Text>
                  </View>
                  {currentVideo.sizeBytes ? (
                    <Text style={[styles.sizeText, { color: theme.textSecondary }]}>
                      {formatBytes(currentVideo.sizeBytes)}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Delete from phone button */}
              {isLocalOnDisk && (
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: theme.dangerLight, borderColor: theme.danger }]}
                  onPress={async () => {
                    Alert.alert(
                      'Delete Local File',
                      `Are you sure you want to delete "${currentVideo.title}" from your phone's memory? (It will NEVER be deleted from your Google Drive)`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete from Phone',
                          style: 'destructive',
                          onPress: async () => {
                            if (player) player.pause();
                            await deleteCurrentVideoNow();
                          },
                        },
                      ]
                    );
                  }}
                  activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={16} color={theme.danger} />
                  <Text style={[styles.deleteButtonText, { color: theme.danger }]}>Delete Local</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Section: Recently Watched (Last 3 Videos with Resume) */}
          {recentVideos.length > 0 && (
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="time-outline" size={20} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Recently Watched (Continue Watching)
                </Text>
              </View>

              {recentVideos.slice(0, 3).map((item) => {
                const isCurrent = currentVideo.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.recentCard,
                      {
                        backgroundColor: isCurrent ? theme.primaryLight : theme.cardBackground,
                        borderColor: isCurrent ? theme.primary : theme.cardBorder,
                      },
                    ]}
                    onPress={() => {
                      requestPlayVideo(
                        {
                          id: item.id,
                          name: item.title,
                          isFolder: false,
                          kind: 'video',
                          downloadUrl: item.localUri,
                          thumbnailUrl: item.thumbnailUrl,
                          source: 'google_drive',
                        },
                        activeFolderPlaylist,
                        'stream'
                      );
                    }}
                    activeOpacity={0.7}>
                    <View style={[styles.recentIconBox, { backgroundColor: isCurrent ? '#0284c7' : 'rgba(255, 255, 255, 0.08)' }]}>
                      <Ionicons name="play" size={18} color="#fff" />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.recentTitle,
                          { color: isCurrent ? theme.primary : theme.text, fontWeight: isCurrent ? '700' : '600' },
                        ]}
                        numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.recentSub, { color: theme.textSecondary }]}>
                        {item.progressPercent}% watched • {formatSeconds(item.positionSeconds)} of {formatSeconds(item.durationSeconds)}
                      </Text>
                      {/* Mini Progress Bar */}
                      <View style={styles.miniProgressBg}>
                        <View style={[styles.miniProgressFill, { width: `${item.progressPercent}%` }]} />
                      </View>
                    </View>

                    <View style={[styles.resumeChip, { backgroundColor: theme.primary }]}>
                      <Text style={styles.resumeChipText}>Resume</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Section: Folder Video Playlist */}
          <View style={styles.sectionBox}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="albums-outline" size={20} color={theme.primary} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {activeFolderPlaylist.length > 0
                  ? `Folder Playlist (${activeFolderIndex + 1} of ${activeFolderPlaylist.length})`
                  : 'Sample Video Queue'}
              </Text>
            </View>

            {playlistToDisplay.map((item, idx) => {
              const itemId = 'id' in item ? item.id : '';
              const itemName = 'name' in item ? item.name : (item as any).title;
              const itemSize = item.sizeBytes ? formatBytes(item.sizeBytes) : undefined;
              const isCurrent = currentVideo.id === itemId;

              return (
                <TouchableOpacity
                  key={itemId || `item_${idx}`}
                  style={[
                    styles.playlistCard,
                    {
                      backgroundColor: isCurrent ? theme.primaryLight : theme.cardBackground,
                      borderColor: isCurrent ? theme.primary : theme.cardBorder,
                    },
                  ]}
                  onPress={() => requestPlayVideo(item, activeFolderPlaylist, 'stream')}
                  activeOpacity={0.7}>
                  <Ionicons
                    name={isCurrent ? 'radio-button-on' : 'play-circle-outline'}
                    size={22}
                    color={isCurrent ? theme.primary : theme.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.playlistTitle,
                        { color: isCurrent ? theme.primary : theme.text, fontWeight: isCurrent ? '700' : '500' },
                      ]}
                      numberOfLines={1}>
                      {itemName}
                    </Text>
                    <Text style={[styles.playlistSub, { color: theme.textSecondary }]}>
                      {isCurrent ? '▶ Currently Playing' : itemSize ? `Size: ${itemSize}` : 'Drive Video'}
                    </Text>
                  </View>
                  {isCurrent && (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Active</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Quality Switcher Modal */}
      <Modal visible={showQualityModal} transparent animationType="fade" onRequestClose={() => setShowQualityModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowQualityModal(false)}>
          <View style={[styles.qualitySheet, { backgroundColor: theme.cardBackground }]}>
            <View style={styles.qualityHeader}>
              <Ionicons name="sparkles" size={22} color={theme.primary} />
              <Text style={[styles.qualitySheetTitle, { color: theme.text }]}>Video Quality Stream</Text>
            </View>
            {(['Original (HD)', '1080p', '720p', '480p', 'Auto'] as VideoQuality[]).map((q) => {
              const isSelected = selectedQuality === q;
              return (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.qualityOption,
                    isSelected && { backgroundColor: theme.primaryLight, borderColor: theme.primary },
                  ]}
                  onPress={() => {
                    setSelectedQuality(q);
                    setShowQualityModal(false);
                  }}>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={isSelected ? theme.primary : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.qualityOptionText,
                      { color: isSelected ? theme.primary : theme.text, fontWeight: isSelected ? '700' : '500' },
                    ]}>
                    {q}
                  </Text>
                  {q === 'Original (HD)' && (
                    <View style={[styles.qualityTag, { backgroundColor: '#38bdf8' }]}>
                      <Text style={styles.qualityTagText}>Best</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
  standardViewport: {
    width: '100%',
    height: Dimensions.get('window').width * (9 / 16),
    maxHeight: 280,
    position: 'relative',
  },
  fullscreenViewport: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#000',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  overlayTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  overlayIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTitleBox: {
    flex: 1,
    paddingHorizontal: 4,
  },
  overlayVideoTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  overlayFolderSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 1,
  },
  overlayRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overlayChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  overlayChipText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  overlayCenterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  transportBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transportSubText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    position: 'absolute',
  },
  bigPlayPauseBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  overlayBottomBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timelineText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 42,
  },
  scrubTrackBg: {
    flex: 1,
    height: 20,
    justifyContent: 'center',
  },
  scrubTrackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#38bdf8',
  },
  scrubThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    top: 3,
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  speedChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  speedChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  hudOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    pointerEvents: 'none',
  },
  hudCard: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: 'rgba(10, 14, 20, 0.85)',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  hudText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hudSubText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  resumeToast: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#38bdf8',
    zIndex: 15,
    gap: 8,
  },
  resumeToastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resumeToastTitle: {
    color: '#ffffff',
    fontSize: 13,
  },
  resumeToastBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-end',
  },
  resumeBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#38bdf8',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  resumeBtnPrimaryText: {
    color: '#0a0a0c',
    fontSize: 12,
    fontWeight: '700',
  },
  resumeBtnSecondary: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  resumeBtnSecondaryText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  scrollDetails: {
    flex: 1,
  },
  cachingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  cachingTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  cachingBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  cachingBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 2,
  },
  detailsCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  detailsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sizeText: {
    fontSize: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionBox: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  recentIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentTitle: {
    fontSize: 14,
  },
  recentSub: {
    fontSize: 11,
    marginTop: 2,
  },
  miniProgressBg: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 6,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 1.5,
  },
  resumeChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  resumeChipText: {
    color: '#0a0a0c',
    fontSize: 11,
    fontWeight: '700',
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  playlistTitle: {
    fontSize: 14,
  },
  playlistSub: {
    fontSize: 12,
    marginTop: 2,
  },
  activePill: {
    backgroundColor: '#38bdf8',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  activePillText: {
    color: '#0a0a0c',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyIconBadge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  qualitySheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  qualityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  qualitySheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  qualityOptionText: {
    fontSize: 15,
    flex: 1,
  },
  qualityTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  qualityTagText: {
    color: '#0a0a0c',
    fontSize: 11,
    fontWeight: '700',
  },
});
