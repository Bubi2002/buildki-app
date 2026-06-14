import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Svg, { Path, Circle } from "react-native-svg";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureRef } from "react-native-view-shot";
import * as FileSystem from "expo-file-system/legacy";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

const COLORS = [
  "#E53935", // Red
  "#FF9800", // Orange
  "#FFEB3B", // Yellow
  "#4CAF50", // Green
  "#2196F3", // Blue
  "#9C27B0", // Purple
  "#FFFFFF", // White
  "#000000", // Black
];

const PEN_SIZES = [3, 5, 8, 12];

type DrawPath = {
  path: string;
  color: string;
  strokeWidth: number;
};

export default function PhotoAnnotateScreen() {
  const { photoUri, protocolId, photoIndex } = useLocalSearchParams<{
    photoUri: string;
    protocolId: string;
    photoIndex: string;
  }>();
  const colors = useColors();
  const router = useRouter();
  const canvasRef = useRef<View>(null);

  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedSize, setSelectedSize] = useState(PEN_SIZES[1]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Calculate image dimensions to fit screen
  const imageWidth = SCREEN_WIDTH;
  const imageHeight = SCREEN_HEIGHT - 180; // Leave space for toolbar

  const panGesture = Gesture.Pan()
    .onStart((e) => {
      setCurrentPath(`M ${e.x} ${e.y}`);
    })
    .onUpdate((e) => {
      setCurrentPath((prev) => `${prev} L ${e.x} ${e.y}`);
    })
    .onEnd(() => {
      if (currentPath) {
        setPaths((prev) => [
          ...prev,
          { path: currentPath, color: selectedColor, strokeWidth: selectedSize },
        ]);
        setCurrentPath("");
      }
    })
    .runOnJS(true);

  const undo = () => {
    setPaths((prev) => prev.slice(0, -1));
  };

  const clearAll = () => {
    Alert.alert("Alles löschen", "Alle Markierungen entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Löschen", onPress: () => setPaths([]) },
    ]);
  };

  const saveAnnotation = async () => {
    if (!canvasRef.current || !protocolId) return;

    setIsSaving(true);
    try {
      // Capture the annotated image
      let annotatedUri: string;

      if (Platform.OS === "web") {
        // On web, we save the SVG paths as metadata
        annotatedUri = photoUri || "";
        // Store annotation data alongside the photo
        const annotationData = { paths, photoUri, protocolId, photoIndex };
        await AsyncStorage.setItem(
          `annotation-${protocolId}-${photoIndex}`,
          JSON.stringify(annotationData)
        );
      } else {
        // On native, capture the view as an image
        annotatedUri = await captureRef(canvasRef, {
          format: "png",
          quality: 0.9,
        });

        // Copy to persistent directory
        const annotDir = `${FileSystem.documentDirectory}annotations/`;
        const dirInfo = await FileSystem.getInfoAsync(annotDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(annotDir, { intermediates: true });
        }
        const filename = `annotated_${Date.now()}.png`;
        const destPath = `${annotDir}${filename}`;
        await FileSystem.copyAsync({ from: annotatedUri, to: destPath });
        annotatedUri = destPath;
      }

      // Update the protocol's photos array with the annotated version
      const protocolsData = await AsyncStorage.getItem("protocols");
      if (protocolsData) {
        const protocols = JSON.parse(protocolsData);
        const idx = protocols.findIndex((p: any) => p.id === protocolId);
        if (idx !== -1 && protocols[idx].photos) {
          const photoIdx = parseInt(photoIndex || "0", 10);
          if (photoIdx >= 0 && photoIdx < protocols[idx].photos.length) {
            protocols[idx].photos[photoIdx] = annotatedUri;
            await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
          }
        }
      }

      Alert.alert("Gespeichert", "Die Annotation wurde gespeichert.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Save annotation error:", error);
      Alert.alert("Fehler", "Annotation konnte nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 8 }]}
          >
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Foto annotieren
          </Text>
          <Pressable
            onPress={saveAnnotation}
            disabled={isSaving || paths.length === 0}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: paths.length > 0 ? colors.primary : colors.border,
                opacity: pressed || isSaving ? 0.7 : 1,
              },
            ]}
          >
            <MaterialIcons name="check" size={20} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>
              {isSaving ? "..." : "Speichern"}
            </Text>
          </Pressable>
        </View>

        {/* Canvas area */}
        <View ref={canvasRef} style={styles.canvasContainer} collapsable={false}>
          <Image
            source={{ uri: photoUri }}
            style={{ width: imageWidth, height: imageHeight }}
            contentFit="contain"
          />
          <GestureDetector gesture={panGesture}>
            <View style={[styles.svgOverlay, { width: imageWidth, height: imageHeight }]}>
              <Svg width={imageWidth} height={imageHeight}>
                {/* Rendered paths */}
                {paths.map((p, i) => (
                  <Path
                    key={i}
                    d={p.path}
                    stroke={p.color}
                    strokeWidth={p.strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {/* Current drawing path */}
                {currentPath ? (
                  <Path
                    d={currentPath}
                    stroke={selectedColor}
                    strokeWidth={selectedSize}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
              </Svg>
            </View>
          </GestureDetector>
        </View>

        {/* Toolbar */}
        <View style={[styles.toolbar, { backgroundColor: colors.background }]}>
          {/* Color picker toggle */}
          <Pressable
            onPress={() => { setShowColorPicker(!showColorPicker); setShowSizePicker(false); }}
            style={({ pressed }) => [
              styles.toolButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.colorIndicator, { backgroundColor: selectedColor }]} />
          </Pressable>

          {/* Pen size toggle */}
          <Pressable
            onPress={() => { setShowSizePicker(!showSizePicker); setShowColorPicker(false); }}
            style={({ pressed }) => [
              styles.toolButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.sizeIndicator, { width: selectedSize + 8, height: selectedSize + 8, backgroundColor: colors.foreground }]} />
          </Pressable>

          {/* Undo */}
          <Pressable
            onPress={undo}
            disabled={paths.length === 0}
            style={({ pressed }) => [
              styles.toolButton,
              { opacity: pressed || paths.length === 0 ? 0.4 : 1 },
            ]}
          >
            <MaterialIcons name="undo" size={24} color={colors.foreground} />
          </Pressable>

          {/* Clear all */}
          <Pressable
            onPress={clearAll}
            disabled={paths.length === 0}
            style={({ pressed }) => [
              styles.toolButton,
              { opacity: pressed || paths.length === 0 ? 0.4 : 1 },
            ]}
          >
            <MaterialIcons name="delete-sweep" size={24} color={colors.error} />
          </Pressable>

          {/* Path count */}
          <Text style={[styles.pathCount, { color: colors.muted }]}>
            {paths.length} Markierung{paths.length !== 1 ? "en" : ""}
          </Text>
        </View>

        {/* Color picker panel */}
        {showColorPicker && (
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, bottom: 70 }]}>
            <Text style={[styles.pickerLabel, { color: colors.foreground }]}>Farbe</Text>
            <View style={styles.pickerRow}>
              {COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => { setSelectedColor(color); setShowColorPicker(false); }}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorDotSelected,
                  ]}
                >
                  {selectedColor === color && (
                    <MaterialIcons name="check" size={14} color={color === "#FFFFFF" || color === "#FFEB3B" ? "#000" : "#FFF"} />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Size picker panel */}
        {showSizePicker && (
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, bottom: 70 }]}>
            <Text style={[styles.pickerLabel, { color: colors.foreground }]}>Stiftstärke</Text>
            <View style={styles.pickerRow}>
              {PEN_SIZES.map((size) => (
                <Pressable
                  key={size}
                  onPress={() => { setSelectedSize(size); setShowSizePicker(false); }}
                  style={[
                    styles.sizeDot,
                    selectedSize === size && { borderColor: colors.primary, borderWidth: 2 },
                  ]}
                >
                  <View
                    style={{
                      width: size + 4,
                      height: size + 4,
                      borderRadius: (size + 4) / 2,
                      backgroundColor: colors.foreground,
                    }}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "ios" ? 50 : 12,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  canvasContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  svgOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  toolButton: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  colorIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  sizeIndicator: {
    borderRadius: 20,
  },
  pathCount: { fontSize: 12, marginLeft: "auto" },
  pickerPanel: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  pickerLabel: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.3)",
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sizeDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.3)",
  },
});
