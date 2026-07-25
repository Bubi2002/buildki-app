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

const SECTIONS: { key: LegalSection; title: string }[] = [
  { key: "datenschutz", title: "Datenschutz" },
  { key: "impressum", title: "Impressum" },
  { key: "agb", title: "Nutzungsbedingungen" },
  { key: "ki-hinweis", title: "KI-Hinweis" },
  { key: "lizenzen", title: "Lizenzen" },
  { key: "dsgvo-export", title: "Meine Daten" },
];

export default function LegalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const [activeSection, setActiveSection] = useState<LegalSection>(
    (params.section as LegalSection) || "datenschutz",
  );

  return (
    <ScreenContainer className="p-0">
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text className="text-primary text-base">← Zurück</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground ml-4">Rechtliches</Text>
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
              accessibilityLabel={section.title}
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
                {section.title}
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
  return (
    <View className="border border-error bg-error/10 p-4 mb-5">
      <Text className="text-error text-sm font-bold mb-2">
        NICHT VERÖFFENTLICHUNGSFÄHIG
      </Text>
      <Text className="text-foreground text-sm leading-5">{LEGAL_DRAFT_NOTICE}</Text>
      <Text className="text-muted text-xs mt-2">Entwurfsversion: {LEGAL_DRAFT_VERSION}</Text>
    </View>
  );
}

