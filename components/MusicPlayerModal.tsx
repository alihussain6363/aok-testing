import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SeekBar } from '@/components/SeekBar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { type DriveItem } from '@/services/googleDriveService';
import { downloadMediaToLocal, formatBytes } from '@/services/downloadManager';

interface MusicPlayerModalProps {
  visible: boolean;
  playlist: DriveItem[];
  currentIndex: number;
  authToken?: string | null;
  onClose: () => void;
  onTrackChange?: (index: number) => void;
}

export const MusicPlayerModal: React.FC<MusicPlayerModalProps> = ({
  visible,
  playlist,
  currentIndex: initialIndex,
  authToken,
  onClose,
  onTrackChange,
}) => {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex, visible]);

  const currentTrack = playlist[index] || playlist[0];

  // Helper to build audio source with Google Drive auth header
  const getAudioSource = (item: DriveItem) => {
    if (!item) return '';
    const isGoogleApi = item.downloadUrl.includes('googleapis.com');
    if (isGoogleApi && authToken) {
      return {
        uri: item.downloadUrl,
        headers: { Authorization: `Bearer ${authToken}` },
      };
    }
    return item.downloadUrl;
  };

  // Initialize expo-video player for audio playback
  const player = useVideoPlayer(currentTrack ? (getAudioSource(currentTrack) as any) : null, (p) => {
    p.loop = isLooping;
    // timeUpdate events are disabled by default (interval 0) — without this the timer and progress bar never move
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });

  // When track or index changes, replace player source
  useEffect(() => {
    if (player && currentTrack && visible) {
      const src = getAudioSource(currentTrack);
      setCurrentTime(0);
      setDuration(0);
      player.replace(src as any);
      player.play();
      setIsPlaying(true);
    }
  }, [index, currentTrack?.id, visible, authToken]);

  // Synchronize playback events
  useEffect(() => {
    if (!player) return;
    player.loop = isLooping;

    const subSourceLoad = player.addListener('sourceLoad', (event) => {
      if (event.duration > 0) {
        setDuration(event.duration);
      }
    });

    const subStatus = player.addListener('statusChange', ({ status }) => {
      setIsPlaying(status === 'readyToPlay' && player.playing);
    });

    const subPlaying = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });

    const subTime = player.addListener('timeUpdate', ({ currentTime: curr }) => {
      setCurrentTime(curr);
      if (player.duration) {
        setDuration(player.duration);
      }
    });

    return () => {
      subSourceLoad.remove();
      subStatus.remove();
      subPlaying.remove();
      subTime.remove();
    };
  }, [player, isLooping]);

  if (!visible || !currentTrack) return null;

  const togglePlayPause = () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleNext = () => {
    if (playlist.length <= 1) return;
    let nextIdx = index + 1;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * playlist.length);
    } else if (nextIdx >= playlist.length) {
      nextIdx = 0;
    }
    setIndex(nextIdx);
    onTrackChange?.(nextIdx);
  };

  const handlePrev = () => {
    if (playlist.length <= 1) return;
    let prevIdx = index - 1;
    if (prevIdx < 0) {
      prevIdx = playlist.length - 1;
    }
    setIndex(prevIdx);
    onTrackChange?.(prevIdx);
  };

  const handleSeek = (seconds: number) => {
    if (!player || duration <= 0) return;
    const target = Math.max(0, Math.min(duration, seconds));
    player.currentTime = target;
    setCurrentTime(target);
  };

  const handleSaveMusic = async () => {
    setIsSaving(true);
    try {
      await downloadMediaToLocal(
        currentTrack.downloadUrl,
        currentTrack.name,
        'audio',
        currentTrack.id,
        currentTrack.thumbnailUrl
      );
      Alert.alert('Saved to Phone!', `"${currentTrack.name}" has been saved to your offline music library.`);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not download track.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Invisible VideoView container so expo-video audio pipeline processes on Android */}
        <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}>
          <VideoView style={{ width: 1, height: 1 }} player={player} />
        </View>

        {/* Header Bar */}
        <View style={[styles.headerBar, { paddingTop: insets.top > 0 ? insets.top + 8 : 16 }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="chevron-down" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerCategory}>PLAYING FROM FOLDER</Text>
            <Text style={styles.headerFolderName} numberOfLines={1}>
              {currentTrack.name}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowQueue(!showQueue)}
            style={[styles.iconBtn, showQueue && { backgroundColor: '#38bdf8' }]}>
            <Ionicons name="list" size={22} color={showQueue ? '#0a0a0c' : '#fff'} />
          </TouchableOpacity>
        </View>

        {/* Content Body: Either Now Playing or Folder Queue */}
        {showQueue ? (
          <View style={styles.queueContainer}>
            <Text style={styles.queueHeaderTitle}>Folder Music Queue ({playlist.length})</Text>
            <FlatList
              data={playlist}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index: itemIdx }) => {
                const isSelected = itemIdx === index;
                return (
                  <TouchableOpacity
                    style={[styles.queueItem, isSelected && styles.queueItemActive]}
                    onPress={() => {
                      setIndex(itemIdx);
                      onTrackChange?.(itemIdx);
                    }}>
                    <Ionicons
                      name={isSelected ? 'musical-notes' : 'musical-note-outline'}
                      size={20}
                      color={isSelected ? '#38bdf8' : '#94a3b8'}
                      style={{ marginRight: 12 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.queueItemName, isSelected && { color: '#38bdf8', fontWeight: '700' }]}
                        numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.queueItemSize}>
                        {item.sizeBytes ? formatBytes(item.sizeBytes) : 'Google Drive'}
                      </Text>
                    </View>
                    {isSelected && <Ionicons name="volume-high" size={18} color="#38bdf8" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        ) : (
          <View style={styles.playerBody}>
            {/* Vinyl / Album Art Disc with Glowing Ring */}
            <View style={styles.discWrapper}>
              <View style={styles.discGlow} />
              <View style={styles.disc}>
                <Ionicons name="disc-outline" size={120} color="#38bdf8" />
                <View style={styles.discCenter}>
                  <Ionicons name="musical-notes" size={32} color="#fff" />
                </View>
              </View>
            </View>

            {/* Song Meta Info */}
            <View style={styles.songMetaBox}>
              <Text style={styles.songTitle} numberOfLines={2}>
                {currentTrack.name}
              </Text>
              <Text style={styles.songSubtitle}>
                Track {index + 1} of {playlist.length} • {currentTrack.sizeBytes ? formatBytes(currentTrack.sizeBytes) : 'Drive Audio'}
              </Text>
            </View>

            {/* Progress Slider */}
            <View style={styles.progressContainer}>
              <SeekBar
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                onScrubChange={setScrubPreview}
              />
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatSeconds(scrubPreview ?? currentTime)}</Text>
                <Text style={styles.timeText}>{formatSeconds(duration)}</Text>
              </View>
            </View>

            {/* Main Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                onPress={() => setIsShuffle(!isShuffle)}
                style={[styles.secBtn, isShuffle && styles.secBtnActive]}>
                <Ionicons name="shuffle" size={20} color={isShuffle ? '#38bdf8' : '#94a3b8'} />
              </TouchableOpacity>

              <TouchableOpacity onPress={handlePrev} style={styles.mainCtrlBtn}>
                <Ionicons name="play-skip-back" size={28} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={togglePlayPause} style={styles.playPauseBtn}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color="#0a0a0c" />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleNext} style={styles.mainCtrlBtn}>
                <Ionicons name="play-skip-forward" size={28} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsLooping(!isLooping)}
                style={[styles.secBtn, isLooping && styles.secBtnActive]}>
                <Ionicons name="repeat" size={20} color={isLooping ? '#38bdf8' : '#94a3b8'} />
              </TouchableOpacity>
            </View>

            {/* Save to Phone Offline Button */}
            <TouchableOpacity
              onPress={handleSaveMusic}
              style={styles.downloadTrackBtn}
              disabled={isSaving}
              activeOpacity={0.8}>
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                  <Text style={styles.downloadTrackBtnText}>Save to Phone Library</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: insets.bottom + 8 }} />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0c0e14',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleBox: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  headerCategory: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  headerFolderName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  playerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  discWrapper: {
    width: 240,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  discGlow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  disc: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#161922',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    elevation: 8,
    shadowColor: '#38bdf8',
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  discCenter: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  songMetaBox: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  songTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  songSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 6,
  },
  progressContainer: {
    width: '100%',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  secBtn: {
    padding: 10,
    borderRadius: 20,
  },
  secBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  mainCtrlBtn: {
    padding: 12,
  },
  playPauseBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
  },
  downloadTrackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  downloadTrackBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  queueContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  queueHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  queueItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  queueItemName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  queueItemSize: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
});
