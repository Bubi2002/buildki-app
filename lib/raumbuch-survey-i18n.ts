import type { Language } from "@/lib/i18n";

/**
 * Display translations for the room-survey questionnaire (RAUMBUCH_SURVEY in
 * raumbuch-store). The stored survey state uses the GERMAN option labels as the
 * identifier, so these translations are DISPLAY-ONLY — toggling/saving keeps the
 * German label. German is the canonical source; codes like "GK Q2/Q3/Q4" are
 * language-neutral and pass through unchanged.
 *
 * NOTE: uk/pl/ru/ro/bg/tr technical terms are best-effort; native review advised.
 */

type Tr = { groups: Record<string, string>; options: Record<string, string> };

const EN: Tr = {
  groups: { innenwaende: "Interior walls", boden: "Floor", decke: "Ceiling", installationen: "Installations", schallschutz: "Sound insulation" },
  options: {
    "Betonoptik": "Concrete look", "Vlies": "Lining fleece", "Anstrich weiß": "Paint white", "Anstrich farbig": "Paint coloured", "Fliesen": "Tiles", "Sichtbeton": "Exposed concrete", "Holzverkleidung": "Wood cladding", "Akustikpaneel": "Acoustic panel", "Sonstiges": "Other",
    "Estrich roh": "Raw screed", "Vinyl": "Vinyl", "Parkett": "Parquet", "Epoxidharz": "Epoxy resin", "Teppich": "Carpet", "Sockelleiste fehlt": "Skirting board missing", "Fuge nacharbeiten": "Joint needs rework",
    "Beton roh": "Raw concrete", "GK glatt": "Plasterboard smooth", "GK-Lochdecke": "Perforated plasterboard ceiling", "Rasterdecke": "Grid ceiling", "Akustikdecke": "Acoustic ceiling", "Schattenfuge": "Shadow gap", "Revisionsklappe": "Access panel",
    "Kabel vorhanden": "Cables present", "Kabel beschriften": "Label cables", "Steckdosen fehlen": "Sockets missing", "Schalter fehlt": "Switch missing", "Netzwerk fehlt": "Network missing", "Sanitär offen": "Plumbing open", "Lüftung offen": "Ventilation open", "Brandschutz offen": "Fire protection open",
    "Baffel": "Baffle", "Segel": "Acoustic sail", "Paneel": "Panel", "Wandabsorber": "Wall absorber",
  },
};

const FR: Tr = {
  groups: { innenwaende: "Murs intérieurs", boden: "Sol", decke: "Plafond", installationen: "Installations", schallschutz: "Isolation acoustique" },
  options: {
    "Betonoptik": "Aspect béton", "Vlies": "Toile de verre", "Anstrich weiß": "Peinture blanche", "Anstrich farbig": "Peinture couleur", "Fliesen": "Carrelage", "Sichtbeton": "Béton apparent", "Holzverkleidung": "Habillage bois", "Akustikpaneel": "Panneau acoustique", "Sonstiges": "Autre",
    "Estrich roh": "Chape brute", "Vinyl": "Vinyle", "Parkett": "Parquet", "Epoxidharz": "Résine époxy", "Teppich": "Moquette", "Sockelleiste fehlt": "Plinthe manquante", "Fuge nacharbeiten": "Joint à reprendre",
    "Beton roh": "Béton brut", "GK glatt": "Placo lisse", "GK-Lochdecke": "Plafond placo perforé", "Rasterdecke": "Plafond à trame", "Akustikdecke": "Plafond acoustique", "Schattenfuge": "Joint creux", "Revisionsklappe": "Trappe de visite",
    "Kabel vorhanden": "Câbles présents", "Kabel beschriften": "Repérer les câbles", "Steckdosen fehlen": "Prises manquantes", "Schalter fehlt": "Interrupteur manquant", "Netzwerk fehlt": "Réseau manquant", "Sanitär offen": "Plomberie en attente", "Lüftung offen": "Ventilation en attente", "Brandschutz offen": "Protection incendie en attente",
    "Baffel": "Baffle acoustique", "Segel": "Voile acoustique", "Paneel": "Panneau", "Wandabsorber": "Absorbeur mural",
  },
};

