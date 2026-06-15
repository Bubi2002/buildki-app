import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import {
  TeamMember,
  TEAM_ROLES,
  MEMBER_COLORS,
  getTeamMembers,
  saveTeamMember,
  deleteTeamMember,
} from "@/lib/team-store";

export default function TeamScreen() {
  const colors = useColors();
  const router = useRouter();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<TeamMember["role"]>("handwerker");
  const [newColor, setNewColor] = useState(MEMBER_COLORS[0]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [])
  );

  const loadMembers = async () => {
    const loaded = await getTeamMembers();
    setMembers(loaded);
  };

  const createMember = async () => {
    if (!newName.trim()) return;

    const member: TeamMember = {
      id: `member-${Date.now()}`,
      name: newName.trim(),
      email: newEmail.trim() || undefined,
      phone: newPhone.trim() || undefined,
      role: newRole,
      color: newColor,
      createdAt: new Date().toISOString(),
    };

    await saveTeamMember(member);
    await loadMembers();
    setShowCreateModal(false);
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewRole("handwerker");
    setNewColor(MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)]);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removeMember = (memberId: string, name: string) => {
    Alert.alert("Teammitglied entfernen", `${name} wirklich aus dem Team entfernen?`, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Entfernen",
        style: "destructive",
        onPress: async () => {
          await deleteTeamMember(memberId);
          await loadMembers();
        },
      },
    ]);
  };

  const getRoleLabel = (role: TeamMember["role"]) => {
    return TEAM_ROLES.find((r) => r.key === role)?.label || role;
  };

  const renderMember = ({ item }: { item: TeamMember }) => (
    <Pressable
      onLongPress={() => removeMember(item.id, item.name)}
      style={({ pressed }) => [
        styles.memberCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: item.color }]}>
        <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: colors.foreground }]}>{item.name}</Text>
        <Text style={[styles.memberRole, { color: colors.muted }]}>{getRoleLabel(item.role)}</Text>
        {item.email && (
          <Text style={[styles.memberContact, { color: colors.muted }]}>{item.email}</Text>
        )}
      </View>
      <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );

  return (
    <ScreenContainer className="p-4">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Team</Text>
        <Pressable onPress={() => setShowCreateModal(true)} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="person-add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Team Stats */}
      <View style={[styles.statsCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
        <MaterialIcons name="groups" size={24} color={colors.primary} />
        <View style={styles.statsText}>
          <Text style={[styles.statsTitle, { color: colors.foreground }]}>{members.length} Mitglieder</Text>
          <Text style={[styles.statsSubtitle, { color: colors.muted }]}>
            {TEAM_ROLES.map((r) => {
              const count = members.filter((m) => m.role === r.key).length;
              return count > 0 ? `${count} ${r.label}` : null;
            }).filter(Boolean).join(", ") || "Noch keine Mitglieder"}
          </Text>
        </View>
      </View>

      {/* Member List */}
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="group-add" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>Noch keine Teammitglieder</Text>
            <Text style={[styles.emptySubtext, { color: colors.muted }]}>
              Füge Teammitglieder hinzu um Aufgaben zuzuweisen und Projekte zu teilen
            </Text>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Neues Teammitglied</Text>

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Name *"
              placeholderTextColor={colors.muted}
              value={newName}
              onChangeText={setNewName}
            />

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="E-Mail"
              placeholderTextColor={colors.muted}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Telefon"
              placeholderTextColor={colors.muted}
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
            />

            {/* Role Selection */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>Rolle</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
              {TEAM_ROLES.map((role) => (
                <Pressable
                  key={role.key}
                  onPress={() => setNewRole(role.key as TeamMember["role"])}
                  style={[
                    styles.roleBtn,
                    { borderColor: newRole === role.key ? colors.primary : colors.border },
                    newRole === role.key && { backgroundColor: colors.primary + "15" },
                  ]}
                >
                  <Text style={[styles.roleText, { color: newRole === role.key ? colors.primary : colors.muted }]}>
                    {role.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Color Selection */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>Farbe</Text>
            <View style={styles.colorRow}>
              {MEMBER_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setNewColor(color)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    newColor === color && styles.colorDotSelected,
                  ]}
                />
              ))}
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setShowCreateModal(false); setNewName(""); setNewEmail(""); setNewPhone(""); }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={createMember}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.saveBtnText}>Hinzufügen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  addBtn: { padding: 8 },
  statsCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  statsText: { flex: 1 },
  statsTitle: { fontSize: 16, fontWeight: "600" },
  statsSubtitle: { fontSize: 13, marginTop: 2 },
  list: { paddingBottom: 20 },
  memberCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: "600" },
  memberRole: { fontSize: 13, marginTop: 2 },
  memberContact: { fontSize: 12, marginTop: 2 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: "500" },
  emptySubtext: { fontSize: 13, textAlign: "center", paddingHorizontal: 32 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: "500", marginBottom: 8, marginTop: 4 },
  roleScroll: { marginBottom: 16, maxHeight: 36 },
  roleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, marginRight: 8 },
  roleText: { fontSize: 13, fontWeight: "500" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotSelected: { borderWidth: 3, borderColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
