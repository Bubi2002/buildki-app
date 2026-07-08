#!/usr/bin/env python3
"""Add missing alert keys to i18n.ts and replace all remaining hardcoded Alert.alert strings."""
import re, os, subprocess

os.chdir('/home/ubuntu/protokoll-app')

# All alert titles and their translations
ALERT_TRANSLATIONS = {
    # title: (key, en, fr)
    "Agenda": ("alert_agenda", "Agenda", "Agenda"),
    "Aktiviert": ("alert_aktiviert", "Activated", "Activé"),
    "Alles löschen": ("alert_alles_loeschen", "Delete all", "Tout supprimer"),
    "Aufgabe delegiert": ("alert_aufgabe_delegiert", "Task delegated", "Tâche déléguée"),
    "Aufgabe delegiert \u2713": ("alert_aufgabe_delegiert_ok", "Task delegated \u2713", "Tâche déléguée \u2713"),
    "Benachrichtigung gesendet": ("alert_benachrichtigung_gesendet", "Notification sent", "Notification envoyée"),
    "Berechtigung": ("alert_berechtigung", "Permission", "Permission"),
    "Berechtigung verweigert": ("alert_berechtigung_verweigert", "Permission denied", "Permission refusée"),
    "Dupliziert": ("alert_dupliziert", "Duplicated", "Dupliqué"),
    "Eintrag löschen": ("alert_eintrag_loeschen", "Delete entry", "Supprimer l\\'entrée"),
    "Entfernen": ("alert_entfernen", "Remove", "Supprimer"),
    "Ergebnis löschen": ("alert_ergebnis_loeschen", "Delete result", "Supprimer le résultat"),
    "Export fehlgeschlagen": ("alert_export_fehlgeschlagen", "Export failed", "Échec de l\\'export"),
    "Exportiert": ("alert_exportiert", "Exported", "Exporté"),
    "Fehler": ("alert_fehler", "Error", "Erreur"),
    "Foto entfernen": ("alert_foto_entfernen", "Remove photo", "Supprimer la photo"),
    "Fotos aktualisiert": ("alert_fotos_aktualisiert", "Photos updated", "Photos mises à jour"),
    "Gespeichert": ("alert_gespeichert", "Saved", "Enregistré"),
    "Gespeichert!": ("alert_gespeichert_ex", "Saved!", "Enregistré !"),
    "Gestoppt": ("alert_gestoppt", "Stopped", "Arrêté"),
    "Import": ("alert_import", "Import", "Import"),
    "Importiert": ("alert_importiert", "Imported", "Importé"),
    "Importiert!": ("alert_importiert_ex", "Imported!", "Importé !"),
    "Keine Auswahl": ("alert_keine_auswahl", "No selection", "Aucune sélection"),
    "Keine Fotos ausgewählt": ("alert_keine_fotos_ausgewaehlt", "No photos selected", "Aucune photo sélectionnée"),
    "Keine Kontakte": ("alert_keine_kontakte", "No contacts", "Aucun contact"),
    "Keine Punkte": ("alert_keine_punkte", "No items", "Aucun élément"),
    "Keine Vorlagen": ("alert_keine_vorlagen", "No templates", "Aucun modèle"),
    "Kopiert": ("alert_kopiert", "Copied", "Copié"),
    "Login erforderlich": ("alert_login_erforderlich", "Login required", "Connexion requise"),
    "Löschen": ("alert_loeschen", "Delete", "Supprimer"),
    "Löschen?": ("alert_loeschen_frage", "Delete?", "Supprimer ?"),
    "Mangel löschen": ("alert_mangel_loeschen", "Delete defect", "Supprimer le défaut"),
    "Markierung löschen": ("alert_markierung_loeschen", "Delete marker", "Supprimer le marqueur"),
    "Mindestens 2 Protokolle": ("alert_mindestens_2", "At least 2 protocols", "Au moins 2 protocoles"),
    "Neues Stimmprofil": ("alert_neues_stimmprofil", "New voice profile", "Nouveau profil vocal"),
    "Nicht verfügbar": ("alert_nicht_verfuegbar", "Not available", "Non disponible"),
    "PDF erstellt": ("alert_pdf_erstellt", "PDF created", "PDF créé"),
    "Plan hinzufügen": ("alert_plan_hinzufuegen", "Add plan", "Ajouter un plan"),
    "Plan löschen": ("alert_plan_loeschen", "Delete plan", "Supprimer le plan"),
    "Prüfpunkt löschen": ("alert_pruefpunkt_loeschen", "Delete checkpoint", "Supprimer le point de contrôle"),
    "Projekt archivieren": ("alert_projekt_archivieren", "Archive project", "Archiver le projet"),
    "Projekt löschen": ("alert_projekt_loeschen", "Delete project", "Supprimer le projet"),
    "Sprecher erkannt": ("alert_sprecher_erkannt", "Speaker recognized", "Locuteur reconnu"),
    "Sync abgeschlossen": ("alert_sync_abgeschlossen", "Sync completed", "Synchronisation terminée"),
    "Sync-Fehler": ("alert_sync_fehler", "Sync error", "Erreur de synchronisation"),
    "Tag hinzufügen": ("alert_tag_hinzufuegen", "Add tag", "Ajouter un tag"),
    "Teammitglied entfernen": ("alert_teammitglied_entfernen", "Remove team member", "Supprimer le membre"),
    "Titel fehlt": ("alert_titel_fehlt", "Title missing", "Titre manquant"),
    "Verbunden": ("alert_verbunden", "Connected", "Connecté"),
    "Wiederhergestellt": ("alert_wiederhergestellt", "Restored", "Restauré"),
    "Hinweis": ("alert_hinweis", "Note", "Note"),
    "Export": ("alert_export", "Export", "Export"),
}

