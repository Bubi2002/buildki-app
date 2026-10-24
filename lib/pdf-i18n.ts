import type { Language } from "@/lib/i18n";

/**
 * Localised CHROME labels for the generated PDFs (column headers, meta labels,
 * section titles, report-type names) + the date locale. The AI-generated TEXT
 * content stays in the recording language; only the fixed labels follow the
 * chosen app language. German is the canonical fallback.
 *
 * uk/pl/ru/ro/bg/tr are best-effort; native review advised.
 */

const LOCALES: Record<Language, string> = {
  de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", uk: "uk-UA",
  pl: "pl-PL", ru: "ru-RU", ro: "ro-RO", bg: "bg-BG", tr: "tr-TR",
};

export function pdfLocale(lang: Language): string {
  return LOCALES[lang] || "de-DE";
}

export type PdfLabels = {
  project: string; reportType: string; date: string; time: string; address: string;
  createdBy: string; protocolNr: string; duration: string; attachmentOne: string; attachmentMany: string;
  defectsTasks: string; done: string; open: string;
  colNr: string; colLocation: string; colDescription: string; colTrade: string; colDeadline: string;
  checklistResults: string; inspector: string; photoDocs: string; release: string;
  acknowledged: string; placeDate: string; overview: string; detail: string;
  summary: string; recommendedActions: string; photo: string;
  createdOn: string; colStatus: string; colPriority: string; colResponsible: string; colDescShort: string;
  openTasks: string; completed: string; photos: string;
  contents: string; floor: string; room: string; noPhotos: string; page: string;
  pleaseCheck: string; change: string; orWord: string; pleaseSpecify: string;
};

const DE: PdfLabels = {
  project: "Projekt", reportType: "Berichtstyp", date: "Datum", time: "Uhrzeit", address: "Adresse",
  createdBy: "Erstellt durch", protocolNr: "Protokoll-Nr.", duration: "Aufnahmedauer", attachmentOne: "Beleg", attachmentMany: "Belege",
  defectsTasks: "Mängel & Aufgaben", done: "erledigt", open: "offen",
  colNr: "Nr.", colLocation: "Ort / Raum", colDescription: "Mangelbeschreibung", colTrade: "Gewerk / Verantwortlich", colDeadline: "Frist zur Beseitigung",
  checklistResults: "Checklisten-Ergebnisse", inspector: "Prüfer", photoDocs: "Fotodokumentation", release: "Freigabe",
  acknowledged: "Zur Kenntnis genommen", placeDate: "Ort, Datum", overview: "Übersicht (Gesamtplan)", detail: "Detailausschnitt",
  summary: "Zusammenfassung", recommendedActions: "Empfohlene Maßnahmen", photo: "Foto",
  createdOn: "Erstellt am", colStatus: "Status", colPriority: "Priorität", colResponsible: "Verantwortlich", colDescShort: "Beschreibung",
  openTasks: "Offene Aufgaben", completed: "Erledigt", photos: "Fotos",
  contents: "Inhalt", floor: "Geschoss", room: "Raum", noPhotos: "Keine Fotos erfasst.", page: "Seite",
  pleaseCheck: "BITTE ANKREUZEN:", change: "Änderung", orWord: "oder", pleaseSpecify: "(bitte hier angeben)",
};

const EN: PdfLabels = {
  project: "Project", reportType: "Report type", date: "Date", time: "Time", address: "Address",
  createdBy: "Created by", protocolNr: "Report no.", duration: "Recording duration", attachmentOne: "Attachment", attachmentMany: "Attachments",
  defectsTasks: "Defects & Tasks", done: "done", open: "open",
  colNr: "No.", colLocation: "Location / Room", colDescription: "Defect description", colTrade: "Trade / Responsible", colDeadline: "Deadline",
  checklistResults: "Checklist results", inspector: "Inspector", photoDocs: "Photo documentation", release: "Sign-off",
  acknowledged: "Acknowledged", placeDate: "Place, date", overview: "Overview (full plan)", detail: "Detail section",
  summary: "Summary", recommendedActions: "Recommended actions", photo: "Photo",
  createdOn: "Created on", colStatus: "Status", colPriority: "Priority", colResponsible: "Responsible", colDescShort: "Description",
  openTasks: "Open tasks", completed: "Completed", photos: "Photos",
  contents: "Contents", floor: "Floor", room: "Room", noPhotos: "No photos recorded.", page: "Page",
  pleaseCheck: "PLEASE TICK:", change: "Change", orWord: "or", pleaseSpecify: "(please specify here)",
};

