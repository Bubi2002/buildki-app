#!/usr/bin/env python3
"""
Complete i18n implementation:
1. Read all German strings from app files
2. Generate translation keys automatically
3. Use an LLM-free approach: auto-translate using a mapping
4. Rewrite i18n.ts with all keys
5. Apply t() calls to all files
"""
import re
import os
import unicodedata

os.chdir('/home/ubuntu/protokoll-app')

# Read existing i18n.ts to preserve current keys
with open('lib/i18n.ts', 'r') as f:
    existing_i18n = f.read()

# Extract existing DE keys
existing_de = {}
de_match = re.search(r'de:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}', existing_i18n, re.DOTALL)
if de_match:
    for m in re.finditer(r"(\w+):\s*['\"](.+?)['\"]", de_match.group(1)):
        existing_de[m.group(1)] = m.group(2)

# Read all German strings from files
all_strings = set()
app_files = []
for root, dirs, files in os.walk('app'):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            filepath = os.path.join(root, f)
            app_files.append(filepath)
            with open(filepath, 'r') as fh:
                content = fh.read()
            # Find >German text< patterns
            for m in re.finditer(r'>([A-ZÄÖÜ][^<]{1,80})<', content):
                text = m.group(1).strip()
                # Skip interpolated strings and very short ones
                if '{' not in text and len(text) > 1:
                    all_strings.add(text)

# Also find strings in title="..." placeholder="..." etc
for filepath in app_files:
    with open(filepath, 'r') as fh:
        content = fh.read()
    for prop in ['title', 'placeholder', 'label', 'accessibilityLabel']:
        for m in re.finditer(rf'{prop}="([A-ZÄÖÜ][^"{{]+)"', content):
            text = m.group(1).strip()
            if len(text) > 1:
                all_strings.add(text)

def make_key(text):
    """Generate a translation key from German text."""
    # Normalize unicode
    t = text.lower()
    # Replace umlauts
    t = t.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    # Remove special chars, keep alphanumeric and spaces
    t = re.sub(r'[^a-z0-9\s]', '', t)
    # Split and take first 4 words
    words = t.split()[:4]
    key = '_'.join(words)
    # Limit length
    if len(key) > 40:
        key = key[:40]
    return key

# Build the complete translation dictionary
# Start with existing keys
de_translations = dict(existing_de)

# Map from German text to key
text_to_key = {}

# First, map existing keys by their values
for key, val in existing_de.items():
    text_to_key[val] = key

# Add all new strings
for text in sorted(all_strings):
    if text in text_to_key:
        continue
    key = make_key(text)
    # Ensure uniqueness
    if key in de_translations:
        key = key + '_2'
    if key in de_translations:
        key = key + '_3'
    text_to_key[text] = key
    de_translations[key] = text

