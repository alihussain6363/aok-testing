import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayback } from '@/context/PlaybackContext';
import {
  SAMPLE_VIDEOS,
  extractDriveFileId,
  buildDriveDownloadUrl,
  fetchGoogleDriveVideos,
  type DriveVideoItem,
} from '@/services/googleDriveService';
import { formatBytes } from '@/services/downloadManager';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function DriveScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const { requestPlayVideo, localVideos } = usePlayback();

  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveVideoItem[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Handle direct Google Drive link or ID
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

    const downloadUrl = buildDriveDownloadUrl(fileId, accessToken || undefined);
    const driveItem: DriveVideoItem = {
      id: fileId,
      name: `Drive Video (${fileId.slice(0, 8)})`,
      downloadUrl,
      source: 'google_drive',
    };

    setDriveUrlInput('');
    await requestPlayVideo(driveItem);
  };

  // Connect and fetch Drive files using access token
  const handleConnectDrive = async () => {
    if (!accessToken.trim()) {
      Alert.alert('Access Token Required', 'Please enter your Google Drive OAuth access token.');
      return;
    }

    setIsLoadingDrive(true);
    try {
      const files = await fetchGoogleDriveVideos(accessToken.trim());
      setDriveFiles(files);
      setIsConnected(true);
      setShowAuthModal(false);
      Alert.alert('Success', `Found ${files.length} video(s) in your Google Drive.`);
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message || 'Could not fetch videos from Google Drive.');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header Banner */}
      <View style={[styles.heroCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
        <View style={styles.heroHeaderRow}>
          <View style={[styles.heroIconBadge, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="logo-google" size={24} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Google Drive Player</Text>
            <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
              Stream & download videos with smart storage cleanup
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.connectBadge,
              {
                backgroundColor: isConnected ? theme.successLight : theme.primaryLight,
                borderColor: isConnected ? theme.success : theme.primary,
              },
            ]}
            onPress={() => setShowAuthModal(true)}
            activeOpacity={0.8}>
            <Ionicons
              name={isConnected ? 'checkmark-circle' : 'key-outline'}
              size={14}
              color={isConnected ? theme.success : theme.primary}
            />
            <Text
              style={[
                styles.connectBadgeText,
                { color: isConnected ? theme.success : theme.primary },
              ]}>
              {isConnected ? 'Connected' : 'Sign In'}
            </Text>
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
              placeholder="Paste Google Drive video link..."
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

      {/* Connected Google Drive Videos (if loaded) */}
      {driveFiles.length > 0 && (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="cloud-done" size={20} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Your Google Drive Videos ({driveFiles.length})
            </Text>
          </View>
          {driveFiles.map((item) => {
            const isLocal = localVideos.some((l) => l.googleDriveId === item.id || l.id === item.id);
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.videoCard,
                  { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
                ]}
                onPress={() => requestPlayVideo(item)}
                activeOpacity={0.7}>
                <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.background }]}>
                  <Ionicons name="film" size={28} color={theme.primary} />
                </View>
                <View style={styles.videoMeta}>
                  <Text style={[styles.videoTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.videoSize, { color: theme.textSecondary }]}>
                    {item.sizeBytes ? formatBytes(item.sizeBytes) : 'Unknown size'} • Google Drive
                  </Text>
                  {isLocal && (
                    <View style={[styles.downloadedChip, { backgroundColor: theme.successLight }]}>
                      <Ionicons name="checkmark-done" size={12} color={theme.success} />
                      <Text style={[styles.downloadedChipText, { color: theme.success }]}>
                        Saved in local storage
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[styles.downloadActionIcon, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="play" size={18} color={theme.primary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Cloud Videos for Instant Testing */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="sparkles" size={20} color={theme.accent} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Sample Videos (Test Download & Auto-Delete)
          </Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
          Tap any video below to test: it downloads to local storage, plays smoothly, and when you select the next video, it will prompt to delete the previous one!
        </Text>

        {SAMPLE_VIDEOS.map((item) => {
          const isLocal = localVideos.some((l) => l.id === item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.videoCard,
                { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
              ]}
              onPress={() => requestPlayVideo(item)}
              activeOpacity={0.7}>
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
              ) : (
                <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.background }]}>
                  <Ionicons name="play-circle" size={28} color={theme.accent} />
                </View>
              )}
              <View style={styles.videoMeta}>
                <Text style={[styles.videoTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.videoSize, { color: theme.textSecondary }]}>
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
              <View style={[styles.downloadActionIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name="play" size={18} color={theme.primary} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Instructions Card */}
      <View
        style={[
          styles.infoCard,
          { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
        ]}>
        <View style={styles.infoHeaderRow}>
          <Ionicons name="information-circle" size={20} color={theme.primary} />
          <Text style={[styles.infoTitle, { color: theme.text }]}>How it works</Text>
        </View>
        <Text style={[styles.infoBody, { color: theme.textSecondary }]}>
          1. <Text style={{ fontWeight: '600', color: theme.text }}>Choose or Paste:</Text> Select any video or paste a shared Google Drive link.
          {'\n'}2. <Text style={{ fontWeight: '600', color: theme.text }}>Local Download:</Text> The app downloads the video directly into your device storage for offline playback.
          {'\n'}3. <Text style={{ fontWeight: '600', color: theme.text }}>Smart Prompt:</Text> When you play another video, the player asks if you want to delete the previous video from local storage to keep your phone storage free!
        </Text>
      </View>

      <View style={{ height: 40 }} />

      {/* Google Sign-in / Token Modal */}
      <Modal visible={showAuthModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.authModalCard,
              { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
            ]}>
            <View style={styles.authModalHeader}>
              <Ionicons name="logo-google" size={28} color={theme.primary} />
              <Text style={[styles.authModalTitle, { color: theme.text }]}>
                Google Drive Connect
              </Text>
              <TouchableOpacity onPress={() => setShowAuthModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.authModalText, { color: theme.textSecondary }]}>
              Enter a Google OAuth access token to browse your Google Drive videos inside the app. Alternatively, you can always paste any public/shared Drive link directly in the search bar!
            </Text>

            <TextInput
              style={[
                styles.tokenInput,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.cardBorder,
                  color: theme.text,
                },
              ]}
              placeholder="Paste Google OAuth Access Token..."
              placeholderTextColor={theme.textSecondary}
              value={accessToken}
              onChangeText={setAccessToken}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.connectButton, { backgroundColor: theme.primary }]}
              onPress={handleConnectDrive}
              disabled={isLoadingDrive}
              activeOpacity={0.8}>
              <Text style={styles.connectButtonText}>
                {isLoadingDrive ? 'Connecting...' : 'Fetch Drive Videos'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelAuthButton}
              onPress={() => setShowAuthModal(false)}>
              <Text style={[styles.cancelAuthText, { color: theme.textSecondary }]}>Close</Text>
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
    marginBottom: 20,
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
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  thumbnail: {
    width: 72,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  thumbnailPlaceholder: {
    width: 72,
    height: 52,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoMeta: {
    flex: 1,
  },
  videoTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  videoSize: {
    fontSize: 12,
    marginBottom: 4,
  },
  downloadedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  downloadedChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  downloadActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  infoBody: {
    fontSize: 13,
    lineHeight: 20,
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
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginLeft: 12,
  },
  authModalText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  tokenInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  connectButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  connectButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelAuthButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelAuthText: {
    fontSize: 14,
  },
});