const FR: PdfLabels = {
  project: "Projet", reportType: "Type de rapport", date: "Date", time: "Heure", address: "Adresse",
  createdBy: "Créé par", protocolNr: "N° de rapport", duration: "Durée d'enregistrement", attachmentOne: "Pièce jointe", attachmentMany: "Pièces jointes",
  defectsTasks: "Défauts et tâches", done: "fait", open: "ouvert",
  colNr: "N°", colLocation: "Lieu / Pièce", colDescription: "Description du défaut", colTrade: "Corps d'état / Responsable", colDeadline: "Délai",
  checklistResults: "Résultats de la liste de contrôle", inspector: "Contrôleur", photoDocs: "Documentation photo", release: "Validation",
  acknowledged: "Pris connaissance", placeDate: "Lieu, date", overview: "Vue d'ensemble (plan complet)", detail: "Extrait de détail",
  summary: "Résumé", recommendedActions: "Mesures recommandées", photo: "Photo",
  createdOn: "Créé le", colStatus: "Statut", colPriority: "Priorité", colResponsible: "Responsable", colDescShort: "Description",
  openTasks: "Tâches ouvertes", completed: "Terminé", photos: "Photos",
  contents: "Sommaire", floor: "Étage", room: "Pièce", noPhotos: "Aucune photo enregistrée.", page: "Page",
  pleaseCheck: "COCHER SVP :", change: "Modification", orWord: "ou", pleaseSpecify: "(à préciser ici)",
};

const ES: PdfLabels = {
  project: "Proyecto", reportType: "Tipo de informe", date: "Fecha", time: "Hora", address: "Dirección",
  createdBy: "Creado por", protocolNr: "N.º de informe", duration: "Duración de la grabación", attachmentOne: "Anexo", attachmentMany: "Anexos",
  defectsTasks: "Defectos y tareas", done: "hecho", open: "abierto",
  colNr: "N.º", colLocation: "Lugar / Sala", colDescription: "Descripción del defecto", colTrade: "Oficio / Responsable", colDeadline: "Plazo",
  checklistResults: "Resultados de la lista de control", inspector: "Inspector", photoDocs: "Documentación fotográfica", release: "Aprobación",
  acknowledged: "Enterado", placeDate: "Lugar, fecha", overview: "Vista general (plano completo)", detail: "Detalle",
  summary: "Resumen", recommendedActions: "Medidas recomendadas", photo: "Foto",
  createdOn: "Creado el", colStatus: "Estado", colPriority: "Prioridad", colResponsible: "Responsable", colDescShort: "Descripción",
  openTasks: "Tareas abiertas", completed: "Completado", photos: "Fotos",
  contents: "Índice", floor: "Planta", room: "Sala", noPhotos: "No se registraron fotos.", page: "Página",
  pleaseCheck: "MARCAR POR FAVOR:", change: "Cambio", orWord: "o", pleaseSpecify: "(especificar aquí)",
};

const PL: PdfLabels = {
  project: "Projekt", reportType: "Typ raportu", date: "Data", time: "Godzina", address: "Adres",
  createdBy: "Utworzył", protocolNr: "Nr raportu", duration: "Czas nagrania", attachmentOne: "Załącznik", attachmentMany: "Załączniki",
  defectsTasks: "Usterki i zadania", done: "wykonane", open: "otwarte",
  colNr: "Nr", colLocation: "Miejsce / Pomieszczenie", colDescription: "Opis usterki", colTrade: "Branża / Odpowiedzialny", colDeadline: "Termin",
  checklistResults: "Wyniki listy kontrolnej", inspector: "Kontroler", photoDocs: "Dokumentacja fotograficzna", release: "Zatwierdzenie",
  acknowledged: "Przyjęto do wiadomości", placeDate: "Miejscowość, data", overview: "Przegląd (cały plan)", detail: "Fragment szczegółowy",
  summary: "Podsumowanie", recommendedActions: "Zalecane działania", photo: "Zdjęcie",
  createdOn: "Utworzono", colStatus: "Status", colPriority: "Priorytet", colResponsible: "Odpowiedzialny", colDescShort: "Opis",
  openTasks: "Otwarte zadania", completed: "Ukończone", photos: "Zdjęcia",
  contents: "Spis treści", floor: "Kondygnacja", room: "Pomieszczenie", noPhotos: "Brak zdjęć.", page: "Strona",
  pleaseCheck: "PROSZĘ ZAZNACZYĆ:", change: "Zmiana", orWord: "lub", pleaseSpecify: "(proszę podać tutaj)",
};

