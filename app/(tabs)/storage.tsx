import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayback, type DeletePreference } from '@/context/PlaybackContext';
import {
  formatBytes,
  clearAllLocalVideos,
  deleteLocalVideo,
  getTotalStorageUsed,
} from '@/services/downloadManager';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function StorageScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const {
    localVideos,
    refreshLocalVideos,
    requestPlayVideo,
    deletePreference,
    setDeletePreference,
    currentVideo,
  } = usePlayback();

  const [totalStorage, setTotalStorage] = useState<{ totalBytes: number; formatted: string }>({
    totalBytes: 0,
    formatted: '0 B',
  });

  const loadStorageInfo = async () => {
    const info = await getTotalStorageUsed();
    setTotalStorage(info);
  };

  useEffect(() => {
    loadStorageInfo();
  }, [localVideos]);

  const handleDeleteItem = (localUri: string, title: string) => {
    Alert.alert('Delete Video', `Remove "${title}" from device storage?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalVideo(localUri);
          await refreshLocalVideos();
        },
      },
    ]);
  };

  const handleClearAll = () => {
    if (localVideos.length === 0) return;
    Alert.alert(
      'Clear All Videos',
      'This will delete all downloaded videos from device storage. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAllLocalVideos();
            await refreshLocalVideos();
          },
        },
      ]
    );
  };

  const PREFERENCE_OPTIONS: { id: DeletePreference; title: string; desc: string; icon: any }[] = [
    {
      id: 'ask',
      title: 'Ask Every Time (Recommended)',
      desc: 'Show a prompt asking to delete the previous video when playing the next video',
      icon: 'help-circle-outline',
    },
    {
      id: 'always_delete',
      title: 'Always Auto-Delete Previous',
      desc: 'Automatically remove the previous video as soon as you play a new one',
      icon: 'trash-outline',
    },
    {
      id: 'always_keep',
      title: 'Always Keep All Videos',
      desc: 'Never delete videos automatically; keep them for offline viewing',
      icon: 'save-outline',
    },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Storage Usage Card */}
      <View style={[styles.storageCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
        <View style={styles.storageHeaderRow}>
          <View style={[styles.storageIconCircle, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="folder-open" size={26} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.storageLabel, { color: theme.textSecondary }]}>
              Local Video Storage
            </Text>
            <Text style={[styles.storageValue, { color: theme.text }]}>
              {totalStorage.formatted}
            </Text>
          </View>
          {localVideos.length > 0 && (
            <TouchableOpacity
              style={[styles.clearBtn, { backgroundColor: theme.dangerLight, borderColor: theme.danger }]}
              onPress={handleClearAll}
              activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={14} color={theme.danger} />
              <Text style={[styles.clearBtnText, { color: theme.danger }]}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.meterTrack, { backgroundColor: theme.cardBorder }]}>
          <View
            style={[
              styles.meterFill,
              {
                backgroundColor: theme.primary,
                width: `${Math.min(100, Math.max(10, (totalStorage.totalBytes / (50 * 1024 * 1024)) * 100))}%`,
              },
            ]}
          />
        </View>

        <Text style={[styles.meterCaption, { color: theme.textSecondary }]}>
          {localVideos.length} cached video file(s) saved in app storage
        </Text>
      </View>

      {/* Smart Cleanup Behavior Preferences */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="settings-outline" size={18} color={theme.primary} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Next Video Cleanup Policy
          </Text>
        </View>

        <View style={[styles.prefCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
          {PREFERENCE_OPTIONS.map((opt, index) => {
            const isSelected = deletePreference === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.prefOptionRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.cardBorder },
                  isSelected && { backgroundColor: theme.primaryLight },
                ]}
                onPress={() => setDeletePreference(opt.id)}
                activeOpacity={0.7}>
                <Ionicons
                  name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={isSelected ? theme.primary : theme.textSecondary}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.prefOptionTitle,
                      { color: isSelected ? theme.primary : theme.text, fontWeight: isSelected ? '700' : '600' },
                    ]}>
                    {opt.title}
                  </Text>
                  <Text style={[styles.prefOptionDesc, { color: theme.textSecondary }]}>
                    {opt.desc}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Downloaded Videos List */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="film-outline" size={18} color={theme.primary} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Downloaded Videos ({localVideos.length})
          </Text>
        </View>

        {localVideos.length === 0 ? (
          <View
            style={[
              styles.emptyStateCard,
              { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
            ]}>
            <Ionicons name="cloud-download-outline" size={36} color={theme.textSecondary} />
            <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
              No Local Videos Stored
            </Text>
            <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary }]}>
              When you play videos from Google Drive, they will be saved here for offline playback.
            </Text>
          </View>
        ) : (
          localVideos.map((item) => {
            const isPlayingThis = currentVideo?.id === item.id;
            return (
              <View
                key={item.id}
                style={[
                  styles.videoRowCard,
                  { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
                ]}>
                <View style={[styles.videoBadgeIcon, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="videocam" size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>
                    {formatBytes(item.sizeBytes)} • Saved{' '}
                    {new Date(item.downloadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                {/* Actions */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.playBtn, { backgroundColor: theme.primary }]}
                    onPress={() => requestPlayVideo(item)}
                    activeOpacity={0.8}>
                    <Ionicons name="play" size={14} color="#fff" />
                    <Text style={styles.playBtnText}>{isPlayingThis ? 'Playing' : 'Play'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.deleteBtn, { backgroundColor: theme.dangerLight }]}
                    onPress={() => handleDeleteItem(item.localUri, item.title)}
                    activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={16} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* APK Export Information Box */}
      <View
        style={[
          styles.apkCard,
          { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
        ]}>
        <View style={styles.apkHeaderRow}>
          <Ionicons name="logo-android" size={24} color="#10B981" />
          <Text style={[styles.apkTitle, { color: theme.text }]}>Android APK Export</Text>
        </View>
        <Text style={[styles.apkText, { color: theme.textSecondary }]}>
          This app is ready to compile into a standalone Android APK. You can run:{'\n'}
          <Text style={{ fontFamily: 'SpaceMono', color: theme.primary }}>
            npx eas-cli build -p android --profile preview
          </Text>
          {'\n'}or prebuild locally with{' '}
          <Text style={{ fontFamily: 'SpaceMono', color: theme.primary }}>npx expo prebuild</Text>.
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  storageCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  storageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  storageIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storageLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  storageValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  meterTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
  },
  meterCaption: {
    fontSize: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  prefCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  prefOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  prefOptionTitle: {
    fontSize: 14,
    marginBottom: 2,
  },
  prefOptionDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  emptyStateCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  videoRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  videoBadgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  playBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 8,
  },
  apkCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  apkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  apkTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  apkText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
