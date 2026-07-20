/**
 * ProtoKI – Preise & Abonnement
 * Neues Preismodell: 12,99 € netto/Monat oder 140,00 € netto/Jahr
 * Mit Monat/Jahr-Umschalter (Toggle)
 * Design: Dark-Navy #0B1622, eckige Kästen, helle Schrift, Akzent Blau
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { createCheckoutSession, createPortalSession, checkStripeStatus } from "@/lib/stripe-client";

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
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

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
    }
  };

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);

  useEffect(() => {
    checkStripeStatus().then((s) => setStripeConfigured(s.configured));
  }, []);

  const handleSubscribe = async () => {
    // Get user email from registration data
    const regData = await AsyncStorage.getItem("@protoki_registered");
    const email = regData ? JSON.parse(regData).email : null;

    if (!email) {
      Alert.alert("Fehler", "Bitte registriere dich zuerst, um ein Abo abzuschlie\u00DFen.");
      return;
    }

    if (!stripeConfigured) {
      // Fallback: local-only subscription (demo mode)
      Alert.alert(
        "Demo-Modus",
        "Stripe ist noch nicht konfiguriert. Im Demo-Modus wird das Abo lokal aktiviert.",
        [
          { text: "Abbrechen", style: "cancel" },
          {
            text: "Demo aktivieren",
            onPress: async () => {
              const newState: SubscriptionState = {
                plan: billingCycle,
                trialStartDate: subState.trialStartDate,
                trialDaysLeft: 0,
                subscribedAt: new Date().toISOString(),
              };
              await AsyncStorage.setItem(SUB_STORAGE_KEY, JSON.stringify(newState));
              setSubState(newState);
              Alert.alert("Erfolgreich", "Demo-Abo aktiviert.");
            },
          },
        ]
      );
      return;
    }

    // Stripe Checkout
    setCheckoutLoading(true);
    try {
      const { url } = await createCheckoutSession(email, billingCycle);
      if (url) {
        await WebBrowser.openBrowserAsync(url);
        // After returning from browser, refresh subscription status
        loadSubscriptionState();
      }
    } catch (error: any) {
      Alert.alert("Fehler", error.message || "Checkout konnte nicht gestartet werden.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    const regData = await AsyncStorage.getItem("@protoki_registered");
    const email = regData ? JSON.parse(regData).email : null;
    if (!email) return;

    try {
      const { url } = await createPortalSession(email);
      if (url) {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (error: any) {
      Alert.alert("Fehler", "Abo-Verwaltung konnte nicht ge\u00F6ffnet werden.");
    }
  };

  const isActive = subState.plan === "trial" || subState.plan === "monthly" || subState.plan === "yearly";

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Preise</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Card */}
        <View style={[styles.statusCard, {
          backgroundColor: isActive ? "#5DADE2" + "10" : "#EF4444" + "10",
          borderColor: isActive ? "#5DADE2" + "30" : "#EF4444" + "30",
        }]}>
          <MaterialIcons
            name={isActive ? "verified" : "error-outline"}
            size={28}
            color={isActive ? "#5DADE2" : "#EF4444"}
          />
          <Text style={styles.statusTitle}>
            {subState.plan === "trial" && `Testphase \u2013 ${subState.trialDaysLeft} Tage verbleibend`}
            {subState.plan === "monthly" && "Monatsabo aktiv"}
            {subState.plan === "yearly" && "Jahresabo aktiv"}
            {subState.plan === "expired" && "Testphase abgelaufen"}
          </Text>
          <Text style={styles.statusSubtext}>
            {subState.plan === "trial" && "Alle Funktionen uneingeschr\u00E4nkt verf\u00FCgbar."}
            {subState.plan === "monthly" && "N\u00E4chste Abrechnung: 12,99 \u20AC + MwSt./Monat"}
            {subState.plan === "yearly" && "N\u00E4chste Abrechnung: 140,00 \u20AC + MwSt./Jahr"}
            {subState.plan === "expired" && "Bitte w\u00E4hle ein Abo, um ProtoKI weiter zu nutzen."}
          </Text>
        </View>

        {/* Billing Cycle Toggle */}
        <View style={styles.toggleSection}>
          <Text style={styles.sectionTitle}>Tarif w\u00E4hlen</Text>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                billingCycle === "monthly" && styles.toggleBtnActive,
              ]}
              onPress={() => setBillingCycle("monthly")}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.toggleBtnText,
                billingCycle === "monthly" && styles.toggleBtnTextActive,
              ]}>
                Monatlich
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                billingCycle === "yearly" && styles.toggleBtnActive,
              ]}
              onPress={() => setBillingCycle("yearly")}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.toggleBtnText,
                billingCycle === "yearly" && styles.toggleBtnTextActive,
              ]}>
                J\u00E4hrlich
              </Text>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>-10%</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Price Display */}
        <View style={styles.priceCard}>
          {billingCycle === "yearly" && (
            <View style={styles.recommendedBadge}>
              <MaterialIcons name="star" size={14} color="#FFF" />
              <Text style={styles.recommendedText}>Empfohlen</Text>
            </View>
          )}

          <Text style={styles.planName}>
            {billingCycle === "monthly" ? "Monatsabo" : "Jahresabo"}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>
              {billingCycle === "monthly" ? "12,99" : "140,00"}
            </Text>
            <View style={styles.priceUnit}>
              <Text style={styles.priceUnitCurrency}>\u20AC</Text>
              <Text style={styles.priceUnitPeriod}>
                netto / {billingCycle === "monthly" ? "Monat" : "Jahr"}
              </Text>
            </View>
          </View>

          <Text style={styles.priceVat}>zzgl. MwSt.</Text>

          {billingCycle === "yearly" && (
            <View style={styles.savingsRow}>
              <MaterialIcons name="savings" size={16} color="#4ADE80" />
              <Text style={styles.savingsText}>
                = 11,66 \u20AC/Monat (ca. 10% Ersparnis gegen\u00FCber Monatsabo)
              </Text>
            </View>
          )}

          {billingCycle === "monthly" && (
            <Text style={styles.flexNote}>Jederzeit k\u00FCndbar, keine Mindestlaufzeit</Text>
          )}

          {billingCycle === "yearly" && (
            <Text style={styles.flexNote}>Jederzeit k\u00FCndbar zum Ende der Laufzeit</Text>
          )}
        </View>

        {/* Trial Info */}
        {(subState.plan === "trial" || subState.plan === "expired") && (
          <View style={styles.trialInfoCard}>
            <MaterialIcons name="timer" size={20} color="#5DADE2" />
            <Text style={styles.trialInfoText}>
              14 Tage kostenlos testen \u2013 keine Kreditkarte erforderlich
            </Text>
          </View>
        )}

        {/* Subscribe Button */}
        {(subState.plan === "trial" || subState.plan === "expired") && (
          <TouchableOpacity
            onPress={handleSubscribe}
            style={[styles.subscribeBtn, checkoutLoading && { opacity: 0.6 }]}
            activeOpacity={0.8}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.subscribeBtnText}>
                {billingCycle === "monthly" ? "Monatsabo abschlie\u00DFen" : "Jahresabo abschlie\u00DFen"}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Features */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Alle Funktionen inklusive</Text>
        <View style={styles.featuresGrid}>
          {[
            { icon: "mic", text: "Unbegrenzte Aufnahmen" },
            { icon: "auto-awesome", text: "KI-Protokollgenerierung" },
            { icon: "videocam", text: "Video-Import" },
            { icon: "camera-alt", text: "KI-Foto-Analyse" },
            { icon: "view-in-ar", text: "Matterport 3D" },
            { icon: "picture-as-pdf", text: "PDF-Berichte" },
            { icon: "psychology", text: "KI-Baustellenassistent" },
            { icon: "warning", text: "M\u00E4ngelmanagement" },
            { icon: "cloud-sync", text: "Cloud-Sync & Offline" },
            { icon: "groups", text: "Unbegrenzte Projekte" },
          ].map((feature, i) => (
            <View key={i} style={styles.featureItem}>
              <View style={styles.featureIconBox}>
                <MaterialIcons name={feature.icon as any} size={18} color="#5DADE2" />
              </View>
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>

        {/* Manage Subscription Button (for active subscribers) */}
        {(subState.plan === "monthly" || subState.plan === "yearly") && stripeConfigured && (
          <TouchableOpacity
            onPress={handleManageSubscription}
            style={styles.manageBtn}
            activeOpacity={0.8}
          >
            <MaterialIcons name="settings" size={18} color="#5DADE2" />
            <Text style={styles.manageBtnText}>Abo verwalten (Zahlungsmethode, K\u00FCndigung)</Text>
          </TouchableOpacity>
        )}

        {/* Payment Methods Info */}
        <View style={styles.paymentMethodsRow}>
          <MaterialIcons name="credit-card" size={16} color="#5A6B7E" />
          <Text style={styles.paymentMethodsText}>Kreditkarte, SEPA-Lastschrift, PayPal, Klarna</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Preise zzgl. 19% MwSt. K\u00FCndigung jederzeit zum Ende der Laufzeit m\u00F6glich.
            {"\n"}Sichere Zahlungsabwicklung \u00FCber Stripe.
            {"\n"}Bei Fragen: info@iserloh.net
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
    gap: 6,
  },
  statusTitle: { fontSize: 16, fontWeight: "700", textAlign: "center", color: "#F0F4F8" },
  statusSubtext: { fontSize: 13, textAlign: "center", color: "#7F8C9B" },
  toggleSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12, color: "#F0F4F8" },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#132238",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: "#5DADE2",
  },
  toggleBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#7F8C9B",
  },
  toggleBtnTextActive: {
    color: "#FFF",
  },
  saveBadge: {
    backgroundColor: "#4ADE80",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFF",
  },
  priceCard: {
    backgroundColor: "#132238",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    padding: 24,
    marginBottom: 16,
    position: "relative",
  },
  recommendedBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#5DADE2",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  recommendedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
  },
  planName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#7F8C9B",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    marginBottom: 4,
  },
  priceAmount: {
    fontSize: 42,
    fontWeight: "800",
    color: "#F0F4F8",
    letterSpacing: -1,
  },
  priceUnit: {
    paddingBottom: 8,
  },
  priceUnitCurrency: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F0F4F8",
  },
  priceUnitPeriod: {
    fontSize: 13,
    color: "#7F8C9B",
  },
  priceVat: {
    fontSize: 13,
    color: "#5A6B7E",
    marginBottom: 12,
  },
  savingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#4ADE80" + "15",
    padding: 10,
    marginTop: 4,
  },
  savingsText: {
    fontSize: 13,
    color: "#4ADE80",
    flex: 1,
  },
  flexNote: {
    fontSize: 13,
    color: "#7F8C9B",
    marginTop: 8,
  },
  trialInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#5DADE2" + "10",
    borderWidth: 1,
    borderColor: "#5DADE2" + "30",
    padding: 14,
    marginBottom: 16,
  },
  trialInfoText: {
    fontSize: 14,
    color: "#5DADE2",
    flex: 1,
    fontWeight: "500",
  },
  subscribeBtn: {
    alignItems: "center",
    paddingVertical: 16,
    backgroundColor: "#5DADE2",
    marginBottom: 8,
  },
  subscribeBtnText: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "48%",
    paddingVertical: 8,
  },
  featureIconBox: {
    width: 30,
    height: 30,
    backgroundColor: "#5DADE2" + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontSize: 13, color: "#F0F4F8", flex: 1 },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#5DADE2",
  },
  manageBtnText: { fontSize: 14, color: "#5DADE2", fontWeight: "600" },
  paymentMethodsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 8,
  },
  paymentMethodsText: { fontSize: 12, color: "#5A6B7E" },
  footer: { marginTop: 16, alignItems: "center" },
  footerText: { fontSize: 12, textAlign: "center", lineHeight: 18, color: "#5A6B7E" },
});
