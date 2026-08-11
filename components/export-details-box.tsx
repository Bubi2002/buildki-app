import { View, Text, TextInput } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

/** Optional project/floor/room/notes the user can attach to a PDF export. */
export type ExportDetails = {
  bauvorhaben: string;
  adresse: string;
  etage: string;
  raum: string;
  notizen: string;
};

export const EMPTY_EXPORT_DETAILS: ExportDetails = {
  bauvorhaben: "",
  adresse: "",
  etage: "",
  raum: "",
  notizen: "",
};

export function hasExportDetails(d?: ExportDetails | null): boolean {
  return !!d && [d.bauvorhaben, d.adresse, d.etage, d.raum, d.notizen].some((v) => (v || "").trim().length > 0);
}

/**
 * Inline, always-optional box for entering the construction project / floor /
 * room / notes that get printed into a PDF export header. Drop it into the free
 * space of any export screen and feed the value into the PDF generator.
 */
export function ExportDetailsBox({
  value,
  onChange,
}: {
  value: ExportDetails;
  onChange: (next: ExportDetails) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();

  const set = (key: keyof ExportDetails) => (text: string) => onChange({ ...value, [key]: text });

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.foreground,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  } as const;

  const label = (text: string) => (
    <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, marginTop: 10 }}>{text}</Text>
  );

  return (
    <View style={{ marginTop: 20, padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {t('export_details_title')}
      </Text>

      {label(t('export_bauvorhaben'))}
      <TextInput value={value.bauvorhaben} onChangeText={set("bauvorhaben")} placeholder={t('export_bauvorhaben')} placeholderTextColor={colors.muted} style={inputStyle} />

      {label(t('export_adresse'))}
      <TextInput value={value.adresse} onChangeText={set("adresse")} placeholder={t('export_adresse')} placeholderTextColor={colors.muted} style={inputStyle} />

      {label(t('export_etage'))}
      <TextInput value={value.etage} onChangeText={set("etage")} placeholder={t('export_etage')} placeholderTextColor={colors.muted} style={inputStyle} />

      {label(t('export_raum'))}
      <TextInput value={value.raum} onChangeText={set("raum")} placeholder={t('export_raum')} placeholderTextColor={colors.muted} style={inputStyle} />

      {label(t('export_notizen'))}
      <TextInput value={value.notizen} onChangeText={set("notizen")} placeholder={t('export_notizen')} placeholderTextColor={colors.muted} multiline numberOfLines={3} style={[inputStyle, { minHeight: 64, textAlignVertical: "top" }]} />
    </View>
  );
}