const ES: Tr = {
  groups: { innenwaende: "Paredes interiores", boden: "Suelo", decke: "Techo", installationen: "Instalaciones", schallschutz: "Aislamiento acústico" },
  options: {
    "Betonoptik": "Aspecto hormigón", "Vlies": "Velo/fibra", "Anstrich weiß": "Pintura blanca", "Anstrich farbig": "Pintura de color", "Fliesen": "Azulejos", "Sichtbeton": "Hormigón visto", "Holzverkleidung": "Revestimiento de madera", "Akustikpaneel": "Panel acústico", "Sonstiges": "Otros",
    "Estrich roh": "Solera en bruto", "Vinyl": "Vinilo", "Parkett": "Parquet", "Epoxidharz": "Resina epoxi", "Teppich": "Moqueta", "Sockelleiste fehlt": "Falta rodapié", "Fuge nacharbeiten": "Junta a repasar",
    "Beton roh": "Hormigón en bruto", "GK glatt": "Pladur liso", "GK-Lochdecke": "Techo de pladur perforado", "Rasterdecke": "Techo registrable", "Akustikdecke": "Techo acústico", "Schattenfuge": "Junta de sombra", "Revisionsklappe": "Trampilla de registro",
    "Kabel vorhanden": "Cables presentes", "Kabel beschriften": "Etiquetar cables", "Steckdosen fehlen": "Faltan enchufes", "Schalter fehlt": "Falta interruptor", "Netzwerk fehlt": "Falta red", "Sanitär offen": "Fontanería pendiente", "Lüftung offen": "Ventilación pendiente", "Brandschutz offen": "Protección contra incendios pendiente",
    "Baffel": "Bafle acústico", "Segel": "Vela acústica", "Paneel": "Panel", "Wandabsorber": "Absorbente de pared",
  },
};

const PL: Tr = {
  groups: { innenwaende: "Ściany wewnętrzne", boden: "Podłoga", decke: "Sufit", installationen: "Instalacje", schallschutz: "Izolacja akustyczna" },
  options: {
    "Betonoptik": "Imitacja betonu", "Vlies": "Włóknina", "Anstrich weiß": "Malowanie białe", "Anstrich farbig": "Malowanie kolorowe", "Fliesen": "Płytki", "Sichtbeton": "Beton architektoniczny", "Holzverkleidung": "Okładzina drewniana", "Akustikpaneel": "Panel akustyczny", "Sonstiges": "Inne",
    "Estrich roh": "Jastrych surowy", "Vinyl": "Winyl", "Parkett": "Parkiet", "Epoxidharz": "Żywica epoksydowa", "Teppich": "Wykładzina dywanowa", "Sockelleiste fehlt": "Brak listwy przypodłogowej", "Fuge nacharbeiten": "Fuga do poprawy",
    "Beton roh": "Beton surowy", "GK glatt": "Płyta GK gładka", "GK-Lochdecke": "Sufit GK perforowany", "Rasterdecke": "Sufit rastrowy", "Akustikdecke": "Sufit akustyczny", "Schattenfuge": "Fuga cieniowa", "Revisionsklappe": "Klapa rewizyjna",
    "Kabel vorhanden": "Kable obecne", "Kabel beschriften": "Opisać kable", "Steckdosen fehlen": "Brak gniazdek", "Schalter fehlt": "Brak włącznika", "Netzwerk fehlt": "Brak sieci", "Sanitär offen": "Instalacja sanitarna otwarta", "Lüftung offen": "Wentylacja otwarta", "Brandschutz offen": "Ochrona ppoż. otwarta",
    "Baffel": "Baffle akustyczny", "Segel": "Żagiel akustyczny", "Paneel": "Panel", "Wandabsorber": "Absorber ścienny",
  },
};

const RU: Tr = {
  groups: { innenwaende: "Внутренние стены", boden: "Пол", decke: "Потолок", installationen: "Инженерные сети", schallschutz: "Звукоизоляция" },
  options: {
    "Betonoptik": "Под бетон", "Vlies": "Флизелин", "Anstrich weiß": "Покраска белая", "Anstrich farbig": "Покраска цветная", "Fliesen": "Плитка", "Sichtbeton": "Открытый бетон", "Holzverkleidung": "Деревянная обшивка", "Akustikpaneel": "Акустическая панель", "Sonstiges": "Прочее",
    "Estrich roh": "Стяжка черновая", "Vinyl": "Винил", "Parkett": "Паркет", "Epoxidharz": "Эпоксидная смола", "Teppich": "Ковролин", "Sockelleiste fehlt": "Нет плинтуса", "Fuge nacharbeiten": "Шов доработать",
    "Beton roh": "Бетон черновой", "GK glatt": "ГКЛ гладкий", "GK-Lochdecke": "Перфорированный потолок ГКЛ", "Rasterdecke": "Растровый потолок", "Akustikdecke": "Акустический потолок", "Schattenfuge": "Теневой шов", "Revisionsklappe": "Ревизионный люк",
    "Kabel vorhanden": "Кабели есть", "Kabel beschriften": "Промаркировать кабели", "Steckdosen fehlen": "Нет розеток", "Schalter fehlt": "Нет выключателя", "Netzwerk fehlt": "Нет сети", "Sanitär offen": "Сантехника открыта", "Lüftung offen": "Вентиляция открыта", "Brandschutz offen": "Пожарная защита открыта",
    "Baffel": "Акустический баффл", "Segel": "Акустический парус", "Paneel": "Панель", "Wandabsorber": "Настенный абсорбер",
  },
};

