import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";
import { MONETIZATION_ENABLED } from "@/lib/monetization";
import { usePremium } from "@/hooks/use-premium";
import { getOfferingPackages, purchasePackage, restorePurchases } from "@/lib/purchases";

const PERKS: { icon: string; key: string }[] = [
  { icon: "auto-awesome", key: "subscription_perk_ai" },
  { icon: "folder-special", key: "subscription_perk_projects" },
];

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isPremium = usePremium();

  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!MONETIZATION_ENABLED || isPremium) return;
    let active = true;
    setLoading(true);
    getOfferingPackages()
      .then((pkgs) => {
        if (!active) return;
        setPackages(pkgs);
        // Preselect the annual package if present, else the first.
        const annual = pkgs.find((p) => p?.packageType === "ANNUAL");
        setSelectedId((annual || pkgs[0])?.identifier ?? null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isPremium]);

  const onBuy = async () => {
    const pkg = packages.find((p) => p.identifier === selectedId) || packages[0];
    if (!pkg || busy) return;
    setBusy(true);
    try {
      await purchasePackage(pkg);
      // Premium state updates via the RevenueCat listener.
    } catch {
      Alert.alert(t("subscription_header_title" as any), t("subscription_purchase_error" as any));
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await restorePurchases();
      if (!ok) Alert.alert(t("subscription_header_title" as any), t("subscription_restore_none" as any));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.header, { borderBottomColor: "#1E3A5F" }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t("subscription_a11y_back" as any)}
        >
          <MaterialIcons name="arrow-back" size={24} color="#F0F4F8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("subscription_header_title" as any)}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Perks — always shown */}
        <Text style={styles.sectionTitle}>{t("subscription_perks_title" as any)}</Text>
        <View style={styles.listCard}>
          {PERKS.map((p, i) => (
            <View key={p.key} style={[styles.row, i > 0 && styles.rowBorder]}>
              <MaterialIcons name={p.icon as any} size={22} color="#5DADE2" />
              <Text style={styles.rowText}>{t(p.key as any)}</Text>
            </View>
          ))}
        </View>

        {isPremium && MONETIZATION_ENABLED ? (
          <View style={styles.activeCard} accessibilityRole="summary">
            <MaterialIcons name="verified" size={28} color="#4ADE80" />
            <View style={styles.activeCopy}>
              <Text style={styles.activeTitle}>{t("subscription_active_title" as any)}</Text>
              <Text style={styles.activeText}>{t("subscription_active_text" as any)}</Text>
            </View>
          </View>
        ) : !MONETIZATION_ENABLED ? (
          <View style={styles.soonCard} accessibilityRole="summary">
            <MaterialIcons name="hourglass-top" size={28} color="#F59E0B" />
            <View style={styles.activeCopy}>
              <Text style={styles.soonTitle}>{t("subscription_coming_soon_title" as any)}</Text>
              <Text style={styles.activeText}>{t("subscription_coming_soon_text" as any)}</Text>
            </View>
          </View>
        ) : loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#5DADE2" />
            <Text style={styles.loadingText}>{t("subscription_loading" as any)}</Text>
          </View>
        ) : (
          <>
            <View style={styles.plansWrap}>
              {packages.map((pkg) => {
                const active = selectedId === pkg.identifier;
                const isAnnual = pkg?.packageType === "ANNUAL";
                const title = pkg?.product?.title || (isAnnual ? t("subscription_plan_yearly_name" as any) : t("subscription_plan_monthly_name" as any));
                const price = pkg?.product?.priceString || "";
                return (
                  <TouchableOpacity
                    key={pkg.identifier}
                    activeOpacity={0.85}
                    onPress={() => setSelectedId(pkg.identifier)}
                    style={[styles.planCard, active && styles.planCardActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <View style={styles.planTop}>
                      <MaterialIcons
                        name={active ? "radio-button-checked" : "radio-button-unchecked"}
                        size={22}
                        color={active ? "#5DADE2" : "#4B5B6B"}
                      />
                      <Text style={styles.planName}>{title}</Text>
                    </View>
                    <Text style={styles.planPrice}>{price}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.buyBtn, (busy || packages.length === 0) && styles.buyBtnDisabled]}
              disabled={busy || packages.length === 0}
              onPress={onBuy}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buyBtnText}>{t("subscription_buy_cta" as any)}</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.restoreBtn} disabled={busy} onPress={onRestore} accessibilityRole="button">
              <Text style={styles.restoreText}>{t("subscription_restore" as any)}</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.priceHint}>{t("subscription_price_hint" as any)}</Text>

        <TouchableOpacity
          style={styles.legalButton}
          onPress={() => router.push("/legal" as never)}
          accessibilityRole="button"
          accessibilityLabel={t("subscription_a11y_legal" as any)}
        >
          <MaterialIcons name="gavel" size={20} color="#5DADE2" />
          <Text style={styles.legalButtonText}>{t("subscription_legal_button" as any)}</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>{t("subscription_footer_text" as any)}</Text>
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
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center", color: "#F0F4F8" },
  headerSpacer: { width: 40 },
  content: { padding: 16, paddingBottom: 48 },
  sectionTitle: { color: "#F0F4F8", fontSize: 17, fontWeight: "800", marginBottom: 10 },
  listCard: {
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#132238",
    marginBottom: 20,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#1E3A5F" },
  rowText: { flex: 1, color: "#D7E0EA", fontSize: 14, lineHeight: 21 },
  plansWrap: { gap: 12, marginBottom: 16 },
  planCard: {
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#132238",
    borderRadius: 12,
    padding: 16,
  },
  planCardActive: { borderColor: "#5DADE2", backgroundColor: "#15304A" },
  planTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  planName: { color: "#F0F4F8", fontSize: 17, fontWeight: "800" },
  planPrice: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  buyBtn: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    marginBottom: 12,
  },
  buyBtnDisabled: { opacity: 0.5 },
  buyBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  restoreBtn: { minHeight: 44, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  restoreText: { color: "#9FC5E8", fontSize: 14, fontWeight: "700" },
  loadingBox: { alignItems: "center", gap: 10, paddingVertical: 32 },
  loadingText: { color: "#9FB2C4", fontSize: 14 },
  activeCard: {
    flexDirection: "row",
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#166534",
    backgroundColor: "#0E2418",
    marginBottom: 16,
  },
  soonCard: {
    flexDirection: "row",
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#251E0C",
    marginBottom: 16,
  },
  activeCopy: { flex: 1, gap: 6 },
  activeTitle: { color: "#DCFCE7", fontSize: 18, fontWeight: "800" },
  soonTitle: { color: "#F8D477", fontSize: 18, fontWeight: "800" },
  activeText: { color: "#E5E7EB", fontSize: 14, lineHeight: 21 },
  priceHint: { color: "#7F8C9B", fontSize: 12, lineHeight: 18, marginTop: 16, marginBottom: 22 },
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
