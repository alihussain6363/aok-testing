import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onScrubStart?: () => void;
  onScrubChange?: (seconds: number | null) => void;
  trackColor?: string;
  fillColor?: string;
  thumbColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Draggable progress bar: tap to jump, drag to scrub. Measures its own width via onLayout
 * and only commits the seek on release so the player isn't flooded with seeks mid-drag.
 */
export const SeekBar: React.FC<SeekBarProps> = ({
  currentTime,
  duration,
  onSeek,
  onScrubStart,
  onScrubChange,
  trackColor = 'rgba(255,255,255,0.25)',
  fillColor = '#38bdf8',
  thumbColor = '#ffffff',
  style,
}) => {
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);
  const widthRef = useRef(0);

  const secondsAt = (e: GestureResponderEvent) => {
    const w = widthRef.current;
    if (w <= 0 || duration <= 0) return 0;
    return Math.max(0, Math.min(1, e.nativeEvent.locationX / w)) * duration;
  };

  const updateScrub = (e: GestureResponderEvent) => {
    const sec = secondsAt(e);
    setScrubSeconds(sec);
    onScrubChange?.(sec);
  };

  const endScrub = () => {
    setScrubSeconds(null);
    onScrubChange?.(null);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const shown = scrubSeconds ?? currentTime;
  const percent = duration > 0 ? Math.max(0, Math.min(100, (shown / duration) * 100)) : 0;

  return (
    <View
      style={[styles.hitArea, style]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // Don't let the parent video gesture layer steal the drag
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        onScrubStart?.();
        updateScrub(e);
      }}
      onResponderMove={updateScrub}
      onResponderRelease={(e) => {
        if (duration > 0) onSeek(secondsAt(e));
        endScrub();
      }}
      onResponderTerminate={endScrub}>
      {/* pointerEvents none so locationX is always relative to the hit area, not a child */}
      <View pointerEvents="none" style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: fillColor }]} />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          { left: `${percent}%`, backgroundColor: thumbColor },
          scrubSeconds !== null && styles.thumbActive,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hitArea: {
    height: 28,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    top: 7,
  },
  thumbActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    top: 4,
  },
});
