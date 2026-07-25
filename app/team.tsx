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
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@/lib/language-provider";
import {
  TeamMember,
  TEAM_ROLES,
  MEMBER_COLORS,
  getTeamMembers,
  saveTeamMember,
  deleteTeamMember,
} from "@/lib/team-store";

export default function TeamScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<TeamMember["role"]>("handwerker");
  const [newColor, setNewColor] = useState(MEMBER_COLORS[0]);
  const [sendInvite, setSendInvite] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [])
  );

  async function loadMembers() {
    const loaded = await getTeamMembers();
    setMembers(loaded);
  }

  const createMember = async () => {
    if (!newName.trim()) {
      Alert.alert(t('alert_fehler'), t('msg_bitte_einen_namen_eingeben'));
      return;
    }

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

    // Send invite if requested
    if (sendInvite && (newEmail.trim() || newPhone.trim())) {
      const inviteMessage = t('einladung_nachricht').replace('{name}', newName.trim()).replace('{role}', getRoleLabel(newRole));

      if (newEmail.trim()) {
        const subject = encodeURIComponent("Einladung zum BuildKI-Team");
        const body = encodeURIComponent(inviteMessage);
        const mailUrl = `mailto:${newEmail.trim()}?subject=${subject}&body=${body}`;
        try {
          await Linking.openURL(mailUrl);
        } catch {
          // Silently fail if mail app not available
        }
      } else if (newPhone.trim()) {
        const smsBody = encodeURIComponent(inviteMessage);
        const smsUrl = Platform.OS === "ios"
          ? `sms:${newPhone.trim()}&body=${smsBody}`
          : `sms:${newPhone.trim()}?body=${smsBody}`;
        try {
          await Linking.openURL(smsUrl);
        } catch {
          // Silently fail if SMS not available
        }
      }
    }

    setShowCreateModal(false);
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewRole("handwerker");
    setNewColor(MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)]);
    setSendInvite(true);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t('hinzugefuegt'), t('msg_mitglied_zum_team_hinzugefuegt').replace('{name}', member.name));
  };

  const removeMember = (memberId: string, name: string) => {
    Alert.alert(t('alert_teammitglied_entfernen'), `${name} wirklich aus dem Team entfernen?`, [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_entfernen'),
        style: "destructive",
        onPress: async () => {
          await deleteTeamMember(memberId);
          await loadMembers();
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const getRoleLabel = (role: TeamMember["role"]) => {
    return TEAM_ROLES.find((r) => r.key === role)?.label || role;
  };

  const contactMember = (member: TeamMember) => {
    const options: { text: string; onPress?: () => void }[] = [];

    if (member.email) {
      options.push({
        text: `E-Mail: ${member.email}`,
        onPress: () => Linking.openURL(`mailto:${member.email}`),
      });
    }
    if (member.phone) {
      options.push({
        text: `Anrufen: ${member.phone}`,
        onPress: () => Linking.openURL(`tel:${member.phone}`),
      });
      options.push({
        text: `SMS: ${member.phone}`,
        onPress: () => {
          const url = Platform.OS === "ios" ? `sms:${member.phone}` : `sms:${member.phone}`;
          Linking.openURL(url);
        },
      });
    }

    options.push({
      text: t('btn_entfernen'),
      onPress: () => removeMember(member.id, member.name),
    });

    options.push({ text: t('btn_abbrechen') });

    Alert.alert(member.name, getRoleLabel(member.role), options);
  };

  const renderMember = ({ item }: { item: TeamMember }) => (
    <Pressable
      onPress={() => contactMember(item)}
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
        {item.phone && !item.email && (
          <Text style={[styles.memberContact, { color: colors.muted }]}>{item.phone}</Text>
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
        <Text style={[styles.title, { color: colors.foreground }]}>{t('team_title')}</Text>
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
            <Text style={[styles.emptyText, { color: colors.muted }]}>{t('noch_keine_teammitglieder')}</Text>
            <Text style={[styles.emptySubtext, { color: colors.muted }]}>
              Tippe auf das + Symbol oben rechts um Teammitglieder hinzuzufügen
            </Text>
            <Pressable
              onPress={() => setShowCreateModal(true)}
              style={({ pressed }) => [styles.emptyAddBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="person-add" size={20} color="#FFF" />
              <Text style={styles.emptyAddBtnText}>{t('person_hinzufuegen')}</Text>
            </Pressable>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {/* Modal Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('person_einladen')}</Text>
                <Pressable onPress={() => setShowCreateModal(false)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 4 }]}>
                  <MaterialIcons name="close" size={22} color={colors.muted} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
                {/* Name */}
                <Text style={[styles.inputLabel, { color: colors.muted }]}>{t('name')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder={t('vor_und_nachname')}
                  placeholderTextColor={colors.muted + "80"}
                  value={newName}
                  onChangeText={setNewName}
                  returnKeyType="next"
                />

                {/* Email */}
                <Text style={[styles.inputLabel, { color: colors.muted }]}>{t('email')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="name@firma.de"
                  placeholderTextColor={colors.muted + "80"}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                />

                {/* Phone */}
                <Text style={[styles.inputLabel, { color: colors.muted }]}>{t('telefon_handynummer')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="+49 170 1234567"
                  placeholderTextColor={colors.muted + "80"}
                  value={newPhone}
                  onChangeText={setNewPhone}
                  keyboardType="phone-pad"
                />

                {/* Role Selection */}
                <Text style={[styles.inputLabel, { color: colors.muted }]}>{t('rolle')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
                  {TEAM_ROLES.map((role) => (
                    <Pressable
                      key={role.key}
                      onPress={() => setNewRole(role.key as TeamMember["role"])}
                      style={({ pressed }) => [
                        styles.roleBtn,
                        { borderColor: newRole === role.key ? colors.primary : colors.border },
                        newRole === role.key && { backgroundColor: colors.primary + "15" },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={[styles.roleText, { color: newRole === role.key ? colors.primary : colors.muted }]}>
                        {role.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* Color Selection */}
                <Text style={[styles.inputLabel, { color: colors.muted }]}>{t('project_color')}</Text>
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

                {/* Invite Toggle */}
                <Pressable
                  onPress={() => setSendInvite(!sendInvite)}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 8, opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons
                    name={sendInvite ? "check-box" : "check-box-outline-blank"}
                    size={22}
                    color={sendInvite ? colors.primary : colors.muted}
                  />
                  <Text style={{ fontSize: 14, color: colors.foreground }}>{t('einladung_per_emailsms_senden')}</Text>
                </Pressable>

                {/* Info */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4, marginBottom: 4 }}>
                  <MaterialIcons name="info-outline" size={14} color={colors.muted} style={{ marginTop: 2 }} />
                  <Text style={{ fontSize: 12, color: colors.muted, flex: 1, lineHeight: 18 }}>
                    Die Person wird zum Team hinzugefügt und kann per E-Mail oder Nummer eingeladen werden, um gemeinsam in der App zu arbeiten.
                  </Text>
                </View>
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.modalButtons}>
                <Pressable
                  onPress={() => { setShowCreateModal(false); setNewName(""); setNewEmail(""); setNewPhone(""); }}
                  style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>{t('cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={createMember}
                  style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
                >
                  <MaterialIcons name="person-add" size={18} color="#FFF" />
                  <Text style={styles.saveBtnText}>{t('hinzufuegen')}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  statsCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 0, borderWidth: 1, marginBottom: 16 },
  statsText: { flex: 1 },
  statsTitle: { fontSize: 16, fontWeight: "600" },
  statsSubtitle: { fontSize: 13, marginTop: 2 },
  list: { paddingBottom: 20 },
  memberCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, borderWidth: 1, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 0, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: "600" },
  memberRole: { fontSize: 13, marginTop: 2 },
  memberContact: { fontSize: 12, marginTop: 2 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: "500" },
  emptySubtext: { fontSize: 13, textAlign: "center", paddingHorizontal: 32 },
  emptyAddBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 0, marginTop: 16 },
  emptyAddBtnText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { width: "100%", maxWidth: 400, borderRadius: 0, borderWidth: 1, padding: 24, alignSelf: "center" },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  inputLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 0, padding: 14, fontSize: 15, marginBottom: 14 },
  roleScroll: { marginBottom: 16, maxHeight: 40 },
  roleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 0, borderWidth: 1, marginRight: 8 },
  roleText: { fontSize: 13, fontWeight: "500" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  colorDot: { width: 28, height: 28, borderRadius: 0 },
  colorDotSelected: { borderWidth: 3, borderColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 0, borderWidth: 1, alignItems: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 0, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
