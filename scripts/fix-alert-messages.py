#!/usr/bin/env python3
"""Replace remaining hardcoded German alert messages (2nd arg) with t() calls."""
import re, os, subprocess

os.chdir('/home/ubuntu/protokoll-app')

# Get all remaining alert messages
result = subprocess.run(
    ['grep', '-rohP', r'Alert\.alert\(t\([^)]+\),\s*"([^"]+)"', '-r', 'app/'],
    capture_output=True, text=True
)
messages = set()
for m in re.finditer(r'"([^"]+)"', result.stdout):
    msg = m.group(1)
    if len(msg) > 3:
        messages.add(msg)

# Also get messages with single quotes
result2 = subprocess.run(
    ['grep', '-rohP', r"Alert\.alert\(t\([^)]+\),\s*'([^']+)'", '-r', 'app/'],
    capture_output=True, text=True
)
for m in re.finditer(r"'([^']+)'", result2.stdout):
    msg = m.group(1)
    if len(msg) > 3:
        messages.add(msg)

print(f"Found {len(messages)} unique alert messages to translate")

# Generate keys and translations
def make_key(text):
    t = text.lower()[:50]
    t = t.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    t = re.sub(r'[^a-z0-9\s]', '', t)
    words = t.split()[:5]
    return 'msg_' + '_'.join(words)

# Simple translations (we'll do our best for common patterns)
def translate_to_en(text):
    translations = {
        "Agenda wurde erfolgreich erstellt.": "Agenda created successfully.",
        "Alle Markierungen entfernen?": "Remove all markers?",
        "Annotation konnte nicht gespeichert werden.": "Annotation could not be saved.",
        "Aufgabe konnte nicht delegiert werden.": "Task could not be delegated.",
        "Beim Import ist ein Fehler aufgetreten.": "An error occurred during import.",
        "Benachrichtigungen wurden aktiviert.": "Notifications have been activated.",
        "Bitte aktiviere Benachrichtigungen in den Geräte-Einstellungen.": "Please enable notifications in device settings.",
        "Bitte einen Namen eingeben.": "Please enter a name.",
        "Bitte erlaube Benachrichtigungen in den Systemeinstellungen.": "Please allow notifications in system settings.",
        "Bitte erlaube Push-Benachrichtigungen in den Einstellungen deines Geräts.": "Please allow push notifications in your device settings.",
        "Bitte füge mindestens eine Sektion hinzu.": "Please add at least one section.",
        "Bitte geben Sie einen Titel ein.": "Please enter a title.",
        "Bitte gib eine Bezeichnung ein.": "Please enter a label.",
        "Bitte gib einen Meeting-Titel ein.": "Please enter a meeting title.",
        "Bitte gib einen Namen für die Vorlage ein.": "Please enter a template name.",
        "Bitte gib einen Projektnamen ein.": "Please enter a project name.",
        "Bitte gib einen Text ein.": "Please enter text.",
        "Bitte melde dich an, um Cloud-Sync zu nutzen.": "Please log in to use cloud sync.",
        "Bitte wähle mindestens 2 Protokolle zum Zusammenführen aus.": "Please select at least 2 protocols to merge.",
        "Bitte wähle mindestens ein Foto zum Exportieren aus.": "Please select at least one photo to export.",
    }
    if text in translations:
        return translations[text]
    # Generic patterns
    if text.startswith("Bitte"):
        return "Please " + text[6:7].lower() + text[7:]
    if "nicht" in text and "konnte" in text:
        return text  # Keep German as fallback
    return text  # Keep German as fallback for complex messages

