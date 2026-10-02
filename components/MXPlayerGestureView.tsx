import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MXPlayerGestureViewProps {
  children: React.ReactNode;
  durationSeconds: number;
  currentPositionSeconds: number;
  onSeekTo: (newSeconds: number) => void;
  onToggleControls: () => void;
  onDoubleTapSeek: (forward: boolean) => void;
  volume: number;
  onVolumeChange: (newVol: number) => void;
}

export const MXPlayerGestureView: React.FC<MXPlayerGestureViewProps> = ({
  children,
  durationSeconds,
  currentPositionSeconds,
  onSeekTo,
  onToggleControls,
  onDoubleTapSeek,
  volume,
  onVolumeChange,
}) => {
  const [hudType, setHudType] = useState<'volume' | 'seek' | 'brightness' | null>(null);
  const [hudValue, setHudValue] = useState<number>(0);
  const [seekTarget, setSeekTarget] = useState<number>(0);
  const [seekDelta, setSeekDelta] = useState<number>(0);

  const lastTapRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const startVolumeRef = useRef<number>(volume);
  const startPosRef = useRef<number>(currentPositionSeconds);
  const isGestureActiveRef = useRef<boolean>(false);
  const gestureModeRef = useRef<'none' | 'vertical_right' | 'vertical_left' | 'horizontal'>('none');

  const screenWidth = Dimensions.get('window').width;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        isGestureActiveRef.current = false;
        gestureModeRef.current = 'none';
        startYRef.current = evt.nativeEvent.pageY;
        startVolumeRef.current = volume;
        startPosRef.current = currentPositionSeconds;
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const touchX = evt.nativeEvent.pageX;
        const dx = gestureState.dx;
        const dy = gestureState.dy;

        // Determine gesture mode if not set
        if (gestureModeRef.current === 'none') {
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
            gestureModeRef.current = 'horizontal';
            isGestureActiveRef.current = true;
          } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
            gestureModeRef.current = touchX > screenWidth / 2 ? 'vertical_right' : 'vertical_left';
            isGestureActiveRef.current = true;
          }
        }

        if (gestureModeRef.current === 'vertical_right' || gestureModeRef.current === 'vertical_left') {
          // Volume control (swipe up = louder, swipe down = quieter)
          const deltaVolume = -dy / 200;
          const newVol = Math.max(0, Math.min(1, startVolumeRef.current + deltaVolume));
          setHudType('volume');
          setHudValue(Math.round(newVol * 100));
          onVolumeChange(newVol);
        } else if (gestureModeRef.current === 'horizontal') {
          // Seek gesture
          // 1 pixel = 0.5 second
          const deltaSec = Math.round(dx * 0.5);
          const target = Math.max(0, Math.min(durationSeconds || 1000, startPosRef.current + deltaSec));
          setHudType('seek');
          setSeekDelta(deltaSec);
          setSeekTarget(target);
        }
      },
      onPanResponderRelease: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (isGestureActiveRef.current) {
          if (gestureModeRef.current === 'horizontal') {
            const deltaSec = Math.round(gestureState.dx * 0.5);
            const target = Math.max(0, Math.min(durationSeconds || 1000, startPosRef.current + deltaSec));
            onSeekTo(target);
          }
          setTimeout(() => setHudType(null), 700);
        } else {
          // It was a tap (not a drag)
          const now = Date.now();
          if (now - lastTapRef.current < 280) {
            // Double tap
            const touchX = evt.nativeEvent.pageX;
            const isRightSide = touchX > screenWidth / 2;
            onDoubleTapSeek(isRightSide);
            setHudType('seek');
            setSeekDelta(isRightSide ? 10 : -10);
            setSeekTarget(Math.max(0, currentPositionSeconds + (isRightSide ? 10 : -10)));
            setTimeout(() => setHudType(null), 800);
            lastTapRef.current = 0;
          } else {
            lastTapRef.current = now;
            setTimeout(() => {
              if (Date.now() - lastTapRef.current >= 280 && lastTapRef.current !== 0) {
                onToggleControls();
              }
            }, 300);
          }
        }
        gestureModeRef.current = 'none';
        isGestureActiveRef.current = false;
      },
    })
  ).current;

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {children}

      {/* OSD Volume HUD */}
      {hudType === 'volume' && (
        <View style={styles.hudOverlay}>
          <View style={styles.hudBox}>
            <Ionicons
              name={hudValue === 0 ? 'volume-mute' : hudValue < 50 ? 'volume-low' : 'volume-high'}
              size={36}
              color="#fff"
            />
            <Text style={styles.hudText}>Volume: {hudValue}%</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${hudValue}%` }]} />
            </View>
          </View>
        </View>
      )}

      {/* OSD Seek HUD */}
      {hudType === 'seek' && (
        <View style={styles.hudOverlay}>
          <View style={styles.hudBox}>
            <Ionicons name={seekDelta >= 0 ? 'play-forward' : 'play-back'} size={36} color="#fff" />
            <Text style={styles.hudSeekTime}>{formatSeconds(seekTarget)}</Text>
            <Text style={styles.hudDeltaText}>
              [{seekDelta >= 0 ? `+${seekDelta}` : `${seekDelta}`} sec]
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  hudOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
    zIndex: 99,
  },
  hudBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 160,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  hudText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  hudSeekTime: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
  },
  hudDeltaText: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  progressBarBg: {
    width: 120,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 3,
  },
});