const RU: PdfLabels = {
  project: "Проект", reportType: "Тип отчёта", date: "Дата", time: "Время", address: "Адрес",
  createdBy: "Создал", protocolNr: "№ отчёта", duration: "Длительность записи", attachmentOne: "Приложение", attachmentMany: "Приложения",
  defectsTasks: "Дефекты и задачи", done: "выполнено", open: "открыто",
  colNr: "№", colLocation: "Место / Помещение", colDescription: "Описание дефекта", colTrade: "Раздел / Ответственный", colDeadline: "Срок",
  checklistResults: "Результаты чек-листа", inspector: "Проверяющий", photoDocs: "Фотодокументация", release: "Согласование",
  acknowledged: "Ознакомлен", placeDate: "Место, дата", overview: "Обзор (полный план)", detail: "Фрагмент",
  summary: "Сводка", recommendedActions: "Рекомендуемые меры", photo: "Фото",
  createdOn: "Создано", colStatus: "Статус", colPriority: "Приоритет", colResponsible: "Ответственный", colDescShort: "Описание",
  openTasks: "Открытые задачи", completed: "Выполнено", photos: "Фото",
  contents: "Содержание", floor: "Этаж", room: "Помещение", noPhotos: "Фото не добавлены.", page: "Стр.",
  pleaseCheck: "ОТМЕТЬТЕ:", change: "Изменение", orWord: "или", pleaseSpecify: "(укажите здесь)",
};

const UK: PdfLabels = {
  project: "Проєкт", reportType: "Тип звіту", date: "Дата", time: "Час", address: "Адреса",
  createdBy: "Створив", protocolNr: "№ звіту", duration: "Тривалість запису", attachmentOne: "Додаток", attachmentMany: "Додатки",
  defectsTasks: "Дефекти та завдання", done: "виконано", open: "відкрито",
  colNr: "№", colLocation: "Місце / Приміщення", colDescription: "Опис дефекту", colTrade: "Розділ / Відповідальний", colDeadline: "Строк",
  checklistResults: "Результати чек-листа", inspector: "Перевіряючий", photoDocs: "Фотодокументація", release: "Погодження",
  acknowledged: "Ознайомлено", placeDate: "Місце, дата", overview: "Огляд (повний план)", detail: "Фрагмент",
  summary: "Підсумок", recommendedActions: "Рекомендовані заходи", photo: "Фото",
  createdOn: "Створено", colStatus: "Статус", colPriority: "Пріоритет", colResponsible: "Відповідальний", colDescShort: "Опис",
  openTasks: "Відкриті завдання", completed: "Виконано", photos: "Фото",
  contents: "Зміст", floor: "Поверх", room: "Приміщення", noPhotos: "Фото не додані.", page: "Стор.",
  pleaseCheck: "ПОЗНАЧТЕ:", change: "Зміна", orWord: "або", pleaseSpecify: "(вкажіть тут)",
};

