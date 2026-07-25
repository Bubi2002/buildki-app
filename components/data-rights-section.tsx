import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/hooks/use-auth";
import { deleteAllLocalUserData, shareCombinedDataExport } from "@/lib/data-rights";
import { LEGAL_CONTACT_EMAIL, LEGAL_DRAFT_MARKER } from "@/lib/legal-draft";
import { trpc } from "@/lib/trpc";

const DELETE_CONFIRMATION = "KONTO ENDGÜLTIG LÖSCHEN";

export function DataRightsSection() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const accountExport = trpc.account.exportData.useQuery(undefined, {
    enabled: false,
    retry: false,
  });
  const deleteAccount = trpc.account.deleteAccount.useMutation();
  const [exporting, setExporting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledgeProviderResiduals, setAcknowledgeProviderResiduals] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    if (!isAuthenticated) {
      Alert.alert("Anmeldung erforderlich", "Für den Konto- und Cloudexport müssen Sie angemeldet sein.");
      return;
    }
    setExporting(true);
    try {
      const result = await accountExport.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Der Kontoexport hat keine Daten zurückgegeben.");
      await shareCombinedDataExport(result.data);
    } catch (error: any) {
      Alert.alert("Export fehlgeschlagen", error?.message || "Der Datenexport konnte nicht erstellt werden.");
    } finally {
      setExporting(false);
    }
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setShowDeleteDialog(false);
    setConfirmation("");
    setAcknowledgeProviderResiduals(false);
  };

  const handleDeleteAccount = async () => {
    if (!isAuthenticated) {
      Alert.alert("Anmeldung erforderlich", "Für die Konto- und Cloudlöschung müssen Sie angemeldet sein.");
      return;
    }
    if (confirmation !== DELETE_CONFIRMATION || !acknowledgeProviderResiduals) return;

    setDeleting(true);
    try {
      const serverResult = await deleteAccount.mutateAsync({
        confirmation: DELETE_CONFIRMATION,
        acknowledgeProviderResiduals: true,
      });
      const localResult = await deleteAllLocalUserData();
      setShowDeleteDialog(false);

      const residualCount = serverResult.externalResiduals.storageObjectsUnlinked;
      Alert.alert(
        "Konto und erreichbare Daten gelöscht",
        `Datenbankkonto, Cloudtabellen und lokale Daten wurden entfernt. Lokal gelöscht: ${localResult.removedStorageKeys} Speicherbereiche, ${localResult.removedDocumentEntries} Dokumenteinträge und ${localResult.removedCacheEntries} Cacheeinträge.${
          residualCount > 0
            ? `\n\n${residualCount} nicht mehr verknüpfte Speicherobjekte unterliegen noch der Provider-Löschfrist: ${LEGAL_DRAFT_MARKER}.`
            : ""
        }`,
        [{ text: "OK", onPress: () => router.replace("/login" as any) }],
      );
    } catch (error: any) {
      Alert.alert(
        "Löschung nicht vollständig",
        `${error?.message || "Die Löschung konnte nicht abgeschlossen werden."}\n\nBitte wenden Sie sich an ${LEGAL_CONTACT_EMAIL}.`,
      );
    } finally {
      setDeleting(false);
    }
  };

  const canDelete = confirmation === DELETE_CONFIRMATION && acknowledgeProviderResiduals && !deleting;

  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">Meine Daten – Prüfstand</Text>

      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">Konto- und Gerätedaten exportieren</Text>
        <Text className="text-sm text-foreground leading-5">
          Der Export verbindet Profil-, Consent-, Projekt-, Protokoll-, Mängel-, Anhangs- und Tagesberichtsdaten des Kontos mit allen nicht geheimen lokalen App-Stores und einem lokalen Dateimanifest. Passwörter, Token und andere Zugangsschlüssel werden nicht exportiert.
        </Text>
        <Text className="text-xs text-warning leading-4">
          Binäre Medieninhalte und Daten bei externen Anbietern: {LEGAL_DRAFT_MARKER}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Konto- und Gerätedaten exportieren"
          onPress={handleExport}
          disabled={exporting}
          className={`mt-2 px-4 py-3 border border-primary ${exporting ? "bg-muted" : "bg-primary"}`}
        >
          {exporting ? (
            <ActivityIndicator color="#06111D" />
          ) : (
            <Text className="text-background text-center font-semibold">Datenexport erstellen</Text>
          )}
        </Pressable>
      </View>

      <View className="gap-2 border border-error p-4">
        <Text className="text-base font-semibold text-error">Konto endgültig löschen</Text>
        <Text className="text-sm text-foreground leading-5">
          Diese Aktion löscht das Benutzerkonto, BuildKI-Cloudtabellen, lokale App-Stores, lokale Medien, Cache, Authentifizierungsdaten und verbundene Dropbox-Token. Die Aktion kann nicht rückgängig gemacht werden.
        </Text>
        <Text className="text-xs text-warning leading-4">
          Physische Provider-Löschung nicht mehr verknüpfter Objekte, gesetzliche Aufbewahrung und Stripe-Kundendaten: {LEGAL_DRAFT_MARKER}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Konto endgültig löschen"
          onPress={() => setShowDeleteDialog(true)}
          className="mt-2 px-4 py-3 bg-error"
        >
          <Text className="text-background text-center font-semibold">Löschung prüfen</Text>
        </Pressable>
      </View>

      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">Datenschutzanfrage</Text>
        <Text className="text-sm text-foreground leading-5">
          Für Berichtigung, Einschränkung, Widerspruch oder Fragen zu externen Anbieterresten: {LEGAL_CONTACT_EMAIL}
        </Text>
      </View>

      <Modal visible={showDeleteDialog} transparent animationType="fade" onRequestClose={closeDeleteDialog}>
        <View className="flex-1 bg-black/70 justify-center px-5">
          <View className="bg-background border border-error p-5 gap-4">
            <View className="flex-row items-center gap-3">
              <MaterialIcons name="warning" size={28} color="#EF4444" />
              <Text className="text-lg font-bold text-error flex-1">Endgültige Kontolöschung</Text>
            </View>
            <Text className="text-sm text-foreground leading-5">
              Erstellen und sichern Sie vorher den Datenexport. Tippen Sie zur Bestätigung exakt:
            </Text>
            <Text className="text-sm font-bold text-foreground">{DELETE_CONFIRMATION}</Text>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              accessibilityLabel="Bestätigungstext für Kontolöschung"
              className="border border-border bg-surface px-3 py-3 text-foreground"
              placeholder={DELETE_CONFIRMATION}
              placeholderTextColor="#7A8794"
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledgeProviderResiduals }}
              onPress={() => setAcknowledgeProviderResiduals((value) => !value)}
              disabled={deleting}
              className="flex-row items-start gap-3 border border-border p-3"
            >
              <MaterialIcons
                name={acknowledgeProviderResiduals ? "check-box" : "check-box-outline-blank"}
                size={24}
                color={acknowledgeProviderResiduals ? "#5BA7D9" : "#7A8794"}
              />
              <Text className="text-sm text-foreground leading-5 flex-1">
                Ich habe verstanden, dass Provider-Löschfristen und gesetzliche Aufbewahrung vor Veröffentlichung noch verbindlich festgelegt werden müssen.
              </Text>
            </Pressable>
            <View className="flex-row gap-3">
              <Pressable
                onPress={closeDeleteDialog}
                disabled={deleting}
                className="flex-1 border border-border px-3 py-3"
              >
                <Text className="text-foreground text-center font-semibold">Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteAccount}
                disabled={!canDelete}
                className={`flex-1 px-3 py-3 ${canDelete ? "bg-error" : "bg-muted"}`}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-background text-center font-semibold">Endgültig löschen</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
