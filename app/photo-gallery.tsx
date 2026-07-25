import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { TradePicker } from "@/components/trade-picker";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { createAsyncInvocationGuard } from "@/lib/async-invocation-guard";
import {
  deleteDirectProjectPhoto,
  getDirectProjectPhotos,
  persistDirectProjectPhoto,
  updateDirectProjectPhoto,
  type DirectProjectPhoto,
  type DirectProjectPhotoSource,
} from "@/lib/project-photo-store";

type PhotoItem = {
  id: string;
  uri: string;
  source: "protocol" | DirectProjectPhotoSource;
  protocolId?: string;
  protocolTitle: string;
  date: string;
  index?: number;
  directPhoto?: DirectProjectPhoto;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_GAP = 2;
const COLUMNS = 3;
const PHOTO_SIZE = (SCREEN_WIDTH - 40 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

export default function PhotoGalleryScreen() {
  const { t } = useTranslation();
  const { projectId = "" } = useLocalSearchParams<{ projectId: string }>();
  const colors = useColors();
  const pickerGuard = useRef(createAsyncInvocationGuard()).current;
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [project, setProject] = useState<any>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [filterMonth, setFilterMonth] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [description, setDescription] = useState("");
  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    void loadPhotos();
  }, [projectId]);

  async function loadPhotos() {
    try {
      const [projectsData, protocolsData, directPhotos] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
        getDirectProjectPhotos(projectId),
      ]);
      const allProjects = JSON.parse(projectsData || "[]");
      const currentProject = allProjects.find((item: any) => item.id === projectId);
      setProject(currentProject || null);

      const allProtocols = JSON.parse(protocolsData || "[]");
      const projectProtocols = allProtocols.filter((protocol: any) => protocol.projectId === projectId);
      const allPhotos: PhotoItem[] = [];

      projectProtocols.forEach((protocol: any) => {
        if (!Array.isArray(protocol.photos)) return;
        protocol.photos.forEach((uri: string, index: number) => {
          allPhotos.push({
            id: `protocol-${protocol.id}-${index}`,
            uri,
            source: "protocol",
            protocolId: protocol.id,
            protocolTitle: protocol.title || "Ohne Titel",
            date: protocol.createdAt,
            index,
          });
        });
      });

      directPhotos.forEach((photo) => {
        allPhotos.push({
          id: photo.id,
          uri: photo.uri,
          source: photo.source,
          protocolTitle: photo.description || "Direktes Projektfoto",
          date: photo.createdAt,
          directPhoto: photo,
        });
      });

      allPhotos.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPhotos(allPhotos);
    } catch {
      Alert.alert("Fehler", "Die Projektfotos konnten nicht geladen werden.");
    }
  }

  const storeAssets = async (
    assets: ImagePicker.ImagePickerAsset[],
    source: DirectProjectPhotoSource,
  ) => {
    if (!projectId) {
      Alert.alert("Kein Projekt", "Bitte zuerst ein Projekt auswählen.");
      return;
    }
    const projectName = project?.name || "Projekt";
    for (const asset of assets) {
      await persistDirectProjectPhoto({
        projectId,
        projectName,
        sourceUri: asset.uri,
        originalFileName: source === "library" ? asset.fileName : null,
        source,
      });
    }
    await loadPhotos();
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const capturePhoto = async () => {
    const invocation = await pickerGuard.run(async () => {
      setIsImporting(true);
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Kamerazugriff erforderlich", "Bitte den Kamerazugriff für BuildKI in den iPhone-Einstellungen erlauben.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.9,
          exif: false,
        });
        if (!result.canceled && result.assets.length > 0) {
          await storeAssets(result.assets, "camera");
        }
      } finally {
        setIsImporting(false);
      }
    });
    if (!invocation.started) return;
  };

  const importPhotos = async () => {
    const invocation = await pickerGuard.run(async () => {
      setIsImporting(true);
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Fotozugriff erforderlich", "Bitte den Fotozugriff für BuildKI in den iPhone-Einstellungen erlauben.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true,
          selectionLimit: 20,
          quality: 0.9,
        });
        if (!result.canceled && result.assets.length > 0) {
          await storeAssets(result.assets, "library");
        }
      } finally {
        setIsImporting(false);
      }
    });
    if (!invocation.started) return;
  };

  const openPhoto = (photo: PhotoItem) => {
    setSelectedPhoto(photo);
    setDescription(photo.directPhoto?.description || "");
    setTrade(photo.directPhoto?.trade || "");
    setLocation(photo.directPhoto?.location || "");
  };

  const closePhoto = () => {
    setSelectedPhoto(null);
    setDescription("");
    setTrade("");
    setLocation("");
  };

  const saveMetadata = async () => {
    if (!selectedPhoto?.directPhoto) return;
    const updated = await updateDirectProjectPhoto(selectedPhoto.id, { description, trade, location });
    if (updated) {
      setSelectedPhoto({
        ...selectedPhoto,
        protocolTitle: updated.description || "Direktes Projektfoto",
        directPhoto: updated,
      });
      await loadPhotos();
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  };

  const confirmDelete = () => {
    if (!selectedPhoto?.directPhoto) return;
    Alert.alert(
      "Projektfoto löschen",
      "Dieses direkt gespeicherte Projektfoto wird vom Gerät entfernt. Protokollfotos bleiben unverändert.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            await deleteDirectProjectPhoto(selectedPhoto.id);
            closePhoto();
            await loadPhotos();
          },
        },
      ],
    );
  };

  const exportProjectPhotos = () => {
    if (photos.length === 0) {
      Alert.alert("Keine Fotos", "Bitte zuerst ein Projektfoto aufnehmen oder importieren.");
      return;
    }
    router.push({
      pathname: "/cloud-photo-export",
      params: {
        photos: JSON.stringify(photos.map((photo) => photo.uri)),
        protocolTitle: "Projektfotos",
        projectName: project?.name || "Projekt",
        protocolDate: new Date().toISOString().split("T")[0],
      },
    } as any);
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    photos.forEach((photo) => {
      const date = new Date(photo.date);
      months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(months).sort().reverse();
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    if (!filterMonth) return photos;
    return photos.filter((photo) => {
      const date = new Date(photo.date);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return month === filterMonth;
    });
  }, [photos, filterMonth]);

  const groupedPhotos = useMemo(() => {
    const groups: { date: string; label: string; photos: PhotoItem[] }[] = [];
    const map = new Map<string, PhotoItem[]>();
    filteredPhotos.forEach((photo) => {
      const dateKey = new Date(photo.date).toISOString().split("T")[0];
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(photo);
    });
    map.forEach((items, dateKey) => {
      groups.push({
        date: dateKey,
        label: new Date(`${dateKey}T12:00:00`).toLocaleDateString("de-DE", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        photos: items,
      });
    });
    groups.sort((a, b) => b.date.localeCompare(a.date));
    return groups;
  }, [filteredPhotos]);

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zurück"
            onPress={() => router.back()}
            style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{t("gallery_title")}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{project?.name || "Projekt"} · {photos.length} Fotos</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Alle Projektfotos exportieren"
            disabled={photos.length === 0}
            onPress={exportProjectPhotos}
            style={({ pressed }) => [{
              width: 44,
              height: 44,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 0,
              alignItems: "center",
              justifyContent: "center",
              opacity: photos.length === 0 ? 0.35 : pressed ? 0.65 : 1,
            }]}
          >
            <MaterialIcons name="cloud-upload" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Foto direkt mit der Kamera aufnehmen"
            disabled={isImporting || !projectId}
            onPress={capturePhoto}
            style={({ pressed }) => [{
              flex: 1,
              minHeight: 48,
              borderWidth: 1,
              borderColor: colors.primary,
              backgroundColor: colors.primary,
              borderRadius: 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: isImporting || !projectId ? 0.45 : pressed ? 0.75 : 1,
            }]}
          >
            <MaterialIcons name="photo-camera" size={20} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>FOTO AUFNEHMEN</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fotos aus der Galerie hinzufügen"
            disabled={isImporting || !projectId}
            onPress={importPhotos}
            style={({ pressed }) => [{
              flex: 1,
              minHeight: 48,
              borderWidth: 1,
              borderColor: colors.primary,
              backgroundColor: colors.surface,
              borderRadius: 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: isImporting || !projectId ? 0.45 : pressed ? 0.75 : 1,
            }]}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="photo-library" size={20} color={colors.primary} />
            )}
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>GALERIE</Text>
          </Pressable>
        </View>

        {availableMonths.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}
            style={{ flexGrow: 0 }}
          >
            <Pressable
              onPress={() => setFilterMonth(null)}
              style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 0, backgroundColor: !filterMonth ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: !filterMonth ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: !filterMonth ? colors.primary : colors.muted }}>{t("all")}</Text>
            </Pressable>
            {availableMonths.map((month) => {
              const [year, monthNumber] = month.split("-");
              const label = new Date(parseInt(year), parseInt(monthNumber) - 1).toLocaleDateString("de-DE", { month: "short", year: "numeric" });
              const isActive = filterMonth === month;
              return (
                <Pressable
                  key={month}
                  onPress={() => setFilterMonth(isActive ? null : month)}
                  style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 0, backgroundColor: isActive ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: isActive ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: isActive ? colors.primary : colors.muted }}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          {groupedPhotos.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 64 }}>
              <MaterialIcons name="photo-library" size={64} color={colors.border} />
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginTop: 16 }}>{t("gallery_no_photos")}</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6, textAlign: "center" }}>
                {filterMonth ? "Keine Fotos in diesem Monat." : "Nehmen Sie direkt ein Projektfoto auf oder wählen Sie vorhandene Bilder aus der Galerie."}
              </Text>
            </View>
          )}

          {groupedPhotos.map((group) => (
            <View key={group.date} style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>{group.label}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP }}>
                {group.photos.map((photo) => (
                  <Pressable
                    key={photo.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${photo.protocolTitle}, ${new Date(photo.date).toLocaleDateString("de-DE")}`}
                    onPress={() => openPhoto(photo)}
                    style={({ pressed }) => [{ width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 0, overflow: "hidden", opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                      transition={200}
                    />
                    {photo.source !== "protocol" && (
                      <View style={{ position: "absolute", right: 4, bottom: 4, width: 24, height: 24, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" }}>
                        <MaterialIcons name={photo.source === "camera" ? "photo-camera" : "photo-library"} size={15} color="#FFFFFF" />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <Modal visible={!!selectedPhoto} animationType="fade" transparent onRequestClose={closePhoto}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)" }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Foto schließen"
              onPress={closePhoto}
              style={({ pressed }) => [{ position: "absolute", top: 56, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 0, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}
            >
              <MaterialIcons name="close" size={24} color="#FFFFFF" />
            </Pressable>

            {selectedPhoto && (
              <ScrollView
                contentContainerStyle={{ paddingTop: 104, paddingHorizontal: 16, paddingBottom: 44 }}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
              >
                <Image
                  source={{ uri: selectedPhoto.uri }}
                  style={{ width: "100%", height: 360, backgroundColor: "#000000" }}
                  contentFit="contain"
                  transition={200}
                />
                <View style={{ paddingTop: 16 }}>
                  <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{selectedPhoto.protocolTitle}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 4 }}>
                    {new Date(selectedPhoto.date).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4 }}>
                    {selectedPhoto.source === "protocol" ? "Quelle: Protokollaufnahme" : selectedPhoto.source === "camera" ? "Quelle: Direkte Kameraaufnahme" : "Quelle: Galerieimport"}
                  </Text>

                  {selectedPhoto.directPhoto && (
                    <View style={{ marginTop: 18, gap: 10 }}>
                      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }} numberOfLines={1}>
                        Originaldatei: {selectedPhoto.directPhoto.originalFileName}
                      </Text>
                      <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Beschreibung (optional)"
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        multiline
                        style={{ minHeight: 76, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: 0, color: "#FFFFFF", padding: 12, textAlignVertical: "top" }}
                      />
                      <TradePicker
                        value={trade}
                        onChange={setTrade}
                        placeholder="Gewerk auswählen (optional)"
                        accessibilityLabel="Gewerk für das Projektfoto auswählen"
                      />
                      <TextInput
                        value={location}
                        onChangeText={setLocation}
                        placeholder="Ort oder Raum (optional)"
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        returnKeyType="done"
                        style={{ minHeight: 48, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: 0, color: "#FFFFFF", paddingHorizontal: 12 }}
                      />
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Projektfoto löschen"
                          onPress={confirmDelete}
                          style={({ pressed }) => [{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: "#EF4444", borderRadius: 0, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 }]}
                        >
                          <Text style={{ color: "#EF4444", fontSize: 13, fontWeight: "800" }}>LÖSCHEN</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Fotodaten speichern"
                          onPress={saveMetadata}
                          style={({ pressed }) => [{ flex: 2, minHeight: 48, backgroundColor: colors.primary, borderRadius: 0, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.75 : 1 }]}
                        >
                          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>DATEN SPEICHERN</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </ScreenContainer>
  );
}