def translate_to_fr(text):
    translations = {
        "Agenda wurde erfolgreich erstellt.": "Agenda créé avec succès.",
        "Alle Markierungen entfernen?": "Supprimer tous les marqueurs ?",
        "Annotation konnte nicht gespeichert werden.": "L'annotation n'a pas pu être enregistrée.",
        "Aufgabe konnte nicht delegiert werden.": "La tâche n'a pas pu être déléguée.",
        "Beim Import ist ein Fehler aufgetreten.": "Une erreur est survenue lors de l'import.",
        "Benachrichtigungen wurden aktiviert.": "Les notifications ont été activées.",
        "Bitte aktiviere Benachrichtigungen in den Geräte-Einstellungen.": "Veuillez activer les notifications dans les paramètres.",
        "Bitte einen Namen eingeben.": "Veuillez entrer un nom.",
        "Bitte erlaube Benachrichtigungen in den Systemeinstellungen.": "Veuillez autoriser les notifications dans les paramètres système.",
        "Bitte erlaube Push-Benachrichtigungen in den Einstellungen deines Geräts.": "Veuillez autoriser les notifications push dans les paramètres.",
        "Bitte füge mindestens eine Sektion hinzu.": "Veuillez ajouter au moins une section.",
        "Bitte geben Sie einen Titel ein.": "Veuillez entrer un titre.",
        "Bitte gib eine Bezeichnung ein.": "Veuillez entrer un libellé.",
        "Bitte gib einen Meeting-Titel ein.": "Veuillez entrer un titre de réunion.",
        "Bitte gib einen Namen für die Vorlage ein.": "Veuillez entrer un nom de modèle.",
        "Bitte gib einen Projektnamen ein.": "Veuillez entrer un nom de projet.",
        "Bitte gib einen Text ein.": "Veuillez entrer un texte.",
        "Bitte melde dich an, um Cloud-Sync zu nutzen.": "Veuillez vous connecter pour utiliser la synchronisation cloud.",
        "Bitte wähle mindestens 2 Protokolle zum Zusammenführen aus.": "Veuillez sélectionner au moins 2 protocoles à fusionner.",
        "Bitte wähle mindestens ein Foto zum Exportieren aus.": "Veuillez sélectionner au moins une photo à exporter.",
    }
    if text in translations:
        return translations[text]
    return text  # Keep German as fallback

# Build the keys
new_keys = {}
for msg in sorted(messages):
    key = make_key(msg)
    # Ensure unique
    base = key
    counter = 2
    while key in new_keys:
        key = f"{base}_{counter}"
        counter += 1
    new_keys[key] = {
        'de': msg,
        'en': translate_to_en(msg),
        'fr': translate_to_fr(msg),
    }

# Add keys to i18n.ts
with open('lib/i18n.ts', 'r') as f:
    i18n = f.read()

de_lines = []
en_lines = []
fr_lines = []
for key, vals in sorted(new_keys.items()):
    de_val = vals['de'].replace("'", "\\'")
    en_val = vals['en'].replace("'", "\\'")
    fr_val = vals['fr'].replace("'", "\\'")
    de_lines.append(f"    {key}: '{de_val}',")
    en_lines.append(f"    {key}: '{en_val}',")
    fr_lines.append(f"    {key}: '{fr_val}',")

# Insert before the closing of each section
de_end = i18n.find("\n  },\n  en: {")
if de_end > 0:
    i18n = i18n[:de_end] + "\n" + "\n".join(de_lines) + i18n[de_end:]

en_end = i18n.find("\n  },\n  fr: {")
if en_end > 0:
    i18n = i18n[:en_end] + "\n" + "\n".join(en_lines) + i18n[en_end:]

fr_end = i18n.find("\n  },\n} as const;")
if fr_end > 0:
    i18n = i18n[:fr_end] + "\n" + "\n".join(fr_lines) + i18n[fr_end:]

with open('lib/i18n.ts', 'w') as f:
    f.write(i18n)
print(f"Added {len(new_keys)} message keys to i18n.ts")

# Now replace in all files
# Build a map: German text -> key
text_to_key = {vals['de']: key for key, vals in new_keys.items()}

total = 0
for root, dirs, files in os.walk('app'):
    for fname in files:
        if not fname.endswith('.tsx') and not fname.endswith('.ts'):
            continue
        filepath = os.path.join(root, fname)
        with open(filepath, 'r') as f:
            content = f.read()
        
        original = content
        
        # Replace "message" after Alert.alert(t('key'),
        for text, key in text_to_key.items():
            escaped = text.replace('"', '\\"')
            content = content.replace(f', "{text}"', f", t('{key}')")
            content = content.replace(f", '{text}'", f", t('{key}')")
        
        if content != original:
            with open(filepath, 'w') as f:
                f.write(content)
            total += 1
            print(f"  Fixed: {filepath}")

print(f"\nTotal files updated: {total}")
