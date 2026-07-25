import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { LEGAL_DRAFT_MARKER } from "@/lib/legal-draft";

const OPEN_DECISIONS = [
  "Vertrieb ausschließlich an Unternehmen oder auch an Verbraucher",
  "Tarife, Steuern, Vertragslaufzeit, Verlängerung und Kündigungsfristen",
  "Vertragspartner, Rechnungssteller und Zahlungsdienstleister",
  "Apple StoreKit/IAP, qualifiziertes B2B-/Enterprise-Modell oder zulässiger EU-Alternativkauf",
  "Widerruf, Erstattung, Kündigung und gegebenenfalls Kündigungsschaltfläche",
];

const ARCHITECTURE_GUIDANCE = [
  "Digitale Funktionen, die in der iOS-App an einzelne Nutzer verkauft werden, sollen standardmäßig über StoreKit/In-App Purchase angeboten werden.",
  "Direkter B2B-Vertrieb außerhalb der App kommt nur nach bestätigter Unternehmensausrichtung und Prüfung der einschlägigen Apple-Ausnahme in Betracht.",
  "Stripe darf erst nach festgelegtem Geschäftsmodell, Anbieter-/AVV-/Transferprüfung und Apple-konformer Vertriebsentscheidung aktiviert werden.",
  "Externe EU-Kaufangebote sind kein einfacher Browserlink, sondern benötigen gegebenenfalls Entitlements, Systemhinweise, Reporting sowie eigene Steuer-, Kündigungs- und Erstattungsprozesse.",
];

export default function SubscriptionScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Abonnement & Abrechnung</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.holdCard} accessibilityRole="summary">
          <MaterialIcons name="lock-outline" size={30} color="#F59E0B" />
          <View style={styles.holdCopy}>
            <Text style={styles.holdTitle}>Kaufabschluss gesperrt</Text>
            <Text style={styles.holdText}>
              Dieser uncommittierte Compliance-Prüfentwurf enthält bewusst keinen Demo-Kauf,
              keinen Preis und keinen externen Checkout. Es wird kein Abonnement aktiviert.
            </Text>
          </View>
        </View>

        <View style={styles.openCard}>
          <Text style={styles.openLabel}>{LEGAL_DRAFT_MARKER}</Text>
          <Text style={styles.openText}>
            Die folgenden Betreiber- und Vertragsentscheidungen müssen vor einer Veröffentlichung
            verbindlich festgelegt und anwaltlich geprüft werden.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Offene Geschäftsmodellentscheidungen</Text>
        <View style={styles.listCard}>
          {OPEN_DECISIONS.map((item, index) => (
            <View key={item} style={[styles.row, index > 0 && styles.rowBorder]}>
              <View style={styles.numberBox}>
                <Text style={styles.numberText}>{index + 1}</Text>
              </View>
              <Text style={styles.rowText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Technische Empfehlung für iOS</Text>
        <View style={styles.listCard}>
          {ARCHITECTURE_GUIDANCE.map((item, index) => (
            <View key={item} style={[styles.row, index > 0 && styles.rowBorder]}>
              <MaterialIcons name="verified-user" size={20} color="#5DADE2" />
              <Text style={styles.rowText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.protectionCard}>
          <MaterialIcons name="shield" size={22} color="#4ADE80" />
          <Text style={styles.protectionText}>
            Bestehende Kernfunktionen bleiben im Prüfentwurf testbar. Nur der rechtlich und
            vertraglich ungeklärte Erwerbs- und Demo-Freischaltpfad ist deaktiviert.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.legalButton}
          onPress={() => router.push("/legal" as never)}
          accessibilityRole="button"
          accessibilityLabel="Rechtliche Hinweise öffnen"
        >
          <MaterialIcons name="gavel" size={20} color="#5DADE2" />
          <Text style={styles.legalButtonText}>Rechtliche Hinweise öffnen</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Nicht veröffentlichungsfähig. Kein Checkout, keine Belastung, keine Vertragszusage.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  headerSpacer: { width: 40 },
  content: { padding: 16, paddingBottom: 48 },
  holdCard: {
    flexDirection: "row",
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#251E0C",
    marginBottom: 16,
  },
  holdCopy: { flex: 1, gap: 6 },
  holdTitle: { color: "#F8D477", fontSize: 18, fontWeight: "800" },
  holdText: { color: "#E5E7EB", fontSize: 14, lineHeight: 21 },
  openCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#EF4444",
    backgroundColor: "#2A1115",
    marginBottom: 24,
  },
  openLabel: { color: "#FCA5A5", fontSize: 13, fontWeight: "900", marginBottom: 8 },
  openText: { color: "#E5E7EB", fontSize: 14, lineHeight: 21 },
  sectionTitle: { color: "#F0F4F8", fontSize: 17, fontWeight: "800", marginBottom: 10 },
  listCard: {
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#132238",
    marginBottom: 24,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#1E3A5F" },
  numberBox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E3A5F",
  },
  numberText: { color: "#D7E9F7", fontSize: 12, fontWeight: "800" },
  rowText: { flex: 1, color: "#D7E0EA", fontSize: 14, lineHeight: 21 },
  protectionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#166534",
    backgroundColor: "#0E2418",
    marginBottom: 18,
  },
  protectionText: { flex: 1, color: "#DCFCE7", fontSize: 14, lineHeight: 21 },
  legalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#5DADE2",
    backgroundColor: "#10283D",
  },
  legalButtonText: { color: "#5DADE2", fontSize: 15, fontWeight: "800" },
  footerText: { color: "#7F8C9B", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 16 },
});
