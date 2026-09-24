/**
 * Projekt-Assistent – guided setup shown when opening "Projekte & Werkzeuge":
 * choose/create a project (details incl. address), optionally add rooms/floors,
 * optionally add first defects/tasks, then land on the tools screen with the
 * project active and everything saved.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, Platform, Alert, ActivityIndicator, Modal } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";
import { initializeDefaultFloors, getFloors, getAllRooms, addRoom, addFloor, updateRoom, deleteRoom, type Floor, type Room } from "@/lib/room-store";
import { saveDefect } from "@/lib/defect-store";

const WIZ_COLORS = ["#5DADE2", "#EF4444", "#F59E0B", "#34D399", "#A78BFA", "#EC407A", "#00ACC1", "#FF7043"];
type Step = "choose" | "details" | "rooms" | "items";
type ProjItem = { id: string; name: string; color?: string; archived?: boolean };

export default function ProjectWizardScreen() {
  const { t, language } = useTranslation();
  const colors = useColors();
  const router = useRouter();

  const [step, setStep] = useState<Step>("choose");
  const [projects, setProjects] = useState<ProjItem[]>([]);

  // Step 1 – details
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState(WIZ_COLORS[0]);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Step 2 – rooms
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [floorInputOpen, setFloorInputOpen] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [editRoomName, setEditRoomName] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const uploadAudio = trpc.upload.audio.useMutation();
  const transcribe = trpc.voice.transcribe.useMutation();
  const [roomName, setRoomName] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);

  // Step 3 – defects/tasks
  const [itemType, setItemType] = useState<"defect" | "task">("defect");
  const [itemTitle, setItemTitle] = useState("");
  const [itemRoom, setItemRoom] = useState("");
  const [itemFloorId, setItemFloorId] = useState<string | null>(null);
  const [itemAssignee, setItemAssignee] = useState("");
  const [itemPhotos, setItemPhotos] = useState<string[]>([]);
  const [addedItems, setAddedItems] = useState<{ type: "defect" | "task"; title: string; room?: string }[]>([]);

  const haptic = () => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem("projects");
        const all: ProjItem[] = (raw ? JSON.parse(raw) : []).filter((p: ProjItem) => !p.archived);
        setProjects(all);
        if (all.length === 0) setStep("details"); // nothing to choose → create
      } catch { setStep("details"); }
    })();
  }, []);

  const finish = () => router.replace("/(tabs)" as any);

  const pickExisting = async (id: string) => {
    haptic();
    await AsyncStorage.setItem("last-selected-project-id", id);
    finish();
  };

  const createProject = async (): Promise<string | null> => {
    if (!name.trim()) return null;
    const id = Date.now().toString();
    try {
      const raw = await AsyncStorage.getItem("projects");
      const all = raw ? JSON.parse(raw) : [];
      all.push({
        id,
        name: name.trim(),
        description: desc.trim(),
        address: address.trim() || undefined,
        color,
        createdAt: new Date().toISOString(),
      });
      await AsyncStorage.setItem("projects", JSON.stringify(all));
      await AsyncStorage.setItem("last-selected-project-id", id);
      await initializeDefaultFloors(id);
      setProjectId(id);
      return id;
    } catch { return null; }
  };

  const goToRooms = async () => {
    haptic();
    let id = projectId;
    if (id) {
      // Already created (user went back and edited) → persist detail changes.
      try {
        const raw = await AsyncStorage.getItem("projects");
        const all = raw ? JSON.parse(raw) : [];
        const i = all.findIndex((p: any) => p.id === id);
        if (i >= 0) {
          all[i] = { ...all[i], name: name.trim(), description: desc.trim(), address: address.trim() || undefined, color };
          await AsyncStorage.setItem("projects", JSON.stringify(all));
        }
      } catch {}
    } else {
      id = await createProject();
    }
    if (!id) return;
    const [fl, rm] = await Promise.all([getFloors(id), getAllRooms(id)]);
    setFloors(fl);
    setRooms(rm);
    setFloorId((prev) => prev || fl[0]?.id || null);
    setStep("rooms");
  };

  const addRoomNow = async () => {
    if (!projectId || !floorId || !roomName.trim()) return;
    haptic();
    await addRoom(projectId, floorId, roomName.trim());
    setRoomName("");
    setRooms(await getAllRooms(projectId));
  };

  const addCustomFloor = async () => {
    const name = newFloorName.trim();
    if (!name || !projectId) { setFloorInputOpen(false); setNewFloorName(""); return; }
    haptic();
    const nextNum = floors.reduce((m, f) => Math.max(m, f.number), -1) + 1;
    await addFloor(projectId, name, nextNum);
    const fl = await getFloors(projectId);
    setFloors(fl);
    const created = [...fl].reverse().find((f) => f.name === name);
    if (created) setFloorId(created.id);
    setNewFloorName("");
    setFloorInputOpen(false);
  };

  const openEditRoom = (r: Room) => { setEditRoomName(r.name); setEditRoom(r); };
  const saveEditRoom = async () => {
    const r = editRoom;
    const name = editRoomName.trim();
    if (!r || !projectId || !name) { setEditRoom(null); return; }
    setRooms((prev) => prev.map((x) => (x.id === r.id ? { ...x, name } : x)));
    try { await updateRoom(projectId, r.id, { name }); } catch {}
    setEditRoom(null);
  };
  const deleteRoomNow = async (r: Room) => {
    if (!projectId) return;
    setRooms((prev) => prev.filter((x) => x.id !== r.id));
    setEditRoom(null);
    try { await deleteRoom(projectId, r.id); } catch {}
  };

  // Speak room names ("Küche, Bad und Schlafzimmer") → adds them to the floor.
  // Splits on separators and strips common filler words so free speech still
  // produces clean names (the list is also editable afterwards).
  const parseRoomNames = (text: string): string[] =>
    text
      .split(/\s*(?:,|;|·|\/|\n|\bund\b|\bsowie\b|\band\b)\s*/gi)
      .map((s) =>
        s
          .trim()
          .replace(/[.!?]+$/g, "")
          .replace(/^(?:es\s+gibt\s+(?:noch\s+)?|hier\s+ist\s+|das\s+ist\s+|noch\s+|ein(?:e|en)?\s+|a\s+|an\s+|the\s+|there\s+is\s+(?:a\s+)?)/i, "")
          .trim(),
      )
      .filter((s) => s.length >= 2 && !/^\d+$/.test(s) && !/^(zwei|drei|vier|eins|two|three)$/i.test(s))
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .slice(0, 25);

  const startVoiceRooms = async () => {
    if (!projectId) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      haptic();
    } catch { setRecording(false); }
  };

  const stopVoiceRooms = async () => {
    setRecording(false);
    setVoiceBusy(true);
    try {
      try { await recorder.stop(); } catch {}
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri || (recorder.getStatus?.() as any)?.url || null;
      if (!uri) throw new Error();
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const uploaded = await uploadAudio.mutateAsync({ base64, mimeType: "audio/m4a", filename: `rooms-${Date.now()}.m4a` });
      const transcribed = await transcribe.mutateAsync({ audioUrl: uploaded.url, language: language || "de" });
      const names = parseRoomNames((transcribed.text || "").trim());
      const fid = floorId ?? floors[0]?.id ?? null;
      if (fid && names.length) {
        for (const n of names) await addRoom(projectId, fid, n);
        setRooms(await getAllRooms(projectId));
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert(t('hinweis'), t('wizard_voice_none' as any));
      }
    } catch {
      Alert.alert(t('alert_fehler'), t('wizard_voice_failed' as any));
    } finally {
      setVoiceBusy(false);
    }
  };

  const curFloorId = itemFloorId ?? floorId ?? (floors[0]?.id ?? null);

  const pickItemPhotos = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.length) return;
      const dir = `${FileSystem.documentDirectory}wizard-photos/`;
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      } catch {}
      const uris: string[] = [];
      for (const a of res.assets) {
        try {
          const dest = `${dir}p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
          await FileSystem.copyAsync({ from: a.uri, to: dest });
          uris.push(dest);
        } catch { uris.push(a.uri); }
      }
      setItemPhotos((prev) => [...prev, ...uris]);
    } catch {}
  };

  const addItemNow = async () => {
    if (!projectId || !itemTitle.trim()) return;
    haptic();
    const title = itemTitle.trim();
    const room = itemRoom.trim() || undefined;
    const floorName = floors.find((f) => f.id === curFloorId)?.name || undefined;
    const assignee = itemAssignee.trim() || undefined;
    try {
      if (itemType === "defect") {
        const now = new Date().toISOString();
        await saveDefect({
          id: `defect_${Date.now()}`,
          projectId,
          title,
          description: "",
          status: "offen",
          priority: "mittel",
          category: "sonstiges",
          photos: itemPhotos,
          room,
          floor: floorName,
          assignee,
          createdAt: now,
          updatedAt: now,
        } as any);
      } else {
        const raw = await AsyncStorage.getItem("project-tasks");
        const all = raw ? JSON.parse(raw) : [];
        all.unshift({ id: `task-${Date.now()}`, projectId, title, room, floor: floorName, assignee, status: "offen", done: false });
        await AsyncStorage.setItem("project-tasks", JSON.stringify(all));
      }
      setAddedItems((prev) => [{ type: itemType, title, room }, ...prev]);
      setItemTitle("");
      setItemPhotos([]);
      setItemAssignee("");
    } catch {}
  };

  const floorLabel = (f: Floor) => f.name;
  const roomsForFloor = (fid: string) => rooms.filter((r) => r.floorId === fid);

  // ─── Header / progress ──────────────────────────────────────────────────────
  const stepIndex = step === "choose" ? 0 : step === "details" ? 1 : step === "rooms" ? 2 : 3;
  const stepTitle =
    step === "choose" ? t('wizard_choose_project' as any)
      : step === "details" ? t('wizard_step_details' as any)
        : step === "rooms" ? t('wizard_step_rooms' as any)
          : t('wizard_step_items' as any);

  const back = () => {
    if (step === "details") setStep(projects.length ? "choose" : "details");
    else if (step === "rooms") setStep("details");
    else if (step === "items") setStep("rooms");
    else router.back();
  };

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={back} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{stepTitle}</Text>
        </View>
        <Pressable onPress={finish} hitSlop={8}>
          <MaterialIcons name="close" size={24} color={colors.muted} />
        </Pressable>
      </View>

      {/* progress dots (details/rooms/items) */}
      {step !== "choose" && (
        <View style={styles.dots}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.dot, { backgroundColor: stepIndex >= n ? colors.primary : colors.border }]} />
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {/* ─── Step: choose ─────────────────────────────────────────────── */}
        {step === "choose" && (
          <>
            {projects.map((p) => (
              <Pressable key={p.id} onPress={() => pickExisting(p.id)} style={[styles.projRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.projDot, { backgroundColor: p.color || "#5DADE2" }]} />
                <Text style={[styles.projName, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
            <Pressable onPress={() => { haptic(); setStep("details"); }} style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1, marginTop: projects.length ? 14 : 0 }]}>
              <MaterialIcons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>{t('wizard_new_project' as any)}</Text>
            </Pressable>
          </>
        )}

        {/* ─── Step: details ────────────────────────────────────────────── */}
        {step === "details" && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('projektname')}</Text>
            <TextInput value={name} onChangeText={setName} placeholder={t('projektname')} placeholderTextColor={colors.muted} autoFocus style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('adresse')}</Text>
            <TextInput value={address} onChangeText={setAddress} placeholder="Musterstraße 1, 12345 Stadt" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('beschreibung_optional')}</Text>
            <TextInput value={desc} onChangeText={setDesc} placeholder={t('beschreibung_optional')} placeholderTextColor={colors.muted} multiline style={[styles.input, { minHeight: 70, textAlignVertical: "top", color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
            <View style={styles.colorRow}>
              {WIZ_COLORS.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? colors.foreground : "transparent" }]} />
              ))}
            </View>
          </>
        )}

        {/* ─── Step: rooms ──────────────────────────────────────────────── */}
        {step === "rooms" && (
          <>
            <Text style={[styles.hint, { color: colors.muted }]}>{t('wizard_optional_hint' as any)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {floors.map((f) => {
                const active = f.id === floorId;
                return (
                  <Pressable key={f.id} onPress={() => setFloorId(f.id)} style={[styles.floorChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surface }]}>
                    <Text style={{ color: active ? colors.primary : colors.muted, fontWeight: "700", fontSize: 13 }}>{floorLabel(f)}</Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => { setNewFloorName(""); setFloorInputOpen(true); }} style={[styles.floorChip, { flexDirection: "row", alignItems: "center", gap: 4, borderColor: colors.border, backgroundColor: colors.surface }]}>
                <MaterialIcons name="add" size={15} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{t('wizard_floor' as any)}</Text>
              </Pressable>
            </ScrollView>

            {floorInputOpen && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TextInput value={newFloorName} onChangeText={setNewFloorName} placeholder={t('wizard_floor' as any)} placeholderTextColor={colors.muted} autoFocus returnKeyType="done" onSubmitEditing={addCustomFloor} style={[styles.input, { flex: 1, marginBottom: 0, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
                <Pressable onPress={addCustomFloor} style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.85 : 1 }]}>
                  <MaterialIcons name="check" size={22} color="#FFFFFF" />
                </Pressable>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <TextInput value={roomName} onChangeText={setRoomName} placeholder={t('rooms_add_room')} placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={addRoomNow} style={[styles.input, { flex: 1, marginBottom: 0, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
              <Pressable onPress={recording ? stopVoiceRooms : startVoiceRooms} style={({ pressed }) => [styles.addBtn, { backgroundColor: recording ? "#EF4444" : "#334155", opacity: pressed ? 0.85 : 1 }]}>
                <MaterialIcons name={recording ? "stop" : "mic"} size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={addRoomNow} style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.85 : 1 }]}>
                <MaterialIcons name="add" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={{ color: recording ? "#EF4444" : colors.muted, fontSize: 12, marginTop: 6 }}>
              {recording ? t('wizard_voice_listening' as any) : t('wizard_voice_hint' as any)}
            </Text>
            {floors.map((f) => {
              const fr = roomsForFloor(f.id);
              if (fr.length === 0) return null;
              return (
                <View key={f.id} style={{ marginTop: 14 }}>
                  <Text style={[styles.groupLabel, { color: colors.muted }]}>{floorLabel(f)}</Text>
                  {fr.map((r) => (
                    <Pressable key={r.id} onPress={() => openEditRoom(r)} style={({ pressed }) => [styles.itemRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                      <MaterialIcons name="meeting-room" size={16} color="#5DADE2" />
                      <Text style={[styles.itemText, { color: colors.foreground }]} numberOfLines={1}>{r.name}</Text>
                      <MaterialIcons name="edit" size={15} color={colors.muted} />
                      <Pressable onPress={() => deleteRoomNow(r)} hitSlop={8} style={{ paddingLeft: 6 }}>
                        <MaterialIcons name="delete-outline" size={19} color="#F87171" />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </>
        )}

        {/* ─── Step: items ──────────────────────────────────────────────── */}
        {step === "items" && (
          <>
            <Text style={[styles.hint, { color: colors.muted }]}>{t('wizard_optional_hint' as any)}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              {(["defect", "task"] as const).map((tp) => {
                const active = itemType === tp;
                const label = tp === "defect" ? t('maengel') : t('index_tool_aufgaben');
                const c = tp === "defect" ? "#F59E0B" : "#818CF8";
                return (
                  <Pressable key={tp} onPress={() => setItemType(tp)} style={[styles.typeToggle, { borderColor: active ? c : colors.border, backgroundColor: active ? c + "18" : colors.surface }]}>
                    <MaterialIcons name={tp === "defect" ? "warning" : "task-alt"} size={16} color={active ? c : colors.muted} />
                    <Text style={{ color: active ? c : colors.muted, fontWeight: "700", fontSize: 13 }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput value={itemTitle} onChangeText={setItemTitle} placeholder={t('titel')} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

            {/* Etage */}
            {floors.length > 0 && (
              <>
                <Text style={styles.miniLabel}>{t('wizard_floor' as any)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                  {floors.map((f) => {
                    const active = f.id === curFloorId;
                    return (
                      <Pressable key={f.id} onPress={() => setItemFloorId(f.id)} style={[styles.floorChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surface }]}>
                        <Text style={{ color: active ? colors.primary : colors.muted, fontWeight: "700", fontSize: 13 }}>{floorLabel(f)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Raum – aus den zuvor erstellten Räumen wählen */}
            {curFloorId && roomsForFloor(curFloorId).length > 0 && (
              <>
                <Text style={styles.miniLabel}>{t('index_tool_raeume')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                  {roomsForFloor(curFloorId).map((r) => {
                    const active = itemRoom === r.name;
                    return (
                      <Pressable key={r.id} onPress={() => setItemRoom(active ? "" : r.name)} style={[styles.floorChip, { flexDirection: "row", alignItems: "center", gap: 5, borderColor: active ? "#5DADE2" : colors.border, backgroundColor: active ? "#5DADE218" : colors.surface }]}>
                        <MaterialIcons name="meeting-room" size={14} color={active ? "#5DADE2" : colors.muted} />
                        <Text style={{ color: active ? "#5DADE2" : colors.muted, fontWeight: "600", fontSize: 13 }}>{r.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
            <TextInput value={itemRoom} onChangeText={setItemRoom} placeholder={t('index_tool_raeume')} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

            {/* Zuständiger */}
            <TextInput value={itemAssignee} onChangeText={setItemAssignee} placeholder={t('zustaendig')} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

            {/* Fotos */}
            <Pressable onPress={pickItemPhotos} style={({ pressed }) => [styles.photoBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="add-a-photo" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{t('fotos_hinzufuegen')}</Text>
            </Pressable>
            {itemPhotos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {itemPhotos.map((uri, i) => (
                  <View key={i} style={{ marginRight: 8 }}>
                    <Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
                    <Pressable onPress={() => setItemPhotos((prev) => prev.filter((_, idx) => idx !== i))} style={styles.photoRemove}>
                      <MaterialIcons name="close" size={13} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable onPress={addItemNow} disabled={!itemTitle.trim()} style={({ pressed }) => [styles.addFullBtn, { opacity: !itemTitle.trim() ? 0.4 : pressed ? 0.85 : 1 }]}>
              <MaterialIcons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addFullBtnText}>{t('hinzufuegen')}</Text>
            </Pressable>
            {addedItems.map((it, i) => (
              <View key={i} style={[styles.itemRow, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: i === 0 ? 14 : 8 }]}>
                <MaterialIcons name={it.type === "defect" ? "warning" : "task-alt"} size={16} color={it.type === "defect" ? "#F59E0B" : "#818CF8"} />
                <Text style={[styles.itemText, { color: colors.foreground }]} numberOfLines={1}>{it.title}{it.room ? `  ·  ${it.room}` : ""}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* ─── Footer buttons ───────────────────────────────────────────── */}
      {step !== "choose" && (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {step === "details" && (
            <Pressable onPress={goToRooms} disabled={!name.trim()} style={({ pressed }) => [styles.footerPrimary, { opacity: !name.trim() ? 0.4 : pressed ? 0.85 : 1 }]}>
              <Text style={styles.footerPrimaryText}>{t('weiter')}</Text>
              <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
            </Pressable>
          )}
          {step === "rooms" && (
            <>
              <Pressable onPress={() => setStep("items")} style={({ pressed }) => [styles.footerGhost, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.footerGhostText, { color: colors.muted }]}>{t('ueberspringen')}</Text>
              </Pressable>
              <Pressable onPress={() => setStep("items")} style={({ pressed }) => [styles.footerPrimary, { flex: 2, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={styles.footerPrimaryText}>{t('weiter')}</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
              </Pressable>
            </>
          )}
          {step === "items" && (
            <>
              <Pressable onPress={finish} style={({ pressed }) => [styles.footerGhost, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.footerGhostText, { color: colors.muted }]}>{t('ueberspringen')}</Text>
              </Pressable>
              <Pressable onPress={finish} style={({ pressed }) => [styles.footerPrimary, { flex: 2, opacity: pressed ? 0.85 : 1 }]}>
                <MaterialIcons name="check" size={20} color="#FFFFFF" />
                <Text style={styles.footerPrimaryText}>{t('wizard_done' as any)}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {voiceBusy && (
        <View style={styles.voiceOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600", marginTop: 12 }}>{t('wizard_voice_processing' as any)}</Text>
        </View>
      )}

      {/* Edit / delete a room */}
      <Modal visible={!!editRoom} transparent animationType="slide" onRequestClose={() => setEditRoom(null)}>
        <View style={styles.editOverlay}>
          <View style={[styles.editSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.editTitle, { color: colors.foreground }]}>{t('rooms_add_room' as any)}</Text>
            <TextInput
              value={editRoomName}
              onChangeText={setEditRoomName}
              placeholder={t('rooms_add_room' as any)}
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveEditRoom}
              style={[styles.input, { marginTop: 12, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => editRoom && deleteRoomNow(editRoom)} style={({ pressed }) => [styles.editDelete, { opacity: pressed ? 0.7 : 1 }]}>
                <MaterialIcons name="delete-outline" size={18} color="#F87171" />
                <Text style={{ color: "#F87171", fontWeight: "700" }}>{t('btn_loeschen')}</Text>
              </Pressable>
              <Pressable onPress={saveEditRoom} style={({ pressed }) => [styles.editSave, { opacity: pressed ? 0.85 : 1 }]}>
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  title: { fontSize: 17, fontWeight: "800" },
  dots: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 12 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginBottom: 4 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  floorChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  addBtn: { width: 46, height: 46, borderRadius: 10, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  miniLabel: { fontSize: 12, fontWeight: "700", color: "#7F8C9B", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 6, marginBottom: 6 },
  photoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 12, marginTop: 2 },
  photoRemove: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  addFullBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  addFullBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  groupLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
  itemText: { flex: 1, fontSize: 14, fontWeight: "600" },
  typeToggle: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  projRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
  projDot: { width: 12, height: 12, borderRadius: 6 },
  projName: { flex: 1, fontSize: 15, fontWeight: "700" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 15 },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  footer: { flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 0.5 },
  footerGhost: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  footerGhostText: { fontSize: 15, fontWeight: "700" },
  footerPrimary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 14 },
  footerPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  voiceOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.72)" },
  editOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  editSheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, padding: 20, paddingBottom: 34 },
  editTitle: { fontSize: 18, fontWeight: "800" },
  editDelete: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#7F1D1D" },
  editSave: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: "#2563EB" },
});