const UK: Tr = {
  groups: { innenwaende: "Внутрішні стіни", boden: "Підлога", decke: "Стеля", installationen: "Інженерні мережі", schallschutz: "Звукоізоляція" },
  options: {
    "Betonoptik": "Під бетон", "Vlies": "Флізелін", "Anstrich weiß": "Фарбування біле", "Anstrich farbig": "Фарбування кольорове", "Fliesen": "Плитка", "Sichtbeton": "Відкритий бетон", "Holzverkleidung": "Дерев'яне облицювання", "Akustikpaneel": "Акустична панель", "Sonstiges": "Інше",
    "Estrich roh": "Стяжка чорнова", "Vinyl": "Вініл", "Parkett": "Паркет", "Epoxidharz": "Епоксидна смола", "Teppich": "Килимове покриття", "Sockelleiste fehlt": "Немає плінтуса", "Fuge nacharbeiten": "Шов доробити",
    "Beton roh": "Бетон чорновий", "GK glatt": "ГКЛ гладкий", "GK-Lochdecke": "Перфорована стеля ГКЛ", "Rasterdecke": "Растрова стеля", "Akustikdecke": "Акустична стеля", "Schattenfuge": "Тіньовий шов", "Revisionsklappe": "Ревізійний люк",
    "Kabel vorhanden": "Кабелі є", "Kabel beschriften": "Промаркувати кабелі", "Steckdosen fehlen": "Немає розеток", "Schalter fehlt": "Немає вимикача", "Netzwerk fehlt": "Немає мережі", "Sanitär offen": "Сантехніка відкрита", "Lüftung offen": "Вентиляція відкрита", "Brandschutz offen": "Пожежний захист відкритий",
    "Baffel": "Акустичний бафл", "Segel": "Акустичне вітрило", "Paneel": "Панель", "Wandabsorber": "Настінний абсорбер",
  },
};

const RO: Tr = {
  groups: { innenwaende: "Pereți interiori", boden: "Pardoseală", decke: "Tavan", installationen: "Instalații", schallschutz: "Izolație fonică" },
  options: {
    "Betonoptik": "Aspect de beton", "Vlies": "Fibră/vlies", "Anstrich weiß": "Vopsea albă", "Anstrich farbig": "Vopsea colorată", "Fliesen": "Faianță/gresie", "Sichtbeton": "Beton aparent", "Holzverkleidung": "Placare din lemn", "Akustikpaneel": "Panou acustic", "Sonstiges": "Altele",
    "Estrich roh": "Șapă brută", "Vinyl": "Vinil", "Parkett": "Parchet", "Epoxidharz": "Rășină epoxidică", "Teppich": "Mochetă", "Sockelleiste fehlt": "Lipsește plinta", "Fuge nacharbeiten": "Rost de refăcut",
    "Beton roh": "Beton brut", "GK glatt": "Gips-carton neted", "GK-Lochdecke": "Tavan gips-carton perforat", "Rasterdecke": "Tavan casetat", "Akustikdecke": "Tavan acustic", "Schattenfuge": "Rost de umbră", "Revisionsklappe": "Trapă de vizitare",
    "Kabel vorhanden": "Cabluri prezente", "Kabel beschriften": "Etichetare cabluri", "Steckdosen fehlen": "Lipsesc prize", "Schalter fehlt": "Lipsește întrerupător", "Netzwerk fehlt": "Lipsește rețea", "Sanitär offen": "Sanitare în lucru", "Lüftung offen": "Ventilație în lucru", "Brandschutz offen": "Protecție la incendiu în lucru",
    "Baffel": "Baffle acustic", "Segel": "Pânză acustică", "Paneel": "Panou", "Wandabsorber": "Absorbant de perete",
  },
};

