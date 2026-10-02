import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback } from '@/context/PlaybackContext';
import { formatBytes } from '@/services/downloadManager';
import { SAMPLE_VIDEOS } from '@/services/googleDriveService';
import { MXPlayerGestureView } from '@/components/MXPlayerGestureView';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

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

  // Initialize expo-video player with current video URI
  const player = useVideoPlayer(currentVideo ? currentVideo.localUri : null, (p) => {
    p.loop = false;
    p.play();
  });

  // Keep player source synchronized with currentVideo
  useEffect(() => {
    if (player && currentVideo) {
      player.replace(currentVideo.localUri);
      player.play();
      setIsPlaying(true);
    }
  }, [currentVideo?.localUri]);

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

    return () => {
      subPlaying.remove();
      subTime.remove();
    };
  }, [player]);

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
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No Video Playing</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Select a video from your Google Drive folders or test with a sample video to start playing.
        </Text>
        <TouchableOpacity
          style={[styles.emptyButton, { backgroundColor: theme.primary }]}
          onPress={() => router.push('/(tabs)')}
          activeOpacity={0.8}>
          <Ionicons name="cloud-outline" size={20} color="#fff" />
          <Text style={styles.emptyButtonText}>Browse Google Drive</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLocalOnDisk = localVideos.some(
    (l) => l.id === currentVideo.id || l.localUri === currentVideo.localUri
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {/* Video Viewport Container with MX Gesture Control */}
      <View style={[styles.videoContainer, { backgroundColor: '#000' }]}>
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

          {/* Top Quick Actions Overlay (Aspect Ratio & Lock) */}
          <View style={styles.videoTopOverlay}>
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
        </MXPlayerGestureView>
      </View>

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

      {/* Main Playback Bar Controls */}
      <View style={[styles.controlsCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
        <View style={styles.controlsRow}>
          {/* Replay */}
          <TouchableOpacity onPress={handleReplay} style={styles.controlIconBtn}>
            <Ionicons name="refresh" size={22} color={theme.text} />
          </TouchableOpacity>

          {/* Skip -10s */}
          <TouchableOpacity onPress={() => seekRelative(-10)} style={styles.controlIconBtn}>
            <Ionicons name="play-back" size={24} color={theme.text} />
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
            <Ionicons name="play-forward" size={24} color={theme.text} />
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

      {/* Gesture Controls Guide Box */}
      <View style={[styles.gestureGuideCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
        <View style={styles.guideHeaderRow}>
          <Ionicons name="finger-print" size={18} color={theme.primary} />
          <Text style={[styles.guideTitle, { color: theme.text }]}>MX Player Touch Gestures Active</Text>
        </View>
        <Text style={[styles.guideText, { color: theme.textSecondary }]}>
          • <Text style={{ fontWeight: '600', color: theme.text }}>Right vertical swipe:</Text> Adjust volume up/down
          {'\n'}• <Text style={{ fontWeight: '600', color: theme.text }}>Horizontal swipe:</Text> Fast scrub seek forward/backward
          {'\n'}• <Text style={{ fontWeight: '600', color: theme.text }}>Double-tap left/right:</Text> Skip ±10 seconds
        </Text>
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

      {/* Sample Videos to Switch Between */}
      <View style={styles.switchSection}>
        <View style={styles.switchSectionHeader}>
          <Ionicons name="play-skip-forward-circle-outline" size={20} color={theme.primary} />
          <Text style={[styles.switchSectionTitle, { color: theme.text }]}>
            Switch / Queue Video
          </Text>
        </View>

        {SAMPLE_VIDEOS.map((item) => {
          const isCurrent = currentVideo.id === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.nextItemCard,
                {
                  backgroundColor: isCurrent ? theme.primaryLight : theme.cardBackground,
                  borderColor: isCurrent ? theme.primary : theme.cardBorder,
                },
              ]}
              onPress={() => requestPlayVideo(item)}
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
                  {item.name}
                </Text>
                <Text style={[styles.nextItemSub, { color: theme.textSecondary }]}>
                  {item.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoContainer: {
    width: '100%',
    height: Dimensions.get('window').width * (9 / 16),
    maxHeight: 280,
    position: 'relative',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  videoTopOverlay: {
    position: 'absolute',
    top: 10,
    right: 12,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  overlayIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  overlayIconBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderColor: '#f59e0b',
  },
  overlayBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  cachingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cachingTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  cachingBarBg: {
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  cachingBarFill: {
    height: '100%',
    backgroundColor: '#0284c7',
  },
  controlsCard: {
    margin: 16,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  controlIconBtn: {
    padding: 8,
  },
  mainPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
  },
  speedText: {
    fontSize: 13,
    fontWeight: '700',
  },
  gestureGuideCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  guideHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  guideText: {
    fontSize: 12,
    lineHeight: 18,
  },
  detailsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  detailsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  switchSection: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  switchSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    marginBottom: 2,
  },
  nextItemSub: {
    fontSize: 11,
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
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