# English translations (manual mapping for common terms + auto-generated)
EN_MAP = {
    'Abbrechen': 'Cancel', 'Abschließen': 'Finish', 'Abmelden': 'Sign out',
    'Aktivität': 'Activity', 'Aktuell': 'Current', 'Alle': 'All',
    'Annotieren': 'Annotate', 'Anmelden': 'Sign in', 'Archiv': 'Archive',
    'Aufgabe': 'Task', 'Aufgaben': 'Tasks', 'Aufnahme': 'Recording',
    'Backup': 'Backup', 'Bearbeiten': 'Edit', 'Benachrichtigungen': 'Notifications',
    'Beschreibung': 'Description', 'Bilder': 'Images', 'Dashboard': 'Dashboard',
    'Datensicherung': 'Data Backup', 'Datum': 'Date', 'Deutsch': 'German',
    'Dropbox': 'Dropbox', 'Einstellungen': 'Settings', 'E-Mail': 'Email',
    'Empfänger': 'Recipients', 'Entfernen': 'Remove', 'Erledigt': 'Done',
    'Export': 'Export', 'Favoriten': 'Favorites', 'Fehler': 'Error',
    'Fertig': 'Done', 'Filter': 'Filter', 'Fortsetzen': 'Resume',
    'Fotos': 'Photos', 'Gesendet': 'Sent', 'Gespeichert': 'Saved',
    'Hoch': 'High', 'Kalender': 'Calendar', 'Kapitel': 'Chapter',
    'Kopieren': 'Copy', 'Laden': 'Loading', 'Löschen': 'Delete',
    'Mittel': 'Medium', 'Neu': 'New', 'Niedrig': 'Low',
    'Offen': 'Open', 'Optionen': 'Options', 'Pause': 'Pause',
    'Priorität': 'Priority', 'Projekt': 'Project', 'Projekte': 'Projects',
    'Protokoll': 'Protocol', 'Protokolle': 'Protocols', 'Schließen': 'Close',
    'Senden': 'Send', 'Sortieren': 'Sort', 'Speichern': 'Save',
    'Sprache': 'Language', 'Starten': 'Start', 'Suchen': 'Search',
    'Teilen': 'Share', 'Versionen': 'Versions', 'Vorschau': 'Preview',
    'Weiter': 'Next', 'WhatsApp': 'WhatsApp', 'Wiederherstellen': 'Restore',
    'Zeit': 'Time', 'Zoom': 'Zoom', 'Zurück': 'Back',
    'Zusammenfassung': 'Summary', 'Ändern': 'Change', 'Überspringen': 'Skip',
    'Übersetzung': 'Translation',
    # Longer strings
    'Aufnahme beenden?': 'End recording?',
    'Aufnahme läuft...': 'Recording...',
    'Aufgaben-Erinnerungen': 'Task Reminders',
    'Alle Erinnerungen ein/ausschalten': 'Enable/disable all reminders',
    'Alle gesendeten PDFs anzeigen': 'View all sent PDFs',
    'Anderes Template oder Format wählen': 'Choose different template or format',
    'App-Sperre': 'App Lock',
    'App-Sprache auswählen': 'Select app language',
    'App-Sprache für internationale Baustellen': 'App language for international construction sites',
    'Auto-Versand': 'Auto-send',
    'Auto-Bericht': 'Auto Report',
    'Auto-Bericht Einstellungen': 'Auto Report Settings',
    'Auto-Sync': 'Auto-Sync',
    'Automatischer PDF-Upload in deinen Dropbox-Ordner': 'Automatic PDF upload to your Dropbox folder',
    'Benachrichtigungen bei fälligen Aufgaben': 'Notifications for due tasks',
    'Biometrische Sperre': 'Biometric Lock',
    'Datensicherung': 'Data Backup',
    'Dropbox-Einstellungen': 'Dropbox Settings',
    'Eigene Vorlage erstellen': 'Create custom template',
    'Erinnerungen aktiv': 'Reminders active',
    'Erinnerung bei offenen Prüfpunkten': 'Reminder for open checkpoints',
    'Export-Verlauf': 'Export History',
    'Face ID zum Entsperren der App verwenden': 'Use Face ID to unlock the app',
    'Firmendaten': 'Company Data',
    'Firmenlogo': 'Company Logo',
    'Firmenlogo und Kopf-/Fußzeile für exportierte PDFs': 'Company logo and header/footer for exported PDFs',
    'Firmenstempel als Wasserzeichen im PDF anzeigen': 'Show company stamp as watermark in PDF',
    'Foto aufnehmen': 'Take photo',
    'Fotos hinzufügen': 'Add photos',
    'Gute Qualität': 'Good quality',
    'Halte gedrückt zum Teilen': 'Hold to share',
    'Kalender-Ansicht': 'Calendar View',
    'Kapitel gesetzt': 'Chapter set',
    'Kernpunkte auf einen Blick': 'Key points at a glance',
    'KI-Werkzeuge': 'AI Tools',
    'Kopf- & Fußzeile': 'Header & Footer',
    'Logo, Firmendaten, Farben': 'Logo, company data, colors',
    'Mikrofon-Zugriff benötigt': 'Microphone access required',
    'Kamera-Zugriff benötigt': 'Camera access required',
    'Mittlere Qualität': 'Medium quality',
    'Morgens an offene Aufgaben erinnern': 'Morning reminder for open tasks',
    'Neues Kapitel': 'New chapter',
    'Neues Projekt': 'New project',
    'Offene Mängel': 'Open Defects',
    'PDF-Branding': 'PDF Branding',
    'PDF-Layout anpassen': 'Customize PDF layout',
    'PDFs automatisch in Dropbox speichern': 'Automatically save PDFs to Dropbox',
    'Personen im Gespräch identifizieren': 'Identify people in conversation',
    'Protokoll wird erstellt': 'Creating protocol',
    'Protokoll-Vorlage': 'Protocol Template',
    'Protokolle in Timeline anzeigen': 'View protocols in timeline',
    'Schlechte Qualität': 'Poor quality',
    'Seitenzahlen': 'Page Numbers',
    'Sprecher erkennen': 'Identify speakers',
    'Standard-Vorlagen': 'Standard Templates',
    'Starte eine Aufnahme': 'Start a recording',
    'Tägliche Erinnerung bei offenen Mängeln': 'Daily reminder for open defects',
    'Tägliche Zusammenfassung': 'Daily Summary',
    'Tippe zum Starten': 'Tap to start',
    'Tippe zum Vergrößern': 'Tap to enlarge',
    'Transkription läuft': 'Transcribing',
    'Verarbeitung läuft': 'Processing',
    'Vorher/Nachher': 'Before/After',
    'Foto-Vergleiche für Fortschrittsdoku': 'Photo comparisons for progress documentation',
    'Wasserzeichen aktiv': 'Watermark active',
    'Wasserzeichen / Stempel': 'Watermark / Stamp',
    'WhatsApp-Nummer': 'WhatsApp Number',
    'Wiederkehrende Meetings': 'Recurring Meetings',
    'Wird diagonal über jede PDF-Seite gelegt': 'Applied diagonally on every PDF page',
    'Wird in der Kopfzeile des PDFs angezeigt': 'Displayed in the PDF header',
    'Wähle die Standard-Vorlage für neue Protokolle': 'Choose default template for new protocols',
    'Akzentfarbe': 'Accent Color',
    'Berechtigung erteilen': 'Grant permission',
    'Bitte warten': 'Please wait',
    'Checklisten': 'Checklists',
    'Deckblatt': 'Cover Page',
    'Deutsch, English, Français': 'Deutsch, English, Français',
    'Erscheinen in der Fußzeile': 'Shown in the footer',
    'Fußzeile': 'Footer',
    'Gewerk': 'Trade',
    'Hilfe & Support': 'Help & Support',
    'Ja, abschließen': 'Yes, finish',
    'Keine Protokolle': 'No protocols',
    'Kopfzeile (optional)': 'Header (optional)',
    'Mängelliste': 'Defect List',
    'Neu generieren': 'Regenerate',
    'Ort': 'Location',
    'Sprache / Language': 'Language',
    'Verbinden': 'Connect',
    'Verbunden': 'Connected',
    'Trennen': 'Disconnect',
    'Zielordner': 'Target folder',
    'Wöchentlich': 'Weekly',
    'Monatlich': 'Monthly',
    'Täglich': 'Daily',
    'Häufigkeit': 'Frequency',
    'Aufgabenboard': 'Task Board',
    'Neue Aufgabe': 'New task',
    'Zu erledigen': 'To do',
    'In Arbeit': 'In progress',
    'Automatische Berichte': 'Automatic Reports',
    'Neuer Termin': 'New appointment',
    'Wochentage': 'Weekdays',
    'Jeden Tag': 'Every day',
    'Stunde': 'Hour',
    'Minute': 'Minute',
    'Farbe der Kopfzeilen-Linie': 'Color of the header line',
    'Seite X / Y in der Fußzeile': 'Page X / Y in footer',
    'Aktuelles Datum in der Fußzeile': 'Current date in footer',
    'Deckblatt mit Logo und Titel': 'Cover page with logo and title',
    'Zurücksetzen': 'Reset',
    'Firmenname': 'Company name',
    'Adresse / Kontakt': 'Address / Contact',
    'Telefon / E-Mail': 'Phone / Email',
    'Logo hochladen': 'Upload logo',
    'Logo ausgewählt': 'Logo selected',
    'Empfohlen: 300x100px, PNG/JPG': 'Recommended: 300x100px, PNG/JPG',
    'Projektname in der Kopfzeile': 'Project name in header',
    'Datum anzeigen': 'Show date',
    'Aufnahme starten': 'Start recording',
    'Aufnahme pausiert': 'Recording paused',
    'Möchtest du die Aufnahme beenden und das Protokoll erstellen?': 'Do you want to end the recording and create the protocol?',
    'Foto-Wasserzeichen': 'Photo Watermark',
    'Datum und Projektname dezent auf jedem Foto': 'Date and project name subtly on each photo',
    'E-Mail-Versand': 'Email Delivery',
    'Mehrere Adressen mit Komma trennen': 'Separate multiple addresses with comma',
    'PDF automatisch nach Protokoll-Erstellung senden': 'Automatically send PDF after protocol creation',
    'Dateiname': 'Filename',
    'Schema für den PDF-Dateinamen': 'Pattern for PDF filename',
    'PDF-Layout': 'PDF Layout',
    'Wähle das Layout für den PDF-Export': 'Choose layout for PDF export',
    'Layout-Anpassung': 'Layout Adjustment',
    'Transkription anzeigen': 'Show transcription',
    'Originaler Sprachtext unter dem Protokoll': 'Original speech text below the protocol',
    'Professionelles Deckblatt mit Logo, Titel und Projektinfo': 'Professional cover with logo, title and project info',
    'Deckblatt-Vorschau': 'Cover Preview',
    'Beispielprojekt': 'Example Project',
    'Willkommen im Dashboard': 'Welcome to Dashboard',
    'Aktivität (30 Tage)': 'Activity (30 days)',
    'Wöchentliche Aktivität': 'Weekly Activity',
    'Keine Projekte': 'No projects',
    'Projekt erstellen': 'Create project',
    'Projektname': 'Project name',
    'Kein Projekt': 'No project',
    'Alle Protokolle': 'All protocols',
    'Neueste zuerst': 'Newest first',
    'Älteste zuerst': 'Oldest first',
    'Projekt löschen': 'Delete project',
    'Projekt bearbeiten': 'Edit project',
    'Mitglieder': 'Members',
    'Projektdetails': 'Project details',
    'Aufgabe hinzufügen': 'Add task',
    'Aufgabe bearbeiten': 'Edit task',
    'Aufgabe delegieren': 'Delegate task',
    'Protokolle zusammenführen': 'Merge protocols',
    'Zusammenführen': 'Merge',
    'Protokolle auswählen': 'Select protocols',
    'Fotos exportieren': 'Export photos',
    'Exportieren': 'Export',
    'Vorlage erstellen': 'Create template',
    'Vorlage bearbeiten': 'Edit template',
    'Vorlagenname': 'Template name',
    'Abschnitte': 'Sections',
    'Neuer Abschnitt': 'New section',
    'Vorlage speichern': 'Save template',
    'Wie kann ich helfen?': 'How can I help?',
    'Termin erstellen': 'Create appointment',
    'Wiederholung': 'Recurrence',
    'Automatisch hochladen': 'Auto upload',
    'Arbeitszeit': 'Working hours',
    'Zeiterfassung': 'Time Tracking',
    'Wetterdaten einbeziehen': 'Include weather data',
    'Wochenbericht': 'Weekly Report',
    'In Bearbeitung': 'In progress',
    'Mangel hinzufügen': 'Add defect',
    'Neuer Mangel': 'New defect',
    'Beschreibung des Mangels': 'Defect description',
    'Zuständig:': 'Responsible:',
    'Alle Gewerke': 'All trades',
    'Vergleichen': 'Compare',
    'Vergleich': 'Comparison',
    'Vollansicht': 'Full view',
    'Verlauf': 'History',
    'Werkzeuge': 'Tools',
    'Agenda speichern': 'Save agenda',
    'Agenda-Punkt hinzufügen': 'Add agenda item',
    'Agenda-Vorbereitung': 'Agenda Preparation',
    'Teilnehmer': 'Participants',
    'Nächster Termin': 'Next appointment',
    'Erinnerungen konfigurieren': 'Configure reminders',
    'Vorkommnisse': 'Incidents',
    'Vorlage (optional)': 'Template (optional)',
    'Vorlage wählen': 'Choose template',
    'Vorlagen entdecken und teilen': 'Discover and share templates',
    'Vorlagen-Marktplatz': 'Template Marketplace',
    'Vorlagen-Nutzung': 'Template Usage',
    'Vorschau testen': 'Test preview',
    'Wann soll die Erinnerung kommen?': 'When should the reminder come?',
    'An welchen Tagen erinnern?': 'On which days to remind?',
    'Abendliche Push mit Tagesübersicht': 'Evening push with daily overview',
    'Verfügbare Checklisten': 'Available checklists',
    'Keine Exporte': 'No exports',
    'Noch keine PDFs exportiert': 'No PDFs exported yet',
    'Archiv leer': 'Archive empty',
    'Aus Kontakten': 'From contacts',
    'Zu den Einstellungen': 'Go to settings',
    'Zum Protokoll': 'Go to protocol',
    'Wird neu generiert...': 'Regenerating...',
    'Wähle ein Projekt oder starte ohne Zuordnung': 'Choose a project or start without assignment',
}

