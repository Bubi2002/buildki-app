import { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Dimensions, Modal } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

type PhotoItem = {
  uri: string;
  protocolId: string;
  protocolTitle: string;
  date: string;
  index: number;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_GAP = 2;
const COLUMNS = 3;
const PHOTO_SIZE = (SCREEN_WIDTH - 40 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

export default function PhotoGalleryScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const colors = useColors();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [project, setProject] = useState<any>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [filterMonth, setFilterMonth] = useState<string | null>(null);

  useEffect(() => {
    loadPhotos();
  }, [projectId]);

  const loadPhotos = async () => {
    try {
      const [projectsData, protocolsData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
      ]);
      const allProjects = JSON.parse(projectsData || "[]");
      const proj = allProjects.find((p: any) => p.id === projectId);
      setProject(proj);

      const allProtocols = JSON.parse(protocolsData || "[]");
      const projectProtocols = allProtocols.filter((p: any) => p.projectId === projectId);

      const allPhotos: PhotoItem[] = [];
      projectProtocols.forEach((protocol: any) => {
        if (protocol.photos && Array.isArray(protocol.photos)) {
          protocol.photos.forEach((uri: string, index: number) => {
            allPhotos.push({
              uri,
              protocolId: protocol.id,
              protocolTitle: protocol.title || "Ohne Titel",
              date: protocol.createdAt,
              index,
            });
          });
        }
      });

      // Sort by date, newest first
      allPhotos.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPhotos(allPhotos);
    } catch {}
  };

  // Available months for filter
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    photos.forEach((p) => {
      const d = new Date(p.date);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(months).sort().reverse();
  }, [photos]);

  // Filtered photos
  const filteredPhotos = useMemo(() => {
    if (!filterMonth) return photos;
    return photos.filter((p) => {
      const d = new Date(p.date);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return month === filterMonth;
    });
  }, [photos, filterMonth]);

  // Group by date
  const groupedPhotos = useMemo(() => {
    const groups: { date: string; label: string; photos: PhotoItem[] }[] = [];
    const map = new Map<string, PhotoItem[]>();
    filteredPhotos.forEach((p) => {
      const dateKey = new Date(p.date).toISOString().split("T")[0];
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(p);
    });
    map.forEach((photos, dateKey) => {
      groups.push({
        date: dateKey,
        label: new Date(dateKey).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
        photos,
      });
    });
    groups.sort((a, b) => b.date.localeCompare(a.date));
    return groups;
  }, [filteredPhotos]);

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Foto-Galerie</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{project?.name || "Projekt"} · {photos.length} Fotos</Text>
          </View>
        </View>

        {/* Month Filter */}
        {availableMonths.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }} style={{ flexGrow: 0 }}>
            <Pressable
              onPress={() => setFilterMonth(null)}
              style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 0, backgroundColor: !filterMonth ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: !filterMonth ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: !filterMonth ? colors.primary : colors.muted }}>Alle</Text>
            </Pressable>
            {availableMonths.map((month) => {
              const [year, m] = month.split("-");
              const label = new Date(parseInt(year), parseInt(m) - 1).toLocaleDateString("de-DE", { month: "short", year: "numeric" });
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

        {/* Photo Grid */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          {groupedPhotos.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 80 }}>
              <MaterialIcons name="photo-library" size={64} color={colors.border} />
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginTop: 16 }}>Keine Fotos</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6, textAlign: "center" }}>
                {filterMonth ? "Keine Fotos in diesem Monat." : "Dieses Projekt hat noch keine Fotos.\nFotos werden bei der Protokoll-Aufnahme erstellt."}
              </Text>
            </View>
          )}

          {groupedPhotos.map((group) => (
            <View key={group.date} style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>{group.label}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP }}>
                {group.photos.map((photo, i) => (
                  <Pressable
                    key={`${photo.protocolId}-${photo.index}`}
                    onPress={() => setSelectedPhoto(photo)}
                    style={({ pressed }) => [{ width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 4, overflow: "hidden", opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                      transition={200}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Photo Detail Modal */}
        <Modal visible={!!selectedPhoto} animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center" }}>
            {/* Close Button */}
            <Pressable
              onPress={() => setSelectedPhoto(null)}
              style={({ pressed }) => [{ position: "absolute", top: 60, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 0, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}
            >
              <MaterialIcons name="close" size={24} color="#FFF" />
            </Pressable>

            {/* Photo */}
            {selectedPhoto && (
              <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 10 }}>
                <Image
                  source={{ uri: selectedPhoto.uri }}
                  style={{ width: "100%", height: "70%" }}
                  contentFit="contain"
                  transition={200}
                />
                {/* Info */}
                <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                  <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>{selectedPhoto.protocolTitle}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 4 }}>
                    {new Date(selectedPhoto.date).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Modal>
      </View>
    </ScreenContainer>
  );
}
