import { useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DataRightsSection } from "@/components/data-rights-section";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";
import {
  LEGAL_BUSINESS_MODEL,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DRAFT_MARKER,
  LEGAL_DRAFT_NOTICE,
  LEGAL_DRAFT_VERSION,
  LEGAL_PROVIDER,
} from "@/lib/legal-draft";

type LegalSection =
  | "datenschutz"
  | "impressum"
  | "agb"
  | "ki-hinweis"
  | "lizenzen"
  | "dsgvo-export";

const SECTIONS: { key: LegalSection; titleKey: string }[] = [
  { key: "datenschutz", titleKey: "legal_tab_datenschutz" },
  { key: "impressum", titleKey: "legal_tab_impressum" },
  { key: "agb", titleKey: "legal_tab_nutzungsbedingungen" },
  { key: "ki-hinweis", titleKey: "legal_tab_ki_hinweis" },
  { key: "lizenzen", titleKey: "legal_tab_lizenzen" },
  { key: "dsgvo-export", titleKey: "legal_tab_meine_daten" },
];

export default function LegalScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ section?: string }>();
  const [activeSection, setActiveSection] = useState<LegalSection>(
    (params.section as LegalSection) || "datenschutz",
  );

  return (
    <ScreenContainer className="p-0">
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text className="text-primary text-base">{t('legal_zurueck')}</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground ml-4">{t('legal_rechtliches')}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          flexGrow: 0,
          maxHeight: 54,
          borderBottomWidth: 1,
          borderBottomColor: "#223A55",
        }}
        contentContainerStyle={{
          minHeight: 53,
          paddingHorizontal: 8,
          paddingVertical: 5,
          gap: 6,
          alignItems: "center",
        }}
      >
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.key;
          return (
            <TouchableOpacity
              key={section.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t(section.titleKey as any)}
              onPress={() => setActiveSection(section.key)}
              activeOpacity={0.65}
              style={{
                height: 42,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: isActive ? "#5BA7D9" : "#223A55",
                backgroundColor: isActive ? "#5BA7D9" : "#12233D",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: isActive ? "#06111D" : "#F4F7FA",
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {t(section.titleKey as any)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <DraftBanner />
        {activeSection === "datenschutz" && <DatenschutzContent />}
        {activeSection === "impressum" && <ImpressumContent />}
        {activeSection === "agb" && <AGBContent />}
        {activeSection === "ki-hinweis" && <KIHinweisContent />}
        {activeSection === "lizenzen" && <LizenzenContent />}
        {activeSection === "dsgvo-export" && <DataRightsSection />}
      </ScrollView>
    </ScreenContainer>
  );
}

function DraftBanner() {
  const { t } = useTranslation();
  return (
    <View className="border border-error bg-error/10 p-4 mb-5">
      <Text className="text-error text-sm font-bold mb-2">
        {t('legal_nicht_veroeffentlichungsfaehig')}
      </Text>
      <Text className="text-foreground text-sm leading-5">{LEGAL_DRAFT_NOTICE}</Text>
      <Text className="text-muted text-xs mt-2">{t('legal_entwurfsversion')}{LEGAL_DRAFT_VERSION}</Text>
    </View>
  );
}

function DatenschutzContent() {
  const { t } = useTranslation();
  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">{t('legal_datenschutz_pruefentwurf')}</Text>

      <Section title={t('legal_ds_1_verantwortlicher')}>
        <OpenLine label={t('legal_name_firma')} value={LEGAL_PROVIDER.legalName} />
        <OpenLine label={t('legal_rechtsform')} value={LEGAL_PROVIDER.legalForm} />
        <OpenLine label={t('legal_anschrift')} value={`${LEGAL_PROVIDER.streetAddress}, ${LEGAL_PROVIDER.postalCodeAndCity}`} />
        <OpenLine label={t('legal_vertretung')} value={LEGAL_PROVIDER.representative} />
        <P>{t('legal_email_label')}{LEGAL_CONTACT_EMAIL}</P>
        <OpenLine label={t('legal_datenschutzbeauftragter')} value={LEGAL_PROVIDER.dataProtectionOfficer} />
        <P>
          {`${t('legal_ds_dpo_notice_prefix')}${LEGAL_CONTACT_EMAIL}${t('legal_ds_dpo_notice_suffix')}`}
        </P>
      </Section>

      <Section title={t('legal_ds_2_betroffene')}>
        <Bullet text={t('legal_ds_kat_kontoinhaber')} />
        <Bullet text={t('legal_ds_kat_projektbeteiligte')} />
        <Bullet text={t('legal_ds_kat_beschaeftigte')} />
        <Bullet text={t('legal_ds_kat_baustellendaten')} />
        <Bullet text={t('legal_ds_kat_nutzerinhalte')} />
        <Bullet text={t('legal_ds_kat_betriebsdaten')} />
        <Bullet text={t('legal_ds_kat_abrechnungsdaten')} />
      </Section>

      <Section title={t('legal_ds_3_zwecke')}>
        <Bullet text={`${t('legal_ds_zweck_registrierung')}${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={t('legal_ds_zweck_verwaltung')} />
        <Bullet text={t('legal_ds_zweck_optionale')} />
        <Bullet text={t('legal_ds_zweck_sicherheit')} />
        <Bullet text={t('legal_ds_zweck_aufbewahrung')} />
      </Section>

      <Section title={t('legal_ds_4_lokale')}>
        <P>
          {t('legal_ds_lokale_text')}
        </P>
      </Section>

      <Section title={t('legal_ds_5_empfaenger')}>
        <Bullet text={`${t('legal_ds_empf_backend')}${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`${t('legal_ds_empf_ki')}${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`${t('legal_ds_empf_email')}${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`${t('legal_ds_empf_stripe')}${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`${t('legal_ds_empf_dropbox')}${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`${t('legal_ds_empf_apple')}${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={t('legal_ds_empf_openmeteo')} />
      </Section>

      <Section title={t('legal_ds_6_drittland')}>
        <P>
          {t('legal_ds_drittland_text')}
        </P>
        <OpenValue />
      </Section>

      <Section title={t('legal_ds_7_speicherdauer')}>
        <P>
          {t('legal_ds_speicher_text1')}
        </P>
        <OpenValue />
        <P>
          {t('legal_ds_speicher_text2')}
        </P>
      </Section>

      <Section title={t('legal_ds_8_audio')}>
        <P>
          {t('legal_ds_audio_text')}
        </P>
      </Section>

      <Section title={t('legal_ds_9_rechte')}>
        <Bullet text={t('legal_ds_recht_auskunft')} />
        <Bullet text={t('legal_ds_recht_berichtigung')} />
        <Bullet text={t('legal_ds_recht_loeschung')} />
        <Bullet text={t('legal_ds_recht_uebertragbarkeit')} />
        <Bullet text={t('legal_ds_recht_widerspruch')} />
        <Bullet text={t('legal_ds_recht_widerruf')} />
        <Bullet text={t('legal_ds_recht_beschwerde')} />
        <P>{t('legal_ds_kontakt_anfragen')}{LEGAL_CONTACT_EMAIL}</P>
      </Section>

      <Section title={t('legal_ds_10_tracking')}>
        <P>
          {t('legal_ds_tracking_text')}
        </P>
      </Section>

      <Section title={t('legal_ds_11_aktualitaet')}>
        <P>
          {t('legal_ds_aktualitaet_text')}
        </P>
      </Section>
    </View>
  );
}

function ImpressumContent() {
  const { t } = useTranslation();
  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">{t('legal_impressum_pruefentwurf')}</Text>
      <Section title={t('legal_imp_angaben')}>
        <OpenLine label={t('legal_name_firma')} value={LEGAL_PROVIDER.legalName} />
        <OpenLine label={t('legal_rechtsform')} value={LEGAL_PROVIDER.legalForm} />
        <OpenLine label={t('legal_imp_ladungsfaehige_anschrift')} value={`${LEGAL_PROVIDER.streetAddress}, ${LEGAL_PROVIDER.postalCodeAndCity}`} />
        <OpenLine label={t('legal_imp_vertretungsberechtigter')} value={LEGAL_PROVIDER.representative} />
        <P>{t('legal_email_label')}{LEGAL_CONTACT_EMAIL}</P>
        <OpenLine label={t('legal_imp_telefon')} value={LEGAL_PROVIDER.phone} />
      </Section>

      <Section title={t('legal_imp_register')}>
        <OpenLine label={t('legal_imp_registergericht')} value={LEGAL_PROVIDER.registerCourt} />
        <OpenLine label={t('legal_imp_registernummer')} value={LEGAL_PROVIDER.registerNumber} />
        <OpenLine label={t('legal_imp_ustid')} value={LEGAL_PROVIDER.vatOrBusinessId} />
        <P>{t('legal_imp_steuernummer_text')}</P>
      </Section>

      <Section title={t('legal_imp_verantwortung')}>
        <OpenLine label={t('legal_imp_inhaltlich_verantwortlich')} value={LEGAL_PROVIDER.representative} />
        <P>{t('legal_imp_support_kontakt')}{LEGAL_CONTACT_EMAIL}</P>
      </Section>

      <Section title={t('legal_imp_ki_hinweis')}>
        <P>
          {t('legal_imp_ki_text')}
        </P>
      </Section>
    </View>
  );
}

function AGBContent() {
  const { t } = useTranslation();
  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">{t('legal_agb_pruefentwurf')}</Text>

      <Section title={t('legal_agb_1_anbieter')}>
        <OpenLine label={t('legal_agb_vertragspartner')} value={LEGAL_PROVIDER.legalName} />
        <OpenLine label={t('legal_agb_modell')} value={LEGAL_BUSINESS_MODEL.audience} />
        <P>
          {t('legal_agb_1_text')}
        </P>
      </Section>

      <Section title={t('legal_agb_2_leistungsumfang')}>
        <P>
          {t('legal_agb_2_text1')}
        </P>
        <P>
          {`${t('legal_agb_2_text2')}${LEGAL_DRAFT_MARKER}`}
        </P>
      </Section>

      <Section title={t('legal_agb_3_ki')}>
        <P>
          {t('legal_agb_3_text')}
        </P>
      </Section>

      <Section title={t('legal_agb_4_preise')}>
        <OpenLine label={t('legal_agb_monatspreis')} value={LEGAL_BUSINESS_MODEL.monthlyPrice} />
        <OpenLine label={t('legal_agb_jahrespreis')} value={LEGAL_BUSINESS_MODEL.yearlyPrice} />
        <OpenLine label={t('legal_agb_testphase')} value={LEGAL_BUSINESS_MODEL.trialTerms} />
        <OpenLine label={t('legal_agb_zahlungsarchitektur')} value={LEGAL_BUSINESS_MODEL.paymentArchitecture} />
        <P>
          {t('legal_agb_4_text')}
        </P>
      </Section>

      <Section title={t('legal_agb_5_pflichten')}>
        <Bullet text={t('legal_agb_pflicht_zugangsdaten')} />
        <Bullet text={t('legal_agb_pflicht_daten')} />
        <Bullet text={t('legal_agb_pflicht_aufnahmen')} />
        <Bullet text={t('legal_agb_pflicht_ki')} />
        <Bullet text={t('legal_agb_pflicht_betriebsrat')} />
      </Section>

      <Section title={t('legal_agb_6_auftrag')}>
        <P>
          {t('legal_agb_6_text')}
        </P>
        <OpenValue />
      </Section>

      <Section title={t('legal_agb_7_laufzeit')}>
        <OpenLine label={t('legal_agb_laufzeit_kuendigung')} value={LEGAL_BUSINESS_MODEL.cancellationTerms} />
        <OpenLine label={t('legal_agb_exportfrist')} value={LEGAL_DRAFT_MARKER} />
        <OpenLine label={t('legal_agb_loeschung')} value={LEGAL_DRAFT_MARKER} />
      </Section>

      <Section title={t('legal_agb_8_haftung')}>
        <P>
          {t('legal_agb_8_text')}
        </P>
        <OpenValue />
      </Section>
    </View>
  );
}

function KIHinweisContent() {
  const { t } = useTranslation();
  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">{t('legal_ki_transparenz')}</Text>

      <View className="bg-warning/10 border border-warning/30 p-4">
        <Text className="text-sm font-bold text-foreground mb-2">{t('legal_ki_menschliche_pruefung')}</Text>
        <Text className="text-sm text-foreground leading-5">
          {t('legal_ki_menschliche_text')}
        </Text>
      </View>

      <Section title={t('legal_ki_funktionen_titel')}>
        <Bullet text={t('legal_ki_funktion_transkription')} />
        <Bullet text={t('legal_ki_funktion_protokoll')} />
        <Bullet text={t('legal_ki_funktion_agenda')} />
        <Bullet text={t('legal_ki_funktion_bautagebuch')} />
      </Section>

      <Section title={t('legal_ki_uebermittelte')}>
        <P>
          {t('legal_ki_uebermittelte_text')}
        </P>
        <OpenLine label={t('legal_ki_vertragspartner_label')} value={LEGAL_DRAFT_MARKER} />
      </Section>

      <Section title={t('legal_ki_steuerung')}>
        <Bullet text={t('legal_ki_steuerung_freigabe')} />
        <Bullet text={t('legal_ki_steuerung_ohne')} />
        <Bullet text={t('legal_ki_steuerung_erkennbar')} />
        <Bullet text={t('legal_ki_steuerung_pruefen')} />
      </Section>

      <Section title={t('legal_ki_kompetenz')}>
        <P>
          {t('legal_ki_kompetenz_text')}
        </P>
      </Section>
    </View>
  );
}

function LizenzenContent() {
  const { t } = useTranslation();
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">{t('legal_lizenzen_titel')}</Text>
      <P>
        {t('legal_lizenzen_text')}
      </P>
      <LicenseItem name="React / React Native" license="MIT" />
      <LicenseItem name="Expo / Expo Router" license="MIT" />
      <LicenseItem name="React Navigation" license="MIT" />
      <LicenseItem name="AsyncStorage" license="MIT" />
      <LicenseItem name="NativeWind / Tailwind CSS" license="MIT" />
      <LicenseItem name="tRPC" license="MIT" />
      <LicenseItem name="Drizzle ORM" license="Apache-2.0" />
      <LicenseItem name="Zod" license="MIT" />
      <OpenLine label={t('legal_lizenzen_vollstaendige')} value={LEGAL_DRAFT_MARKER} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm text-foreground leading-5">{children}</Text>;
}

function Bullet({ text }: { text: string }) {
  return (
    <View className="flex-row pl-2">
      <Text className="text-sm text-muted mr-2">•</Text>
      <Text className="text-sm text-foreground leading-5 flex-1">{text}</Text>
    </View>
  );
}

function OpenValue() {
  return (
    <Text className="text-sm text-error font-bold leading-5">{LEGAL_DRAFT_MARKER}</Text>
  );
}

function OpenLine({ label, value }: { label: string; value: string }) {
  const isOpen = value.includes(LEGAL_DRAFT_MARKER);
  return (
    <View className="border-l-2 border-border pl-3 py-1">
      <Text className="text-xs text-muted font-semibold">{label}</Text>
      <Text className={`text-sm leading-5 ${isOpen ? "text-error font-bold" : "text-foreground"}`}>
        {value}
      </Text>
    </View>
  );
}

function LicenseItem({ name, license }: { name: string; license: string }) {
  return (
    <View className="flex-row justify-between items-center py-2 border-b border-border">
      <Text className="text-sm text-foreground">{name}</Text>
      <Text className="text-xs text-muted bg-surface px-2 py-1">{license}</Text>
    </View>
  );
}
