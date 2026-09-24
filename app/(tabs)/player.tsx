import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayback } from '@/context/PlaybackContext';
import { formatBytes } from '@/services/downloadManager';
import { SAMPLE_VIDEOS } from '@/services/googleDriveService';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function PlayerScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const {
    currentVideo,
    requestPlayVideo,
    deleteCurrentVideoNow,
    localVideos,
  } = usePlayback();

  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);

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

  // Listen for playback state changes
  useEffect(() => {
    if (!player) return;
    const subscription = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
    });
    return () => {
      subscription?.remove();
    };
  }, [player]);

  const togglePlayPause = () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const seekRelative = (seconds: number) => {
    if (!player) return;
    player.currentTime = Math.max(0, player.currentTime + seconds);
  };

  const handleReplay = () => {
    if (!player) return;
    player.currentTime = 0;
    player.play();
  };

  const handleCycleSpeed = () => {
    if (!player) return;
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackSpeed(newSpeed);
    player.playbackRate = newSpeed;
  };

  const toggleMute = () => {
    if (!player) return;
    player.muted = !player.muted;
    setIsMuted(player.muted);
  };

  const handleDeleteThisVideo = () => {
    Alert.alert(
      'Delete Video',
      `Are you sure you want to delete "${currentVideo?.title}" from local storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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
          Select a video from your Google Drive or test with a sample cloud video to start playing.
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

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Video Viewport Container */}
      <View style={[styles.videoContainer, { backgroundColor: '#000' }]}>
        <VideoView
          style={styles.videoPlayer}
          player={player}
          nativeControls
          contentFit="contain"
          allowsPictureInPicture
          startsPictureInPictureAutomatically
        />
      </View>

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

      {/* Video Information & Local Storage Status */}
      <View style={[styles.detailsCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
        <View style={styles.detailsHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.videoTitle, { color: theme.text }]} numberOfLines={2}>
              {currentVideo.title}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: theme.successLight }]}>
                <Ionicons name="folder-outline" size={14} color={theme.success} />
                <Text style={[styles.statusBadgeText, { color: theme.success }]}>
                  Playing from Local Storage
                </Text>
              </View>
              <Text style={[styles.sizeText, { color: theme.textSecondary }]}>
                {formatBytes(currentVideo.sizeBytes)}
              </Text>
            </View>
          </View>

          {/* Delete current video button */}
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: theme.dangerLight, borderColor: theme.danger }]}
            onPress={handleDeleteThisVideo}
            activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={16} color={theme.danger} />
            <Text style={[styles.deleteButtonText, { color: theme.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.uriBox, { backgroundColor: theme.background }]}>
          <Text style={[styles.uriLabel, { color: theme.textSecondary }]}>Local Path:</Text>
          <Text style={[styles.uriText, { color: theme.textSecondary }]} numberOfLines={1}>
            {currentVideo.localUri}
          </Text>
        </View>
      </View>

      {/* "Play Next Video" Quick Selector (to test prompt) */}
      <View style={styles.switchSection}>
        <View style={styles.switchSectionHeader}>
          <Ionicons name="play-skip-forward-circle-outline" size={20} color={theme.primary} />
          <Text style={[styles.switchSectionTitle, { color: theme.text }]}>
            Play Next Video (Triggers Delete Prompt)
          </Text>
        </View>
        <Text style={[styles.switchSectionSubtitle, { color: theme.textSecondary }]}>
          Tap any video below while this video is playing. The app will prompt you: "Would you like to delete the previous video from local storage?"
        </Text>

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
              onPress={() => {
                if (!isCurrent) {
                  requestPlayVideo(item);
                }
              }}
              activeOpacity={0.7}
              disabled={isCurrent}>
              <Ionicons
                name={isCurrent ? 'radio-button-on' : 'play-circle-outline'}
                size={24}
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
                <Text style={[styles.nextItemSize, { color: theme.textSecondary }]}>
                  {formatBytes(item.sizeBytes)} {isCurrent ? '• Currently Playing' : ''}
                </Text>
              </View>
              {!isCurrent && (
                <View style={[styles.switchBtnBadge, { backgroundColor: theme.primaryLight }]}>
                  <Text style={[styles.switchBtnText, { color: theme.primary }]}>Switch</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  controlsCard: {
    marginHorizontal: 16,
    marginTop: -16,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  speedText: {
    fontSize: 14,
    fontWeight: '700',
  },
  detailsCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  detailsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  uriBox: {
    marginTop: 12,
    padding: 8,
    borderRadius: 8,
  },
  uriLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  uriText: {
    fontSize: 11,
  },
  switchSection: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  switchSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  switchSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  switchSectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  nextItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  nextItemTitle: {
    fontSize: 14,
    marginBottom: 2,
  },
  nextItemSize: {
    fontSize: 12,
  },
  switchBtnBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  switchBtnText: {
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 320,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
