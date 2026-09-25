import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useContext, useState } from "react";
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
import { useTranslation } from "@/lib/language-provider";
import { deleteAllLocalUserData, shareCombinedDataExport } from "@/lib/data-rights";
import { LEGAL_CONTACT_EMAIL, LEGAL_DRAFT_MARKER } from "@/lib/legal-draft";
import { LegalModeContext } from "@/lib/legal-mode";
import { trpc } from "@/lib/trpc";

const DELETE_CONFIRMATION = "KONTO ENDGÜLTIG LÖSCHEN";

const DR_DATE_LOCALE: Record<string, string> = {
  de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", uk: "uk-UA",
  pl: "pl-PL", ru: "ru-RU", ro: "ro-RO", bg: "bg-BG", tr: "tr-TR",
};

export function DataRightsSection() {
  const { t, language } = useTranslation();
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
  const [exportReadyAt, setExportReadyAt] = useState<string | null>(null);
  const internalLegal = useContext(LegalModeContext);

  const handleExport = async () => {
    if (!isAuthenticated) {
      Alert.alert(t('data_rights_section_login_required' as any), t('data_rights_section_login_required_export' as any));
      return;
    }
    setExporting(true);
    try {
      const result = await accountExport.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error(t('data_rights_section_export_no_data' as any));
      await shareCombinedDataExport(result.data);
      setExportReadyAt(new Date().toLocaleDateString(DR_DATE_LOCALE[language] || "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }));
    } catch (error: any) {
      Alert.alert(t('data_rights_section_export_failed' as any), error?.message || t('data_rights_section_export_failed_msg' as any));
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
      Alert.alert(t('data_rights_section_login_required' as any), t('data_rights_section_login_required_delete' as any));
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
        t('data_rights_section_deleted_title' as any),
        `${t('data_rights_section_deleted_p1' as any)}${localResult.removedStorageKeys}${t('data_rights_section_deleted_p2' as any)}${localResult.removedDocumentEntries}${t('data_rights_section_deleted_p3' as any)}${localResult.removedCacheEntries}${t('data_rights_section_deleted_p4' as any)}${
          residualCount > 0
            ? `\n\n${residualCount}${t('data_rights_section_residual' as any)}${internalLegal ? LEGAL_DRAFT_MARKER : ""}.`
            : ""
        }`,
        [{ text: t('ok'), onPress: () => router.replace("/login" as any) }],
      );
    } catch (error: any) {
      Alert.alert(
        t('data_rights_section_delete_incomplete_title' as any),
        `${error?.message || t('data_rights_section_delete_incomplete_msg' as any)}\n\n${t('data_rights_section_contact_prefix' as any)}${LEGAL_CONTACT_EMAIL}.`,
      );
    } finally {
      setDeleting(false);
    }
  };

  const canDelete = confirmation === DELETE_CONFIRMATION && acknowledgeProviderResiduals && !deleting;

  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">{t('data_rights_section_heading' as any)}</Text>

      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">{t('data_rights_section_export_title' as any)}</Text>
        <Text className="text-sm text-foreground leading-5">
          {t('data_rights_section_export_desc' as any)}
        </Text>
        {/* What the export contains */}
        <View className="border border-border bg-surface p-3 gap-1">
          <Text className="text-xs font-semibold text-muted mb-1">{t('dr_export_contains' as any)}</Text>
          {[
            "dr_export_i_account", "dr_export_i_projects", "dr_export_i_protocols",
            "dr_export_i_defects", "dr_export_i_tasks", "dr_export_i_photos",
          ].map((k) => (
            <View key={k} className="flex-row items-center">
              <MaterialIcons name="check" size={14} color="#5BA7D9" />
              <Text className="text-sm text-foreground ml-2">{t(k as any)}</Text>
            </View>
          ))}
        </View>
        {internalLegal && (
          <Text className="text-xs text-warning leading-4">
            {t('data_rights_section_export_binary_prefix' as any)}{LEGAL_DRAFT_MARKER}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('data_rights_section_export_title' as any)}
          onPress={handleExport}
          disabled={exporting}
          className={`mt-2 px-4 py-3 border border-primary ${exporting ? "bg-muted" : "bg-primary"}`}
        >
          {exporting ? (
            <ActivityIndicator color="#06111D" />
          ) : (
            <Text className="text-background text-center font-semibold">{t('data_rights_section_export_button' as any)}</Text>
          )}
        </Pressable>
        {/* Status */}
        {exporting ? (
          <Text className="text-xs text-muted mt-1">{t('dr_export_preparing' as any)}</Text>
        ) : exportReadyAt ? (
          <View className="flex-row items-center mt-1">
            <MaterialIcons name="check-circle" size={14} color="#0E9F6E" />
            <Text className="text-xs text-muted ml-1">{t('dr_export_ready_prefix' as any)}{exportReadyAt}</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-2 border border-error p-4">
        <Text className="text-base font-semibold text-error">{t('data_rights_section_delete_title' as any)}</Text>
        <Text className="text-sm text-foreground leading-5">
          {t('data_rights_section_delete_desc' as any)}
        </Text>
        {internalLegal && (
          <Text className="text-xs text-warning leading-4">
            {t('data_rights_section_delete_residual_prefix' as any)}{LEGAL_DRAFT_MARKER}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('data_rights_section_delete_title' as any)}
          onPress={() => setShowDeleteDialog(true)}
          className="mt-2 px-4 py-3 bg-error"
        >
          <Text className="text-background text-center font-semibold">{t('data_rights_section_review_deletion' as any)}</Text>
        </Pressable>
      </View>

      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">{t('data_rights_section_privacy_request' as any)}</Text>
        <Text className="text-sm text-foreground leading-5">
          {t('data_rights_section_privacy_request_desc' as any)}{LEGAL_CONTACT_EMAIL}
        </Text>
      </View>

      <Modal visible={showDeleteDialog} transparent animationType="fade" onRequestClose={closeDeleteDialog}>
        <View className="flex-1 bg-black/70 justify-center px-5">
          <View className="bg-background border border-error p-5 gap-4">
            <View className="flex-row items-center gap-3">
              <MaterialIcons name="warning" size={28} color="#EF4444" />
              <Text className="text-lg font-bold text-error flex-1">{t('data_rights_section_dialog_title' as any)}</Text>
            </View>
            <Text className="text-sm text-foreground leading-5">
              {t('data_rights_section_dialog_instruction' as any)}
            </Text>
            {/* What will be deleted (explain the consequences clearly) */}
            <View className="border border-border bg-surface p-3 gap-1">
              <Text className="text-xs font-semibold text-muted mb-1">{t('dr_delete_what_title' as any)}</Text>
              {["dr_delete_what_1", "dr_delete_what_2", "dr_delete_what_3"].map((k) => (
                <View key={k} className="flex-row items-start">
                  <MaterialIcons name="delete-outline" size={14} color="#EF4444" style={{ marginTop: 2 }} />
                  <Text className="text-sm text-foreground ml-2 flex-1 leading-5">{t(k as any)}</Text>
                </View>
              ))}
              <Text className="text-xs text-muted leading-4 mt-2">{t('dr_delete_retention' as any)}</Text>
            </View>
            <Text className="text-sm font-bold text-foreground">{DELETE_CONFIRMATION}</Text>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              accessibilityLabel={t('data_rights_section_confirmation_a11y' as any)}
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
                {t('data_rights_section_acknowledge' as any)}
              </Text>
            </Pressable>
            <View className="flex-row gap-3">
              <Pressable
                onPress={closeDeleteDialog}
                disabled={deleting}
                className="flex-1 border border-border px-3 py-3"
              >
                <Text className="text-foreground text-center font-semibold">{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteAccount}
                disabled={!canDelete}
                className={`flex-1 px-3 py-3 ${canDelete ? "bg-error" : "bg-muted"}`}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-background text-center font-semibold">{t('data_rights_section_delete_final' as any)}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
