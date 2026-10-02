import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback, type PlaybackMode } from '@/context/PlaybackContext';
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
import { getRecentVideos, type RecentVideoItem } from '@/services/watchHistoryManager';
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
  const {
    requestPlayVideo,
    requestPlayAudio,
    requestViewImages,
    localVideos,
    downloadState,
    authToken,
  } = usePlayback();

  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected item for the Media Action Sheet
  const [selectedActionItem, setSelectedActionItem] = useState<DriveItem | null>(null);

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
    setSearchQuery('');
    loadFolder(folder.id);
  };

  // Navigate back to a specific breadcrumb
  const handleBreadcrumbPress = (index: number) => {
    if (index === folderStack.length - 1) return;
    const target = folderStack[index];
    setFolderStack((prev) => prev.slice(0, index + 1));
    setActiveCategory('all');
    setSearchQuery('');
    loadFolder(target.id);
  };

  // Back button (one step up)
  const handleGoBack = () => {
    if (folderStack.length <= 1) return;
    const newStack = folderStack.slice(0, folderStack.length - 1);
    setFolderStack(newStack);
    setActiveCategory('all');
    setSearchQuery('');
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
      const downloadUrl = buildDriveDownloadUrl(fileId);
      const driveItem: DriveItem = {
        id: fileId,
        name: `Drive Media (${fileId.slice(0, 8)})`,
        isFolder: false,
        kind: 'video',
        downloadUrl,
        source: 'google_drive',
      };

      setDriveUrlInput('');
      await requestPlayVideo(driveItem, [driveItem], 'stream');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not authenticate with Google Drive');
    }
  };

  // In-folder media collections for continuous playback
  const folderVideos = useMemo(() => driveItems.filter((i) => i.kind === 'video'), [driveItems]);
  const folderAudio = useMemo(() => driveItems.filter((i) => i.kind === 'audio'), [driveItems]);
  const folderImages = useMemo(() => driveItems.filter((i) => i.kind === 'image'), [driveItems]);

  // Handle Playback Execution with chosen mode
  const executePlayMedia = async (item: DriveItem, mode: PlaybackMode = 'stream') => {
    setSelectedActionItem(null);

    if (item.kind === 'video') {
      await requestPlayVideo(item, folderVideos, mode);
    } else if (item.kind === 'audio') {
      if (mode === 'download_only') {
        await requestPlayVideo(item as any, undefined, 'download_only');
      } else {
        requestPlayAudio(item, folderAudio);
      }
    } else if (item.kind === 'image') {
      const idx = folderImages.findIndex((i) => i.id === item.id);
      requestViewImages(folderImages, idx >= 0 ? idx : 0);
    }
  };

  const [recentVideos, setRecentVideos] = useState<RecentVideoItem[]>([]);

  useEffect(() => {
    getRecentVideos(4).then(setRecentVideos);
  }, [driveItems]);

  // Media item tap handler
  const handleItemPress = (item: DriveItem) => {
    if (item.isFolder) {
      handleOpenFolder(item);
    } else if (item.kind === 'image') {
      const idx = folderImages.findIndex((i) => i.id === item.id);
      requestViewImages(folderImages, idx >= 0 ? idx : 0);
    } else if (item.kind === 'audio') {
      requestPlayAudio(item, folderAudio);
    } else {
      // Open Media Action Sheet for rich options: Stream / Stream & Download / Download
      setSelectedActionItem(item);
    }
  };

  // Filtered & searched items
  const filteredItems = useMemo(() => {
    return driveItems.filter((item) => {
      // Category filter
      if (activeCategory === 'folder' && !item.isFolder) return false;
      if (activeCategory !== 'all' && activeCategory !== 'folder' && item.kind !== activeCategory) return false;
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [driveItems, activeCategory, searchQuery]);

  const folderCount = driveItems.filter((i) => i.isFolder).length;
  const videoCount = driveItems.filter((i) => i.kind === 'video').length;
  const audioCount = driveItems.filter((i) => i.kind === 'audio').length;
  const imageCount = driveItems.filter((i) => i.kind === 'image').length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
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
              Auto-authenticated • Stream & in-folder playlist
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
              placeholder="Paste Google Drive link or ID..."
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

      {/* Continue Watching (Last Played Videos) */}
      {recentVideos.length > 0 && folderStack.length === 1 && (
        <View style={styles.recentSection}>
          <View style={styles.recentHeaderRow}>
            <Ionicons name="time-outline" size={18} color={theme.primary} />
            <Text style={[styles.recentSectionTitle, { color: theme.text }]}>Continue Watching</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {recentVideos.map((rv) => (
              <TouchableOpacity
                key={rv.id}
                style={[styles.recentHeroCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}
                onPress={() => {
                  requestPlayVideo(
                    {
                      id: rv.id,
                      name: rv.title,
                      isFolder: false,
                      kind: 'video',
                      downloadUrl: rv.localUri,
                      thumbnailUrl: rv.thumbnailUrl,
                      source: 'google_drive',
                    },
                    folderVideos,
                    'stream'
                  );
                }}
                activeOpacity={0.7}>
                <View style={styles.recentPlayIcon}>
                  <Ionicons name="play" size={16} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 130, maxWidth: 190 }}>
                  <Text style={[styles.recentCardTitle, { color: theme.text }]} numberOfLines={1}>
                    {rv.title}
                  </Text>
                  <Text style={[styles.recentCardSub, { color: theme.textSecondary }]}>
                    {rv.progressPercent}% watched
                  </Text>
                  <View style={styles.recentBarBg}>
                    <View style={[styles.recentBarFill, { width: `${rv.progressPercent}%` }]} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

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

      {/* In-Folder Search Bar */}
      {driveItems.length > 0 && (
        <View style={[styles.searchBox, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={`Search in ${currentFolder.name}...`}
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

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

      {/* Global Background Download Banner */}
      {downloadState.isDownloading && (
        <View style={[styles.downloadNotice, { backgroundColor: theme.cardBackground, borderColor: theme.primary }]}>
          <Ionicons name="cloud-download" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.downloadNoticeTitle, { color: theme.text }]}>
              Downloading {downloadState.title} ({downloadState.progressPercent}%)
            </Text>
            <View style={styles.downloadNoticeBar}>
              <View style={[styles.downloadNoticeFill, { width: `${downloadState.progressPercent}%` }]} />
            </View>
          </View>
        </View>
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

      {/* Empty State / How to Share Guidance */}
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

      {/* Main Drive Items List */}
      {!isLoading && filteredItems.length > 0 && (
        <View style={styles.sectionContainer}>
          {filteredItems.map((item) => {
            const isLocal = localVideos.some((l) => l.googleDriveId === item.id || l.id === item.id);
            const isFolder = item.isFolder;

            return (
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
                ]}>
                {/* Clickable Area for Full Item */}
                <TouchableOpacity
                  style={styles.itemMainRow}
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
                        : `${item.sizeBytes ? formatBytes(item.sizeBytes) : 'Drive'} • ${item.kind.toUpperCase()}`}
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
                </TouchableOpacity>

                {/* Quick Action Buttons for Non-Folders */}
                {!isFolder && (
                  <View style={styles.quickActionsRow}>
                    {/* Primary Action Quick Button */}
                    <TouchableOpacity
                      style={[styles.quickPillBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
                      onPress={() => executePlayMedia(item, 'stream')}
                      activeOpacity={0.7}>
                      <Ionicons
                        name={item.kind === 'video' ? 'play' : item.kind === 'audio' ? 'musical-notes' : 'eye'}
                        size={13}
                        color={theme.primary}
                      />
                      <Text style={[styles.quickPillText, { color: theme.primary }]}>
                        {item.kind === 'video' ? 'Stream' : item.kind === 'audio' ? 'Listen' : 'View'}
                      </Text>
                    </TouchableOpacity>

                    {/* Download Quick Button */}
                    <TouchableOpacity
                      style={[styles.quickPillBtn, { backgroundColor: 'rgba(255, 255, 255, 0.06)' }]}
                      onPress={() => executePlayMedia(item, 'download_only')}
                      activeOpacity={0.7}>
                      <Ionicons name="cloud-download-outline" size={13} color={theme.text} />
                      <Text style={[styles.quickPillText, { color: theme.text }]}>Download</Text>
                    </TouchableOpacity>

                    {/* More Options */}
                    <TouchableOpacity
                      style={styles.moreIconBtn}
                      onPress={() => setSelectedActionItem(item)}>
                      <Ionicons name="ellipsis-vertical" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Folder Chevron */}
                {isFolder && (
                  <TouchableOpacity onPress={() => handleOpenFolder(item)} style={{ padding: 8 }}>
                    <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Sample Videos Section (for testing gestures & controls) */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="sparkles" size={20} color={theme.accent} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Sample Demo Clips
          </Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
          Test offline playback, touch gestures, and quality switches with these sample clips:
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
              onPress={() => requestPlayVideo(item, SAMPLE_VIDEOS, 'stream')}
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

      {/* Media Action Sheet Modal: Stream / Stream & Download / Download for Later */}
      <Modal
        visible={!!selectedActionItem}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedActionItem(null)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedActionItem(null)}>
          <View
            style={[
              styles.actionSheetCard,
              { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
            ]}>
            {/* Sheet Header */}
            <View style={styles.actionSheetHeader}>
              <View style={[styles.sheetMediaIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons
                  name={
                    selectedActionItem?.kind === 'video'
                      ? 'film'
                      : selectedActionItem?.kind === 'audio'
                      ? 'musical-notes'
                      : 'image'
                  }
                  size={24}
                  color={theme.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionSheetTitle, { color: theme.text }]} numberOfLines={2}>
                  {selectedActionItem?.name}
                </Text>
                <Text style={[styles.actionSheetSub, { color: theme.textSecondary }]}>
                  {selectedActionItem?.sizeBytes ? formatBytes(selectedActionItem.sizeBytes) : 'Google Drive'} • In {currentFolder.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedActionItem(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Option 1: Stream Play */}
            <TouchableOpacity
              style={[styles.sheetOptionCard, { backgroundColor: theme.background, borderColor: theme.cardBorder }]}
              onPress={() => selectedActionItem && executePlayMedia(selectedActionItem, 'stream')}
              activeOpacity={0.7}>
              <View style={[styles.sheetOptionIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                <Ionicons name="flash" size={22} color="#38bdf8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetOptionTitle, { color: theme.text }]}>Stream Play Now</Text>
                <Text style={[styles.sheetOptionDesc, { color: theme.textSecondary }]}>
                  Instant playback with zero device storage used
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </TouchableOpacity>

            {/* Option 2: Stream & Download */}
            <TouchableOpacity
              style={[styles.sheetOptionCard, { backgroundColor: theme.background, borderColor: theme.cardBorder }]}
              onPress={() => selectedActionItem && executePlayMedia(selectedActionItem, 'stream_and_download')}
              activeOpacity={0.7}>
              <View style={[styles.sheetOptionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="rocket" size={22} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetOptionTitle, { color: theme.text }]}>Stream & Download</Text>
                <Text style={[styles.sheetOptionDesc, { color: theme.textSecondary }]}>
                  Play right away and save to local storage in background
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </TouchableOpacity>

            {/* Option 3: Download for Later */}
            <TouchableOpacity
              style={[styles.sheetOptionCard, { backgroundColor: theme.background, borderColor: theme.cardBorder }]}
              onPress={() => selectedActionItem && executePlayMedia(selectedActionItem, 'download_only')}
              activeOpacity={0.7}>
              <View style={[styles.sheetOptionIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                <Ionicons name="cloud-download" size={22} color="#a855f7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetOptionTitle, { color: theme.text }]}>Download for Later</Text>
                <Text style={[styles.sheetOptionDesc, { color: theme.textSecondary }]}>
                  Save to phone library for offline viewing later
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
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
  downloadNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  downloadNoticeTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  downloadNoticeBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  downloadNoticeFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 2,
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
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  quickPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  quickPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  moreIconBtn: {
    padding: 4,
    paddingHorizontal: 8,
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionSheetCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    gap: 12,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  sheetMediaIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  actionSheetSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sheetOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  sheetOptionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  sheetOptionDesc: {
    fontSize: 12,
    marginTop: 2,
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
  recentSection: {
    marginBottom: 16,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  recentSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  recentHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  recentPlayIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentCardTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  recentCardSub: {
    fontSize: 11,
    marginTop: 1,
  },
  recentBarBg: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginTop: 4,
    overflow: 'hidden',
  },
  recentBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 1.5,
  },
});
