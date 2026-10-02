import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  Dimensions,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type DriveItem } from '@/services/googleDriveService';
import { downloadMediaToLocal, formatBytes } from '@/services/downloadManager';
import { getOrFetchCachedImage, prefetchNeighborImages } from '@/services/imageCacheService';

interface ImageViewerModalProps {
  visible: boolean;
  images: DriveItem[];
  initialIndex: number;
  authToken?: string | null;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  visible,
  images,
  initialIndex,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showOverlays, setShowOverlays] = useState(true);

  // Sync index when initialIndex changes or modal opens
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, visible]);

  const currentItem = images[currentIndex] || images[0];
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

  // Load and cache active photo
  const loadImage = useCallback(async (item: DriveItem) => {
    if (!item) return;
    setIsLoading(true);
    setHasError(false);

    try {
      const uri = await getOrFetchCachedImage(item);
      if (uri) {
        setResolvedUri(uri);
      } else {
        setHasError(true);
      }
    } catch (e) {
      console.warn('Error displaying image:', e);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }

    // Pre-cache next and previous images in background for instant navigation
    prefetchNeighborImages(images, currentIndex).catch(() => {});
  }, [images, currentIndex]);

  useEffect(() => {
    if (visible && currentItem) {
      loadImage(currentItem);
    }
  }, [visible, currentItem, loadImage]);

  if (!visible || images.length === 0 || !currentItem) return null;

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleSaveToDevice = async () => {
    if (!currentItem) return;
    setIsSaving(true);
    try {
      await downloadMediaToLocal(
        currentItem.downloadUrl,
        currentItem.name,
        'image',
        currentItem.id,
        currentItem.thumbnailUrl
      );
      Alert.alert('Saved to Photos!', `"${currentItem.name}" has been saved to your offline device photo library.`);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not download image.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <StatusBar hidden={!showOverlays} />

        {/* Top Header Bar */}
        {showOverlays && (
          <View style={[styles.headerBar, { paddingTop: insets.top > 0 ? insets.top + 6 : 16 }]}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <View style={styles.titleBox}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {currentItem.name}
              </Text>
              <Text style={styles.headerSubtitle}>
                {currentIndex + 1} of {images.length} • {currentItem.sizeBytes ? formatBytes(currentItem.sizeBytes) : 'Google Drive Photo'}
              </Text>
            </View>
            <TouchableOpacity onPress={handleSaveToDevice} style={styles.iconBtn} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <Ionicons name="download-outline" size={24} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Zoomable Image Viewport */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowOverlays(!showOverlays)}
          style={styles.viewportTouch}>
          <ScrollView
            style={styles.imageScroll}
            contentContainerStyle={styles.imageScrollContent}
            maximumZoomScale={5}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent>
            {isLoading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#38bdf8" />
                <Text style={styles.loadingText}>Loading photo...</Text>
              </View>
            )}

            {hasError && !isLoading && (
              <View style={styles.errorBox}>
                <Ionicons name="image-outline" size={54} color="#64748b" />
                <Text style={styles.errorText}>Could not open image stream</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => loadImage(currentItem)}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {resolvedUri && !hasError && (
              <Image
                source={{ uri: resolvedUri }}
                style={{ width: windowWidth, height: windowHeight * 0.8 }}
                resizeMode="contain"
                onLoadStart={() => setIsLoading(true)}
                onLoadEnd={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
              />
            )}
          </ScrollView>
        </TouchableOpacity>

        {/* Bottom Navigation & Controls */}
        {showOverlays && (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 24 }]}>
            <TouchableOpacity
              onPress={handlePrev}
              disabled={currentIndex === 0}
              style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}>
              <Ionicons name="chevron-back" size={24} color={currentIndex === 0 ? '#555' : '#fff'} />
              <Text style={[styles.navText, currentIndex === 0 && { color: '#555' }]}>Previous</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSaveToDevice} style={styles.saveBtn} disabled={isSaving}>
              <Ionicons name="cloud-download" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save to Phone'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleNext}
              disabled={currentIndex === images.length - 1}
              style={[styles.navBtn, currentIndex === images.length - 1 && styles.navBtnDisabled]}>
              <Text style={[styles.navText, currentIndex === images.length - 1 && { color: '#555' }]}>Next</Text>
              <Ionicons name="chevron-forward" size={24} color={currentIndex === images.length - 1 ? '#555' : '#fff'} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#05070a',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(5, 7, 10, 0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 10,
  },
  titleBox: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewportTouch: {
    flex: 1,
  },
  imageScroll: {
    flex: 1,
  },
  imageScrollContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  errorBox: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 24,
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(5, 7, 10, 0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