function DatenschutzContent() {
  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">Datenschutz-Prüfentwurf</Text>

      <Section title="1. Verantwortlicher">
        <OpenLine label="Name/Firma" value={LEGAL_PROVIDER.legalName} />
        <OpenLine label="Rechtsform" value={LEGAL_PROVIDER.legalForm} />
        <OpenLine label="Anschrift" value={`${LEGAL_PROVIDER.streetAddress}, ${LEGAL_PROVIDER.postalCodeAndCity}`} />
        <OpenLine label="Vertretung" value={LEGAL_PROVIDER.representative} />
        <P>E-Mail: {LEGAL_CONTACT_EMAIL}</P>
        <OpenLine label="Datenschutzbeauftragter" value={LEGAL_PROVIDER.dataProtectionOfficer} />
        <P>
          Bis zur verbindlichen Betreiberbestätigung dient {LEGAL_CONTACT_EMAIL} ausschließlich als allgemeiner Datenschutzkontakt; eine förmliche Bestellung eines Datenschutzbeauftragten wird nicht behauptet.
        </P>
      </Section>

      <Section title="2. Betroffene Personen und Datenkategorien">
        <Bullet text="Kontoinhaber: E-Mail-Adresse, Name, Benutzer-ID, Login-, Verifikations- und Sitzungsdaten" />
        <Bullet text="Projektbeteiligte und Kontakte: Namen, Firmen, Rollen, E-Mail-Adressen und Telefonnummern" />
        <Bullet text="Beschäftigte und Auftragnehmer: Anwesenheit, Arbeitszeiten, Tätigkeiten, Aufgaben, Verantwortlichkeiten und Status" />
        <Bullet text="Baustellendaten: Projekte, Räume, Mängel, Protokolle, Termine, Standorte, Wetter- und Matterport-Bezüge" />
        <Bullet text="Nutzerinhalte: Audio, Video, Fotos, Anhänge, Transkripte, Notizen, Exporte und KI-Ergebnisse" />
        <Bullet text="Betriebsdaten: Audit-, Sicherheits-, Fehler-, Geräte-, Push- und Synchronisationsinformationen" />
        <Bullet text="Abrechnungsdaten nur bei tatsächlich aktiviertem, zulässigem Zahlungsmodell" />
      </Section>

      <Section title="3. Zwecke und vorläufige Rechtsgrundlagen">
        <Bullet text={`Kontoregistrierung, Authentifizierung und Bereitstellung der gewünschten Appfunktionen: endgültiges B2B/B2C-Modell und konkrete Rechtsgrundlage – ${LEGAL_DRAFT_MARKER}`} />
        <Bullet text="Projekt-, Protokoll-, Aufgaben- und Mängelverwaltung: Vertrag beziehungsweise dokumentiertes berechtigtes Interesse, abhängig von Verantwortungsrolle und Kundenvertrag" />
        <Bullet text="Optionale KI-, Standort-, Cloud- und Drittanbieterfunktionen: nur nach zweckbezogener Aktivierung und transparenter Information; konkrete Rechtsgrundlage ist funktionsbezogen zu dokumentieren" />
        <Bullet text="Sicherheit, Missbrauchsabwehr und notwendige Protokollierung: berechtigtes Interesse beziehungsweise gesetzliche Pflicht, nach dokumentierter Interessenabwägung" />
        <Bullet text="Gesetzliche Aufbewahrung und Rechtsverteidigung: nur soweit konkret erforderlich" />
      </Section>

      <Section title="4. Lokale und serverseitige Verarbeitung">
        <P>
          BuildKI speichert einen Teil der Projekte, Einstellungen, Medienverweise und Einwilligungsinformationen lokal auf dem Gerät. Bei Konto-, Cloud-, Synchronisations-, Upload-, E-Mail-, KI-, Zahlungs-, Dropbox-, Matterport-, Wetter- oder Pushfunktionen werden Daten zusätzlich an BuildKI-Server oder externe Anbieter übertragen. Eine Deinstallation löscht daher nicht automatisch alle Daten.
        </P>
      </Section>

      <Section title="5. Empfänger und Dienstleister">
        <Bullet text={`BuildKI-Backend, Datenbank und Objektspeicher – Vertragspartner, Region, AVV, Transfergrundlage und Löschfrist: ${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`KI-/Transkriptions-/Analyseanbieter (technischer Forge-Endpunkt) – Rechtsträger, Modelle, Region, AVV, SCC und Löschfrist: ${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`E-Mail-Versand (technisch Strato SMTP) – Vertrag, Region, AVV und Löschfrist: ${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`Stripe nur bei künftig rechtlich und Apple-konform aktiviertem Zahlungsmodell – Vertrags-/Transferangaben: ${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`Dropbox und Matterport nur bei freiwilliger Verbindung durch den Nutzer – Vertrags-/Transferangaben: ${LEGAL_DRAFT_MARKER}`} />
        <Bullet text={`Apple/Expo für Betriebssystem-, Push-, TestFlight- und Storeprozesse – konkrete Produktivkonfiguration: ${LEGAL_DRAFT_MARKER}`} />
        <Bullet text="Open-Meteo für Wetterabfragen; zu übertragen sind nur die hierfür notwendigen Standort-/Zeitparameter" />
      </Section>

      <Section title="6. Drittlandübermittlungen">
        <P>
          Ob und welche Anbieter Daten außerhalb EU/EWR verarbeiten, welche Angemessenheitsbeschlüsse, Standardvertragsklauseln oder zusätzlichen Maßnahmen gelten, ist je Produktivvertrag zu bestätigen.
        </P>
        <OpenValue />
      </Section>

      <Section title="7. Speicherdauer und Löschkonzept">
        <P>
          Verbindliche Fristen für Konten, Projekte, Audio, Video, Fotos, Transkripte, KI-Anfragen, Objektspeicher, Auditdaten, Sicherheitslogs, Zahlungsunterlagen und Backups sind noch nicht beschlossen.
        </P>
        <OpenValue />
        <P>
          Daten werden im Prüfentwurf nicht mit einer erfundenen pauschalen 30-Tage-Frist beschrieben. Gesetzliche Aufbewahrung und technische Backupzyklen müssen je Datenkategorie dokumentiert werden.
        </P>
      </Section>

      <Section title="8. Audio, Video, Fotos und Beschäftigtendaten">
        <P>
          Nutzer müssen vor nichtöffentlichen Audio-/Videoaufnahmen alle betroffenen Personen informieren und eine geeignete Rechtsgrundlage sicherstellen. Personenfotos, Anwesenheit, Arbeitszeit, Standort und Aufgaben können Beschäftigten- oder Drittdaten betreffen. Unternehmen müssen Erforderlichkeit, Informationspflichten, mögliche Betriebsratsmitbestimmung und erforderliche Vereinbarungen eigenständig prüfen.
        </P>
      </Section>

      <Section title="9. Ihre Rechte">
        <Bullet text="Auskunft und Kopie der personenbezogenen Daten" />
        <Bullet text="Berichtigung unrichtiger Daten" />
        <Bullet text="Löschung oder Einschränkung, soweit keine vorrangige Pflicht entgegensteht" />
        <Bullet text="Datenübertragbarkeit, soweit anwendbar" />
        <Bullet text="Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen" />
        <Bullet text="Widerruf einer Einwilligung für die Zukunft" />
        <Bullet text="Beschwerde bei einer zuständigen Datenschutzaufsichtsbehörde" />
        <P>Kontakt für Anfragen: {LEGAL_CONTACT_EMAIL}</P>
      </Section>

      <Section title="10. Endgerätespeicherung und Tracking">
        <P>
          Für den ausdrücklich gewünschten Appbetrieb notwendige lokale Speicherungen werden transparent dokumentiert. Ein Analytics-, Werbe-, Profiling- oder Tracking-SDK ist im geprüften Quellstand nicht nachgewiesen und wird nicht behauptet. Eine spätere Einführung erfordert eine erneute TDDDG-/DSGVO-Prüfung vor Aktivierung.
        </P>
      </Section>

      <Section title="11. Aktualität und Veröffentlichungssperre">
        <P>
          Dieser Text ist ein technischer Prüfentwurf. Er darf erst nach Betreiberbestätigung, Dienstleister-/Transferprüfung, Löschkonzept, finaler Zahlungsentscheidung und anwaltlicher Prüfung veröffentlicht werden.
        </P>
      </Section>
    </View>
  );
}

function ImpressumContent() {
  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">Impressum-Prüfentwurf</Text>
      <Section title="Angaben gemäß § 5 DDG">
        <OpenLine label="Name/Firma" value={LEGAL_PROVIDER.legalName} />
        <OpenLine label="Rechtsform" value={LEGAL_PROVIDER.legalForm} />
        <OpenLine label="Ladungsfähige Anschrift" value={`${LEGAL_PROVIDER.streetAddress}, ${LEGAL_PROVIDER.postalCodeAndCity}`} />
        <OpenLine label="Vertretungsberechtigter" value={LEGAL_PROVIDER.representative} />
        <P>E-Mail: {LEGAL_CONTACT_EMAIL}</P>
        <OpenLine label="Telefon/weitere schnelle Kontaktmöglichkeit" value={LEGAL_PROVIDER.phone} />
      </Section>

      <Section title="Register und Identifikationsnummern">
        <OpenLine label="Registergericht" value={LEGAL_PROVIDER.registerCourt} />
        <OpenLine label="Registernummer" value={LEGAL_PROVIDER.registerNumber} />
        <OpenLine label="USt-IdNr. oder Wirtschafts-IdNr." value={LEGAL_PROVIDER.vatOrBusinessId} />
        <P>Eine interne Steuernummer und Bankverbindung werden im Impressum nicht veröffentlicht.</P>
      </Section>

      <Section title="Inhaltliche Verantwortung und Support">
        <OpenLine label="Inhaltlich verantwortlich" value={LEGAL_PROVIDER.representative} />
        <P>Support und Datenschutzkontakt: {LEGAL_CONTACT_EMAIL}</P>
      </Section>

      <Section title="KI-Hinweis">
        <P>
          KI-generierte Inhalte sind Arbeitshilfen, können fehlerhaft sein und müssen vor Freigabe, Versand oder Verwendung fachlich geprüft werden. Sie ersetzen keine rechtliche, technische oder sicherheitsrelevante Fachentscheidung.
        </P>
      </Section>
    </View>
  );
}