# Also common button texts
BUTTON_TRANSLATIONS = {
    "Abbrechen": ("btn_abbrechen", "Cancel", "Annuler"),
    "Löschen": ("btn_loeschen", "Delete", "Supprimer"),
    "Entfernen": ("btn_entfernen", "Remove", "Supprimer"),
    "OK": ("btn_ok", "OK", "OK"),
    "Ja": ("btn_ja", "Yes", "Oui"),
    "Nein": ("btn_nein", "No", "Non"),
    "Speichern": ("btn_speichern", "Save", "Enregistrer"),
    "Verwerfen": ("btn_verwerfen", "Discard", "Abandonner"),
    "Fortsetzen": ("btn_fortsetzen", "Continue", "Continuer"),
    "Wiederherstellen": ("btn_wiederherstellen", "Restore", "Restaurer"),
    "Archivieren": ("btn_archivieren", "Archive", "Archiver"),
    "Verstanden": ("btn_verstanden", "Understood", "Compris"),
    "Schließen": ("btn_schliessen", "Close", "Fermer"),
    "Öffnen": ("btn_oeffnen", "Open", "Ouvrir"),
    "Teilen": ("btn_teilen", "Share", "Partager"),
    "Senden": ("btn_senden", "Send", "Envoyer"),
    "Hinzufügen": ("btn_hinzufuegen", "Add", "Ajouter"),
    "Bearbeiten": ("btn_bearbeiten", "Edit", "Modifier"),
    "Fertig": ("btn_fertig", "Done", "Terminé"),
    "Weiter": ("btn_weiter", "Next", "Suivant"),
    "Zurück": ("btn_zurueck", "Back", "Retour"),
    "Exportieren": ("btn_exportieren", "Export", "Exporter"),
}

# Step 1: Add all missing keys to i18n.ts
with open('lib/i18n.ts', 'r') as f:
    i18n = f.read()

# Find the end of each language section to insert keys
# Pattern: find the last key before the closing }
de_keys_to_add = []
en_keys_to_add = []
fr_keys_to_add = []

for text, (key, en, fr) in {**ALERT_TRANSLATIONS, **BUTTON_TRANSLATIONS}.items():
    # Check if key already exists
    if f"  {key}:" not in i18n and f"    {key}:" not in i18n:
        de_val = text.replace("'", "\\'")
        en_val = en.replace("'", "\\'")
        fr_val = fr.replace("'", "\\'")
        de_keys_to_add.append(f"    {key}: '{de_val}',")
        en_keys_to_add.append(f"    {key}: '{en_val}',")
        fr_keys_to_add.append(f"    {key}: '{fr_val}',")

if de_keys_to_add:
    # Insert before the closing of each section
    # Find DE section end
    de_end = i18n.find("\n  },\n  en: {")
    if de_end > 0:
        i18n = i18n[:de_end] + "\n" + "\n".join(de_keys_to_add) + i18n[de_end:]
    
    # Find EN section end (after DE insertion)
    en_end = i18n.find("\n  },\n  fr: {")
    if en_end > 0:
        i18n = i18n[:en_end] + "\n" + "\n".join(en_keys_to_add) + i18n[en_end:]
    
    # Find FR section end
    fr_end = i18n.find("\n  },\n} as const;")
    if fr_end > 0:
        i18n = i18n[:fr_end] + "\n" + "\n".join(fr_keys_to_add) + i18n[fr_end:]
    
    with open('lib/i18n.ts', 'w') as f:
        f.write(i18n)
    print(f"Added {len(de_keys_to_add)} new keys to i18n.ts")

# Step 2: Replace all Alert.alert("Title" with Alert.alert(t('key')
total_replacements = 0
for root, dirs, files in os.walk('app'):
    for fname in files:
        if not fname.endswith('.tsx') and not fname.endswith('.ts'):
            continue
        filepath = os.path.join(root, fname)
        with open(filepath, 'r') as f:
            content = f.read()
        
        original = content
        
        # Replace Alert.alert("Title" -> Alert.alert(t('key')
        for text, (key, en, fr) in ALERT_TRANSLATIONS.items():
            content = content.replace(f'Alert.alert("{text}"', f"Alert.alert(t('{key}')")
            content = content.replace(f"Alert.alert('{text}'", f"Alert.alert(t('{key}')")
        
        # Replace text: "Button" -> text: t('key')
        for text, (key, en, fr) in BUTTON_TRANSLATIONS.items():
            content = content.replace(f'text: "{text}"', f"text: t('{key}')")
            content = content.replace(f"text: '{text}'", f"text: t('{key}')")
        
        if content != original:
            with open(filepath, 'w') as f:
                f.write(content)
            total_replacements += 1
            print(f"  Fixed: {filepath}")

print(f"\nTotal files updated: {total_replacements}")

# Step 3: Also handle the second argument of Alert.alert (the message)
# Get all unique Alert.alert messages
result = subprocess.run(
    ['grep', '-rohP', r'Alert\.alert\(t\([^)]+\),\s*"([^"]+)"', '-r', 'app/'],
    capture_output=True, text=True
)
messages = set()
for m in re.finditer(r'"([^"]+)"', result.stdout):
    msg = m.group(1)
    if any(c in msg for c in 'äöüÄÖÜß') or (msg[0:1].isupper() and len(msg) > 3):
        messages.add(msg)

print(f"\nRemaining alert messages to translate: {len(messages)}")
for msg in sorted(messages)[:20]:
    print(f"  {msg}")