const RO: PdfLabels = {
  project: "Proiect", reportType: "Tip de raport", date: "Data", time: "Ora", address: "Adresă",
  createdBy: "Creat de", protocolNr: "Nr. raport", duration: "Durata înregistrării", attachmentOne: "Anexă", attachmentMany: "Anexe",
  defectsTasks: "Defecte și sarcini", done: "finalizat", open: "deschis",
  colNr: "Nr.", colLocation: "Loc / Încăpere", colDescription: "Descrierea defectului", colTrade: "Specialitate / Responsabil", colDeadline: "Termen",
  checklistResults: "Rezultatele listei de verificare", inspector: "Inspector", photoDocs: "Documentație foto", release: "Aprobare",
  acknowledged: "Luat la cunoștință", placeDate: "Loc, data", overview: "Prezentare generală (plan complet)", detail: "Detaliu",
  summary: "Rezumat", recommendedActions: "Măsuri recomandate", photo: "Foto",
  createdOn: "Creat la", colStatus: "Stare", colPriority: "Prioritate", colResponsible: "Responsabil", colDescShort: "Descriere",
  openTasks: "Sarcini deschise", completed: "Finalizat", photos: "Foto",
  contents: "Cuprins", floor: "Etaj", room: "Încăpere", noPhotos: "Nicio fotografie.", page: "Pagina",
  pleaseCheck: "BIFAȚI:", change: "Modificare", orWord: "sau", pleaseSpecify: "(precizați aici)",
};

const BG: PdfLabels = {
  project: "Проект", reportType: "Тип на отчета", date: "Дата", time: "Час", address: "Адрес",
  createdBy: "Създадено от", protocolNr: "№ на отчета", duration: "Продължителност на записа", attachmentOne: "Приложение", attachmentMany: "Приложения",
  defectsTasks: "Дефекти и задачи", done: "изпълнено", open: "отворено",
  colNr: "№", colLocation: "Място / Помещение", colDescription: "Описание на дефекта", colTrade: "Част / Отговорник", colDeadline: "Срок",
  checklistResults: "Резултати от контролния списък", inspector: "Проверяващ", photoDocs: "Фотодокументация", release: "Одобрение",
  acknowledged: "Запознат", placeDate: "Място, дата", overview: "Преглед (пълен план)", detail: "Детайл",
  summary: "Обобщение", recommendedActions: "Препоръчани мерки", photo: "Снимка",
  createdOn: "Създадено на", colStatus: "Статус", colPriority: "Приоритет", colResponsible: "Отговорник", colDescShort: "Описание",
  openTasks: "Отворени задачи", completed: "Изпълнено", photos: "Снимки",
  contents: "Съдържание", floor: "Етаж", room: "Помещение", noPhotos: "Няма снимки.", page: "Стр.",
  pleaseCheck: "МОЛЯ, ОТБЕЛЕЖЕТЕ:", change: "Промяна", orWord: "или", pleaseSpecify: "(моля, посочете тук)",
};

const TR: PdfLabels = {
  project: "Proje", reportType: "Rapor türü", date: "Tarih", time: "Saat", address: "Adres",
  createdBy: "Oluşturan", protocolNr: "Rapor no.", duration: "Kayıt süresi", attachmentOne: "Ek", attachmentMany: "Ekler",
  defectsTasks: "Kusurlar ve görevler", done: "tamamlandı", open: "açık",
  colNr: "No.", colLocation: "Yer / Oda", colDescription: "Kusur açıklaması", colTrade: "Meslek / Sorumlu", colDeadline: "Son tarih",
  checklistResults: "Kontrol listesi sonuçları", inspector: "Denetçi", photoDocs: "Fotoğraf dokümantasyonu", release: "Onay",
  acknowledged: "Bilgilendirildi", placeDate: "Yer, tarih", overview: "Genel bakış (tam plan)", detail: "Detay",
  summary: "Özet", recommendedActions: "Önerilen önlemler", photo: "Fotoğraf",
  createdOn: "Oluşturulma", colStatus: "Durum", colPriority: "Öncelik", colResponsible: "Sorumlu", colDescShort: "Açıklama",
  openTasks: "Açık görevler", completed: "Tamamlandı", photos: "Fotoğraflar",
  contents: "İçindekiler", floor: "Kat", room: "Oda", noPhotos: "Fotoğraf yok.", page: "Sayfa",
  pleaseCheck: "LÜTFEN İŞARETLEYİN:", change: "Değişiklik", orWord: "veya", pleaseSpecify: "(lütfen burada belirtin)",
};

