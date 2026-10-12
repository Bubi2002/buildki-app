import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

type QA = { q: string; a: string };
type Group = { title: string; items: QA[] };

// Comprehensive FAQ. Content is kept in German (the app's primary language and
// its users); the screen chrome uses i18n. If multilingual FAQ is needed later,
// this array can be moved behind the translation layer.
const FAQ: Group[] = [
  {
    title: "Projekte",
    items: [
      { q: "Wie lege ich ein neues Projekt an?", a: "Im Tab Projekte auf „+ Neues Projekt“ tippen. Der Assistent führt dich durch Projektname, Bauherr, Adresse, Projekttyp und optional Etagen und Räume." },
      { q: "Wie ändere ich Bauherr, Adresse oder Projektnummer nachträglich?", a: "Projekt öffnen und oben auf das Stift-Symbol tippen – oder in der Übersicht auf die Karte „Projektdaten“. Dort kannst du Projektname, Projektnummer, Bauherr/Auftraggeber, Adresse, Ansprechpartner, Typ, Farbe und Bild anpassen." },
      { q: "Wie archiviere oder lösche ich ein Projekt?", a: "Im Tab Projekte lange auf das Projekt drücken – dann erscheinen die Optionen zum Bearbeiten, Archivieren und Löschen." },
    ],
  },
  {
    title: "Begehung & Aufnahme",
    items: [
      { q: "Wie starte ich eine Begehung?", a: "Über den Tab Begehung oder aus einem Projekt heraus mit „Begehung starten“. Die Kamera öffnet sich direkt." },
      { q: "Wie füge ich während der Aufnahme einen neuen Raum hinzu?", a: "Während der Aufnahme auf „Neuer Raum“ tippen. So wird der folgende Teil dem neuen Raum zugeordnet." },
      { q: "Werden meine Sprachaufnahmen zuverlässig gespeichert?", a: "Ja. Aufnahmen werden sofort dauerhaft gesichert, auch wenn du die App schließt. Nach der Begehung kannst du im Prüf-Schritt noch Aufgaben und Mängel anpassen, bevor der Bericht entsteht." },
    ],
  },
  {
    title: "Räume & Raumbuch",
    items: [
      { q: "Wie lege ich Etagen und Räume an?", a: "Im Tab Projekte beim jeweiligen Projekt: „+ Etage“ für ein Geschoss, „+ Raum“ je Etage. Räume lassen sich inline umbenennen und löschen." },
      { q: "Wie markiere ich eine Wand im Grundriss?", a: "Raum öffnen und „Ort im Grundriss setzen“. Schritt 1: Plan/Seite wählen. Schritt 2: Ausschnitt – den vorgelegten Rahmen an den Ecken/Kanten auf den Raum ziehen. Schritt 3: Wände A–D als Linien zeichnen (ein Finger = zeichnen, zwei Finger = zoomen)." },
      { q: "Wie bekomme ich den ganzen Plan ohne Ausschnitt?", a: "Im Schritt Ausschnitt auf „Ganzer Plan“ tippen – dann wird kein Rahmen gesetzt und der komplette Plan verwendet." },
      { q: "Wo sehe ich, welche Wand welche ist?", a: "Auf der Raum-Seite wird oben der Ausschnitt mit den farbigen Linien angezeigt (A = Blau, B = Grün, C = Rot, D = Orange). Die Karten Wand A/B/C/D tragen denselben Farbpunkt." },
    ],
  },
  {
    title: "Mängel & Aufgaben",
    items: [
      { q: "Wie erfasse ich einen Mangel?", a: "Beim Erfassen Beschreibung, Gewerk, Priorität und optional Frist, Zuständigen und Fotos angeben. Der Button „Fotos hinzufügen“ sitzt direkt unter der Beschreibung." },
      { q: "Wie weise ich einen Mangel einem Kontakt zu?", a: "Im Feld Zuständig tippen und einen Kontakt aus deinem Team-Kontaktbuch oder den Apple-Kontakten wählen." },
    ],
  },
  {
    title: "Fotos",
    items: [
      { q: "Wie beschrifte ich ein Foto?", a: "Foto antippen und Beschriften wählen. Du kannst zeichnen, Pfeile/Text setzen und die Pinselgröße ändern. Zwei Finger zum Zoomen funktioniert in jedem Werkzeug." },
      { q: "Werden meine Fotos gespeichert?", a: "Ja, Fotos und beschriftete Bilder werden dem Projekt bzw. Mangel zugeordnet und dauerhaft gesichert." },
    ],
  },
  {
    title: "PDF & Berichte",
    items: [
      { q: "Wie exportiere ich ein PDF?", a: "Im Protokoll/Bericht auf „Exportieren“ tippen. Je nach Werkzeug gibt es passende Vorlagen (Protokoll, Mängel, Raumbuch, Bautagebuch …)." },
      { q: "Wie bekomme ich mein Logo und meine Firmendaten in die Berichte?", a: "Einstellungen und dann „Unternehmen & Profil“: Logo hochladen, Firmenname, Anschrift, Ansprechpartner, Kontakt und mehr eintragen. Diese Daten erscheinen im Kopf aller Berichte." },
      { q: "Wie ändere ich das Aussehen (Firmenfarbe, Logogröße)?", a: "Einstellungen und dann „Unternehmen & Profil“, Abschnitt Darstellung für Firmenfarbe/Logo – und „Berichte & PDF“ für Vorlage, Wasserzeichen und Titelblatt." },
    ],
  },
  {
    title: "Versand",
    items: [
      { q: "Wie verschicke ich einen Bericht?", a: "Nach dem Export über Teilen/E-Mail. Empfänger wählst du beim Senden aus den Projektbeteiligten und dem Team-Kontaktbuch." },
      { q: "Was bedeuten Manuell, Vorbereiten und Automatisch?", a: "Einstellungen und dann „Versand & Kontakte“: Manuell (du exportierst und sendest selbst), Vorbereiten (PDF wird erstellt, Versand erst nach deiner Bestätigung), Automatisch (sofort an die Standardempfänger). Standard ist Manuell – es wird nichts ohne dich gesendet." },
    ],
  },
  {
    title: "Kontakte",
    items: [
      { q: "Warum sehe ich nur einen Apple-Kontakt?", a: "iOS gibt Apps standardmäßig nur begrenzten Zugriff. Tippe im Kontakt-Feld auf „Weitere Kontakte freigeben“, um weitere Kontakte zu erlauben." },
      { q: "Wie pflege ich ein eigenes Team-Kontaktbuch?", a: "Mehr und dann Team: dort kannst du Namen, E-Mail, Telefon und Rolle hinterlegen. Diese Kontakte stehen als Empfänger und Zuständige zur Verfügung." },
    ],
  },
  {
    title: "Cloud, Backup & Dropbox",
    items: [
      { q: "Wie verbinde ich Dropbox?", a: "Mehr und dann „Cloud & Dropbox“, dort Dropbox verbinden. Danach kannst du Exporte dorthin ablegen." },
      { q: "Wie sichere ich meine Daten?", a: "Mehr und dann „Cloud & Dropbox“ bzw. Einstellungen und dann „Konto & Datensicherung“: dort findest du Backup und, falls angemeldet, die Cloud-Synchronisierung." },
    ],
  },
  {
    title: "Sprache & Datenschutz",
    items: [
      { q: "Wie ändere ich die App-Sprache?", a: "Einstellungen und dann „App & Datenschutz“ und dann Sprache." },
      { q: "Wo finde ich Datenschutz und rechtliche Hinweise?", a: "Mehr und dann Rechtliches. Dort sind auch DSGVO-Export und Datenschutzeinstellungen zu finden." },
    ],
  },
];

