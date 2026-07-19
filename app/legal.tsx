/**
 * ProtoKI – Legal & Privacy Screens
 * 
 * Provides:
 * - Datenschutzerklärung (Privacy Policy)
 * - Impressum
 * - Nutzungsbedingungen (Terms of Service)
 * - KI-Hinweis (AI Disclaimer)
 * - Lizenzen (Open Source)
 * - DSGVO Data Export / Deletion
 */
import { useState, useCallback } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Share,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { exportAuditLog } from "@/lib/audit-log";
import { getDefects } from "@/lib/defect-store";

type LegalSection = "datenschutz" | "impressum" | "agb" | "ki-hinweis" | "lizenzen" | "dsgvo-export";

export default function LegalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const [activeSection, setActiveSection] = useState<LegalSection>(
    (params.section as LegalSection) || "datenschutz"
  );
  const [exporting, setExporting] = useState(false);

  const handleDataExport = useCallback(async () => {
    setExporting(true);
    try {
      // Collect all user data for DSGVO Art. 15 export
      const auditLog = await exportAuditLog();
      const defects = await getDefects();
      
      const allKeys = await AsyncStorage.getAllKeys();
      const relevantKeys = allKeys.filter(k => 
        k.startsWith("protoki_") || 
        k.startsWith("defects") || 
        k.startsWith("projects") ||
        k.startsWith("protocols") ||
        k.startsWith("attendance")
      );
      const allData = await AsyncStorage.multiGet(relevantKeys);
      
      const exportData = {
        exportDate: new Date().toISOString(),
        exportReason: "DSGVO Art. 15 – Auskunftsrecht",
        userData: {
          defects: defects,
          otherData: Object.fromEntries(
            allData.map(([key, value]) => [key, value ? JSON.parse(value) : null])
          ),
        },
        auditLog: JSON.parse(auditLog),
      };
      
      const exportString = JSON.stringify(exportData, null, 2);
      
      await Share.share({
        message: exportString,
        title: "ProtoKI – Datenexport (DSGVO Art. 15)",
      });
    } catch (error: any) {
      Alert.alert("Fehler", `Export fehlgeschlagen: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleDataDeletion = useCallback(() => {
    Alert.alert(
      "Daten löschen",
      "Möchten Sie ALLE Ihre Daten unwiderruflich löschen? Dies umfasst:\n\n• Alle Projekte\n• Alle Mängel und Fotos\n• Alle Protokolle\n• Alle Berichte\n• Audit-Log\n\nDiese Aktion kann NICHT rückgängig gemacht werden.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Alle Daten löschen",
          style: "destructive",
          onPress: async () => {
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              await AsyncStorage.multiRemove(allKeys);
              Alert.alert("Erledigt", "Alle lokalen Daten wurden gelöscht. Die App wird zurückgesetzt.", [
                { text: "OK" }
              ]);
            } catch (error: any) {
              Alert.alert("Fehler", `Löschung fehlgeschlagen: ${error.message}`);
            }
          },
        },
      ]
    );
  }, []);

  const sections: { key: LegalSection; title: string }[] = [
    { key: "datenschutz", title: "Datenschutz" },
    { key: "impressum", title: "Impressum" },
    { key: "agb", title: "Nutzungsbedingungen" },
    { key: "ki-hinweis", title: "KI-Hinweis" },
    { key: "lizenzen", title: "Lizenzen" },
    { key: "dsgvo-export", title: "Meine Daten" },
  ];

  return (
    <ScreenContainer className="p-0">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.6}
        >
          <Text className="text-primary text-base">← Zurück</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground ml-4">Rechtliches</Text>
      </View>

      {/* Tab Navigation */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-border">
        <View className="flex-row px-2 py-2 gap-1">
          {sections.map((s) => (
            <TouchableOpacity
              key={s.key}
              onPress={() => setActiveSection(s.key)}
              className={`px-3 py-2 rounded-lg ${activeSection === s.key ? "bg-primary" : "bg-surface"}`}
            >
              <Text className={`text-sm font-medium ${activeSection === s.key ? "text-background" : "text-foreground"}`}>
                {s.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Content */}
      <ScrollView className="flex-1 px-4 py-4">
        {activeSection === "datenschutz" && <DatenschutzContent />}
        {activeSection === "impressum" && <ImpressumContent />}
        {activeSection === "agb" && <AGBContent />}
        {activeSection === "ki-hinweis" && <KIHinweisContent />}
        {activeSection === "lizenzen" && <LizenzenContent />}
        {activeSection === "dsgvo-export" && (
          <DSGVOExportContent
            onExport={handleDataExport}
            onDelete={handleDataDeletion}
            exporting={exporting}
          />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Content Components ───────────────────────────────────────────────────────

function DatenschutzContent() {
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">Datenschutzerklärung</Text>
      <Text className="text-sm text-muted">Stand: Juli 2026</Text>

      <Section title="1. Verantwortlicher">
        <P>Iserloh Projektmanagement GmbH{"\n"}Vertreten durch: Jörg Iserloh{"\n"}E-Mail: info@iserloh.net</P>
      </Section>

      <Section title="2. Erhobene Daten">
        <P>ProtoKI verarbeitet folgende Daten:</P>
        <Bullet text="Projektdaten (Name, Adresse, Beteiligte)" />
        <Bullet text="Mängeldokumentation (Beschreibung, Fotos, Standort)" />
        <Bullet text="Sprachaufnahmen (Protokolle, Notizen)" />
        <Bullet text="GPS-Koordinaten (zur Verortung von Mängeln)" />
        <Bullet text="Geräteinformationen (für Audit-Log)" />
        <Bullet text="Nutzungsdaten (Audit-Trail für Beweissicherung)" />
      </Section>

      <Section title="3. Zweck der Verarbeitung">
        <Bullet text="Baudokumentation und Mängelmanagement (Art. 6 Abs. 1 lit. b DSGVO)" />
        <Bullet text="Beweissicherung gemäß VOB/B §12 (Art. 6 Abs. 1 lit. f DSGVO)" />
        <Bullet text="KI-gestützte Berichterstellung (Art. 6 Abs. 1 lit. a DSGVO – Einwilligung)" />
      </Section>

      <Section title="4. KI-Verarbeitung">
        <P>ProtoKI verwendet KI-Modelle zur Berichterstellung. Dabei gilt:</P>
        <Bullet text="Keine personenbezogenen Daten werden an KI-Dienste übermittelt" />
        <Bullet text="Transkriptionen werden vor der KI-Verarbeitung anonymisiert" />
        <Bullet text="KI-generierte Inhalte sind als solche gekennzeichnet" />
        <Bullet text="Der Nutzer ist für die Prüfung und Freigabe verantwortlich" />
      </Section>

      <Section title="5. Speicherung und Sicherheit">
        <Bullet text="Lokale Daten: Verschlüsselt auf dem Gerät (iOS Keychain / Android Keystore)" />
        <Bullet text="Cloud-Sync: TLS 1.3 verschlüsselt, EU-Rechenzentrum" />
        <Bullet text="Fotos: Verschlüsselt gespeichert, kein Zugriff durch Dritte" />
        <Bullet text="Backups: Automatisch, verschlüsselt, 30 Tage Aufbewahrung" />
      </Section>

      <Section title="6. Ihre Rechte (DSGVO Art. 15-22)">
        <Bullet text="Auskunftsrecht (Art. 15): Export aller Daten unter 'Meine Daten'" />
        <Bullet text="Berichtigungsrecht (Art. 16): Daten jederzeit in der App änderbar" />
        <Bullet text="Löschungsrecht (Art. 17): Vollständige Datenlöschung unter 'Meine Daten'" />
        <Bullet text="Datenübertragbarkeit (Art. 20): JSON-Export aller Daten" />
        <Bullet text="Widerspruchsrecht (Art. 21): KI-Verarbeitung jederzeit deaktivierbar" />
      </Section>

      <Section title="7. Auftragsverarbeitung">
        <P>Für die Cloud-Synchronisation wird ein Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO mit dem Hosting-Anbieter geschlossen. Serverstandort: EU (Deutschland).</P>
      </Section>

      <Section title="8. Kontakt Datenschutzbeauftragter">
        <P>Bei Fragen zum Datenschutz:{"\n"}E-Mail: datenschutz@iserloh.net</P>
      </Section>
    </View>
  );
}

function ImpressumContent() {
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">Impressum</Text>

      <Section title="Angaben gemäß § 5 TMG">
        <P>Iserloh Projektmanagement GmbH{"\n"}Geschäftsführer: Jörg Iserloh</P>
        <P>E-Mail: info@iserloh.net{"\n"}Telefon: Auf Anfrage</P>
      </Section>

      <Section title="Registereintrag">
        <P>Eingetragen im Handelsregister.{"\n"}Registergericht: [Amtsgericht]{"\n"}Registernummer: [HRB-Nummer]</P>
      </Section>

      <Section title="Umsatzsteuer-ID">
        <P>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG:{"\n"}[USt-IdNr.]</P>
      </Section>

      <Section title="Verantwortlich für den Inhalt">
        <P>Jörg Iserloh{"\n"}(Anschrift wie oben)</P>
      </Section>

      <Section title="Haftungsausschluss">
        <P>Die KI-generierten Berichte dienen als Arbeitshilfe und ersetzen nicht die fachliche Prüfung durch qualifiziertes Personal. Der Nutzer ist für die Richtigkeit und Vollständigkeit der freigegebenen Dokumente verantwortlich.</P>
      </Section>
    </View>
  );
}

function AGBContent() {
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">Nutzungsbedingungen</Text>
      <Text className="text-sm text-muted">Stand: Juli 2026</Text>

      <Section title="1. Geltungsbereich">
        <P>Diese Nutzungsbedingungen gelten für die Verwendung der ProtoKI-App durch gewerbliche Nutzer im Bereich Bauwesen und Projektmanagement.</P>
      </Section>

      <Section title="2. Leistungsbeschreibung">
        <P>ProtoKI bietet KI-gestützte Baudokumentation, Mängelmanagement und Berichterstellung. Die App ist ein Werkzeug zur Unterstützung – nicht zum Ersatz – der fachlichen Arbeit des Bauleiters.</P>
      </Section>

      <Section title="3. Pflichten des Nutzers">
        <Bullet text="Prüfung aller KI-generierten Inhalte vor Freigabe" />
        <Bullet text="Sicherstellung der Richtigkeit eingegebener Daten" />
        <Bullet text="Einhaltung des Datenschutzes bei Personenfotos" />
        <Bullet text="Keine Eingabe sensibler personenbezogener Daten in KI-Felder" />
      </Section>

      <Section title="4. Haftungsbeschränkung">
        <P>Die Haftung für KI-generierte Inhalte ist ausgeschlossen. Der Nutzer trägt die Verantwortung für die Prüfung und Freigabe aller Dokumente. ProtoKI haftet nicht für Schäden, die aus der ungeprüften Verwendung von KI-Berichten entstehen.</P>
      </Section>

      <Section title="5. Verfügbarkeit">
        <P>ProtoKI strebt eine Verfügbarkeit von 99% an. Wartungsarbeiten werden vorab angekündigt. Die Offline-Funktionalität gewährleistet die Nutzung ohne Internetverbindung.</P>
      </Section>

      <Section title="6. Kündigung">
        <P>Der Nutzer kann sein Konto jederzeit löschen. Alle Daten werden gemäß DSGVO vollständig entfernt. Gesetzliche Aufbewahrungspflichten bleiben unberührt.</P>
      </Section>
    </View>
  );
}

function KIHinweisContent() {
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">KI-Hinweis</Text>

      <View className="bg-warning/10 border border-warning/30 rounded-lg p-4">
        <Text className="text-sm font-bold text-foreground mb-2">Wichtiger Hinweis zur KI-Nutzung</Text>
        <Text className="text-sm text-foreground leading-5">
          ProtoKI verwendet künstliche Intelligenz zur Unterstützung der Baudokumentation. KI-generierte Inhalte können Fehler enthalten und müssen vor der Verwendung geprüft werden.
        </Text>
      </View>

      <Section title="Was die KI macht">
        <Bullet text="Transkription von Sprachaufnahmen zu Text" />
        <Bullet text="Strukturierung von Protokollen nach Gewerken" />
        <Bullet text="Erstellung von Bautagebüchern aus Tagesdaten" />
        <Bullet text="Zusammenfassung von Mängelbeschreibungen" />
        <Bullet text="Vorschläge für Fristen und Verantwortliche" />
      </Section>

      <Section title="Was die KI NICHT macht">
        <Bullet text="Eigenständige Entscheidungen treffen" />
        <Bullet text="Dokumente ohne Nutzerfreigabe versenden" />
        <Bullet text="Personenbezogene Daten an Dritte weitergeben" />
        <Bullet text="Rechtlich bindende Aussagen treffen" />
      </Section>

      <Section title="Ihre Verantwortung">
        <P>Als Bauleiter/Projektleiter sind Sie verantwortlich für:</P>
        <Bullet text="Prüfung aller KI-generierten Berichte auf Richtigkeit" />
        <Bullet text="Freigabe von Dokumenten vor Weitergabe an Dritte" />
        <Bullet text="Korrektur fehlerhafter KI-Ausgaben" />
        <Bullet text="Sicherstellung der Vollständigkeit der Dokumentation" />
      </Section>

      <Section title="Nachvollziehbarkeit">
        <P>Alle KI-Aktionen werden im Audit-Log protokolliert. Sie können jederzeit nachvollziehen, welche Inhalte KI-generiert wurden und welche manuell erstellt wurden.</P>
      </Section>
    </View>
  );
}

function LizenzenContent() {
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">Open-Source-Lizenzen</Text>
      <P>ProtoKI verwendet folgende Open-Source-Bibliotheken:</P>

      <LicenseItem name="React Native" license="MIT" />
      <LicenseItem name="Expo" license="MIT" />
      <LicenseItem name="NativeWind" license="MIT" />
      <LicenseItem name="tRPC" license="MIT" />
      <LicenseItem name="Drizzle ORM" license="Apache 2.0" />
      <LicenseItem name="React Navigation" license="MIT" />
      <LicenseItem name="AsyncStorage" license="MIT" />
      <LicenseItem name="Expo Router" license="MIT" />
      <LicenseItem name="Tailwind CSS" license="MIT" />
      <LicenseItem name="Zod" license="MIT" />

      <Text className="text-xs text-muted mt-4">
        Vollständige Lizenzinformationen finden Sie in den jeweiligen Paket-Repositories auf GitHub.
      </Text>
    </View>
  );
}

function DSGVOExportContent({
  onExport,
  onDelete,
  exporting,
}: {
  onExport: () => void;
  onDelete: () => void;
  exporting: boolean;
}) {
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">Meine Daten (DSGVO)</Text>

      <Section title="Datenauskunft (Art. 15 DSGVO)">
        <P>Sie haben das Recht, eine Kopie aller über Sie gespeicherten Daten zu erhalten. Der Export enthält alle Projekte, Mängel, Protokolle, Berichte und das Audit-Log.</P>
        <TouchableOpacity
          onPress={onExport}
          disabled={exporting}
          className={`mt-3 px-4 py-3 rounded-lg ${exporting ? "bg-muted" : "bg-primary"}`}
        >
          <Text className="text-background text-center font-semibold">
            {exporting ? "Exportiere..." : "Alle Daten exportieren (JSON)"}
          </Text>
        </TouchableOpacity>
      </Section>

      <Section title="Datenlöschung (Art. 17 DSGVO)">
        <P>Sie können alle Ihre Daten unwiderruflich löschen. Dies umfasst alle lokalen und synchronisierten Daten. Diese Aktion kann nicht rückgängig gemacht werden.</P>
        <TouchableOpacity
          onPress={onDelete}
          className="mt-3 px-4 py-3 rounded-lg bg-error"
        >
          <Text className="text-background text-center font-semibold">
            Alle Daten löschen
          </Text>
        </TouchableOpacity>
      </Section>

      <Section title="Datenberichtigung (Art. 16 DSGVO)">
        <P>Alle Ihre Daten können direkt in der App bearbeitet und korrigiert werden. Änderungen werden im Audit-Log protokolliert.</P>
      </Section>

      <Section title="Widerspruch KI-Verarbeitung (Art. 21 DSGVO)">
        <P>Sie können die KI-Verarbeitung Ihrer Daten jederzeit in den Einstellungen deaktivieren. Bereits generierte Berichte bleiben erhalten.</P>
      </Section>
    </View>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

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

function LicenseItem({ name, license }: { name: string; license: string }) {
  return (
    <View className="flex-row justify-between items-center py-2 border-b border-border">
      <Text className="text-sm text-foreground">{name}</Text>
      <Text className="text-xs text-muted bg-surface px-2 py-1 rounded">{license}</Text>
    </View>
  );
}
