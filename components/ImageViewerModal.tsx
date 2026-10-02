import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type DriveItem } from '@/services/googleDriveService';
import { downloadMediaToLocal, formatBytes } from '@/services/downloadManager';

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
  authToken,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isSaving, setIsSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Sync index when initialIndex changes
  React.useEffect(() => {
    setCurrentIndex(initialIndex);
    setImageLoaded(false);
  }, [initialIndex, visible]);

  if (!visible || images.length === 0) return null;

  const currentItem = images[currentIndex] || images[0];
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

  // Compute highest quality image source
  const imageSource = useMemo(() => {
    if (!currentItem) return undefined;
    // thumbnailUrl with =s1600 provides direct high-res CDN access without 403
    const uri = currentItem.thumbnailUrl || currentItem.downloadUrl;
    const isGoogleApi = uri.includes('googleapis.com');
    if (isGoogleApi && authToken) {
      return { uri, headers: { Authorization: `Bearer ${authToken}` } };
    }
    return { uri };
  }, [currentItem, authToken]);

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setImageLoaded(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setImageLoaded(false);
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
      Alert.alert('Saved!', `"${currentItem.name}" has been saved to your device's local photo library.`);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not download image.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Top Header Bar */}
        <View style={[styles.headerBar, { paddingTop: insets.top > 0 ? insets.top + 6 : 16 }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.titleBox}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentItem.name}
            </Text>
            <Text style={styles.headerSubtitle}>
              {currentIndex + 1} of {images.length} • {currentItem.sizeBytes ? formatBytes(currentItem.sizeBytes) : 'Google Drive'}
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

        {/* Zoomable Image View */}
        <ScrollView
          style={styles.imageScroll}
          contentContainerStyle={styles.imageScrollContent}
          maximumZoomScale={5}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          centerContent>
          {!imageLoaded && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
            </View>
          )}
          {imageSource && (
            <Image
              source={imageSource}
              style={{ width: windowWidth, height: windowHeight * 0.72 }}
              resizeMode="contain"
              onLoadEnd={() => setImageLoaded(true)}
            />
          )}
        </ScrollView>

        {/* Bottom Navigation & Controls */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 24 }]}>
          <TouchableOpacity
            onPress={handlePrev}
            disabled={currentIndex === 0}
            style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}>
            <Ionicons name="chevron-back" size={24} color={currentIndex === 0 ? '#666' : '#fff'} />
            <Text style={[styles.navText, currentIndex === 0 && { color: '#666' }]}>Previous</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSaveToDevice} style={styles.saveBtn} disabled={isSaving}>
            <Ionicons name="cloud-download" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save to Phone'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNext}
            disabled={currentIndex === images.length - 1}
            style={[styles.navBtn, currentIndex === images.length - 1 && styles.navBtnDisabled]}>
            <Text style={[styles.navText, currentIndex === images.length - 1 && { color: '#666' }]}>Next</Text>
            <Ionicons name="chevron-forward" size={24} color={currentIndex === images.length - 1 ? '#666' : '#fff'} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(10, 10, 12, 0.92)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(10, 10, 12, 0.92)',
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
    opacity: 0.4,
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