# French translations
FR_MAP = {
    'Abbrechen': 'Annuler', 'Abschließen': 'Terminer', 'Abmelden': 'Se déconnecter',
    'Aktivität': 'Activité', 'Aktuell': 'Actuel', 'Alle': 'Tous',
    'Annotieren': 'Annoter', 'Anmelden': 'Se connecter', 'Archiv': 'Archives',
    'Aufgabe': 'Tâche', 'Aufgaben': 'Tâches', 'Aufnahme': 'Enregistrement',
    'Backup': 'Sauvegarde', 'Bearbeiten': 'Modifier', 'Benachrichtigungen': 'Notifications',
    'Beschreibung': 'Description', 'Dashboard': 'Tableau de bord',
    'Datensicherung': 'Sauvegarde des données', 'Datum': 'Date',
    'Dropbox': 'Dropbox', 'Einstellungen': 'Paramètres', 'E-Mail': 'E-mail',
    'Empfänger': 'Destinataires', 'Entfernen': 'Supprimer', 'Erledigt': 'Terminé',
    'Export': 'Export', 'Favoriten': 'Favoris', 'Fehler': 'Erreur',
    'Fertig': 'Terminé', 'Filter': 'Filtre', 'Fortsetzen': 'Reprendre',
    'Fotos': 'Photos', 'Gesendet': 'Envoyé', 'Gespeichert': 'Enregistré',
    'Hoch': 'Haute', 'Kalender': 'Calendrier', 'Kapitel': 'Chapitre',
    'Kopieren': 'Copier', 'Laden': 'Chargement', 'Löschen': 'Supprimer',
    'Mittel': 'Moyen', 'Neu': 'Nouveau', 'Niedrig': 'Basse',
    'Offen': 'Ouvert', 'Optionen': 'Options', 'Pause': 'Pause',
    'Priorität': 'Priorité', 'Projekt': 'Projet', 'Projekte': 'Projets',
    'Protokoll': 'Protocole', 'Protokolle': 'Protocoles', 'Schließen': 'Fermer',
    'Senden': 'Envoyer', 'Sortieren': 'Trier', 'Speichern': 'Enregistrer',
    'Sprache': 'Langue', 'Starten': 'Démarrer', 'Suchen': 'Rechercher',
    'Teilen': 'Partager', 'Versionen': 'Versions', 'Vorschau': 'Aperçu',
    'Weiter': 'Suivant', 'WhatsApp': 'WhatsApp', 'Wiederherstellen': 'Restaurer',
    'Zeit': 'Heure', 'Zoom': 'Zoom', 'Zurück': 'Retour',
    'Zusammenfassung': 'Résumé', 'Ändern': 'Modifier', 'Überspringen': 'Passer',
    'Übersetzung': 'Traduction',
    'Aufnahme beenden?': "Terminer l'enregistrement ?",
    'Aufnahme läuft...': 'Enregistrement...',
    'Aufgaben-Erinnerungen': 'Rappels de tâches',
    'Alle Erinnerungen ein/ausschalten': 'Activer/désactiver tous les rappels',
    'Alle gesendeten PDFs anzeigen': 'Voir tous les PDFs envoyés',
    'Anderes Template oder Format wählen': 'Choisir un autre modèle ou format',
    'App-Sperre': "Verrouillage de l'app",
    'App-Sprache auswählen': "Sélectionner la langue de l'app",
    'App-Sprache für internationale Baustellen': 'Langue pour les chantiers internationaux',
    'Auto-Versand': 'Envoi automatique',
    'Auto-Bericht': 'Rapport automatique',
    'Auto-Bericht Einstellungen': 'Paramètres du rapport automatique',
    'Auto-Sync': 'Synchronisation auto',
    'Automatischer PDF-Upload in deinen Dropbox-Ordner': 'Upload PDF automatique vers votre dossier Dropbox',
    'Benachrichtigungen bei fälligen Aufgaben': 'Notifications pour les tâches dues',
    'Biometrische Sperre': 'Verrouillage biométrique',
    'Dropbox-Einstellungen': 'Paramètres Dropbox',
    'Eigene Vorlage erstellen': 'Créer un modèle personnalisé',
    'Erinnerungen aktiv': 'Rappels actifs',
    'Erinnerung bei offenen Prüfpunkten': 'Rappel pour les points de contrôle ouverts',
    'Export-Verlauf': "Historique d'export",
    'Face ID zum Entsperren der App verwenden': "Utiliser Face ID pour déverrouiller l'app",
    'Firmendaten': "Données de l'entreprise",
    'Firmenlogo': "Logo de l'entreprise",
    'Firmenlogo und Kopf-/Fußzeile für exportierte PDFs': "Logo et en-tête/pied de page pour les PDFs exportés",
    'Firmenstempel als Wasserzeichen im PDF anzeigen': "Afficher le tampon d'entreprise en filigrane",
    'Foto aufnehmen': 'Prendre une photo',
    'Fotos hinzufügen': 'Ajouter des photos',
    'Gute Qualität': 'Bonne qualité',
    'Halte gedrückt zum Teilen': 'Maintenez pour partager',
    'Kalender-Ansicht': 'Vue calendrier',
    'Kapitel gesetzt': 'Chapitre défini',
    'Kernpunkte auf einen Blick': "Points clés en un coup d'oeil",
    'KI-Werkzeuge': 'Outils IA',
    'Kopf- & Fußzeile': 'En-tête & pied de page',
    'Logo, Firmendaten, Farben': "Logo, données d'entreprise, couleurs",
    'Mikrofon-Zugriff benötigt': 'Accès au microphone requis',
    'Kamera-Zugriff benötigt': 'Accès à la caméra requis',
    'Mittlere Qualität': 'Qualité moyenne',
    'Morgens an offene Aufgaben erinnern': 'Rappel matinal des tâches ouvertes',
    'Neues Kapitel': 'Nouveau chapitre',
    'Neues Projekt': 'Nouveau projet',
    'Offene Mängel': 'Défauts ouverts',
    'PDF-Branding': 'Branding PDF',
    'PDF-Layout anpassen': 'Personnaliser la mise en page PDF',
    'PDFs automatisch in Dropbox speichern': 'Enregistrer automatiquement les PDFs dans Dropbox',
    'Personen im Gespräch identifizieren': 'Identifier les personnes dans la conversation',
    'Protokoll wird erstellt': 'Création du protocole',
    'Protokoll-Vorlage': 'Modèle de protocole',
    'Protokolle in Timeline anzeigen': 'Voir les protocoles en chronologie',
    'Schlechte Qualität': 'Mauvaise qualité',
    'Seitenzahlen': 'Numéros de page',
    'Sprecher erkennen': 'Identifier les intervenants',
    'Standard-Vorlagen': 'Modèles standard',
    'Starte eine Aufnahme': 'Démarrez un enregistrement',
    'Tägliche Erinnerung bei offenen Mängeln': 'Rappel quotidien pour les défauts ouverts',
    'Tägliche Zusammenfassung': 'Résumé quotidien',
    'Tippe zum Starten': 'Appuyez pour démarrer',
    'Tippe zum Vergrößern': 'Appuyez pour agrandir',
    'Transkription läuft': 'Transcription en cours',
    'Verarbeitung läuft': 'Traitement en cours',
    'Vorher/Nachher': 'Avant/Après',
    'Foto-Vergleiche für Fortschrittsdoku': 'Comparaisons photo pour la documentation',
    'Wasserzeichen aktiv': 'Filigrane actif',
    'Wasserzeichen / Stempel': 'Filigrane / Tampon',
    'WhatsApp-Nummer': 'Numéro WhatsApp',
    'Wiederkehrende Meetings': 'Réunions récurrentes',
    'Wird diagonal über jede PDF-Seite gelegt': 'Appliqué en diagonale sur chaque page PDF',
    'Wird in der Kopfzeile des PDFs angezeigt': "Affiché dans l'en-tête du PDF",
    'Wähle die Standard-Vorlage für neue Protokolle': 'Choisir le modèle par défaut pour les nouveaux protocoles',
    'Akzentfarbe': "Couleur d'accent",
    'Berechtigung erteilen': 'Accorder la permission',
    'Bitte warten': 'Veuillez patienter',
    'Checklisten': 'Checklists',
    'Deckblatt': 'Page de couverture',
    'Deutsch, English, Français': 'Deutsch, English, Français',
    'Erscheinen in der Fußzeile': 'Affichées dans le pied de page',
    'Fußzeile': 'Pied de page',
    'Gewerk': 'Corps de métier',
    'Hilfe & Support': 'Aide & Support',
    'Ja, abschließen': 'Oui, terminer',
    'Keine Protokolle': 'Aucun protocole',
    'Kopfzeile (optional)': 'En-tête (optionnel)',
    'Mängelliste': 'Liste des défauts',
    'Neu generieren': 'Régénérer',
    'Ort': 'Lieu',
    'Sprache / Language': 'Langue',
    'Verbinden': 'Connecter',
    'Verbunden': 'Connecté',
    'Trennen': 'Déconnecter',
    'Zielordner': 'Dossier cible',
    'Wöchentlich': 'Hebdomadaire',
    'Monatlich': 'Mensuel',
    'Täglich': 'Quotidien',
    'Häufigkeit': 'Fréquence',
    'Aufgabenboard': 'Tableau des tâches',
    'Neue Aufgabe': 'Nouvelle tâche',
    'Zu erledigen': 'À faire',
    'In Arbeit': 'En cours',
    'Automatische Berichte': 'Rapports automatiques',
    'Neuer Termin': 'Nouveau rendez-vous',
    'Wochentage': 'Jours de la semaine',
    'Jeden Tag': 'Chaque jour',
    'Stunde': 'Heure',
    'Minute': 'Minute',
    'Farbe der Kopfzeilen-Linie': "Couleur de la ligne d'en-tête",
    'Seite X / Y in der Fußzeile': 'Page X / Y en pied de page',
    'Aktuelles Datum in der Fußzeile': 'Date actuelle en pied de page',
    'Deckblatt mit Logo und Titel': 'Page de couverture avec logo et titre',
    'Zurücksetzen': 'Réinitialiser',
    'Firmenname': "Nom de l'entreprise",
    'Adresse / Kontakt': 'Adresse / Contact',
    'Telefon / E-Mail': 'Téléphone / E-mail',
    'Logo hochladen': 'Télécharger le logo',
    'Logo ausgewählt': 'Logo sélectionné',
    'Empfohlen: 300x100px, PNG/JPG': 'Recommandé : 300x100px, PNG/JPG',
    'Projektname in der Kopfzeile': "Nom du projet dans l'en-tête",
    'Datum anzeigen': 'Afficher la date',
    'Aufnahme starten': "Démarrer l'enregistrement",
    'Aufnahme pausiert': 'Enregistrement en pause',
    'Möchtest du die Aufnahme beenden und das Protokoll erstellen?': "Voulez-vous terminer l'enregistrement et créer le protocole ?",
    'Foto-Wasserzeichen': 'Filigrane photo',
    'Datum und Projektname dezent auf jedem Foto': 'Date et nom du projet discrètement sur chaque photo',
    'E-Mail-Versand': 'Envoi par e-mail',
    'Mehrere Adressen mit Komma trennen': 'Séparer les adresses par des virgules',
    'PDF automatisch nach Protokoll-Erstellung senden': 'Envoyer le PDF automatiquement après la création du protocole',
    'Dateiname': 'Nom de fichier',
    'Schema für den PDF-Dateinamen': 'Schéma pour le nom de fichier PDF',
    'PDF-Layout': 'Mise en page PDF',
    'Wähle das Layout für den PDF-Export': "Choisir la mise en page pour l'export PDF",
    'Layout-Anpassung': 'Ajustement de la mise en page',
    'Transkription anzeigen': 'Afficher la transcription',
    'Originaler Sprachtext unter dem Protokoll': 'Texte original sous le protocole',
    'Professionelles Deckblatt mit Logo, Titel und Projektinfo': 'Couverture professionnelle avec logo, titre et infos du projet',
    'Deckblatt-Vorschau': 'Aperçu de la couverture',
    'Beispielprojekt': 'Projet exemple',
    'Willkommen im Dashboard': 'Bienvenue au tableau de bord',
    'Aktivität (30 Tage)': 'Activité (30 jours)',
    'Wöchentliche Aktivität': 'Activité hebdomadaire',
    'Keine Projekte': 'Aucun projet',
    'Projekt erstellen': 'Créer un projet',
    'Projektname': 'Nom du projet',
    'Kein Projekt': 'Aucun projet',
    'Alle Protokolle': 'Tous les protocoles',
    'Neueste zuerst': 'Plus récent',
    'Älteste zuerst': 'Plus ancien',
    'Projekt löschen': 'Supprimer le projet',
    'Projekt bearbeiten': 'Modifier le projet',
    'Mitglieder': 'Membres',
    'Projektdetails': 'Détails du projet',
    'Aufgabe hinzufügen': 'Ajouter une tâche',
    'Aufgabe bearbeiten': 'Modifier la tâche',
    'Aufgabe delegieren': 'Déléguer la tâche',
    'Protokolle zusammenführen': 'Fusionner les protocoles',
    'Zusammenführen': 'Fusionner',
    'Protokolle auswählen': 'Sélectionner les protocoles',
    'Fotos exportieren': 'Exporter les photos',
    'Exportieren': 'Exporter',
    'Vorlage erstellen': 'Créer un modèle',
    'Vorlage bearbeiten': 'Modifier le modèle',
    'Vorlagenname': 'Nom du modèle',
    'Abschnitte': 'Sections',
    'Neuer Abschnitt': 'Nouvelle section',
    'Vorlage speichern': 'Enregistrer le modèle',
    'Wie kann ich helfen?': 'Comment puis-je vous aider ?',
    'Termin erstellen': 'Créer un rendez-vous',
    'Wiederholung': 'Récurrence',
    'Automatisch hochladen': 'Upload automatique',
    'Arbeitszeit': 'Heures de travail',
    'Zeiterfassung': 'Suivi du temps',
    'Wetterdaten einbeziehen': 'Inclure les données météo',
    'Wochenbericht': 'Rapport hebdomadaire',
    'In Bearbeitung': 'En cours',
    'Mangel hinzufügen': 'Ajouter un défaut',
    'Neuer Mangel': 'Nouveau défaut',
    'Beschreibung des Mangels': 'Description du défaut',
    'Zuständig:': 'Responsable :',
    'Alle Gewerke': 'Tous les corps de métier',
    'Vergleichen': 'Comparer',
    'Vergleich': 'Comparaison',
    'Vollansicht': 'Vue complète',
    'Verlauf': 'Historique',
    'Werkzeuge': 'Outils',
    'Agenda speichern': "Enregistrer l'agenda",
    'Agenda-Punkt hinzufügen': "Ajouter un point à l'agenda",
    'Agenda-Vorbereitung': "Préparation de l'agenda",
    'Teilnehmer': 'Participants',
    'Nächster Termin': 'Prochain rendez-vous',
    'Erinnerungen konfigurieren': 'Configurer les rappels',
    'Vorkommnisse': 'Incidents',
    'Vorlage (optional)': 'Modèle (optionnel)',
    'Vorlage wählen': 'Choisir un modèle',
    'Vorlagen entdecken und teilen': 'Découvrir et partager des modèles',
    'Vorlagen-Marktplatz': 'Marché des modèles',
    'Vorlagen-Nutzung': 'Utilisation des modèles',
    'Vorschau testen': "Tester l'aperçu",
    'Wann soll die Erinnerung kommen?': 'Quand le rappel doit-il arriver ?',
    'An welchen Tagen erinnern?': 'Quels jours rappeler ?',
    'Abendliche Push mit Tagesübersicht': 'Push du soir avec résumé quotidien',
    'Verfügbare Checklisten': 'Checklists disponibles',
    'Keine Exporte': 'Aucun export',
    'Noch keine PDFs exportiert': 'Aucun PDF exporté',
    'Archiv leer': 'Archives vides',
    'Aus Kontakten': 'Depuis les contacts',
    'Zu den Einstellungen': 'Aller aux paramètres',
    'Zum Protokoll': 'Aller au protocole',
    'Wird neu generiert...': 'Régénération...',
    'Wähle ein Projekt oder starte ohne Zuordnung': 'Choisir un projet ou démarrer sans attribution',
}