const BG: Tr = {
  groups: { innenwaende: "Вътрешни стени", boden: "Под", decke: "Таван", installationen: "Инсталации", schallschutz: "Шумоизолация" },
  options: {
    "Betonoptik": "Имитация на бетон", "Vlies": "Флис/нетъкан текстил", "Anstrich weiß": "Боядисване бяло", "Anstrich farbig": "Боядисване цветно", "Fliesen": "Плочки", "Sichtbeton": "Видим бетон", "Holzverkleidung": "Дървена облицовка", "Akustikpaneel": "Акустичен панел", "Sonstiges": "Друго",
    "Estrich roh": "Замазка груба", "Vinyl": "Винил", "Parkett": "Паркет", "Epoxidharz": "Епоксидна смола", "Teppich": "Мокет", "Sockelleiste fehlt": "Липсва первази", "Fuge nacharbeiten": "Фуга за доработка",
    "Beton roh": "Бетон груб", "GK glatt": "Гипсокартон гладък", "GK-Lochdecke": "Перфориран гипсокартонен таван", "Rasterdecke": "Растерен таван", "Akustikdecke": "Акустичен таван", "Schattenfuge": "Сенчеста фуга", "Revisionsklappe": "Ревизионна клапа",
    "Kabel vorhanden": "Налични кабели", "Kabel beschriften": "Маркиране на кабели", "Steckdosen fehlen": "Липсват контакти", "Schalter fehlt": "Липсва ключ", "Netzwerk fehlt": "Липсва мрежа", "Sanitär offen": "ВиК предстои", "Lüftung offen": "Вентилация предстои", "Brandschutz offen": "Пожарна защита предстои",
    "Baffel": "Акустичен бафъл", "Segel": "Акустично платно", "Paneel": "Панел", "Wandabsorber": "Стенен абсорбер",
  },
};

const TR: Tr = {
  groups: { innenwaende: "İç duvarlar", boden: "Zemin", decke: "Tavan", installationen: "Tesisatlar", schallschutz: "Ses yalıtımı" },
  options: {
    "Betonoptik": "Beton görünüm", "Vlies": "Duvar kağıdı keçesi", "Anstrich weiß": "Boya beyaz", "Anstrich farbig": "Boya renkli", "Fliesen": "Seramik", "Sichtbeton": "Brüt beton", "Holzverkleidung": "Ahşap kaplama", "Akustikpaneel": "Akustik panel", "Sonstiges": "Diğer",
    "Estrich roh": "Ham şap", "Vinyl": "Vinil", "Parkett": "Parke", "Epoxidharz": "Epoksi reçine", "Teppich": "Halı", "Sockelleiste fehlt": "Süpürgelik eksik", "Fuge nacharbeiten": "Derz düzeltilecek",
    "Beton roh": "Ham beton", "GK glatt": "Alçıpan düz", "GK-Lochdecke": "Delikli alçıpan tavan", "Rasterdecke": "Izgara tavan", "Akustikdecke": "Akustik tavan", "Schattenfuge": "Gölge derz", "Revisionsklappe": "Revizyon kapağı",
    "Kabel vorhanden": "Kablolar mevcut", "Kabel beschriften": "Kabloları etiketle", "Steckdosen fehlen": "Prizler eksik", "Schalter fehlt": "Anahtar eksik", "Netzwerk fehlt": "Ağ eksik", "Sanitär offen": "Tesisat açık", "Lüftung offen": "Havalandırma açık", "Brandschutz offen": "Yangın koruması açık",
    "Baffel": "Akustik bafl", "Segel": "Akustik yelken", "Paneel": "Panel", "Wandabsorber": "Duvar emici",
  },
};

const TRANSLATIONS: Partial<Record<Language, Tr>> = { en: EN, fr: FR, es: ES, pl: PL, ru: RU, uk: UK, ro: RO, bg: BG, tr: TR };

/** Translate a survey group label (by its key) into the given language. */
export function localizeSurveyGroup(groupKey: string, germanLabel: string, lang: Language): string {
  if (lang === "de") return germanLabel;
  return TRANSLATIONS[lang]?.groups[groupKey] ?? germanLabel;
}

/** Translate a predefined survey OPTION (german label) for display only. */
export function localizeSurveyOption(germanOption: string, lang: Language): string {
  if (lang === "de") return germanOption;
  return TRANSLATIONS[lang]?.options[germanOption] ?? germanOption;
}
