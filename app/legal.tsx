/**
 * BuildKI – Legal & Privacy Screens
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
        k.startsWith("buildki_") || 
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
        title: "BuildKI – Datenexport (DSGVO Art. 15)",
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

      {/* Compact tab navigation — content height must never stretch with the screen */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, maxHeight: 54, borderBottomWidth: 1, borderBottomColor: "#223A55" }}
        contentContainerStyle={{ minHeight: 53, paddingHorizontal: 8, paddingVertical: 5, gap: 6, alignItems: "center" }}
      >
        {sections.map((section) => {
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
                borderRadius: 0,
                borderWidth: 1,
                borderColor: isActive ? "#5BA7D9" : "#223A55",
                backgroundColor: isActive ? "#5BA7D9" : "#12233D",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: isActive ? "#06111D" : "#F4F7FA", fontSize: 13, fontWeight: "700" }}>
                {section.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Only the legal text scrolls vertically */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
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
        <P>immobau-ka GmbH{"\n"}Ringstraße 6, 76228 Karlsruhe{"\n"}Vertreten durch: Dipl. Ing. (FH) Jörg Iserloh{"\n"}E-Mail: info@iserloh.net{"\n"}Registergericht: Amtsgericht Mannheim, HRB 734893</P>
      </Section>

      <Section title="2. Erhobene Daten">
        <P>BuildKI verarbeitet folgende Daten:</P>
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
        <P>BuildKI verwendet KI-Modelle zur Berichterstellung. Dabei gilt:</P>
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
        <P>Bei Fragen zum Datenschutz:{"\n"}immobau-ka GmbH{"\n"}Ringstraße 6, 76228 Karlsruhe{"\n"}E-Mail: info@iserloh.net</P>
      </Section>
    </View>
  );
}