# Generate EN/FR for all keys
en_translations = {}
fr_translations = {}

for key, de_val in de_translations.items():
    # Check if we have a manual EN translation
    en_val = EN_MAP.get(de_val, None)
    if en_val is None:
        # Check existing i18n.ts EN section
        en_val = de_val  # fallback to German if no translation
    en_translations[key] = en_val
    
    fr_val = FR_MAP.get(de_val, None)
    if fr_val is None:
        fr_val = de_val  # fallback to German if no translation
    fr_translations[key] = fr_val

# Now generate the i18n.ts file
def escape_ts(s):
    """Escape a string for TypeScript single-quoted string."""
    return s.replace("\\", "\\\\").replace("'", "\\'")

lines = []
lines.append('import { useState, useEffect, useCallback, createContext, useContext } from "react";')
lines.append('import AsyncStorage from "@react-native-async-storage/async-storage";')
lines.append('')
lines.append('export type Language = "de" | "en" | "fr";')
lines.append('export type TranslationKey = keyof typeof translations.de;')
lines.append('')
lines.append('const LANGUAGE_KEY = "app_language";')
lines.append('')
lines.append('export const translations = {')
lines.append('  de: {')
for key in sorted(de_translations.keys()):
    val = escape_ts(de_translations[key])
    lines.append(f"    {key}: '{val}',")