const LABELS: Record<Language, PdfLabels> = { de: DE, en: EN, fr: FR, es: ES, pl: PL, ru: RU, uk: UK, ro: RO, bg: BG, tr: TR };

export function getPdfLabels(lang: Language): PdfLabels {
  return LABELS[lang] || DE;
}

// Report-type (template) names, keyed by templateId.
const REPORT_TYPES: Record<string, Partial<Record<Language, string>>> = {
  "baustellenbericht": { en: "Site report", fr: "Rapport de chantier", es: "Informe de obra", pl: "Raport z budowy", ru: "Отчёт со стройплощадки", uk: "Звіт з будмайданчика", ro: "Raport de șantier", bg: "Отчет от строежа", tr: "Şantiye raporu" },
  "besprechungsnotiz": { en: "Meeting note", fr: "Note de réunion", es: "Nota de reunión", pl: "Notatka ze spotkania", ru: "Заметка о встрече", uk: "Нотатка зустрічі", ro: "Notă de ședință", bg: "Бележка от среща", tr: "Toplantı notu" },
  "maengelliste": { en: "Defect list", fr: "Liste des défauts", es: "Lista de defectos", pl: "Lista usterek", ru: "Дефектная ведомость", uk: "Перелік дефектів", ro: "Listă de defecte", bg: "Списък с дефекти", tr: "Kusur listesi" },
  "tagesbericht": { en: "Daily report", fr: "Rapport journalier", es: "Informe diario", pl: "Raport dzienny", ru: "Ежедневный отчёт", uk: "Щоденний звіт", ro: "Raport zilnic", bg: "Дневен отчет", tr: "Günlük rapor" },
  "abnahmeprotokoll": { en: "Acceptance report", fr: "Procès-verbal de réception", es: "Acta de recepción", pl: "Protokół odbioru", ru: "Акт приёмки", uk: "Акт приймання", ro: "Proces-verbal de recepție", bg: "Приемо-предавателен протокол", tr: "Kabul tutanağı" },
  "zusammenfassung-ki": { en: "Summary", fr: "Résumé", es: "Resumen", pl: "Podsumowanie", ru: "Сводка", uk: "Підсумок", ro: "Rezumat", bg: "Обобщение", tr: "Özet" },
  "besprechungszusammenfassung-ki": { en: "Meeting summary", fr: "Résumé de réunion", es: "Resumen de reunión", pl: "Podsumowanie spotkania", ru: "Сводка встречи", uk: "Підсумок зустрічі", ro: "Rezumatul ședinței", bg: "Обобщение на срещата", tr: "Toplantı özeti" },
  "begruendungszusammenfassung-ki": { en: "Rationale summary", fr: "Résumé justificatif", es: "Resumen justificativo", pl: "Podsumowanie uzasadnienia", ru: "Сводка обоснования", uk: "Підсумок обґрунтування", ro: "Rezumatul motivării", bg: "Обобщение на обосновката", tr: "Gerekçe özeti" },
  "sitzungsprotokoll-ki": { en: "Minutes", fr: "Compte rendu de séance", es: "Acta de la sesión", pl: "Protokół posiedzenia", ru: "Протокол заседания", uk: "Протокол засідання", ro: "Proces-verbal de ședință", bg: "Протокол от заседание", tr: "Oturum tutanağı" },
  "gutachterliche-bewertung": { en: "Expert assessment", fr: "Évaluation d'expert", es: "Evaluación pericial", pl: "Ocena rzeczoznawcy", ru: "Экспертная оценка", uk: "Експертна оцінка", ro: "Evaluare de expertiză", bg: "Експертна оценка", tr: "Bilirkişi değerlendirmesi" },
  "freitext": { en: "Free-form report", fr: "Rapport libre", es: "Informe libre", pl: "Raport dowolny", ru: "Свободный отчёт", uk: "Довільний звіт", ro: "Raport liber", bg: "Свободен отчет", tr: "Serbest rapor" },
};

/** Localise the report-type/template name (by templateId) for the PDF. */
export function localizeReportType(templateId: string | undefined, germanName: string, lang: Language): string {
  if (lang === "de" || !templateId) return germanName;
  return REPORT_TYPES[templateId]?.[lang] ?? germanName;
}