function AGBContent() {
  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">Nutzungsbedingungen – Prüfentwurf</Text>

      <Section title="1. Anbieter, Zielgruppe und Vertragsschluss">
        <OpenLine label="Vertragspartner/Anbieter" value={LEGAL_PROVIDER.legalName} />
        <OpenLine label="B2B-, B2C- oder gemischtes Modell" value={LEGAL_BUSINESS_MODEL.audience} />
        <P>
          Die Registrierung allein darf erst dann als Vertragsschluss bezeichnet werden, wenn Anbieter, Zielgruppe, Leistungsumfang, Tarif und Annahmeprozess verbindlich festgelegt sind.
        </P>
      </Section>

      <Section title="2. Leistungsumfang">
        <P>
          BuildKI unterstützt projektbezogene Baudokumentation, Protokolle, Aufgaben, Mängel, Fotos, Videos und Exporte sowie optionale Cloud-, KI- und Dropbox-Funktionen. Verfügbarkeit und Leistungsumfang richten sich nach der tatsächlich freigeschalteten Konfiguration. Nicht nachgewiesene SLAs, automatische Synchronisationsgarantien oder unbegrenzte Funktionen werden nicht zugesagt.
        </P>
        <P>
          Die Matterport-Integration ist im Prüfentwurf technisch gesperrt. Commercial Partner Terms, zulässige Monetarisierung und App-Store-Verteilung, DPA-Rollen, Transfers, Löschung, Endnutzerbedingungen sowie mandantensichere Account-/Modellzuordnung: {LEGAL_DRAFT_MARKER}
        </P>
      </Section>

      <Section title="3. KI-Funktionen">
        <P>
          Transkripte, Zusammenfassungen, Berichte, Aufgaben, Übersetzungen und sonstige Vorschläge können automatisiert beziehungsweise KI-gestützt erzeugt werden. Der Nutzer muss Ergebnisse vor fachlicher oder rechtlicher Verwendung prüfen. BuildKI trifft keine autonome verbindliche Bau-, Sicherheits-, Personal- oder Rechtsentscheidung.
        </P>
      </Section>

      <Section title="4. Preise, Testphase und Zahlung">
        <OpenLine label="Monatspreis" value={LEGAL_BUSINESS_MODEL.monthlyPrice} />
        <OpenLine label="Jahrespreis" value={LEGAL_BUSINESS_MODEL.yearlyPrice} />
        <OpenLine label="Testphase" value={LEGAL_BUSINESS_MODEL.trialTerms} />
        <OpenLine label="Zahlungsarchitektur" value={LEGAL_BUSINESS_MODEL.paymentArchitecture} />
        <P>
          Bis zur Apple- und vertragsrechtlichen Entscheidung darf kein ungeklärter externer Kauf digitaler Premiumfunktionen aus der iOS-App angeboten werden.
        </P>
      </Section>

      <Section title="5. Nutzungs- und Kundenpflichten">
        <Bullet text="Zugangsdaten schützen und unbefugte Nutzung melden" />
        <Bullet text="Nur rechtmäßig erhobene Projekt-, Personen-, Audio-, Bild- und Beschäftigtendaten verarbeiten" />
        <Bullet text="Vor nichtöffentlichen Aufnahmen alle Betroffenen informieren und erforderliche Zustimmungen/Rechtsgrundlagen sicherstellen" />
        <Bullet text="KI-Ausgaben vor Freigabe, Versand oder Verwendung prüfen" />
        <Bullet text="Betriebsrats-, Beschäftigtendatenschutz-, Geheimhaltungs- und Kundenpflichten beachten" />
      </Section>

      <Section title="6. Auftragsverarbeitung und Unterauftragnehmer">
        <P>
          Ob der BuildKI-Anbieter für Kundendaten als Auftragsverarbeiter handelt, welche AVV, TOM, Unterauftragnehmer, Regionen und Transfermechanismen gelten, ist vor Produktivbetrieb vertraglich festzulegen.
        </P>
        <OpenValue />
      </Section>

      <Section title="7. Laufzeit, Kündigung und Daten nach Vertragsende">
        <OpenLine label="Laufzeit/Kündigung" value={LEGAL_BUSINESS_MODEL.cancellationTerms} />
        <OpenLine label="Exportfrist nach Vertragsende" value={LEGAL_DRAFT_MARKER} />
        <OpenLine label="Löschung/gesetzliche Aufbewahrung" value={LEGAL_DRAFT_MARKER} />
      </Section>

      <Section title="8. Haftung, Gewährleistung und Rechtswahl">
        <P>
          Gewährleistungs-, Haftungs-, Gerichtsstands-, AGB-Änderungs- und Übertragungsklauseln werden in diesem Prüfentwurf nicht als verbindlich dargestellt. Sie müssen nach Zielgruppe und Geschäftsmodell von einer qualifizierten Rechtsberatung formuliert werden.
        </P>
        <OpenValue />
      </Section>
    </View>
  );
}

