import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { type DriveItem } from '@/services/googleDriveService';
import { downloadMediaToLocal, formatBytes } from '@/services/downloadManager';

interface MusicPlayerModalProps {
  visible: boolean;
  playlist: DriveItem[];
  currentIndex: number;
  onClose: () => void;
  onTrackChange?: (index: number) => void;
}

export const MusicPlayerModal: React.FC<MusicPlayerModalProps> = ({
  visible,
  playlist,
  currentIndex: initialIndex,
  onClose,
  onTrackChange,
}) => {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex, visible]);

  const currentTrack = playlist[index] || playlist[0];

  const player = useVideoPlayer(currentTrack ? currentTrack.downloadUrl : '', (p) => {
    p.loop = isLooping;
    p.play();
  });

  useEffect(() => {
    if (!player) return;
    player.loop = isLooping;

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

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Hidden video view for audio playback */}
        <VideoView player={player} style={styles.hiddenVideo} />

        {/* Top Header */}
        <View style={[styles.headerBar, { paddingTop: insets.top > 0 ? insets.top + 8 : 16 }]}>
          <TouchableOpacity onPress={onClose} style={styles.circleIconBtn}>
            <Ionicons name="chevron-down" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerSuper}>PLAYING FROM DRIVE</Text>
            <Text style={styles.headerTrackTitle} numberOfLines={1}>
              {currentTrack.name}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSaveMusic} style={styles.circleIconBtn} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#38bdf8" />
            ) : (
              <Ionicons name="arrow-down-circle-outline" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Vinyl / Album Art Display */}
        <View style={styles.artContainer}>
          <View style={styles.vinylDisk}>
            <View style={styles.vinylGrooves}>
              <View style={styles.vinylCenter}>
                <Ionicons name="musical-notes" size={44} color="#38bdf8" />
              </View>
            </View>
          </View>
        </View>

        {/* Track Metadata */}
        <View style={styles.metaContainer}>
          <Text style={styles.trackTitleText} numberOfLines={2}>
            {currentTrack.name}
          </Text>
          <Text style={styles.trackSubtitleText}>
            Track {index + 1} of {playlist.length} • {currentTrack.sizeBytes ? formatBytes(currentTrack.sizeBytes) : 'Google Drive Audio'}
          </Text>
        </View>

        {/* Progress Bar & Timestamps */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatSeconds(currentTime)}</Text>
            <Text style={styles.timeText}>{formatSeconds(duration)}</Text>
          </View>
        </View>

        {/* Controls Bar */}
        <View style={[styles.controlsContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom + 16 : 24 }]}>
          <TouchableOpacity
            onPress={() => setIsShuffle(!isShuffle)}
            style={[styles.smallBtn, isShuffle && styles.activeBtn]}>
            <Ionicons name="shuffle" size={22} color={isShuffle ? '#38bdf8' : '#94a3b8'} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handlePrev} style={styles.mediumBtn}>
            <Ionicons name="play-skip-back" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity onPress={togglePlayPause} style={styles.playPauseBtn}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color="#0f172a" />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleNext} style={styles.mediumBtn}>
            <Ionicons name="play-skip-forward" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsLooping(!isLooping)}
            style={[styles.smallBtn, isLooping && styles.activeBtn]}>
            <Ionicons name="repeat" size={22} color={isLooping ? '#38bdf8' : '#94a3b8'} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'space-between',
  },
  hiddenVideo: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTextBox: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerSuper: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  headerTrackTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  circleIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  vinylDisk: {
    width: Dimensions.get('window').width * 0.65,
    height: Dimensions.get('window').width * 0.65,
    maxWidth: 280,
    maxHeight: 280,
    borderRadius: 140,
    backgroundColor: '#111827',
    borderWidth: 8,
    borderColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  vinylGrooves: {
    width: '84%',
    height: '84%',
    borderRadius: 120,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vinylCenter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1e293b',
    borderWidth: 3,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaContainer: {
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  trackTitleText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  trackSubtitleText: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  progressContainer: {
    paddingHorizontal: 28,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 16,
  },
  smallBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  mediumBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});