export default function FaqScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{t("faq_title" as any)}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {FAQ.map((group) => (
          <View key={group.title} style={{ marginBottom: 18 }}>
            <Text style={[styles.groupTitle, { color: colors.muted }]}>{group.title}</Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {group.items.map((qa, i) => {
                const key = `${group.title}-${i}`;
                const isOpen = open === key;
                return (
                  <View key={key} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : key)}
                      style={({ pressed }) => [styles.qRow, { opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={[styles.question, { color: colors.foreground }]}>{qa.q}</Text>
                      <MaterialIcons name={isOpen ? "expand-less" : "expand-more"} size={22} color={colors.muted} />
                    </Pressable>
                    {isOpen && <Text style={[styles.answer, { color: colors.muted }]}>{qa.a}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {/* Noch Fragen? → KI-Support */}
        <Pressable
          onPress={() => router.push("/support-chat" as any)}
          style={({ pressed }) => [styles.supportBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
        >
          <MaterialIcons name="support-agent" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{t("faq_more_help" as any)}</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { height: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: "800", flex: 1 },
  groupTitle: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  qRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 14 },
  question: { flex: 1, fontSize: 14.5, fontWeight: "700" },
  answer: { fontSize: 13.5, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 14 },
  supportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderWidth: 1, borderRadius: 12, marginTop: 4 },
});