function KIHinweisContent() {
  return (
    <View className="gap-5 pb-8">
      <Text className="text-xl font-bold text-foreground">Transparenz zu KI-Funktionen</Text>

      <View className="bg-warning/10 border border-warning/30 p-4">
        <Text className="text-sm font-bold text-foreground mb-2">Menschliche Prüfung erforderlich</Text>
        <Text className="text-sm text-foreground leading-5">
          BuildKI nutzt KI-gestützte Verarbeitung. Ergebnisse können unvollständig, missverständlich oder falsch sein und dürfen nicht ungeprüft als verbindliche Bau-, Sicherheits-, Personal- oder Rechtsentscheidung verwendet werden.
        </Text>
      </View>

      <Section title="KI-gestützte Funktionen im geprüften Quellstand">
        <Bullet text="Audio-/Video-Transkription und Sprecherzuordnung" />
        <Bullet text="Protokollstrukturierung, Zusammenfassung und Aufgabenextraktion" />
        <Bullet text="Agenda, Übersetzung, Dokument-, Foto- und Berichtsanalysen" />
        <Bullet text="Bautagebuch-, Support- und Formulierungshilfen" />
      </Section>

      <Section title="Übermittelte Inhalte">
        <P>
          Je Funktion können Transkripte, Projektnamen, Protokolle, Aufgaben, Dokumente, Fotos, Anhänge und Nutzereingaben an einen serverseitig angebundenen KI-/Forge-Endpunkt übertragen werden. Eine vollständige Anonymisierung findet im geprüften Stand nicht zuverlässig statt.
        </P>
        <OpenLine label="Vertragspartner, Modell, Region, AVV, SCC und Löschfrist" value={LEGAL_DRAFT_MARKER} />
      </Section>

      <Section title="Steuerung und Verantwortung">
        <Bullet text="Optionale KI-Verarbeitung muss vor Nutzung aktiv freigegeben und später wieder deaktivierbar sein" />
        <Bullet text="Ohne Freigabe dürfen keine neuen Inhalte für KI-Zwecke übertragen werden" />
        <Bullet text="Automatisch erzeugte Inhalte müssen als KI-gestützt erkennbar bleiben" />
        <Bullet text="Nutzer prüfen, korrigieren und bestätigen Ergebnisse vor Weitergabe" />
      </Section>

      <Section title="KI-Kompetenz und Organisation">
        <P>
          Betreiber und Geschäftskunden müssen Personen, die KI-Funktionen konfigurieren, bedienen oder bewerten, angemessen schulen. Ein organisatorischer Schulungs- und Freigabenachweis ist vor Veröffentlichung zu erstellen.
        </P>
      </Section>
    </View>
  );
}

function LizenzenContent() {
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">Open-Source-Hinweise – Prüfstand</Text>
      <P>
        Die folgende Liste ist ein Auszug. Vor Veröffentlichung muss ein automatisiert erzeugtes vollständiges Third-Party-Notices-Dokument mit Paketversionen, Lizenztexten und erforderlichen Hinweisen eingebunden werden.
      </P>
      <LicenseItem name="React / React Native" license="MIT" />
      <LicenseItem name="Expo / Expo Router" license="MIT" />
      <LicenseItem name="React Navigation" license="MIT" />
      <LicenseItem name="AsyncStorage" license="MIT" />
      <LicenseItem name="NativeWind / Tailwind CSS" license="MIT" />
      <LicenseItem name="tRPC" license="MIT" />
      <LicenseItem name="Drizzle ORM" license="Apache-2.0" />
      <LicenseItem name="Zod" license="MIT" />
      <OpenLine label="Vollständige Lizenzprüfung" value={LEGAL_DRAFT_MARKER} />
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
