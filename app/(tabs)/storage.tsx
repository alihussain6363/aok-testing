import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback, type DeletePreference } from '@/context/PlaybackContext';
import {
  formatBytes,
  deleteLocalMedia,
  getLocalMedia,
  clearAllLocalMedia,
  getTotalLocalStorageUsed,
  type LocalMediaItem,
} from '@/services/downloadManager';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type LibraryTab = 'all' | 'video' | 'audio' | 'image';

export default function StorageScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const {
    localVideos,
    refreshLocalVideos,
    requestPlayVideo,
    requestPlayAudio,
    requestViewImages,
    deletePreference,
    setDeletePreference,
    currentVideo,
  } = usePlayback();

  const [activeTab, setActiveTab] = useState<LibraryTab>('all');
  const [allLocalItems, setAllLocalItems] = useState<LocalMediaItem[]>([]);
  const [totalBytes, setTotalBytes] = useState<number>(0);

  const loadData = async () => {
    const items = await getLocalMedia();
    setAllLocalItems(items);
    const total = await getTotalLocalStorageUsed();
    setTotalBytes(total);
  };

  useEffect(() => {
    loadData();
  }, [localVideos]);

  const handleDeleteItem = (localUri: string, title: string) => {
    Alert.alert(
      'Delete from Device Storage',
      `Delete "${title}" from your phone's memory?\n\n(Note: This will NEVER delete anything from your Google Drive)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete from Phone',
          style: 'destructive',
          onPress: async () => {
            await deleteLocalMedia(localUri);
            await refreshLocalVideos();
            await loadData();
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (allLocalItems.length === 0) return;
    Alert.alert(
      'Clear All Device Downloads',
      'This will remove all downloaded media from your phone to free up space. All files on your Google Drive remain 100% safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Phone Storage',
          style: 'destructive',
          onPress: async () => {
            await clearAllLocalMedia();
            await refreshLocalVideos();
            await loadData();
          },
        },
      ]
    );
  };

  const handleItemPress = (item: LocalMediaItem) => {
    if (item.mediaKind === 'video') {
      requestPlayVideo(item);
    } else if (item.mediaKind === 'audio') {
      const driveItem = {
        id: item.googleDriveId || item.id,
        name: item.title,
        isFolder: false,
        kind: 'audio' as const,
        downloadUrl: item.localUri,
        source: 'google_drive' as const,
      };
      requestPlayAudio(driveItem);
    } else if (item.mediaKind === 'image') {
      const driveItem = {
        id: item.googleDriveId || item.id,
        name: item.title,
        isFolder: false,
        kind: 'image' as const,
        downloadUrl: item.localUri,
        source: 'google_drive' as const,
      };
      requestViewImages([driveItem], 0);
    }
  };

  const filteredItems = allLocalItems.filter((i) => {
    if (activeTab === 'all') return true;
    return i.mediaKind === activeTab;
  });

  const videoCount = allLocalItems.filter((i) => i.mediaKind === 'video').length;
  const audioCount = allLocalItems.filter((i) => i.mediaKind === 'audio').length;
  const imageCount = allLocalItems.filter((i) => i.mediaKind === 'image').length;

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
      desc: 'Automatically remove the previous video as soon as you play a new one to save phone space',
      icon: 'trash-outline',
    },
    {
      id: 'always_keep',
      title: 'Always Keep All Media',
      desc: 'Never delete media automatically; keep them saved on phone for offline viewing',
      icon: 'save-outline',
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {/* Storage Usage Summary Card */}
      <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
        <View style={styles.summaryHeader}>
          <View style={[styles.summaryIconCircle, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="pie-chart" size={24} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: theme.text }]}>Phone Storage Used</Text>
            <Text style={[styles.summarySubtitle, { color: theme.textSecondary }]}>
              Offline downloads managed on this device
            </Text>
          </View>
          <Text style={[styles.storageAmountText, { color: theme.primary }]}>
            {formatBytes(totalBytes)}
          </Text>
        </View>

        {/* Breakdown bar */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: theme.text }]}>{videoCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>🎬 Videos</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: theme.text }]}>{audioCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>🎵 Audio</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: theme.text }]}>{imageCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>🖼️ Photos</Text>
          </View>
        </View>

        {/* Clear All Button */}
        {allLocalItems.length > 0 && (
          <TouchableOpacity style={styles.clearAllBtn} onPress={handleClearAll} activeOpacity={0.8}>
            <Ionicons name="trash" size={16} color="#ef4444" />
            <Text style={styles.clearAllBtnText}>Clear Phone Cache ({allLocalItems.length} items)</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Library Tabs (Videos, Audio, Photos, All) */}
      <View style={styles.libraryTabsContainer}>
        <TouchableOpacity
          style={[styles.libraryTab, activeTab === 'all' && { backgroundColor: theme.primary, borderColor: theme.primary }]}
          onPress={() => setActiveTab('all')}>
          <Text style={[styles.libraryTabText, activeTab === 'all' ? { color: '#fff' } : { color: theme.text }]}>
            All ({allLocalItems.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.libraryTab, activeTab === 'video' && { backgroundColor: theme.primary, borderColor: theme.primary }]}
          onPress={() => setActiveTab('video')}>
          <Text style={[styles.libraryTabText, activeTab === 'video' ? { color: '#fff' } : { color: theme.text }]}>
            🎬 Videos ({videoCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.libraryTab, activeTab === 'audio' && { backgroundColor: theme.primary, borderColor: theme.primary }]}
          onPress={() => setActiveTab('audio')}>
          <Text style={[styles.libraryTabText, activeTab === 'audio' ? { color: '#fff' } : { color: theme.text }]}>
            🎵 Music ({audioCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.libraryTab, activeTab === 'image' && { backgroundColor: theme.primary, borderColor: theme.primary }]}
          onPress={() => setActiveTab('image')}>
          <Text style={[styles.libraryTabText, activeTab === 'image' ? { color: '#fff' } : { color: theme.text }]}>
            🖼️ Photos ({imageCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Media Items List */}
      <View style={styles.itemsSection}>
        {filteredItems.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <Ionicons name="cloud-download-outline" size={38} color={theme.textSecondary} />
            <Text style={[styles.emptyCardText, { color: theme.text }]}>No downloaded items here</Text>
            <Text style={[styles.emptyCardSub, { color: theme.textSecondary }]}>
              Files you stream or save from Google Drive will be listed here for fast offline access.
            </Text>
          </View>
        ) : (
          filteredItems.map((item) => {
            const isPlayingThis = currentVideo && currentVideo.id === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: isPlayingThis ? theme.primaryLight : theme.cardBackground,
                    borderColor: isPlayingThis ? theme.primary : theme.cardBorder,
                  },
                ]}
                onPress={() => handleItemPress(item)}
                activeOpacity={0.7}>
                <View style={[styles.itemIconCircle, { backgroundColor: theme.background }]}>
                  <Ionicons
                    name={
                      item.mediaKind === 'video'
                        ? 'film'
                        : item.mediaKind === 'audio'
                        ? 'musical-note'
                        : 'image'
                    }
                    size={22}
                    color={theme.primary}
                  />
                </View>

                <View style={styles.itemMeta}>
                  <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.itemSub, { color: theme.textSecondary }]}>
                    {formatBytes(item.sizeBytes)} • Saved on Phone
                  </Text>
                </View>

                {/* Delete button */}
                <TouchableOpacity
                  style={[styles.itemDeleteBtn, { backgroundColor: theme.dangerLight }]}
                  onPress={() => handleDeleteItem(item.localUri, item.title)}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Auto-Delete Rules & Preferences */}
      <View style={styles.preferencesSection}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="options" size={20} color={theme.primary} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Storage Cleanup Policy</Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
          Choose how the app manages phone storage when switching between files:
        </Text>

        {PREFERENCE_OPTIONS.map((opt) => {
          const isSelected = deletePreference === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.preferenceCard,
                {
                  backgroundColor: isSelected ? theme.primaryLight : theme.cardBackground,
                  borderColor: isSelected ? theme.primary : theme.cardBorder,
                },
              ]}
              onPress={() => setDeletePreference(opt.id)}
              activeOpacity={0.7}>
              <View style={[styles.radioCircle, { borderColor: isSelected ? theme.primary : theme.textSecondary }]}>
                {isSelected && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}
              </View>
              <View style={styles.preferenceMeta}>
                <Text style={[styles.prefTitle, { color: theme.text, fontWeight: isSelected ? '700' : '500' }]}>
                  {opt.title}
                </Text>
                <Text style={[styles.prefDesc, { color: theme.textSecondary }]}>{opt.desc}</Text>
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
    padding: 16,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  summarySubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  storageAmountText: {
    fontSize: 18,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  statBox: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  clearAllBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  libraryTabsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  libraryTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  libraryTabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemsSection: {
    marginBottom: 20,
  },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyCardText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyCardSub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemMeta: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemSub: {
    fontSize: 12,
  },
  itemDeleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  preferencesSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18,
  },
  preferenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  preferenceMeta: {
    flex: 1,
  },
  prefTitle: {
    fontSize: 14,
    marginBottom: 2,
  },
  prefDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
});
