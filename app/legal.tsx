import { useContext, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { DataRightsSection } from "@/components/data-rights-section";
import { LegalModeContext, sanitizeLegal } from "@/lib/legal-mode";
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
import {
  THIRD_PARTY_LICENSES,
  THIRD_PARTY_LICENSE_COUNT,
} from "@/lib/third-party-licenses";

type LegalSection =
  | "datenschutz"
  | "impressum"
  | "agb"
  | "ki-hinweis"
  | "lizenzen"
  | "dsgvo-export";

const SECTIONS: { key: LegalSection; titleKey: string; icon: string }[] = [
  { key: "datenschutz", titleKey: "legal_tab_datenschutz", icon: "privacy-tip" },
  { key: "impressum", titleKey: "legal_tab_impressum", icon: "info-outline" },
  { key: "agb", titleKey: "legal_tab_nutzungsbedingungen", icon: "gavel" },
  { key: "ki-hinweis", titleKey: "legal_tab_ki_hinweis", icon: "smart-toy" },
  { key: "lizenzen", titleKey: "legal_tab_lizenzen", icon: "code" },
  { key: "dsgvo-export", titleKey: "legal_tab_meine_daten", icon: "folder-shared" },
];


export default function LegalScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ section?: string }>();
  // null = show the list; a key = show that page.
  const [activeSection, setActiveSection] = useState<LegalSection | null>(
    (params.section as LegalSection) || null,
  );
  const [internal, setInternal] = useState(false);

  const toggleInternal = () => {
    setInternal((v) => !v);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const current = activeSection ? SECTIONS.find((s) => s.key === activeSection) : null;
  const handleBack = () => {
    if (activeSection) setActiveSection(null); // back to the list
    else router.back();
  };

  return (
    <ScreenContainer className="p-0">
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} className="flex-row items-center">
          <MaterialIcons name="arrow-back-ios" size={18} color="#5BA7D9" />
          <Text className="text-primary text-base">{activeSection ? t('legal_rechtliches') : t('legal_zurueck')}</Text>
        </TouchableOpacity>
        {/* Long-press the title to toggle the internal compliance view. */}
        <TouchableOpacity onLongPress={toggleInternal} delayLongPress={600} activeOpacity={1} className="ml-3 flex-1 flex-row items-center">
          <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
            {current ? t(current.titleKey as any) : t('legal_rechtliches')}
          </Text>
          {internal && (
            <View className="ml-2 px-2 py-0.5 bg-error/20 border border-error rounded">
              <Text className="text-error text-xs font-bold">{t('legal_mode_internal' as any)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LegalModeContext.Provider value={internal}>
          {activeSection === null ? (
            <View className="gap-2">
              {SECTIONS.map((section) => (
                <TouchableOpacity
                  key={section.key}
                  accessibilityRole="button"
                  accessibilityLabel={t(section.titleKey as any)}
                  onPress={() => setActiveSection(section.key)}
                  activeOpacity={0.7}
                  className="flex-row items-center px-4 py-4 border border-border bg-surface rounded-lg"
                >
                  <MaterialIcons name={section.icon as any} size={22} color="#5BA7D9" />
                  <Text className="text-foreground text-base font-semibold flex-1 ml-3">{t(section.titleKey as any)}</Text>
                  <MaterialIcons name="chevron-right" size={22} color="#7A8794" />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <>
              {internal && <DraftBanner />}
              {activeSection === "datenschutz" && <DatenschutzContent />}
              {activeSection === "impressum" && <ImpressumContent />}
              {activeSection === "agb" && <AGBContent />}
              {activeSection === "ki-hinweis" && <KIHinweisContent />}
              {activeSection === "lizenzen" && <LizenzenContent />}
              {activeSection === "dsgvo-export" && <DataRightsSection />}
            </>
          )}
        </LegalModeContext.Provider>
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

function DatenschutzPlain() {
  const { t } = useTranslation();
  const questions = [1, 2, 3, 4, 5, 6, 7];
  return (
    <View className="gap-5 pb-8">
      <H1 text={t('legal_datenschutz_pruefentwurf')} />
      {questions.map((n) => (
        <Section key={n} title={t(`legal_ds_q${n}_title` as any)}>
          <P>
            {t(`legal_ds_q${n}_body` as any)}
            {(n === 1 || n === 7) ? LEGAL_CONTACT_EMAIL : ""}
          </P>
        </Section>
      ))}
    </View>
  );
}

function DatenschutzContent() {
  const { t } = useTranslation();
  const internal = useContext(LegalModeContext);
  // User-facing view: plain, structured Q&A. Internal view: full draft below.
  if (!internal) return <DatenschutzPlain />;
  return (
    <View className="gap-5 pb-8">
      <H1 text={t('legal_datenschutz_pruefentwurf')} />

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
      <H1 text={t('legal_impressum_pruefentwurf')} />
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
      <H1 text={t('legal_agb_pruefentwurf')} />

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
      <Text className="text-xs text-muted">
        {THIRD_PARTY_LICENSE_COUNT} Open-Source-Komponenten (Produktions-Abhängigkeiten).
      </Text>
      {THIRD_PARTY_LICENSES.map((lib) => (
        <LicenseItem
          key={`${lib.name}@${lib.version}`}
          name={lib.name}
          version={lib.version}
          license={lib.license}
        />
      ))}
    </View>
  );
}

function H1({ text }: { text: string }) {
  const internal = useContext(LegalModeContext);
  return <Text className="text-xl font-bold text-foreground">{internal ? text : sanitizeLegal(text)}</Text>;
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
  const internal = useContext(LegalModeContext);
  const shown = internal ? text : sanitizeLegal(text);
  if (!shown) return null;
  return (
    <View className="flex-row pl-2">
      <Text className="text-sm text-muted mr-2">•</Text>
      <Text className="text-sm text-foreground leading-5 flex-1">{shown}</Text>
    </View>
  );
}

function OpenValue() {
  const internal = useContext(LegalModeContext);
  if (!internal) return null; // never show open-point markers to users
  return (
    <Text className="text-sm text-error font-bold leading-5">{LEGAL_DRAFT_MARKER}</Text>
  );
}

function OpenLine({ label, value }: { label: string; value: string }) {
  const internal = useContext(LegalModeContext);
  const isOpen = value.includes(LEGAL_DRAFT_MARKER);
  // Hide unfilled (open) fields from the user-facing view entirely.
  if (!internal && isOpen) return null;
  return (
    <View className="border-l-2 border-border pl-3 py-1">
      <Text className="text-xs text-muted font-semibold">{label}</Text>
      <Text className={`text-sm leading-5 ${isOpen ? "text-error font-bold" : "text-foreground"}`}>
        {value}
      </Text>
    </View>
  );
}

function LicenseItem({ name, version, license }: { name: string; version?: string; license: string }) {
  return (
    <View className="flex-row justify-between items-center py-2 border-b border-border">
      <Text className="text-sm text-foreground flex-1 pr-2">
        {name}{version ? ` @ ${version}` : ""}
      </Text>
      <Text className="text-xs text-muted bg-surface px-2 py-1">{license}</Text>
    </View>
  );
}
