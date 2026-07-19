/**
 * Abonnement / Preise – Abo-Verwaltung mit 14-Tage-Trial
 * Preismodell: 10€+MwSt/Monat oder 100€+MwSt/Jahr
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

const TRIAL_STORAGE_KEY = "@protoki_trial_start";
const SUB_STORAGE_KEY = "@protoki_subscription";
const TRIAL_DAYS = 14;

interface SubscriptionState {
  plan: "trial" | "monthly" | "yearly" | "expired";
  trialStartDate: string | null;
  trialDaysLeft: number;
  subscribedAt: string | null;
}

export default function SubscriptionScreen() {
  const colors = useColors();
  const router = useRouter();
  const [subState, setSubState] = useState<SubscriptionState>({
    plan: "trial",
    trialStartDate: null,
    trialDaysLeft: TRIAL_DAYS,
    subscribedAt: null,
  });
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");

  useEffect(() => {
    loadSubscriptionState();
  }, []);

  const loadSubscriptionState = async () => {
    try {
      const subData = await AsyncStorage.getItem(SUB_STORAGE_KEY);
      if (subData) {
        const parsed = JSON.parse(subData);
        setSubState(parsed);
        return;
      }

      let trialStart = await AsyncStorage.getItem(TRIAL_STORAGE_KEY);
      if (!trialStart) {
        trialStart = new Date().toISOString();
        await AsyncStorage.setItem(TRIAL_STORAGE_KEY, trialStart);
      }

      const startDate = new Date(trialStart);
      const now = new Date();
      const diffMs = now.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const daysLeft = Math.max(0, TRIAL_DAYS - diffDays);

      setSubState({
        plan: daysLeft > 0 ? "trial" : "expired",
        trialStartDate: trialStart,
        trialDaysLeft: daysLeft,
        subscribedAt: null,
      });
    } catch (e) {
      console.log("Error loading subscription state:", e);
    }
  };

  const handleSubscribe = async (plan: "monthly" | "yearly") => {
    // In production: Apple In-App Purchase / Stripe integration
    Alert.alert(
      "Abonnement abschließen",
      `${plan === "monthly" ? "Monatsabo: 10,00 € + MwSt./Monat" : "Jahresabo: 100,00 € + MwSt./Jahr"}\n\nDie Zahlungsabwicklung wird über den App Store durchgeführt.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Bestätigen",
          onPress: async () => {
            const newState: SubscriptionState = {
              plan,
              trialStartDate: subState.trialStartDate,
              trialDaysLeft: 0,
              subscribedAt: new Date().toISOString(),
            };
            await AsyncStorage.setItem(SUB_STORAGE_KEY, JSON.stringify(newState));
            setSubState(newState);
            Alert.alert("Erfolgreich", "Dein Abonnement ist jetzt aktiv. Vielen Dank!");
          },
        },
      ]
    );
  };

  const isActive = subState.plan === "trial" || subState.plan === "monthly" || subState.plan === "yearly";

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Abonnement</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Card */}
        <View style={[styles.statusCard, { 
          backgroundColor: isActive ? colors.primary + "10" : colors.error + "10",
          borderColor: isActive ? colors.primary + "30" : colors.error + "30",
        }]}>
          <MaterialIcons
            name={isActive ? "verified" : "error-outline"}
            size={32}
            color={isActive ? colors.primary : colors.error}
          />
          <Text style={[styles.statusTitle, { color: colors.foreground }]}>
            {subState.plan === "trial" && `Testphase – ${subState.trialDaysLeft} Tage verbleibend`}
            {subState.plan === "monthly" && "Monatsabo aktiv"}
            {subState.plan === "yearly" && "Jahresabo aktiv"}
            {subState.plan === "expired" && "Testphase abgelaufen"}
          </Text>
          <Text style={[styles.statusSubtext, { color: colors.muted }]}>
            {subState.plan === "trial" && "Alle Funktionen uneingeschränkt verfügbar."}
            {subState.plan === "monthly" && "Nächste Abrechnung: monatlich 10,00 € + MwSt."}
            {subState.plan === "yearly" && "Nächste Abrechnung: jährlich 100,00 € + MwSt."}
            {subState.plan === "expired" && "Bitte wähle ein Abo, um ProtoKI weiter zu nutzen."}
          </Text>
        </View>

        {/* Pricing */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tarife</Text>

        {/* Monthly */}
        <TouchableOpacity
          onPress={() => setSelectedPlan("monthly")}
          style={[
            styles.planCard,
            { borderColor: selectedPlan === "monthly" ? colors.primary : colors.border },
            selectedPlan === "monthly" && { borderWidth: 2 },
          ]}
        >
          <View style={styles.planHeader}>
            <View style={styles.planInfo}>
              <Text style={[styles.planName, { color: colors.foreground }]}>Monatsabo</Text>
              <Text style={[styles.planDesc, { color: colors.muted }]}>Flexibel, jederzeit kündbar</Text>
            </View>
            <View style={styles.planPrice}>
              <Text style={[styles.priceAmount, { color: colors.foreground }]}>10,00 €</Text>
              <Text style={[styles.priceUnit, { color: colors.muted }]}>+ MwSt./Monat</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Yearly */}
        <TouchableOpacity
          onPress={() => setSelectedPlan("yearly")}
          style={[
            styles.planCard,
            { borderColor: selectedPlan === "yearly" ? colors.primary : colors.border },
            selectedPlan === "yearly" && { borderWidth: 2 },
          ]}
        >
          <View style={[styles.saveBadge, { backgroundColor: colors.success }]}>
            <Text style={styles.saveBadgeText}>2 Monate gratis</Text>
          </View>
          <View style={styles.planHeader}>
            <View style={styles.planInfo}>
              <Text style={[styles.planName, { color: colors.foreground }]}>Jahresabo</Text>
              <Text style={[styles.planDesc, { color: colors.muted }]}>Beste Preis-Leistung</Text>
            </View>
            <View style={styles.planPrice}>
              <Text style={[styles.priceAmount, { color: colors.foreground }]}>100,00 €</Text>
              <Text style={[styles.priceUnit, { color: colors.muted }]}>+ MwSt./Jahr</Text>
            </View>
          </View>
          <Text style={[styles.yearlyCalc, { color: colors.muted }]}>
            = 8,33 €/Monat statt 10,00 €/Monat
          </Text>
        </TouchableOpacity>

        {/* Subscribe Button */}
        {(subState.plan === "trial" || subState.plan === "expired") && (
          <TouchableOpacity
            onPress={() => handleSubscribe(selectedPlan)}
            style={[styles.subscribeBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.subscribeBtnText}>
              {selectedPlan === "monthly" ? "Monatsabo abschließen" : "Jahresabo abschließen"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Features */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>Alle Funktionen inklusive</Text>
        {[
          "Unbegrenzte Aufnahmen & Protokolle",
          "KI-Transkription & Protokollgenerierung",
          "Video-Import (WhatsApp, E-Mail, Galerie)",
          "Foto-Analyse mit KI-Mängelerkennung",
          "Matterport 3D-Integration",
          "Professionelle PDF-Berichte",
          "KI-Baustellenassistent",
          "Mängelmanagement mit Erinnerungen",
          "Cloud-Synchronisation & Offline-Modus",
          "Unbegrenzte Projekte & Nutzer",
        ].map((feature, i) => (
          <View key={i} style={styles.featureRow}>
            <MaterialIcons name="check" size={18} color={colors.success} />
            <Text style={[styles.featureText, { color: colors.foreground }]}>{feature}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            Preise zzgl. 19% MwSt. Kündigung jederzeit zum Ende der Laufzeit möglich.
            Bei Fragen: info@iserloh.net
          </Text>
        </View>
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
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40 },
  statusCard: {
    alignItems: "center",
    padding: 20,
    borderWidth: 1,
    marginBottom: 24,
    gap: 8,
  },
  statusTitle: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  statusSubtext: { fontSize: 13, textAlign: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  planCard: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    position: "relative",
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  planInfo: { flex: 1 },
  planName: { fontSize: 16, fontWeight: "700" },
  planDesc: { fontSize: 12, marginTop: 2 },
  planPrice: { alignItems: "flex-end" },
  priceAmount: { fontSize: 20, fontWeight: "800" },
  priceUnit: { fontSize: 11 },
  saveBadge: {
    position: "absolute",
    top: -1,
    right: -1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  saveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  yearlyCalc: { fontSize: 12, marginTop: 8 },
  subscribeBtn: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  subscribeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  featureText: { fontSize: 14 },
  footer: { marginTop: 24, alignItems: "center" },
  footerText: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});
