import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback } from '@/context/PlaybackContext';
import {
  SAMPLE_VIDEOS,
  SERVICE_ACCOUNT,
  extractDriveFileId,
  buildDriveDownloadUrl,
  fetchDriveItems,
  getValidAccessToken,
  type DriveItem,
  type MediaKind,
} from '@/services/googleDriveService';
import { formatBytes } from '@/services/downloadManager';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

interface FolderBreadcrumb {
  id?: string;
  name: string;
}

type FilterCategory = 'all' | 'folder' | 'video' | 'audio' | 'image';

export default function DriveScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { requestPlayVideo, requestPlayAudio, requestViewImages, localVideos } = usePlayback();

  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');

  // Folder navigation state
  const [folderStack, setFolderStack] = useState<FolderBreadcrumb[]>([{ name: 'All Shared Folders' }]);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentFolder = folderStack[folderStack.length - 1];

  // Fetch items for the current folder
  const loadFolder = useCallback(async (folderId?: string, isPullRefresh = false) => {
    if (isPullRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMsg(null);

    try {
      const result = await fetchDriveItems(folderId);
      setDriveItems(result.items);
    } catch (err: any) {
      console.error('Error fetching Drive items:', err);
      setErrorMsg(err.message || 'Could not fetch items from Google Drive');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    loadFolder(undefined);
  }, [loadFolder]);

  // Navigate into a folder
  const handleOpenFolder = (folder: DriveItem) => {
    const nextBreadcrumb: FolderBreadcrumb = { id: folder.id, name: folder.name };
    setFolderStack((prev) => [...prev, nextBreadcrumb]);
    setActiveCategory('all');
    loadFolder(folder.id);
  };

  // Navigate back to a specific breadcrumb
  const handleBreadcrumbPress = (index: number) => {
    if (index === folderStack.length - 1) return;
    const target = folderStack[index];
    setFolderStack((prev) => prev.slice(0, index + 1));
    setActiveCategory('all');
    loadFolder(target.id);
  };

  // Back button (one step up)
  const handleGoBack = () => {
    if (folderStack.length <= 1) return;
    const newStack = folderStack.slice(0, folderStack.length - 1);
    setFolderStack(newStack);
    setActiveCategory('all');
    const parentFolder = newStack[newStack.length - 1];
    loadFolder(parentFolder.id);
  };

  // Copy Service Account email to clipboard
  const handleCopyEmail = async () => {
    await Clipboard.setStringAsync(SERVICE_ACCOUNT.client_email);
    setCopiedEmail(true);
    Alert.alert('Email Copied!', `Share any folder from Google Drive with:\n\n${SERVICE_ACCOUNT.client_email}`);
    setTimeout(() => setCopiedEmail(false), 3000);
  };

  // Direct Drive Link / ID Playback
  const handleOpenDirectDriveLink = async () => {
    const input = driveUrlInput.trim();
    if (!input) {
      Alert.alert('Empty Link', 'Please enter or paste a Google Drive video link or file ID.');
      return;
    }

    const fileId = extractDriveFileId(input);
    if (!fileId) {
      Alert.alert(
        'Invalid Link',
        'Could not extract a valid Google Drive File ID. Please paste a link like: https://drive.google.com/file/d/.../view or the file ID.'
      );
      return;
    }

    try {
      const token = await getValidAccessToken();
      const downloadUrl = buildDriveDownloadUrl(fileId, token);
      const driveItem: DriveItem = {
        id: fileId,
        name: `Drive Video (${fileId.slice(0, 8)})`,
        isFolder: false,
        kind: 'video',
        downloadUrl,
        source: 'google_drive',
      };

      setDriveUrlInput('');
      await requestPlayVideo(driveItem);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not authenticate with Google Drive');
    }
  };

  // Media item tap handler
  const handleItemPress = (item: DriveItem) => {
    if (item.isFolder) {
      handleOpenFolder(item);
    } else if (item.kind === 'video') {
      requestPlayVideo(item);
    } else if (item.kind === 'audio') {
      const audioPlaylist = driveItems.filter((i) => i.kind === 'audio');
      requestPlayAudio(item, audioPlaylist);
    } else if (item.kind === 'image') {
      const imageGallery = driveItems.filter((i) => i.kind === 'image');
      const idx = imageGallery.findIndex((i) => i.id === item.id);
      requestViewImages(imageGallery, idx >= 0 ? idx : 0);
    } else {
      // Default to video/media player
      requestPlayVideo(item);
    }
  };

  // Counts by media kind
  const folderCount = driveItems.filter((i) => i.isFolder).length;
  const videoCount = driveItems.filter((i) => i.kind === 'video').length;
  const audioCount = driveItems.filter((i) => i.kind === 'audio').length;
  const imageCount = driveItems.filter((i) => i.kind === 'image').length;

  const filteredItems = driveItems.filter((item) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'folder') return item.isFolder;
    return item.kind === activeCategory;
  });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => loadFolder(currentFolder.id, true)}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      }>
      {/* Header Banner */}
      <View style={[styles.heroCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
        <View style={styles.heroHeaderRow}>
          <View style={[styles.heroIconBadge, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="logo-google" size={24} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Google Drive Explorer</Text>
            <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
              Auto-authenticated • Instant streaming & downloading
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.connectBadge,
              {
                backgroundColor: theme.successLight,
                borderColor: theme.success,
              },
            ]}
            onPress={() => setShowAccountModal(true)}
            activeOpacity={0.8}>
            <Ionicons name="shield-checkmark" size={14} color={theme.success} />
            <Text style={[styles.connectBadgeText, { color: theme.success }]}>Connected</Text>
          </TouchableOpacity>
        </View>

        {/* Input Bar for Google Drive URL / ID */}
        <View style={styles.inputContainer}>
          <View
            style={[
              styles.inputWrapper,
              { backgroundColor: theme.background, borderColor: theme.cardBorder },
            ]}>
            <Ionicons name="link-outline" size={20} color={theme.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Paste Google Drive video link or ID..."
              placeholderTextColor={theme.textSecondary}
              value={driveUrlInput}
              onChangeText={setDriveUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {driveUrlInput.length > 0 && (
              <TouchableOpacity onPress={() => setDriveUrlInput('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: theme.primary }]}
            onPress={handleOpenDirectDriveLink}
            activeOpacity={0.8}>
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.playButtonText}>Play</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Breadcrumb Navigation Bar */}
      <View
        style={[
          styles.breadcrumbCard,
          { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
        ]}>
        <View style={styles.breadcrumbRow}>
          {folderStack.length > 1 && (
            <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
              <Ionicons name="chevron-back" size={20} color={theme.primary} />
            </TouchableOpacity>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbScroll}>
            {folderStack.map((crumb, idx) => {
              const isLast = idx === folderStack.length - 1;
              return (
                <View key={`${crumb.id || 'root'}_${idx}`} style={styles.breadcrumbItem}>
                  <TouchableOpacity
                    onPress={() => handleBreadcrumbPress(idx)}
                    disabled={isLast}
                    style={styles.crumbTouch}>
                    <Ionicons
                      name={idx === 0 ? 'home' : 'folder-outline'}
                      size={14}
                      color={isLast ? theme.text : theme.primary}
                    />
                    <Text
                      style={[
                        styles.crumbText,
                        { color: isLast ? theme.text : theme.primary, fontWeight: isLast ? '700' : '500' },
                      ]}
                      numberOfLines={1}>
                      {crumb.name}
                    </Text>
                  </TouchableOpacity>
                  {!isLast && <Ionicons name="chevron-forward" size={12} color={theme.textSecondary} style={{ marginHorizontal: 4 }} />}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.refreshIconBtn, { backgroundColor: theme.background }]}
            onPress={() => loadFolder(currentFolder.id)}
            disabled={isLoading}>
            <Ionicons name="refresh" size={16} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Filter Chips */}
      {driveItems.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              activeCategory === 'all' && { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
            onPress={() => setActiveCategory('all')}>
            <Text style={[styles.filterChipText, activeCategory === 'all' ? { color: '#fff' } : { color: theme.text }]}>
              All ({driveItems.length})
            </Text>
          </TouchableOpacity>

          {folderCount > 0 && (
            <TouchableOpacity
              style={[
                styles.filterChip,
                activeCategory === 'folder' && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
              ]}
              onPress={() => setActiveCategory('folder')}>
              <Text
                style={[
                  styles.filterChipText,
                  activeCategory === 'folder' ? { color: '#fff' } : { color: theme.text },
                ]}>
                📁 Folders ({folderCount})
              </Text>
            </TouchableOpacity>
          )}

          {videoCount > 0 && (
            <TouchableOpacity
              style={[
                styles.filterChip,
                activeCategory === 'video' && { backgroundColor: '#0284c7', borderColor: '#0284c7' },
              ]}
              onPress={() => setActiveCategory('video')}>
              <Text
                style={[
                  styles.filterChipText,
                  activeCategory === 'video' ? { color: '#fff' } : { color: theme.text },
                ]}>
                🎬 Videos ({videoCount})
              </Text>
            </TouchableOpacity>
          )}

          {audioCount > 0 && (
            <TouchableOpacity
              style={[
                styles.filterChip,
                activeCategory === 'audio' && { backgroundColor: '#a855f7', borderColor: '#a855f7' },
              ]}
              onPress={() => setActiveCategory('audio')}>
              <Text
                style={[
                  styles.filterChipText,
                  activeCategory === 'audio' ? { color: '#fff' } : { color: theme.text },
                ]}>
                🎵 Music ({audioCount})
              </Text>
            </TouchableOpacity>
          )}

          {imageCount > 0 && (
            <TouchableOpacity
              style={[
                styles.filterChip,
                activeCategory === 'image' && { backgroundColor: '#10b981', borderColor: '#10b981' },
              ]}
              onPress={() => setActiveCategory('image')}>
              <Text
                style={[
                  styles.filterChipText,
                  activeCategory === 'image' ? { color: '#fff' } : { color: theme.text },
                ]}>
                🖼️ Photos ({imageCount})
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading Google Drive items...
          </Text>
        </View>
      )}

      {/* Error View */}
      {!isLoading && errorMsg && (
        <View style={[styles.errorCard, { backgroundColor: theme.cardBackground, borderColor: '#ef4444' }]}>
          <Ionicons name="alert-circle" size={24} color="#ef4444" />
          <Text style={[styles.errorText, { color: theme.text }]}>{errorMsg}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.primary }]}
            onPress={() => loadFolder(currentFolder.id)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty State / How to Share Folder Guidance */}
      {!isLoading && !errorMsg && driveItems.length === 0 && (
        <View
          style={[
            styles.emptyDriveCard,
            { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
          ]}>
          <View style={[styles.emptyIconCircle, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="folder-open" size={36} color={theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Shared Folders Found</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            To access your Google Drive folders and files inside this APK:
          </Text>

          <View style={[styles.stepCard, { backgroundColor: theme.background, borderColor: theme.cardBorder }]}>
            <Text style={[styles.stepText, { color: theme.text }]}>
              1. Open Google Drive (<Text style={{ color: theme.primary }}>drive.google.com</Text>)
            </Text>
            <Text style={[styles.stepText, { color: theme.text }]}>
              2. Right-click any folder & tap <Text style={{ fontWeight: '700' }}>Share</Text>
            </Text>
            <Text style={[styles.stepText, { color: theme.text }]}>
              3. Share with your Service Account email:
            </Text>

            <TouchableOpacity
              style={[styles.copyEmailBox, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}
              onPress={handleCopyEmail}
              activeOpacity={0.8}>
              <Text style={[styles.copyEmailText, { color: theme.text }]} numberOfLines={1}>
                {SERVICE_ACCOUNT.client_email}
              </Text>
              <View style={[styles.copyBadge, { backgroundColor: theme.primary }]}>
                <Ionicons name={copiedEmail ? 'checkmark' : 'copy'} size={14} color="#fff" />
                <Text style={styles.copyBadgeText}>{copiedEmail ? 'Copied' : 'Copy'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.refreshDriveBtn, { backgroundColor: theme.primary }]}
            onPress={() => loadFolder(currentFolder.id)}
            activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.refreshDriveBtnText}>Refresh Drive</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Drive Items Grid & List */}
      {!isLoading && filteredItems.length > 0 && (
        <View style={styles.sectionContainer}>
          {filteredItems.map((item) => {
            const isLocal = localVideos.some((l) => l.googleDriveId === item.id || l.id === item.id);
            const isFolder = item.isFolder;

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.itemCard,
                  { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
                ]}
                onPress={() => handleItemPress(item)}
                activeOpacity={0.7}>
                {/* Media Icon Badge */}
                <View
                  style={[
                    styles.itemIconBadge,
                    {
                      backgroundColor: isFolder
                        ? 'rgba(245, 158, 11, 0.15)'
                        : item.kind === 'video'
                        ? 'rgba(2, 132, 199, 0.15)'
                        : item.kind === 'audio'
                        ? 'rgba(168, 85, 247, 0.15)'
                        : 'rgba(16, 185, 129, 0.15)',
                    },
                  ]}>
                  <Ionicons
                    name={
                      isFolder
                        ? 'folder'
                        : item.kind === 'video'
                        ? 'film'
                        : item.kind === 'audio'
                        ? 'musical-notes'
                        : 'image'
                    }
                    size={24}
                    color={
                      isFolder
                        ? '#f59e0b'
                        : item.kind === 'video'
                        ? '#0284c7'
                        : item.kind === 'audio'
                        ? '#a855f7'
                        : '#10b981'
                    }
                  />
                </View>

                {/* Metadata */}
                <View style={styles.itemMeta}>
                  <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.itemSub, { color: theme.textSecondary }]}>
                    {isFolder
                      ? 'Folder • Tap to open'
                      : `${item.sizeBytes ? formatBytes(item.sizeBytes) : 'Google Drive'} • ${
                          item.kind.toUpperCase()
                        }`}
                  </Text>
                  {isLocal && (
                    <View style={[styles.downloadedChip, { backgroundColor: theme.successLight }]}>
                      <Ionicons name="checkmark-done" size={12} color={theme.success} />
                      <Text style={[styles.downloadedChipText, { color: theme.success }]}>
                        Saved on Phone
                      </Text>
                    </View>
                  )}
                </View>

                {/* Trailing Action Icon */}
                <View
                  style={[
                    styles.actionCircle,
                    {
                      backgroundColor: isFolder ? 'transparent' : theme.primaryLight,
                    },
                  ]}>
                  <Ionicons
                    name={
                      isFolder
                        ? 'chevron-forward'
                        : item.kind === 'video'
                        ? 'play'
                        : item.kind === 'audio'
                        ? 'play'
                        : 'expand'
                    }
                    size={18}
                    color={isFolder ? theme.textSecondary : theme.primary}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Sample Videos Section (for testing) */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="sparkles" size={20} color={theme.accent} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Sample Videos (Test Touch Controls & Auto-Delete)
          </Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
          Test MX Player drag-gestures, offline download, and cleanup with these sample clips:
        </Text>

        {SAMPLE_VIDEOS.map((item) => {
          const isLocal = localVideos.some((l) => l.id === item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.itemCard,
                { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
              ]}
              onPress={() => requestPlayVideo(item)}
              activeOpacity={0.7}>
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} style={styles.sampleThumb} />
              ) : (
                <View style={[styles.itemIconBadge, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="play-circle" size={24} color={theme.accent} />
                </View>
              )}
              <View style={styles.itemMeta}>
                <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.itemSub, { color: theme.textSecondary }]}>
                  {formatBytes(item.sizeBytes)} • {item.description}
                </Text>
                {isLocal && (
                  <View style={[styles.downloadedChip, { backgroundColor: theme.successLight }]}>
                    <Ionicons name="checkmark-circle" size={12} color={theme.success} />
                    <Text style={[styles.downloadedChipText, { color: theme.success }]}>
                      Downloaded Locally
                    </Text>
                  </View>
                )}
              </View>
              <View style={[styles.actionCircle, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name="play" size={18} color={theme.primary} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Service Account Information Modal */}
      <Modal visible={showAccountModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.authModalCard,
              { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
            ]}>
            <View style={styles.authModalHeader}>
              <Ionicons name="shield-checkmark" size={26} color={theme.success} />
              <Text style={[styles.authModalTitle, { color: theme.text }]}>
                Google Drive Service
              </Text>
              <TouchableOpacity onPress={() => setShowAccountModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.authModalText, { color: theme.textSecondary }]}>
              Your app automatically authenticates using your Google Service Account. You can add more folders in Google Drive anytime, and they will appear here automatically on refresh!
            </Text>

            <View style={[styles.infoDetailCard, { backgroundColor: theme.background, borderColor: theme.cardBorder }]}>
              <Text style={[styles.infoDetailLabel, { color: theme.textSecondary }]}>
                Service Account Email:
              </Text>
              <TouchableOpacity
                style={[styles.copyEmailBox, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}
                onPress={handleCopyEmail}
                activeOpacity={0.8}>
                <Text style={[styles.copyEmailText, { color: theme.text }]} numberOfLines={1}>
                  {SERVICE_ACCOUNT.client_email}
                </Text>
                <View style={[styles.copyBadge, { backgroundColor: theme.primary }]}>
                  <Ionicons name={copiedEmail ? 'checkmark' : 'copy'} size={14} color="#fff" />
                  <Text style={styles.copyBadgeText}>{copiedEmail ? 'Copied' : 'Copy'}</Text>
                </View>
              </TouchableOpacity>
              <Text style={[styles.infoInstructionText, { color: theme.textSecondary }]}>
                Share any folder from your Google Drive with this email. You can add as many folders as you like.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.connectButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                setShowAccountModal(false);
                loadFolder(currentFolder.id);
              }}>
              <Text style={styles.connectButtonText}>Close & Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  heroCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  heroIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  connectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  connectBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 48,
    borderRadius: 12,
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  breadcrumbCard: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    paddingRight: 8,
    paddingVertical: 4,
  },
  breadcrumbScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumbTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  crumbText: {
    fontSize: 13,
    maxWidth: 140,
  },
  refreshIconBtn: {
    padding: 6,
    borderRadius: 8,
    marginLeft: 6,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  errorCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyDriveCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  stepCard: {
    width: '100%',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 6,
    marginBottom: 16,
  },
  stepText: {
    fontSize: 13,
    lineHeight: 18,
  },
  copyEmailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
  copyEmailText: {
    fontSize: 12,
    flex: 1,
    fontFamily: 'monospace',
  },
  copyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  refreshDriveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  refreshDriveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  itemIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sampleThumb: {
    width: 64,
    height: 48,
    borderRadius: 8,
  },
  itemMeta: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  itemSub: {
    fontSize: 12,
  },
  downloadedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  downloadedChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  authModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
  },
  authModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  authModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    marginLeft: 10,
  },
  authModalText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  infoDetailCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 18,
    gap: 6,
  },
  infoDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoInstructionText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  connectButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
