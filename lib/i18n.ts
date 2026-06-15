import { useState, useEffect, useCallback, createContext, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Language = "de" | "en" | "fr";

export type TranslationKey = keyof typeof translations.de;

const LANGUAGE_KEY = "app_language";

export const translations = {
  de: {
    // General
    app_name: "ProtoKI",
    cancel: "Abbrechen",
    save: "Speichern",
    delete: "Löschen",
    edit: "Bearbeiten",
    close: "Schließen",
    back: "Zurück",
    next: "Weiter",
    done: "Fertig",
    search: "Suchen",
    filter: "Filter",
    all: "Alle",
    none: "Keine",
    yes: "Ja",
    no: "Nein",
    ok: "OK",
    error: "Fehler",
    success: "Erfolg",
    loading: "Laden...",
    retry: "Erneut versuchen",

    // Navigation
    nav_home: "Aufnahme",
    nav_protocols: "Protokolle",
    nav_settings: "Einstellungen",

    // Projects
    project_select: "Projekt auswählen",
    project_new: "Neues Projekt",
    project_name: "Projektname",
    project_description: "Beschreibung",
    project_prefix: "Präfix",
    project_color: "Farbe",
    project_no_projects: "Keine Projekte",
    project_create_first: "Erstelle dein erstes Projekt",
    project_without: "Ohne Projekt fortfahren",
    project_protocols: "Protokolle",
    project_active: "Aktiv",
    project_archived: "Archiv",
    project_favorites: "Favoriten",
    project_sort_activity: "Aktivität",
    project_sort_name: "Name",
    project_sort_created: "Erstellt",
    project_duplicate: "Duplizieren",
    project_archive: "Archivieren",
    project_unarchive: "Wiederherstellen",
    project_delete_confirm: "Projekt wirklich löschen?",
    project_delete_warning: "Alle zugehörigen Protokolle werden ebenfalls gelöscht.",

    // Recording
    record_start: "Aufnahme starten",
    record_stop: "Aufnahme stoppen",
    record_pause: "Pause",
    record_resume: "Fortsetzen",
    record_photo: "Foto aufnehmen",
    record_duration: "Aufnahmedauer",
    record_processing: "Wird verarbeitet...",
    record_transcribing: "Transkribiere...",
    record_generating: "Protokoll wird erstellt...",

    // Protocols
    protocol_title: "Protokolltitel",
    protocol_no_protocols: "Keine Protokolle",
    protocol_create_first: "Erstelle dein erstes Protokoll",
    protocol_share: "Teilen",
    protocol_export_pdf: "Als PDF exportieren",
    protocol_delete_confirm: "Protokoll löschen?",

    // Settings
    settings_title: "Einstellungen",
    settings_general: "Allgemein",
    settings_templates: "Vorlagen",
    settings_notifications: "Benachrichtigungen",
    settings_language: "Sprache",
    settings_theme: "Erscheinungsbild",
    settings_theme_light: "Hell",
    settings_theme_dark: "Dunkel",
    settings_theme_system: "System",
    settings_company: "Firmendaten",
    settings_about: "Über die App",

    // Offline
    offline_banner: "Offline – Änderungen werden lokal gespeichert",
    offline_syncing: "Synchronisiere",
    offline_synced: "Verbunden – Alles synchronisiert",
    offline_pending: "Änderungen",
    offline_last_sync: "Letzte Sync",
    offline_never: "Noch nie",
    offline_just_now: "Gerade eben",

    // Defects
    defect_title: "Mängelmanagement",
    defect_new: "Neuer Mangel",
    defect_open: "Offen",
    defect_in_progress: "In Bearbeitung",
    defect_resolved: "Erledigt",
    defect_priority_low: "Niedrig",
    defect_priority_medium: "Mittel",
    defect_priority_high: "Hoch",
    defect_priority_critical: "Kritisch",

    // Checklists
    checklist_title: "Checklisten",
    checklist_progress: "Fortschritt",
    checklist_complete: "Abgeschlossen",
    checklist_incomplete: "Offen",

    // Team
    team_title: "Team",
    team_members: "Mitglieder",
    team_add_member: "Mitglied hinzufügen",
    team_tasks: "Aufgaben",

    // Weather
    weather_title: "Wetter",
    weather_temp: "Temperatur",
    weather_condition: "Bedingung",
    weather_humidity: "Luftfeuchtigkeit",
    weather_wind: "Wind",

    // Photo Gallery
    gallery_title: "Foto-Galerie",
    gallery_no_photos: "Keine Fotos",
    gallery_photos: "Fotos",

    // Stats
    stats_title: "Statistiken",
    stats_protocols_week: "Protokolle/Woche",
    stats_defects_status: "Mängel-Status",
    stats_activity: "Aktivität",

    // Export
    export_title: "Exportieren",
    export_all: "Alle exportieren",
    export_selected: "Ausgewählte exportieren",
    export_format: "Format",
  },
  en: {
    // General
    app_name: "ProtoKI",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    back: "Back",
    next: "Next",
    done: "Done",
    search: "Search",
    filter: "Filter",
    all: "All",
    none: "None",
    yes: "Yes",
    no: "No",
    ok: "OK",
    error: "Error",
    success: "Success",
    loading: "Loading...",
    retry: "Retry",

    // Navigation
    nav_home: "Record",
    nav_protocols: "Protocols",
    nav_settings: "Settings",

    // Projects
    project_select: "Select Project",
    project_new: "New Project",
    project_name: "Project Name",
    project_description: "Description",
    project_prefix: "Prefix",
    project_color: "Color",
    project_no_projects: "No Projects",
    project_create_first: "Create your first project",
    project_without: "Continue without project",
    project_protocols: "Protocols",
    project_active: "Active",
    project_archived: "Archive",
    project_favorites: "Favorites",
    project_sort_activity: "Activity",
    project_sort_name: "Name",
    project_sort_created: "Created",
    project_duplicate: "Duplicate",
    project_archive: "Archive",
    project_unarchive: "Restore",
    project_delete_confirm: "Really delete project?",
    project_delete_warning: "All associated protocols will also be deleted.",

    // Recording
    record_start: "Start Recording",
    record_stop: "Stop Recording",
    record_pause: "Pause",
    record_resume: "Resume",
    record_photo: "Take Photo",
    record_duration: "Duration",
    record_processing: "Processing...",
    record_transcribing: "Transcribing...",
    record_generating: "Generating protocol...",

    // Protocols
    protocol_title: "Protocol Title",
    protocol_no_protocols: "No Protocols",
    protocol_create_first: "Create your first protocol",
    protocol_share: "Share",
    protocol_export_pdf: "Export as PDF",
    protocol_delete_confirm: "Delete protocol?",

    // Settings
    settings_title: "Settings",
    settings_general: "General",
    settings_templates: "Templates",
    settings_notifications: "Notifications",
    settings_language: "Language",
    settings_theme: "Appearance",
    settings_theme_light: "Light",
    settings_theme_dark: "Dark",
    settings_theme_system: "System",
    settings_company: "Company Info",
    settings_about: "About",

    // Offline
    offline_banner: "Offline – Changes saved locally",
    offline_syncing: "Syncing",
    offline_synced: "Connected – All synced",
    offline_pending: "Changes",
    offline_last_sync: "Last Sync",
    offline_never: "Never",
    offline_just_now: "Just now",

    // Defects
    defect_title: "Defect Management",
    defect_new: "New Defect",
    defect_open: "Open",
    defect_in_progress: "In Progress",
    defect_resolved: "Resolved",
    defect_priority_low: "Low",
    defect_priority_medium: "Medium",
    defect_priority_high: "High",
    defect_priority_critical: "Critical",

    // Checklists
    checklist_title: "Checklists",
    checklist_progress: "Progress",
    checklist_complete: "Complete",
    checklist_incomplete: "Open",

    // Team
    team_title: "Team",
    team_members: "Members",
    team_add_member: "Add Member",
    team_tasks: "Tasks",

    // Weather
    weather_title: "Weather",
    weather_temp: "Temperature",
    weather_condition: "Condition",
    weather_humidity: "Humidity",
    weather_wind: "Wind",

    // Photo Gallery
    gallery_title: "Photo Gallery",
    gallery_no_photos: "No Photos",
    gallery_photos: "Photos",

    // Stats
    stats_title: "Statistics",
    stats_protocols_week: "Protocols/Week",
    stats_defects_status: "Defect Status",
    stats_activity: "Activity",

    // Export
    export_title: "Export",
    export_all: "Export All",
    export_selected: "Export Selected",
    export_format: "Format",
  },
  fr: {
    // General
    app_name: "ProtoKI",
    cancel: "Annuler",
    save: "Enregistrer",
    delete: "Supprimer",
    edit: "Modifier",
    close: "Fermer",
    back: "Retour",
    next: "Suivant",
    done: "Terminé",
    search: "Rechercher",
    filter: "Filtre",
    all: "Tous",
    none: "Aucun",
    yes: "Oui",
    no: "Non",
    ok: "OK",
    error: "Erreur",
    success: "Succès",
    loading: "Chargement...",
    retry: "Réessayer",

    // Navigation
    nav_home: "Enregistrer",
    nav_protocols: "Protocoles",
    nav_settings: "Paramètres",

    // Projects
    project_select: "Sélectionner un projet",
    project_new: "Nouveau projet",
    project_name: "Nom du projet",
    project_description: "Description",
    project_prefix: "Préfixe",
    project_color: "Couleur",
    project_no_projects: "Aucun projet",
    project_create_first: "Créez votre premier projet",
    project_without: "Continuer sans projet",
    project_protocols: "Protocoles",
    project_active: "Actif",
    project_archived: "Archives",
    project_favorites: "Favoris",
    project_sort_activity: "Activité",
    project_sort_name: "Nom",
    project_sort_created: "Créé",
    project_duplicate: "Dupliquer",
    project_archive: "Archiver",
    project_unarchive: "Restaurer",
    project_delete_confirm: "Vraiment supprimer le projet ?",
    project_delete_warning: "Tous les protocoles associés seront également supprimés.",

    // Recording
    record_start: "Démarrer l'enregistrement",
    record_stop: "Arrêter l'enregistrement",
    record_pause: "Pause",
    record_resume: "Reprendre",
    record_photo: "Prendre une photo",
    record_duration: "Durée",
    record_processing: "Traitement en cours...",
    record_transcribing: "Transcription...",
    record_generating: "Génération du protocole...",

    // Protocols
    protocol_title: "Titre du protocole",
    protocol_no_protocols: "Aucun protocole",
    protocol_create_first: "Créez votre premier protocole",
    protocol_share: "Partager",
    protocol_export_pdf: "Exporter en PDF",
    protocol_delete_confirm: "Supprimer le protocole ?",

    // Settings
    settings_title: "Paramètres",
    settings_general: "Général",
    settings_templates: "Modèles",
    settings_notifications: "Notifications",
    settings_language: "Langue",
    settings_theme: "Apparence",
    settings_theme_light: "Clair",
    settings_theme_dark: "Sombre",
    settings_theme_system: "Système",
    settings_company: "Données entreprise",
    settings_about: "À propos",

    // Offline
    offline_banner: "Hors ligne – Modifications enregistrées localement",
    offline_syncing: "Synchronisation",
    offline_synced: "Connecté – Tout synchronisé",
    offline_pending: "Modifications",
    offline_last_sync: "Dernière sync",
    offline_never: "Jamais",
    offline_just_now: "À l'instant",

    // Defects
    defect_title: "Gestion des défauts",
    defect_new: "Nouveau défaut",
    defect_open: "Ouvert",
    defect_in_progress: "En cours",
    defect_resolved: "Résolu",
    defect_priority_low: "Faible",
    defect_priority_medium: "Moyen",
    defect_priority_high: "Élevé",
    defect_priority_critical: "Critique",

    // Checklists
    checklist_title: "Listes de contrôle",
    checklist_progress: "Progression",
    checklist_complete: "Terminé",
    checklist_incomplete: "Ouvert",

    // Team
    team_title: "Équipe",
    team_members: "Membres",
    team_add_member: "Ajouter un membre",
    team_tasks: "Tâches",

    // Weather
    weather_title: "Météo",
    weather_temp: "Température",
    weather_condition: "Condition",
    weather_humidity: "Humidité",
    weather_wind: "Vent",

    // Photo Gallery
    gallery_title: "Galerie photos",
    gallery_no_photos: "Aucune photo",
    gallery_photos: "Photos",

    // Stats
    stats_title: "Statistiques",
    stats_protocols_week: "Protocoles/Semaine",
    stats_defects_status: "État des défauts",
    stats_activity: "Activité",

    // Export
    export_title: "Exporter",
    export_all: "Tout exporter",
    export_selected: "Exporter la sélection",
    export_format: "Format",
  },
} as const;

export async function getLanguage(): Promise<Language> {
  try {
    const lang = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (lang && (lang === "de" || lang === "en" || lang === "fr")) {
      return lang as Language;
    }
    return "de";
  } catch {
    return "de";
  }
}

export async function setLanguage(lang: Language): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}

export function t(key: TranslationKey, lang: Language = "de"): string {
  return translations[lang]?.[key] || translations.de[key] || key;
}

export const LANGUAGE_OPTIONS: { id: Language; name: string; flag: string }[] = [
  { id: "de", name: "Deutsch", flag: "🇩🇪" },
  { id: "en", name: "English", flag: "🇬🇧" },
  { id: "fr", name: "Français", flag: "🇫🇷" },
];