lines.append('  },')
lines.append('  en: {')
for key in sorted(en_translations.keys()):
    val = escape_ts(en_translations[key])
    lines.append(f"    {key}: '{val}',")
lines.append('  },')
lines.append('  fr: {')
for key in sorted(fr_translations.keys()):
    val = escape_ts(fr_translations[key])
    lines.append(f"    {key}: '{val}',")
lines.append('  },')
lines.append('} as const;')
lines.append('')
lines.append('export function t(key: TranslationKey, lang: Language = "de"): string {')
lines.append('  return translations[lang]?.[key] || translations.de[key] || key;')
lines.append('}')
lines.append('')
lines.append('export const LANGUAGE_OPTIONS: { id: Language; name: string; flag: string }[] = [')
lines.append('  { id: "de", name: "Deutsch", flag: "🇩🇪" },')
lines.append('  { id: "en", name: "English", flag: "🇬🇧" },')
lines.append('  { id: "fr", name: "Français", flag: "🇫🇷" },')
lines.append('];')
lines.append('')

with open('lib/i18n.ts', 'w') as f:
    f.write('\n'.join(lines))

print(f"Generated i18n.ts with {len(de_translations)} DE keys, {len(en_translations)} EN keys, {len(fr_translations)} FR keys")

# Now apply translations to all files
def apply_to_file(filepath):
    if not os.path.exists(filepath):
        return 0
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    count = 0
    
    # Sort by length (longest first) to avoid partial matches
    sorted_items = sorted(text_to_key.items(), key=lambda x: len(x[0]), reverse=True)
    
    for text, key in sorted_items:
        # Pattern 1: >Text< (JSX text content)
        old = f'>{text}<'
        new = f">{{t('{key}')}}<"
        if old in content:
            content = content.replace(old, new)
            count += 1
        
        # Pattern 2: title="Text" etc
        for prop in ['title', 'placeholder', 'label', 'accessibilityLabel', 'message']:
            old = f'{prop}="{text}"'
            new = f"{prop}={{t('{key}')}}"
            if old in content:
                content = content.replace(old, new)
                count += 1
    
    if count > 0 and content != original:
        # Add useTranslation import if not present
        if 'useTranslation' not in content:
            # Find last import line
            lines = content.split('\n')
            last_import = 0
            for i, line in enumerate(lines):
                if 'import ' in line and 'from ' in line:
                    last_import = i
            lines.insert(last_import + 1, 'import { useTranslation } from "@/lib/language-provider";')
            content = '\n'.join(lines)
        
        # Add const { t } if not present (inside the component function)
        if "const { t } = useTranslation()" not in content and "const { t }" not in content:
            # Find the first 'export default function' or 'function' after imports
            match = re.search(r'(export default function \w+\([^)]*\)\s*\{)', content)
            if match:
                insert_pos = match.end()
                content = content[:insert_pos] + '\n  const { t } = useTranslation();' + content[insert_pos:]
            else:
                # Try other patterns
                match = re.search(r'(export function \w+\([^)]*\)\s*\{)', content)
                if match:
                    insert_pos = match.end()
                    content = content[:insert_pos] + '\n  const { t } = useTranslation();' + content[insert_pos:]
        
        with open(filepath, 'w') as f:
            f.write(content)
    
    return count

# Apply to all app files
total = 0
for filepath in sorted(app_files):
    count = apply_to_file(filepath)
    if count > 0:
        print(f"  {filepath}: {count} replacements")
        total += count

print(f"\nTotal: {total} replacements across all files")
