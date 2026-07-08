#!/usr/bin/env python3
"""
Replace hardcoded German strings in Alert.alert() calls with t() calls.
Also handles other patterns like const msg = "German text".
"""
import re
import os
import json

os.chdir('/home/ubuntu/protokoll-app')

# Read i18n.ts to get existing keys
with open('lib/i18n.ts', 'r') as f:
    i18n_content = f.read()

# Extract existing DE key-value pairs
existing_keys = {}
de_section = re.search(r'de:\s*\{(.*?)\n  \}', i18n_content, re.DOTALL)
if de_section:
    for m in re.finditer(r"(\w+):\s*'((?:[^'\\]|\\.)*)'", de_section.group(1)):
        existing_keys[m.group(2)] = m.group(1)

# Build reverse map: German text -> key
text_to_key = {}
for val, key in existing_keys.items():
    text_to_key[val] = key

def make_key(text):
    t = text.lower()
    t = t.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    t = re.sub(r'[^a-z0-9\s]', '', t)
    words = t.split()[:4]
    key = '_'.join(words)
    if len(key) > 40:
        key = key[:40]
    return key

# Collect all Alert.alert strings that need translation
new_keys_de = {}
new_keys_en = {}
new_keys_fr = {}

# EN/FR translations for common alert titles/messages
ALERT_EN = {
    'Fehler': 'Error', 'Hinweis': 'Note', 'Gespeichert': 'Saved',
    'Gespeichert!': 'Saved!', 'Exportiert': 'Exported', 'Importiert': 'Imported',
    'Importiert!': 'Imported!', 'Löschen': 'Delete', 'Entfernen': 'Remove',
    'Aktiviert': 'Activated', 'Deaktiviert': 'Deactivated',
    'Export': 'Export', 'Import': 'Import', 'Berechtigung': 'Permission',
    'Berechtigung verweigert': 'Permission denied',
    'Export fehlgeschlagen': 'Export failed', 'Dupliziert': 'Duplicated',
    'Gestoppt': 'Stopped', 'Hinzugefügt': 'Added',
    'Keine Auswahl': 'No selection', 'Keine Fotos': 'No photos',
    'Keine Fotos ausgewählt': 'No photos selected',
    'Keine Kontakte': 'No contacts', 'Keine Vorlagen': 'No templates',
    'Foto entfernen': 'Remove photo', 'Fotos aktualisiert': 'Photos updated',
    'Benachrichtigung gesendet': 'Notification sent',
    'Aufgabe delegiert': 'Task delegated',
    'Eintrag löschen': 'Delete entry', 'Ergebnis löschen': 'Delete result',
    'Alles löschen': 'Delete all', 'Agenda': 'Agenda',
    'Aufgabe delegiert \u2713': 'Task delegated \u2713',
}
ALERT_FR = {
    'Fehler': 'Erreur', 'Hinweis': 'Note', 'Gespeichert': 'Enregistré',
    'Gespeichert!': 'Enregistré !', 'Exportiert': 'Exporté', 'Importiert': 'Importé',
    'Importiert!': 'Importé !', 'Löschen': 'Supprimer', 'Entfernen': 'Supprimer',
    'Aktiviert': 'Activé', 'Deaktiviert': 'Désactivé',
    'Export': 'Export', 'Import': 'Import', 'Berechtigung': 'Permission',
    'Berechtigung verweigert': 'Permission refusée',
    'Export fehlgeschlagen': "Échec de l'export", 'Dupliziert': 'Dupliqué',
    'Gestoppt': 'Arrêté', 'Hinzugefügt': 'Ajouté',
    'Keine Auswahl': 'Aucune sélection', 'Keine Fotos': 'Aucune photo',
    'Keine Fotos ausgewählt': 'Aucune photo sélectionnée',
    'Keine Kontakte': 'Aucun contact', 'Keine Vorlagen': 'Aucun modèle',
    'Foto entfernen': 'Supprimer la photo', 'Fotos aktualisiert': 'Photos mises à jour',
    'Benachrichtigung gesendet': 'Notification envoyée',
    'Aufgabe delegiert': 'Tâche déléguée',
    'Eintrag löschen': "Supprimer l'entrée", 'Ergebnis löschen': 'Supprimer le résultat',
    'Alles löschen': 'Tout supprimer', 'Agenda': 'Agenda',
    'Aufgabe delegiert \u2713': 'Tâche déléguée \u2713',
}

