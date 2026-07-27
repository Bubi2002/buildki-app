import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";

import { ZoomableCanvas } from "@/components/zoomable-canvas";
import { decodeUnicodeEscapes } from "@/lib/display-text";

type FullscreenPhotoViewerProps = {
  visible: boolean;
  photos: string[];
  initialIndex?: number;
  title: string;
  onClose: () => void;
};

export function FullscreenPhotoViewer({
  visible,
  photos,
  initialIndex = 0,
  title,
  onClose,
}: FullscreenPhotoViewerProps) {
  const { width, height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(() => (
    Math.min(Math.max(0, initialIndex), Math.max(0, photos.length - 1))
  ));
  const [resetKey, setResetKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const showPhoto = (index: number) => {
    setActiveIndex(index);
    setResetKey((value) => value + 1);
    setLoading(true);
  };

  const uri = photos[activeIndex];
  const stageHeight = Math.max(240, height - 176);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fotoansicht schließen"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          <View style={styles.titleGroup}>
            <Text style={styles.title} numberOfLines={1}>{decodeUnicodeEscapes(title)}</Text>
            <Text style={styles.counter}>Foto {activeIndex + 1} von {photos.length}</Text>
          </View>
          <Pressable
            onPress={() => setResetKey((value) => value + 1)}
            accessibilityRole="button"
            accessibilityLabel="Fotozoom zurücksetzen"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialIcons name="fit-screen" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.stage}>
          {uri ? (
            <ZoomableCanvas
              key={`${resetKey}-${activeIndex}`}
              width={width}
              height={stageHeight}
              maxScale={5}
              testID="fullscreen-photo-stage"
            >
              <Image
                source={{ uri }}
                style={{ width, height: stageHeight }}
                contentFit="contain"
                cachePolicy="memory-disk"
                allowDownscaling={false}
                recyclingKey={`fullscreen-${uri}`}
                onLoadStart={() => setLoading(true)}
                onLoad={() => setLoading(false)}
                onError={() => setLoading(false)}
              />
            </ZoomableCanvas>
          ) : null}
          {loading && uri ? (
            <View pointerEvents="none" style={styles.loadingBadge}>
              <Text style={styles.loadingText}>Foto wird geladen …</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            disabled={activeIndex <= 0}
            onPress={() => showPhoto(activeIndex - 1)}
            accessibilityRole="button"
            accessibilityLabel="Vorheriges Foto"
            style={({ pressed }) => [styles.navButton, activeIndex <= 0 && styles.disabled, pressed && styles.pressed]}
          >
            <MaterialIcons name="chevron-left" size={24} color="#FFFFFF" />
            <Text style={styles.navText}>Zurück</Text>
          </Pressable>
          <Text style={styles.hint}>Zwei Finger zum Zoomen · Doppeltipp zum Vergrößern</Text>
          <Pressable
            disabled={activeIndex >= photos.length - 1}
            onPress={() => showPhoto(activeIndex + 1)}
            accessibilityRole="button"
            accessibilityLabel="Nächstes Foto"
            style={({ pressed }) => [styles.navButton, activeIndex >= photos.length - 1 && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.navText}>Weiter</Text>
            <MaterialIcons name="chevron-right" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020A13" },
  header: {
    minHeight: 88,
    paddingTop: 36,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1E3850",
  },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  titleGroup: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  counter: { color: "#8FA6BA", fontSize: 12, fontWeight: "700", marginTop: 3 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  loadingBadge: { position: "absolute", paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#0C1D2D", borderWidth: 1, borderColor: "#2B80B9" },
  loadingText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  footer: {
    minHeight: 88,
    paddingHorizontal: 12,
    paddingBottom: 18,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#1E3850",
  },
  navButton: { minWidth: 92, minHeight: 48, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2B80B9" },
  navText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  hint: { flex: 1, color: "#8FA6BA", fontSize: 10, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.65 },
});
