import React, { useState, useEffect, useMemo, useRef } from 'react';
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
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback, type PlayableVideo } from '@/context/PlaybackContext';
import { formatBytes } from '@/services/downloadManager';
import { SAMPLE_VIDEOS } from '@/services/googleDriveService';
import { MXPlayerGestureView } from '@/components/MXPlayerGestureView';
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

  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [contentFit, setContentFit] = useState<'contain' | 'cover'>('contain');
  const [isLocked, setIsLocked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('Original (HD)');
  const [showQualityModal, setShowQualityModal] = useState(false);

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

  // Listen for playback state and time updates
  useEffect(() => {
    if (!player) return;

    const subPlaying = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
    });

    const subTime = player.addListener('timeUpdate', (event) => {
      setCurrentTime(event.currentTime);
      if (player.duration) {
        setDuration(player.duration);
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
  }, [player, duration, currentTime, activeFolderPlaylist.length]);

  const togglePlayPause = () => {
    if (!player || isLocked) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const seekRelative = (seconds: number) => {
    if (!player || isLocked) return;
    player.currentTime = Math.max(0, player.currentTime + seconds);
  };

  const handleSeekTo = (newSeconds: number) => {
    if (!player || isLocked) return;
    player.currentTime = newSeconds;
  };

  const handleVolumeChange = (newVol: number) => {
    if (!player || isLocked) return;
    setVolume(newVol);
    player.volume = newVol;
    setIsMuted(newVol === 0);
  };

  const handleReplay = () => {
    if (!player || isLocked) return;
    player.currentTime = 0;
    player.play();
  };

  const handleCycleSpeed = () => {
    if (!player || isLocked) return;
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackSpeed(newSpeed);
    player.playbackRate = newSpeed;
  };

  const toggleContentFit = () => {
    setContentFit((prev) => (prev === 'contain' ? 'cover' : 'contain'));
  };

  const toggleMute = () => {
    if (!player || isLocked) return;
    player.muted = !player.muted;
    setIsMuted(player.muted);
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const handleDeleteThisVideo = () => {
    Alert.alert(
      'Delete from Local Storage',
      `Are you sure you want to delete "${currentVideo?.title}" from your phone's storage? It will NEVER be deleted from your Google Drive.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete from Phone',
          style: 'destructive',
          onPress: async () => {
            if (player) {
              player.pause();
            }
            await deleteCurrentVideoNow();
          },
        },
      ]
    );
  };

  // If no video is selected yet
  if (!currentVideo) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.emptyIconBadge, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="videocam-outline" size={48} color={theme.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No Video Selected</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Select a video from your Google Drive folders or test with a sample video to start playing.
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

  return (
    <View style={[styles.screenWrapper, { backgroundColor: theme.background }]}>
      <StatusBar hidden={isFullscreen} />

      {/* Main Viewport Container */}
      <View
        style={[
          isFullscreen ? styles.fullscreenVideoContainer : styles.standardVideoContainer,
          { backgroundColor: '#000' },
        ]}>
        <MXPlayerGestureView
          durationSeconds={duration}
          currentPositionSeconds={currentTime}
          onSeekTo={handleSeekTo}
          onVolumeChange={handleVolumeChange}
          volume={volume}
          onDoubleTapSeek={(forward) => seekRelative(forward ? 10 : -10)}
          onToggleControls={() => setShowControls(!showControls)}>
          <VideoView
            style={styles.videoPlayer}
            player={player}
            nativeControls={!isLocked && showControls}
            contentFit={contentFit}
            allowsPictureInPicture
            startsPictureInPictureAutomatically
          />

          {/* Top Quick Action Overlays */}
          {showControls && (
            <View style={[styles.videoTopOverlay, isFullscreen && { paddingTop: insets.top + 10 }]}>
              {/* Fullscreen Toggle */}
              <TouchableOpacity
                onPress={toggleFullscreen}
                style={[styles.overlayIconBtn, isFullscreen && styles.overlayIconBtnActive]}
                activeOpacity={0.8}>
                <Ionicons
                  name={isFullscreen ? 'contract-outline' : 'expand-outline'}
                  size={18}
                  color={isFullscreen ? '#38bdf8' : '#fff'}
                />
                <Text style={[styles.overlayBtnText, isFullscreen && { color: '#38bdf8' }]}>
                  {isFullscreen ? 'Exit Full' : 'Fullscreen'}
                </Text>
              </TouchableOpacity>

              {/* Quality Switcher Badge */}
              <TouchableOpacity
                onPress={() => setShowQualityModal(true)}
                style={styles.overlayIconBtn}
                activeOpacity={0.8}>
                <Ionicons name="sparkles" size={16} color="#38bdf8" />
                <Text style={[styles.overlayBtnText, { color: '#38bdf8', fontWeight: '700' }]}>
                  {selectedQuality.replace(' (HD)', '')}
                </Text>
              </TouchableOpacity>

              {/* Aspect Ratio Fit */}
              <TouchableOpacity
                onPress={toggleContentFit}
                style={styles.overlayIconBtn}
                activeOpacity={0.8}>
                <Ionicons
                  name={contentFit === 'contain' ? 'scan-outline' : 'contract-outline'}
                  size={18}
                  color="#fff"
                />
                <Text style={styles.overlayBtnText}>
                  {contentFit === 'contain' ? 'Fit' : 'Fill'}
                </Text>
              </TouchableOpacity>

              {/* Lock Controls */}
              <TouchableOpacity
                onPress={() => setIsLocked(!isLocked)}
                style={[styles.overlayIconBtn, isLocked && styles.overlayIconBtnActive]}
                activeOpacity={0.8}>
                <Ionicons
                  name={isLocked ? 'lock-closed' : 'lock-open-outline'}
                  size={18}
                  color={isLocked ? '#f59e0b' : '#fff'}
                />
                <Text style={[styles.overlayBtnText, isLocked && { color: '#f59e0b' }]}>
                  {isLocked ? 'Locked' : 'Lock'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </MXPlayerGestureView>
      </View>

      {/* When in Fullscreen mode, don't show the scrollable details below */}
      {!isFullscreen && (
        <ScrollView
          style={styles.scrollDetails}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {/* Background Caching Indicator */}
          {downloadState.isDownloading && (
            <View style={[styles.cachingBanner, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <Ionicons name="cloud-download" size={18} color={theme.primary} />
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

          {/* Main Controls Card */}
          <View style={[styles.controlsCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <View style={styles.controlsRow}>
              {/* Previous Video in Folder */}
              <TouchableOpacity
                onPress={playPrevVideoInFolder}
                style={[styles.controlIconBtn, activeFolderPlaylist.length <= 1 && styles.controlBtnDisabled]}
                disabled={activeFolderPlaylist.length <= 1}>
                <Ionicons name="play-skip-back" size={22} color={activeFolderPlaylist.length <= 1 ? '#666' : theme.text} />
              </TouchableOpacity>

              {/* Skip -10s */}
              <TouchableOpacity onPress={() => seekRelative(-10)} style={styles.controlIconBtn}>
                <Ionicons name="refresh-outline" size={22} color={theme.text} style={{ transform: [{ scaleX: -1 }] }} />
              </TouchableOpacity>

              {/* Main Play / Pause */}
              <TouchableOpacity
                onPress={togglePlayPause}
                style={[styles.mainPlayBtn, { backgroundColor: theme.primary }]}
                activeOpacity={0.8}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#fff" />
              </TouchableOpacity>

              {/* Skip +10s */}
              <TouchableOpacity onPress={() => seekRelative(10)} style={styles.controlIconBtn}>
                <Ionicons name="refresh-outline" size={22} color={theme.text} />
              </TouchableOpacity>

              {/* Next Video in Folder */}
              <TouchableOpacity
                onPress={playNextVideoInFolder}
                style={[styles.controlIconBtn, activeFolderPlaylist.length <= 1 && styles.controlBtnDisabled]}
                disabled={activeFolderPlaylist.length <= 1}>
                <Ionicons name="play-skip-forward" size={22} color={activeFolderPlaylist.length <= 1 ? '#666' : theme.text} />
              </TouchableOpacity>

              {/* Speed Toggle */}
              <TouchableOpacity onPress={handleCycleSpeed} style={styles.speedBtn}>
                <Text style={[styles.speedText, { color: theme.primary }]}>{playbackSpeed}x</Text>
              </TouchableOpacity>

              {/* Mute */}
              <TouchableOpacity onPress={toggleMute} style={styles.controlIconBtn}>
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={22}
                  color={isMuted ? theme.danger : theme.text}
                />
              </TouchableOpacity>
            </View>
          </View>

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
                      {isLocalOnDisk ? 'Saved in Device Storage' : 'Streaming from Drive'}
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
                  onPress={handleDeleteThisVideo}
                  activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={16} color={theme.danger} />
                  <Text style={[styles.deleteButtonText, { color: theme.danger }]}>Delete Local</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* In-Folder Video Queue Section */}
          <View style={styles.switchSection}>
            <View style={styles.switchSectionHeader}>
              <Ionicons name="albums-outline" size={20} color={theme.primary} />
              <Text style={[styles.switchSectionTitle, { color: theme.text }]}>
                {activeFolderPlaylist.length > 0
                  ? `Folder Playlist (${activeFolderIndex + 1} of ${activeFolderPlaylist.length})`
                  : 'Sample Queue'}
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
                    styles.nextItemCard,
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
                        styles.nextItemTitle,
                        { color: isCurrent ? theme.primary : theme.text, fontWeight: isCurrent ? '700' : '500' },
                      ]}
                      numberOfLines={1}>
                      {itemName}
                    </Text>
                    <Text style={[styles.nextItemSub, { color: theme.textSecondary }]}>
                      {isCurrent ? '▶ Now Playing' : itemSize ? `Size: ${itemSize}` : 'Google Drive Video'}
                    </Text>
                  </View>
                  {isCurrent && (
                    <View style={styles.nowPlayingBadge}>
                      <Text style={styles.nowPlayingText}>Active</Text>
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
              <Text style={[styles.qualitySheetTitle, { color: theme.text }]}>Select Video Quality</Text>
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
  standardVideoContainer: {
    width: '100%',
    height: Dimensions.get('window').width * (9 / 16),
    maxHeight: 280,
    position: 'relative',
  },
  fullscreenVideoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  videoTopOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  overlayIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  overlayIconBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  overlayBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
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
    borderRadius: 12,
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
  controlsCard: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlIconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  controlBtnDisabled: {
    opacity: 0.3,
  },
  mainPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  speedText: {
    fontSize: 13,
    fontWeight: '700',
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
  switchSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  switchSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  switchSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  nextItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  nextItemTitle: {
    fontSize: 14,
  },
  nextItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  nowPlayingBadge: {
    backgroundColor: '#38bdf8',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  nowPlayingText: {
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