def get_or_create_key(text):
    """Get existing key or create a new one for the text."""
    if text in text_to_key:
        return text_to_key[text]
    
    key = 'alert_' + make_key(text)
    # Ensure uniqueness
    base_key = key
    counter = 2
    while key in existing_keys.values() or key in new_keys_de:
        key = f"{base_key}_{counter}"
        counter += 1
    
    new_keys_de[key] = text
    new_keys_en[key] = ALERT_EN.get(text, text)
    new_keys_fr[key] = ALERT_FR.get(text, text)
    text_to_key[text] = key
    return key

# Process all app files
app_files = []
for root, dirs, files in os.walk('app'):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            app_files.append(os.path.join(root, f))

total_replacements = 0

for filepath in sorted(app_files):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    file_count = [0]
    
    # Pattern: Alert.alert("German Title", "German Message"
    # Replace title and message separately
    def replace_alert_string(match):
        count = file_count
        quote = match.group(1)  # " or '
        text = match.group(2)
        # Only translate if starts with uppercase German letter
        if text and text[0] in 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜabcdefghijklmnopqrstuvwxyz':
            if any(c in text for c in 'äöüÄÖÜßéèê') or text in ALERT_EN or text in text_to_key:
                key = get_or_create_key(text)
                count += 1
                return f"t('{key}')"
        return match.group(0)
    
    # Replace Alert.alert("Title", "Message", [...])
    # First arg (title)
    count = file_count
    content = re.sub(
        r'Alert\.alert\(\s*(["\'])([A-ZÄÖÜ][^"\']*?)\1',
        lambda m: f"Alert.alert(t('{get_or_create_key(m.group(2))}')" if m.group(2) in ALERT_EN or m.group(2) in text_to_key or any(c in m.group(2) for c in 'äöüÄÖÜß') else m.group(0),
        content
    )
    
    # Second arg (message) - after the title replacement
    # Pattern: Alert.alert(t('key'), "German message"
    def replace_alert_msg(m):
        text = m.group(2)
        if text and len(text) > 1 and (any(c in text for c in 'äöüÄÖÜß') or text[0].isupper()):
            key = get_or_create_key(text)
            count += 1
            return f"{m.group(1)}t('{key}')"
        return m.group(0)
    
    content = re.sub(
        r"(Alert\.alert\([^,]+,\s*)[\"']([A-ZÄÖÜ][^\"']{2,}?)[\"']",
        replace_alert_msg,
        content
    )
    
    # Also handle button text in Alert: { text: "German", ... }
    def replace_button_text(m):
        text = m.group(1)
        if text and len(text) > 1 and (any(c in text for c in 'äöüÄÖÜß') or text in ALERT_EN or text in text_to_key):
            key = get_or_create_key(text)
            count += 1
            return f"text: t('{key}')"
        return m.group(0)
    
    content = re.sub(
        r'text:\s*"([A-ZÄÖÜ][^"]{1,40})"',
        replace_button_text,
        content
    )
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        total_replacements += count
        if count > 0:
            print(f"  {filepath}: {count} alert replacements")

print(f"\nTotal: {total_replacements} alert replacements")
print(f"New keys to add: {len(new_keys_de)}")

# Now add new keys to i18n.ts
if new_keys_de:
    with open('lib/i18n.ts', 'r') as f:
        i18n = f.read()
    
    # Add new keys to each section
    for key in sorted(new_keys_de.keys()):
        de_val = new_keys_de[key].replace("'", "\\'")
        en_val = new_keys_en[key].replace("'", "\\'")
        fr_val = new_keys_fr[key].replace("'", "\\'")
        
        # Insert before the closing of each section
        i18n = i18n.replace(
            "  },\n  en: {",
            f"    {key}: '{de_val}',\n  }},\n  en: {{",
            1
        )
        i18n = i18n.replace(
            "  },\n  fr: {",
            f"    {key}: '{en_val}',\n  }},\n  fr: {{",
            1
        )
        i18n = i18n.replace(
            "  },\n} as const;",
            f"    {key}: '{fr_val}',\n  }},\n}} as const;",
            1
        )
    
    with open('lib/i18n.ts', 'w') as f:
        f.write(i18n)
    
    print(f"Added {len(new_keys_de)} new keys to i18n.ts")