function ImpressumContent() {
  return (
    <View className="gap-4 pb-8">
      <Text className="text-xl font-bold text-foreground">Impressum</Text>

      <Section title="Angaben gemäß § 5 TMG">
        <P>immobau-ka GmbH{"\n"}Ringstraße 6{"\n"}76228 Karlsruhe</P>
        <P>Geschäftsführer: Dipl. Ing. (FH) Jörg Iserloh</P>
        <P>E-Mail: info@iserloh.net{"\n"}Telefon: Auf Anfrage</P>
      </Section>

      <Section title="Registereintrag">
        <P>Eingetragen im Handelsregister.{"\n"}Registergericht: Amtsgericht Mannheim{"\n"}Registernummer: HRB 734893</P>
      </Section>

      <Section title="Steuernummer">
        <P>Steuernummer: 34413/61771{"\n"}Finanzamt Karlsruhe-Durlach</P>
      </Section>

      <Section title="Bankverbindung">
        <P>Sparkasse Karlsruhe{"\n"}IBAN: DE19 6605 0101 0108 2934 40{"\n"}BIC: KARSDE66XXX</P>
      </Section>

      <Section title="Verantwortlich für den Inhalt">
        <P>Dipl. Ing. (FH) Jörg Iserloh{"\n"}Ringstraße 6, 76228 Karlsruhe</P>
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
      <Text className="text-xl font-bold text-foreground">Allgemeine Geschäftsbedingungen</Text>
      <Text className="text-sm text-muted">der immobau-ka GmbH{"\n"}gültig ab 1. Juli 2026</Text>

      <Section title="§ 1 Geltungsbereich">
        <P>1.1 Diese Allgemeinen Geschäftsbedingungen (nachfolgend „AGB“) regeln die vertragliche Beziehung zwischen der immobau-ka GmbH, vertreten durch Dipl. Ing. (FH) Jörg Iserloh (nachfolgend „Anbieter“) und Ihnen als Kunden (nachfolgend „Kunde“) in Bezug auf die Nutzung der mobilen Applikation „BuildKI – Video-Protokoll App“ sowie der zugehörigen Cloud-Dienste (nachfolgend gemeinsam „Software“).</P>
        <P>1.2 Die Software und die zugehörigen Dienste sind ausschließlich für den Geschäftsverkehr (B2B) bestimmt. Die Nutzung ist ausschließlich Unternehmern im Sinne von § 14 BGB gestattet. Der Kunde bestätigt mit Vertragsschluss, dass er in Ausübung seiner gewerblichen oder selbstständigen beruflichen Tätigkeit handelt.</P>
        <P>1.3 Abweichende oder entgegenstehende allgemeine Geschäftsbedingungen des Kunden werden nicht anerkannt, sofern der Anbieter diesen nicht ausdrücklich schriftlich zugestimmt hat.</P>
        <P>1.4 Der Anbieter ist berechtigt, diese AGB mit einer Ankündigungsfrist von sechs (6) Wochen per E-Mail zu ändern. Widerspricht der Kunde nicht innerhalb von vier (4) Wochen nach Zugang der Änderungsmitteilung in Textform, gelten die geänderten AGB als akzeptiert. Der Anbieter weist in der Änderungsmitteilung gesondert auf diese Rechtsfolge hin.</P>
      </Section>

      <Section title="§ 2 Vertragsgegenstand und Leistungsbeschreibung">
        <P>2.1 Der Anbieter stellt dem Kunden die Software „BuildKI“ als Software-as-a-Service (SaaS) in der jeweils aktuellen Version zur Nutzung über das Internet sowie als mobile Applikation (iOS/Android) zur Verfügung.</P>
        <P>2.2 Die Software umfasst insbesondere folgende Funktionen:</P>
        <Bullet text="KI-gestützte Sprachtranskription und Protokollerstellung" />
        <Bullet text="Mängelmanagement mit Fotodokumentation und Statusverfolgung" />
        <Bullet text="3D-Gebäudemodell-Integration (Matterport)" />
        <Bullet text="Automatische Bautagebuch-Erstellung" />
        <Bullet text="PDF-Export mit professionellem Branding" />
        <Bullet text="Cloud-Synchronisation und Offline-Funktionalität" />
        <Bullet text="Push-Benachrichtigungen und Fristenverwaltung" />
        <Bullet text="Team-Kollaboration und Projektverwaltung" />
        <P>2.3 Der Anbieter behält sich vor, die Software jederzeit weiterzuentwickeln und zu ändern. Bei wesentlichen Leistungsänderungen wird der Kunde rechtzeitig vorab informiert. Entstehen dem Kunden durch Leistungsänderungen unzumutbare Nachteile, ist er berechtigt, den Vertrag außerordentlich zum Zeitpunkt der Änderung zu kündigen.</P>
        <P>2.4 Die KI-gestützten Funktionen dienen ausschließlich als Arbeitshilfe. Sie ersetzen nicht die fachliche Prüfung durch qualifiziertes Personal. Der Anbieter übernimmt keine Gewähr für die inhaltliche Richtigkeit KI-generierter Inhalte.</P>
      </Section>

      <Section title="§ 3 Vertragsschluss und Testphase">
        <P>3.1 Der Vertrag kommt durch Registrierung des Kunden in der App und Bestätigung dieser AGB zustande.</P>
        <P>3.2 Jeder Kunde hat die Möglichkeit, die Software für einen Zeitraum von vierzehn (14) Tagen kostenlos und unverbindlich zu testen (Testphase). Während der Testphase stehen alle Funktionen uneingeschränkt zur Verfügung.</P>
        <P>3.3 Nach Ablauf der Testphase wird der Zugang gesperrt, sofern der Kunde kein kostenpflichtiges Abonnement abschließt. Eine automatische Umstellung in ein kostenpflichtiges Abonnement findet nicht statt. Bereits erfasste Daten bleiben für weitere 30 Tage gespeichert.</P>
      </Section>

      <Section title="§ 4 Preise und Zahlungsbedingungen">
        <P>4.1 Für die Nutzung der Software nach Ablauf der Testphase gelten folgende Lizenzgebühren:</P>
        <Bullet text="Monatsabonnement: 10,00 € zzgl. MwSt. pro Lizenz/Monat" />
        <Bullet text="Jahresabonnement: 100,00 € zzgl. MwSt. pro Lizenz/Jahr (ca. 16% Ersparnis)" />
        <P>4.2 Die Abrechnung erfolgt im Voraus. Beim Monatsabonnement monatlich, beim Jahresabonnement jährlich zum Vertragsbeginn.</P>
        <P>4.3 Alle Preise verstehen sich netto zuzüglich der jeweils geltenden gesetzlichen Umsatzsteuer (derzeit 19%).</P>
        <P>4.4 Der Anbieter ist berechtigt, die Preise mit einer Ankündigungsfrist von drei (3) Monaten zum Ende der jeweiligen Vertragslaufzeit anzupassen. Der Kunde hat in diesem Fall ein Sonderkündigungsrecht zum Zeitpunkt des Inkrafttretens der Preisänderung.</P>
        <P>4.5 Bei Zahlungsverzug ist der Anbieter berechtigt, den Zugang zur Software nach erfolgloser Mahnung mit angemessener Nachfrist zu sperren. Die Zahlungspflicht des Kunden bleibt hiervon unberührt.</P>
      </Section>

      <Section title="§ 5 Nutzungsrechte und Lizenzen">
        <P>5.1 Der Anbieter räumt dem Kunden für die Dauer des Vertrages ein nicht-ausschließliches, nicht übertragbares und nicht unterlizenzierbares Recht ein, die Software im vereinbarten Umfang zu nutzen.</P>
        <P>5.2 Eine Lizenz berechtigt zur Nutzung durch eine (1) namentlich benannte natürliche Person. Die gemeinsame Nutzung eines Accounts durch mehrere Personen (Account Sharing) ist nicht gestattet.</P>
        <P>5.3 Der Kunde darf die Software nicht zurückentwickeln, dekompilieren oder disassemblieren, es sei denn, dies ist nach geltendem Recht zwingend gestattet.</P>
        <P>5.4 Alle Rechte an der Software, einschließlich Urheberrechte, Markenrechte und sonstige Schutzrechte, verbleiben beim Anbieter.</P>
        <P>5.5 Die vom Kunden in die Software eingegebenen Daten (Projekte, Protokolle, Fotos, Mängel etc.) verbleiben im Eigentum des Kunden.</P>
      </Section>

      <Section title="§ 6 Pflichten des Kunden">
        <P>6.1 Der Kunde verpflichtet sich:</P>
        <Bullet text="Die Software nur bestimmungsgemäß und im Einklang mit diesen AGB zu verwenden" />
        <Bullet text="Seine Zugangsdaten sicher zu verwahren und Dritten nicht zugänglich zu machen" />
        <Bullet text="Alle KI-generierten Inhalte vor Freigabe und Weitergabe auf Richtigkeit zu prüfen" />
        <Bullet text="Die Richtigkeit der eingegebenen Daten sicherzustellen" />
        <Bullet text="Den Datenschutz bei Personenfotos und personenbezogenen Daten einzuhalten" />
        <Bullet text="Die für die Nutzung erforderliche IT-Infrastruktur auf eigene Kosten bereitzuhalten" />
        <P>6.2 Der Kunde haftet für sämtliche Handlungen, die über seinen Account erfolgen, auch wenn diese nicht von ihm autorisiert waren, sofern er die unbefugte Nutzung zu vertreten hat.</P>
        <P>6.3 Der Kunde wird den Anbieter unverzüglich informieren, wenn er Kenntnis von einer unbefugten Nutzung seines Accounts erlangt.</P>
      </Section>

      <Section title="§ 7 Verfügbarkeit und Wartung">
        <P>7.1 Der Anbieter strebt eine Verfügbarkeit der Cloud-Dienste von 99% im Jahresdurchschnitt an. Nicht eingerechnet werden:</P>
        <Bullet text="Geplante Wartungsarbeiten (werden mind. 24 Stunden vorab angekündigt)" />
        <Bullet text="Ausfälle durch höhere Gewalt oder Umstände außerhalb des Einflussbereichs" />
        <Bullet text="Störungen der Internetverbindung des Kunden" />
        <P>7.2 Die Offline-Funktionalität der App gewährleistet die lokale Nutzung auch ohne Internetverbindung. Eine Synchronisation erfolgt automatisch bei Wiederherstellung der Verbindung.</P>
        <P>7.3 Geplante Wartungsarbeiten werden nach Möglichkeit außerhalb der üblichen Geschäftszeiten (Mo–Fr, 08:00–18:00 Uhr) durchgeführt.</P>
      </Section>

      <Section title="§ 8 Gewährleistung und Haftung">
        <P>8.1 Der Anbieter stellt die Software nach dem Grundsatz der „bestmöglichen Bemühungen“ (Best Efforts) zur Verfügung.</P>
        <P>8.2 Der Anbieter haftet nicht für:</P>
        <Bullet text="Die inhaltliche Richtigkeit KI-generierter Protokolle, Berichte und Analysen" />
        <Bullet text="Schäden aus der ungeprüften Verwendung KI-generierter Inhalte" />
        <Bullet text="Datenverluste, die auf Handlungen des Kunden zurückzuführen sind" />
        <Bullet text="Funktionsstörungen aufgrund unzureichender IT-Infrastruktur des Kunden" />
        <Bullet text="Mittelbare Schäden, entgangenen Gewinn oder Folgeschäden" />
        <P>8.3 Die Haftung ist – außer bei Vorsatz und grober Fahrlässigkeit – auf den vorhersehbaren, vertragstypischen Schaden begrenzt, maximal auf die vom Kunden in den letzten 12 Monaten gezahlten Lizenzgebühren.</P>
        <P>8.4 Die vorstehenden Haftungsbeschränkungen gelten nicht für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie für Ansprüche nach dem Produkthaftungsgesetz.</P>
      </Section>

      <Section title="§ 9 Datenschutz und Datensicherheit">
        <P>9.1 Der Anbieter verarbeitet personenbezogene Daten ausschließlich gemäß der geltenden Datenschutzerklärung und im Einklang mit der DSGVO.</P>
        <P>9.2 Soweit der Anbieter im Auftrag des Kunden personenbezogene Daten verarbeitet, wird ein Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO geschlossen.</P>
        <P>9.3 Die Datenverarbeitung erfolgt auf Servern in der Europäischen Union (Deutschland). Eine Übermittlung in Drittländer findet nicht statt.</P>
        <P>9.4 Bei der KI-Verarbeitung werden Texte vor der Analyse anonymisiert. Keine personenbezogenen Daten werden an KI-Dienste übermittelt.</P>
      </Section>

      <Section title="§ 10 Vertragslaufzeit und Kündigung">
        <P>10.1 Das Monatsabonnement hat eine Mindestlaufzeit von einem (1) Monat und verlängert sich automatisch um jeweils einen weiteren Monat, sofern es nicht mit einer Frist von vierzehn (14) Tagen zum Ende der jeweiligen Laufzeit gekündigt wird.</P>
        <P>10.2 Das Jahresabonnement hat eine Mindestlaufzeit von zwölf (12) Monaten und verlängert sich automatisch um jeweils zwölf weitere Monate, sofern es nicht mit einer Frist von einem (1) Monat zum Ende der jeweiligen Laufzeit gekündigt wird.</P>
        <P>10.3 Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Ein wichtiger Grund liegt insbesondere vor bei:</P>
        <Bullet text="Wesentlichem Verstoß gegen diese AGB trotz Abmahnung" />
        <Bullet text="Zahlungsverzug des Kunden von mehr als 30 Tagen trotz Mahnung" />
        <Bullet text="Insolvenzantrag über das Vermögen einer Vertragspartei" />
        <P>10.4 Die Kündigung bedarf der Textform (E-Mail genügt). Die Kündigung kann auch direkt in der App unter Einstellungen vorgenommen werden.</P>
        <P>10.5 Nach Vertragsende stehen dem Kunden seine Daten für einen Zeitraum von dreißig (30) Tagen zum Export zur Verfügung. Danach werden alle Kundendaten unwiderruflich gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</P>
      </Section>

      <Section title="§ 11 Geistiges Eigentum">
        <P>11.1 Sämtliche Rechte an der Software, einschließlich des Quellcodes, der Benutzeroberfläche, der Dokumentation und aller Weiterentwicklungen, stehen ausschließlich dem Anbieter zu.</P>
        <P>11.2 Die vom Kunden erstellten Inhalte (Protokolle, Berichte, Fotos, Mängeldokumentation) verbleiben im geistigen Eigentum des Kunden.</P>
        <P>11.3 Der Kunde gestattet dem Anbieter, anonymisierte und aggregierte Nutzungsdaten zur Verbesserung der Software zu verwenden.</P>
      </Section>

      <Section title="§ 12 Vertraulichkeit">
        <P>12.1 Beide Parteien verpflichten sich, alle im Rahmen der Vertragsbeziehung erlangten vertraulichen Informationen der jeweils anderen Partei geheim zu halten und nur für die Zwecke dieses Vertrages zu verwenden.</P>
        <P>12.2 Diese Verpflichtung gilt nicht für Informationen, die öffentlich bekannt sind, dem Empfänger bereits bekannt waren oder von Dritten rechtmäßig erlangt wurden.</P>
        <P>12.3 Die Vertraulichkeitsverpflichtung besteht über das Vertragsende hinaus für einen Zeitraum von drei (3) Jahren fort.</P>
      </Section>

      <Section title="§ 13 Schlussbestimmungen">
        <P>13.1 Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG).</P>
        <P>13.2 Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesem Vertrag ist – soweit gesetzlich zulässig – der Sitz des Anbieters.</P>
        <P>13.3 Sollten einzelne Bestimmungen dieser AGB unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. An die Stelle der unwirksamen Bestimmung tritt eine wirksame Regelung, die dem wirtschaftlichen Zweck am nächsten kommt.</P>
        <P>13.4 Änderungen und Ergänzungen dieser AGB bedürfen der Textform.</P>
        <P>13.5 Der Anbieter ist berechtigt, Rechte und Pflichten aus diesem Vertrag ganz oder teilweise auf Dritte zu übertragen, sofern dies für den Kunden zumutbar ist.</P>
      </Section>

      <Section title="Kontakt">
        <P>immobau-ka GmbH{"\n"}Ringstraße 6, 76228 Karlsruhe{"\n"}Geschäftsführer: Dipl. Ing. (FH) Jörg Iserloh{"\n"}E-Mail: info@iserloh.net</P>
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
          BuildKI verwendet künstliche Intelligenz zur Unterstützung der Baudokumentation. KI-generierte Inhalte können Fehler enthalten und müssen vor der Verwendung geprüft werden.
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
      <P>BuildKI verwendet folgende Open-Source-Bibliotheken:</P>

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
