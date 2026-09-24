import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayback } from '@/context/PlaybackContext';
import { formatBytes } from '@/services/downloadManager';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export const PlaybackModals: React.FC = () => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const {
    currentVideo,
    pendingVideo,
    showDeleteModal,
    downloadState,
    confirmDeletePreviousAndPlayNext,
    confirmKeepPreviousAndPlayNext,
    cancelNextVideo,
  } = usePlayback();

  return (
    <>
      {/* 1. Next Video Smart Cleanup Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={cancelNextVideo}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.dialogCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconCircle, { backgroundColor: theme.dangerLight }]}>
              <Ionicons name="trash-outline" size={28} color={theme.danger} />
            </View>

            <Text style={[styles.dialogTitle, { color: theme.text }]}>
              Delete Previous Video?
            </Text>

            <Text style={[styles.dialogSubtitle, { color: theme.textSecondary }]}>
              You are switching to play a new video. Would you like to remove the previous video from local storage to free up disk space?
            </Text>

            {currentVideo && (
              <View style={[styles.videoBadge, { backgroundColor: theme.background, borderColor: theme.cardBorder }]}>
                <Ionicons name="film-outline" size={18} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.videoBadgeTitle, { color: theme.text }]} numberOfLines={1}>
                    {currentVideo.title}
                  </Text>
                  <Text style={[styles.videoBadgeSize, { color: theme.textSecondary }]}>
                    Size: {formatBytes(currentVideo.sizeBytes)} • Saved in local storage
                  </Text>
                </View>
              </View>
            )}

            {pendingVideo && (
              <View style={styles.nextInfoRow}>
                <Ionicons name="arrow-forward-circle-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.nextInfoText, { color: theme.textSecondary }]} numberOfLines={1}>
                  Next video:{' '}
                  <Text style={{ color: theme.text, fontWeight: '600' }}>
                    {'name' in pendingVideo ? pendingVideo.name : pendingVideo.title}
                  </Text>
                </Text>
              </View>
            )}

            <View style={styles.buttonGroup}>
              {/* Primary Danger Action: Delete and Play */}
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.danger }]}
                onPress={confirmDeletePreviousAndPlayNext}
                activeOpacity={0.8}>
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Delete Previous & Play</Text>
              </TouchableOpacity>

              {/* Secondary Action: Keep and Play */}
              <TouchableOpacity
                style={[styles.actionButton, styles.keepButton, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
                onPress={confirmKeepPreviousAndPlayNext}
                activeOpacity={0.8}>
                <Ionicons name="save-outline" size={18} color={theme.primary} />
                <Text style={[styles.actionButtonText, { color: theme.primary }]}>Keep Both & Play</Text>
              </TouchableOpacity>

              {/* Cancel Action */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={cancelNextVideo}
                activeOpacity={0.6}>
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Google Drive Video Download Progress Modal */}
      <Modal
        visible={downloadState.isDownloading}
        transparent
        animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.downloadCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconCircle, { backgroundColor: theme.primaryLight }]}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>

            <Text style={[styles.dialogTitle, { color: theme.text }]}>
              Downloading from Drive...
            </Text>

            <Text style={[styles.downloadFilename, { color: theme.textSecondary }]} numberOfLines={2}>
              {downloadState.title}
            </Text>

            {/* Progress Bar Container */}
            <View style={[styles.progressBarTrack, { backgroundColor: theme.cardBorder }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: theme.primary,
                    width: `${downloadState.progressPercent || 5}%`,
                  },
                ]}
              />
            </View>

            <View style={styles.progressStatsRow}>
              <Text style={[styles.progressPercentText, { color: theme.primary }]}>
                {downloadState.progressPercent}%
              </Text>
              <Text style={[styles.progressBytesText, { color: theme.textSecondary }]}>
                {formatBytes(downloadState.bytesWritten)}
                {downloadState.totalBytes > 0 ? ` / ${formatBytes(downloadState.totalBytes)}` : ''}
              </Text>
            </View>

            <Text style={[styles.downloadHint, { color: theme.textSecondary }]}>
              Saving directly to local storage for smooth offline playback.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  downloadCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  dialogSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  videoBadge: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  videoBadgeTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  videoBadgeSize: {
    fontSize: 12,
    marginTop: 2,
  },
  nextInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  nextInfoText: {
    fontSize: 13,
  },
  buttonGroup: {
    width: '100%',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  keepButton: {
    borderWidth: 1,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  downloadFilename: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressStatsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressPercentText: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressBytesText: {
    fontSize: 13,
  },
  downloadHint: {
    fontSize: 12,
    textAlign: 'center',
  },
});
