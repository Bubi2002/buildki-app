import type { Language } from "@/lib/i18n";
import type { Checklist } from "@/lib/checklist-store";

/**
 * Translations for the BUILT-IN checklist templates (names, descriptions,
 * categories and checkpoint texts). German is the canonical source in
 * checklist-store (BUILT_IN_CHECKLISTS); this file only holds the other
 * languages, keyed by the stable ids. Custom (user-created) checklists keep
 * whatever language the user typed.
 *
 * NOTE: the technical construction terms for the less common languages
 * (uk/pl/ru/ro/bg/tr) are best-effort and should be reviewed by a native
 * speaker before relying on them professionally.
 */

type Tr = {
  categories: Record<string, string>;
  checklists: Record<string, { name: string; description: string }>;
  items: Record<string, string>;
};

const EN: Tr = {
  categories: { "Abnahme": "Acceptance", "Brandschutz": "Fire protection", "Elektro": "Electrical", "Sanitär": "Plumbing", "Heizung": "Heating", "Sicherheit": "Safety" },
  checklists: {
    "abnahme-rohbau": { name: "Shell construction acceptance", description: "Checklist for shell construction acceptance" },
    "brandschutz": { name: "Fire protection inspection", description: "Checklist for fire protection measures" },
    "elektro-abnahme": { name: "Electrical acceptance", description: "Checklist for the electrical installation" },
    "sanitaer-abnahme": { name: "Plumbing acceptance", description: "Checklist for plumbing installations" },
    "heizung-abnahme": { name: "Heating acceptance", description: "Checklist for heating systems" },
    "sicherheit-baustelle": { name: "Site safety", description: "Daily site safety inspection" },
  },
  items: {
    r1: "Foundations and base slab checked", r2: "Masonry plumb and aligned", r3: "Ceilings and beams free of cracks", r4: "Stairs dimensionally accurate", r5: "Roof structure complete", r6: "Drainage functional", r7: "Window and door openings dimensionally accurate", r8: "Chimney/ventilation shafts sealed", r9: "Waterproofing of basement external walls", r10: "Documentation complete",
    b1: "Escape and rescue routes clear", b2: "Fire doors close automatically", b3: "Fire extinguishers present and tested", b4: "Smoke detectors installed and functional", b5: "Fire dampers functional", b6: "Cable penetration seals complete", b7: "Fire safety signage in place", b8: "Firefighting water supply ensured", b9: "Fire alarm system functional", b10: "Fire brigade access clear",
    e1: "Protective conductor test passed", e2: "Insulation resistance measured", e3: "RCD (FI) tripped", e4: "Circuit breakers correctly rated", e5: "Sockets functional", e6: "Lighting complete", e7: "Distribution board labelled", e8: "Equipotential bonding established", e9: "Cabling properly installed", e10: "Test report created",
    s1: "Pressure test drinking water passed", s2: "Leak test waste water passed", s3: "Hot water supply functional", s4: "Fittings leak-free and functional", s5: "Toilet flush works", s6: "Drainage gradient correct", s7: "Backflow prevention installed", s8: "Pipe insulation complete", s9: "Circulation line works", s10: "Documentation/as-built plan created",
    h1: "Pressure test heating circuit passed", h2: "Boiler/heat pump in operation", h3: "Radiators heat up", h4: "Thermostats functional", h5: "Hydraulic balancing carried out", h6: "Underfloor heating even", h7: "Flue system checked", h8: "Expansion vessel correct", h9: "Control system set", h10: "Commissioning report created",
    si1: "Site protection/fence intact", si2: "Scaffolding stable and inspected", si3: "Fall protection in place", si4: "First-aid material available", si5: "PPE is worn", si6: "Access routes clear and lit", si7: "Electrical installations secured", si8: "Hazardous materials stored properly", si9: "Crane/lifting equipment inspected", si10: "Instruction documented",
  },
};

const FR: Tr = {
  categories: { "Abnahme": "Réception", "Brandschutz": "Protection incendie", "Elektro": "Électricité", "Sanitär": "Plomberie", "Heizung": "Chauffage", "Sicherheit": "Sécurité" },
  checklists: {
    "abnahme-rohbau": { name: "Réception du gros œuvre", description: "Liste de contrôle pour la réception du gros œuvre" },
    "brandschutz": { name: "Contrôle protection incendie", description: "Liste de contrôle des mesures de protection incendie" },
    "elektro-abnahme": { name: "Réception électricité", description: "Liste de contrôle de l'installation électrique" },
    "sanitaer-abnahme": { name: "Réception plomberie", description: "Liste de contrôle des installations sanitaires" },
    "heizung-abnahme": { name: "Réception chauffage", description: "Liste de contrôle des installations de chauffage" },
    "sicherheit-baustelle": { name: "Sécurité du chantier", description: "Contrôle de sécurité quotidien du chantier" },
  },
  items: {
    r1: "Fondations et dalle vérifiées", r2: "Maçonnerie d'aplomb et alignée", r3: "Planchers et poutres sans fissures", r4: "Escaliers conformes aux dimensions", r5: "Charpente complète", r6: "Évacuation des eaux fonctionnelle", r7: "Ouvertures portes et fenêtres conformes", r8: "Cheminée/gaines de ventilation étanches", r9: "Étanchéité des murs extérieurs du sous-sol", r10: "Documentation complète",
    b1: "Voies d'évacuation et de secours dégagées", b2: "Portes coupe-feu se ferment automatiquement", b3: "Extincteurs présents et contrôlés", b4: "Détecteurs de fumée installés et fonctionnels", b5: "Clapets coupe-feu fonctionnels", b6: "Calfeutrements de câbles complets", b7: "Signalisation incendie en place", b8: "Alimentation en eau d'extinction assurée", b9: "Système d'alarme incendie fonctionnel", b10: "Accès pompiers dégagé",
    e1: "Contrôle du conducteur de protection réussi", e2: "Résistance d'isolement mesurée", e3: "Disjoncteur différentiel (DDR) déclenché", e4: "Disjoncteurs correctement dimensionnés", e5: "Prises fonctionnelles", e6: "Éclairage complet", e7: "Tableau de distribution étiqueté", e8: "Liaison équipotentielle réalisée", e9: "Pose des câbles conforme", e10: "Rapport de contrôle établi",
    s1: "Essai de pression eau potable réussi", s2: "Essai d'étanchéité eaux usées réussi", s3: "Production d'eau chaude fonctionnelle", s4: "Robinetterie étanche et fonctionnelle", s5: "Chasse d'eau WC fonctionne", s6: "Pente d'évacuation correcte", s7: "Protection anti-reflux installée", s8: "Isolation des canalisations complète", s9: "Boucle de circulation fonctionne", s10: "Documentation/plan de récolement établi",
    h1: "Essai de pression circuit de chauffage réussi", h2: "Chaudière/pompe à chaleur en service", h3: "Radiateurs chauffent", h4: "Thermostats fonctionnels", h5: "Équilibrage hydraulique effectué", h6: "Chauffage au sol uniforme", h7: "Conduit d'évacuation des fumées contrôlé", h8: "Vase d'expansion correct", h9: "Régulation réglée", h10: "Procès-verbal de mise en service établi",
    si1: "Protection/clôture du chantier intacte", si2: "Échafaudages stables et contrôlés", si3: "Protections antichute en place", si4: "Matériel de premiers secours disponible", si5: "EPI portés", si6: "Voies de circulation dégagées et éclairées", si7: "Installations électriques sécurisées", si8: "Produits dangereux stockés correctement", si9: "Grue/moyens de levage contrôlés", si10: "Instruction documentée",
  },
};

const ES: Tr = {
  categories: { "Abnahme": "Recepción", "Brandschutz": "Protección contra incendios", "Elektro": "Electricidad", "Sanitär": "Fontanería", "Heizung": "Calefacción", "Sicherheit": "Seguridad" },
  checklists: {
    "abnahme-rohbau": { name: "Recepción de obra gruesa", description: "Lista de control para la recepción de obra gruesa" },
    "brandschutz": { name: "Control de protección contra incendios", description: "Lista de control de medidas contra incendios" },
    "elektro-abnahme": { name: "Recepción eléctrica", description: "Lista de control de la instalación eléctrica" },
    "sanitaer-abnahme": { name: "Recepción de fontanería", description: "Lista de control de instalaciones de fontanería" },
    "heizung-abnahme": { name: "Recepción de calefacción", description: "Lista de control de instalaciones de calefacción" },
    "sicherheit-baustelle": { name: "Seguridad en obra", description: "Control diario de seguridad de la obra" },
  },
  items: {
    r1: "Cimentación y losa comprobadas", r2: "Fábrica a plomo y alineada", r3: "Forjados y vigas sin fisuras", r4: "Escaleras con dimensiones correctas", r5: "Estructura de cubierta completa", r6: "Drenaje funcional", r7: "Huecos de ventanas y puertas con dimensiones correctas", r8: "Chimenea/conductos de ventilación estancos", r9: "Impermeabilización de muros exteriores del sótano", r10: "Documentación completa",
    b1: "Vías de evacuación y rescate libres", b2: "Puertas cortafuegos cierran solas", b3: "Extintores presentes y revisados", b4: "Detectores de humo instalados y funcionales", b5: "Compuertas cortafuegos funcionales", b6: "Sellados de cables completos", b7: "Señalización contra incendios colocada", b8: "Suministro de agua de extinción garantizado", b9: "Sistema de alarma de incendios funcional", b10: "Acceso de bomberos libre",
    e1: "Prueba del conductor de protección superada", e2: "Resistencia de aislamiento medida", e3: "Diferencial (FI) disparado", e4: "Magnetotérmicos correctamente dimensionados", e5: "Enchufes funcionales", e6: "Iluminación completa", e7: "Cuadro de distribución etiquetado", e8: "Conexión equipotencial realizada", e9: "Tendido de cables correcto", e10: "Protocolo de prueba creado",
    s1: "Prueba de presión de agua potable superada", s2: "Prueba de estanqueidad de aguas residuales superada", s3: "Producción de agua caliente funcional", s4: "Griferías estancas y funcionales", s5: "Cisterna del WC funciona", s6: "Pendiente de drenaje correcta", s7: "Válvula antirretorno instalada", s8: "Aislamiento de tuberías completo", s9: "Línea de circulación funciona", s10: "Documentación/plano as-built creado",
    h1: "Prueba de presión del circuito de calefacción superada", h2: "Caldera/bomba de calor en servicio", h3: "Radiadores se calientan", h4: "Termostatos funcionales", h5: "Equilibrado hidráulico realizado", h6: "Suelo radiante uniforme", h7: "Sistema de evacuación de humos comprobado", h8: "Vaso de expansión correcto", h9: "Regulación ajustada", h10: "Acta de puesta en marcha creada",
    si1: "Protección/valla de obra intacta", si2: "Andamios estables y revisados", si3: "Protecciones anticaídas instaladas", si4: "Material de primeros auxilios disponible", si5: "Se usa el EPI", si6: "Vías de circulación libres e iluminadas", si7: "Instalaciones eléctricas aseguradas", si8: "Sustancias peligrosas almacenadas correctamente", si9: "Grúa/medios de elevación revisados", si10: "Formación documentada",
  },
};

const PL: Tr = {
  categories: { "Abnahme": "Odbiór", "Brandschutz": "Ochrona ppoż.", "Elektro": "Elektryka", "Sanitär": "Instalacje sanitarne", "Heizung": "Ogrzewanie", "Sicherheit": "Bezpieczeństwo" },
  checklists: {
    "abnahme-rohbau": { name: "Odbiór stanu surowego", description: "Lista kontrolna odbioru stanu surowego" },
    "brandschutz": { name: "Kontrola ochrony ppoż.", description: "Lista kontrolna środków ochrony przeciwpożarowej" },
    "elektro-abnahme": { name: "Odbiór instalacji elektrycznej", description: "Lista kontrolna instalacji elektrycznej" },
    "sanitaer-abnahme": { name: "Odbiór instalacji sanitarnej", description: "Lista kontrolna instalacji sanitarnych" },
    "heizung-abnahme": { name: "Odbiór ogrzewania", description: "Lista kontrolna instalacji grzewczych" },
    "sicherheit-baustelle": { name: "Bezpieczeństwo na budowie", description: "Codzienna kontrola bezpieczeństwa budowy" },
  },
  items: {
    r1: "Fundamenty i płyta denna sprawdzone", r2: "Mury w pionie i w linii", r3: "Stropy i podciągi bez pęknięć", r4: "Schody wymiarowo zgodne", r5: "Konstrukcja dachu kompletna", r6: "Odwodnienie sprawne", r7: "Otwory okienne i drzwiowe wymiarowo zgodne", r8: "Komin/szachty wentylacyjne szczelne", r9: "Izolacja ścian zewnętrznych piwnicy", r10: "Dokumentacja kompletna",
    b1: "Drogi ewakuacyjne i ratunkowe wolne", b2: "Drzwi ppoż. zamykają się samoczynnie", b3: "Gaśnice obecne i sprawdzone", b4: "Czujki dymu zainstalowane i sprawne", b5: "Klapy ppoż. sprawne", b6: "Przepusty kablowe kompletne", b7: "Oznakowanie ppoż. umieszczone", b8: "Zaopatrzenie w wodę gaśniczą zapewnione", b9: "System sygnalizacji pożaru sprawny", b10: "Dojazd straży pożarnej wolny",
    e1: "Badanie przewodu ochronnego zaliczone", e2: "Rezystancja izolacji zmierzona", e3: "Wyłącznik różnicowoprądowy (RCD) zadziałał", e4: "Wyłączniki nadprądowe prawidłowo dobrane", e5: "Gniazdka sprawne", e6: "Oświetlenie kompletne", e7: "Rozdzielnica opisana", e8: "Połączenia wyrównawcze wykonane", e9: "Układanie kabli prawidłowe", e10: "Protokół badań sporządzony",
    s1: "Próba ciśnieniowa wody pitnej zaliczona", s2: "Próba szczelności kanalizacji zaliczona", s3: "Przygotowanie ciepłej wody sprawne", s4: "Armatura szczelna i sprawna", s5: "Spłuczka WC działa", s6: "Spadek kanalizacji prawidłowy", s7: "Zawór zwrotny zamontowany", s8: "Izolacja rurociągów kompletna", s9: "Przewód cyrkulacyjny działa", s10: "Dokumentacja/plan powykonawczy sporządzony",
    h1: "Próba ciśnieniowa obiegu grzewczego zaliczona", h2: "Kocioł/pompa ciepła w pracy", h3: "Grzejniki się nagrzewają", h4: "Termostaty sprawne", h5: "Równoważenie hydrauliczne wykonane", h6: "Ogrzewanie podłogowe równomierne", h7: "Układ spalinowy sprawdzony", h8: "Naczynie wzbiorcze prawidłowe", h9: "Regulacja ustawiona", h10: "Protokół uruchomienia sporządzony",
    si1: "Zabezpieczenie/ogrodzenie budowy nienaruszone", si2: "Rusztowania stabilne i sprawdzone", si3: "Zabezpieczenia przed upadkiem obecne", si4: "Materiały pierwszej pomocy dostępne", si5: "Środki ochrony (PPE) noszone", si6: "Drogi komunikacyjne wolne i oświetlone", si7: "Instalacje elektryczne zabezpieczone", si8: "Materiały niebezpieczne prawidłowo składowane", si9: "Dźwig/urządzenia dźwigowe sprawdzone", si10: "Instruktaż udokumentowany",
  },
};

const RU: Tr = {
  categories: { "Abnahme": "Приёмка", "Brandschutz": "Пожарная защита", "Elektro": "Электрика", "Sanitär": "Сантехника", "Heizung": "Отопление", "Sicherheit": "Безопасность" },
  checklists: {
    "abnahme-rohbau": { name: "Приёмка чернового строительства", description: "Чек-лист приёмки чернового строительства" },
    "brandschutz": { name: "Проверка пожарной защиты", description: "Чек-лист мер пожарной защиты" },
    "elektro-abnahme": { name: "Приёмка электрики", description: "Чек-лист электромонтажа" },
    "sanitaer-abnahme": { name: "Приёмка сантехники", description: "Чек-лист сантехнических систем" },
    "heizung-abnahme": { name: "Приёмка отопления", description: "Чек-лист систем отопления" },
    "sicherheit-baustelle": { name: "Безопасность на стройплощадке", description: "Ежедневная проверка безопасности стройплощадки" },
  },
  items: {
    r1: "Фундаменты и плита основания проверены", r2: "Кладка вертикальна и в одной плоскости", r3: "Перекрытия и балки без трещин", r4: "Лестницы соответствуют размерам", r5: "Конструкция крыши завершена", r6: "Водоотведение работает", r7: "Оконные и дверные проёмы по размерам", r8: "Дымоход/вентшахты герметичны", r9: "Гидроизоляция наружных стен подвала", r10: "Документация полная",
    b1: "Пути эвакуации и спасения свободны", b2: "Противопожарные двери закрываются сами", b3: "Огнетушители в наличии и проверены", b4: "Дымовые извещатели установлены и работают", b5: "Противопожарные клапаны работают", b6: "Кабельные уплотнения выполнены", b7: "Противопожарные знаки размещены", b8: "Водоснабжение для пожаротушения обеспечено", b9: "Система пожарной сигнализации работает", b10: "Подъезд для пожарных свободен",
    e1: "Проверка защитного проводника пройдена", e2: "Сопротивление изоляции измерено", e3: "УЗО (FI) сработало", e4: "Автоматы правильно подобраны", e5: "Розетки работают", e6: "Освещение полное", e7: "Распределительный щит подписан", e8: "Уравнивание потенциалов выполнено", e9: "Прокладка кабеля правильная", e10: "Протокол испытаний составлен",
    s1: "Опрессовка питьевой воды пройдена", s2: "Проверка герметичности канализации пройдена", s3: "Приготовление горячей воды работает", s4: "Арматура герметична и работает", s5: "Смыв унитаза работает", s6: "Уклон канализации правильный", s7: "Защита от подпора установлена", s8: "Изоляция трубопроводов полная", s9: "Циркуляционная линия работает", s10: "Документация/исполнительная схема составлена",
    h1: "Опрессовка контура отопления пройдена", h2: "Котёл/тепловой насос в работе", h3: "Радиаторы нагреваются", h4: "Термостаты работают", h5: "Гидравлическая балансировка выполнена", h6: "Тёплый пол равномерный", h7: "Дымоотвод проверен", h8: "Расширительный бак исправен", h9: "Регулирование настроено", h10: "Протокол ввода в эксплуатацию составлен",
    si1: "Ограждение стройплощадки цело", si2: "Леса устойчивы и проверены", si3: "Защита от падения в наличии", si4: "Аптечка первой помощи в наличии", si5: "СИЗ используются", si6: "Проходы свободны и освещены", si7: "Электроустановки защищены", si8: "Опасные вещества хранятся правильно", si9: "Кран/подъёмные механизмы проверены", si10: "Инструктаж задокументирован",
  },
};

const UK: Tr = {
  categories: { "Abnahme": "Приймання", "Brandschutz": "Пожежний захист", "Elektro": "Електрика", "Sanitär": "Сантехніка", "Heizung": "Опалення", "Sicherheit": "Безпека" },
  checklists: {
    "abnahme-rohbau": { name: "Приймання чорнових робіт", description: "Чек-лист приймання чорнових робіт" },
    "brandschutz": { name: "Перевірка пожежного захисту", description: "Чек-лист заходів пожежного захисту" },
    "elektro-abnahme": { name: "Приймання електрики", description: "Чек-лист електромонтажу" },
    "sanitaer-abnahme": { name: "Приймання сантехніки", description: "Чек-лист сантехнічних систем" },
    "heizung-abnahme": { name: "Приймання опалення", description: "Чек-лист систем опалення" },
    "sicherheit-baustelle": { name: "Безпека на будмайданчику", description: "Щоденна перевірка безпеки будмайданчика" },
  },
  items: {
    r1: "Фундаменти та плита основи перевірені", r2: "Кладка вертикальна та в одній площині", r3: "Перекриття та балки без тріщин", r4: "Сходи відповідають розмірам", r5: "Конструкція даху завершена", r6: "Водовідведення працює", r7: "Віконні та дверні прорізи за розмірами", r8: "Димохід/вентшахти герметичні", r9: "Гідроізоляція зовнішніх стін підвалу", r10: "Документація повна",
    b1: "Шляхи евакуації та порятунку вільні", b2: "Протипожежні двері зачиняються самі", b3: "Вогнегасники в наявності та перевірені", b4: "Димові сповіщувачі встановлені та працюють", b5: "Протипожежні клапани працюють", b6: "Кабельні ущільнення виконані", b7: "Протипожежні знаки розміщені", b8: "Водопостачання для пожежогасіння забезпечене", b9: "Система пожежної сигналізації працює", b10: "Під'їзд для пожежників вільний",
    e1: "Перевірка захисного провідника пройдена", e2: "Опір ізоляції виміряний", e3: "ПЗВ (FI) спрацював", e4: "Автомати правильно підібрані", e5: "Розетки працюють", e6: "Освітлення повне", e7: "Розподільний щит підписаний", e8: "Вирівнювання потенціалів виконане", e9: "Прокладання кабелю правильне", e10: "Протокол випробувань складений",
    s1: "Опресування питної води пройдене", s2: "Перевірка герметичності каналізації пройдена", s3: "Приготування гарячої води працює", s4: "Арматура герметична та працює", s5: "Злив унітаза працює", s6: "Ухил каналізації правильний", s7: "Захист від підпору встановлений", s8: "Ізоляція трубопроводів повна", s9: "Циркуляційна лінія працює", s10: "Документація/виконавча схема складена",
    h1: "Опресування контуру опалення пройдене", h2: "Котел/тепловий насос у роботі", h3: "Радіатори нагріваються", h4: "Термостати працюють", h5: "Гідравлічне балансування виконане", h6: "Тепла підлога рівномірна", h7: "Димовідвід перевірений", h8: "Розширювальний бак справний", h9: "Регулювання налаштоване", h10: "Протокол введення в експлуатацію складений",
    si1: "Огородження будмайданчика ціле", si2: "Риштування стійке та перевірене", si3: "Захист від падіння в наявності", si4: "Аптечка першої допомоги в наявності", si5: "ЗІЗ використовуються", si6: "Проходи вільні та освітлені", si7: "Електроустановки захищені", si8: "Небезпечні речовини зберігаються правильно", si9: "Кран/підіймальні механізми перевірені", si10: "Інструктаж задокументований",
  },
};

const RO: Tr = {
  categories: { "Abnahme": "Recepție", "Brandschutz": "Protecție la incendiu", "Elektro": "Electrice", "Sanitär": "Sanitare", "Heizung": "Încălzire", "Sicherheit": "Securitate" },
  checklists: {
    "abnahme-rohbau": { name: "Recepție structură de rezistență", description: "Listă de verificare pentru recepția structurii de rezistență" },
    "brandschutz": { name: "Verificare protecție la incendiu", description: "Listă de verificare a măsurilor de protecție la incendiu" },
    "elektro-abnahme": { name: "Recepție instalații electrice", description: "Listă de verificare a instalației electrice" },
    "sanitaer-abnahme": { name: "Recepție instalații sanitare", description: "Listă de verificare a instalațiilor sanitare" },
    "heizung-abnahme": { name: "Recepție instalație de încălzire", description: "Listă de verificare a instalațiilor de încălzire" },
    "sicherheit-baustelle": { name: "Securitatea șantierului", description: "Verificare zilnică a securității șantierului" },
  },
  items: {
    r1: "Fundații și placă de bază verificate", r2: "Zidărie verticală și aliniată", r3: "Planșee și grinzi fără fisuri", r4: "Scări conforme dimensional", r5: "Structura acoperișului completă", r6: "Drenaj funcțional", r7: "Goluri ferestre și uși conforme dimensional", r8: "Coș/ghene de ventilație etanșe", r9: "Hidroizolație pereți exteriori subsol", r10: "Documentație completă",
    b1: "Căi de evacuare și salvare libere", b2: "Uși antifoc se închid automat", b3: "Stingătoare prezente și verificate", b4: "Detectoare de fum instalate și funcționale", b5: "Clapete antifoc funcționale", b6: "Etanșări trecere cabluri complete", b7: "Semnalizare incendiu montată", b8: "Alimentare cu apă de incendiu asigurată", b9: "Sistem de alarmare incendiu funcțional", b10: "Acces pompieri liber",
    e1: "Verificarea conductorului de protecție trecută", e2: "Rezistența de izolație măsurată", e3: "Dispozitiv diferențial (FI) declanșat", e4: "Disjunctoare dimensionate corect", e5: "Prize funcționale", e6: "Iluminat complet", e7: "Tablou de distribuție etichetat", e8: "Egalizare de potențial realizată", e9: "Pozarea cablurilor corespunzătoare", e10: "Proces-verbal de verificare întocmit",
    s1: "Proba de presiune apă potabilă trecută", s2: "Proba de etanșeitate canalizare trecută", s3: "Prepararea apei calde funcțională", s4: "Armături etanșe și funcționale", s5: "Rezervorul WC funcționează", s6: "Panta de canalizare corectă", s7: "Protecție antirefulare montată", s8: "Izolație conducte completă", s9: "Conductă de recirculare funcționează", s10: "Documentație/plan as-built întocmit",
    h1: "Proba de presiune circuit de încălzire trecută", h2: "Cazan/pompă de căldură în funcțiune", h3: "Radiatoarele se încălzesc", h4: "Termostate funcționale", h5: "Echilibrare hidraulică efectuată", h6: "Încălzire în pardoseală uniformă", h7: "Sistem de evacuare gaze arse verificat", h8: "Vas de expansiune corect", h9: "Reglaj setat", h10: "Proces-verbal de punere în funcțiune întocmit",
    si1: "Împrejmuire/gard șantier intact", si2: "Schele stabile și verificate", si3: "Protecții anticădere montate", si4: "Materiale de prim ajutor disponibile", si5: "EIP purtat", si6: "Căi de circulație libere și iluminate", si7: "Instalații electrice asigurate", si8: "Substanțe periculoase depozitate corect", si9: "Macara/mijloace de ridicare verificate", si10: "Instruire documentată",
  },
};

const BG: Tr = {
  categories: { "Abnahme": "Приемане", "Brandschutz": "Пожарна защита", "Elektro": "Електро", "Sanitär": "ВиК", "Heizung": "Отопление", "Sicherheit": "Безопасност" },
  checklists: {
    "abnahme-rohbau": { name: "Приемане на груб строеж", description: "Контролен списък за приемане на груб строеж" },
    "brandschutz": { name: "Проверка на пожарната защита", description: "Контролен списък за мерките за пожарна защита" },
    "elektro-abnahme": { name: "Приемане на електроинсталация", description: "Контролен списък за електроинсталацията" },
    "sanitaer-abnahme": { name: "Приемане на ВиК", description: "Контролен списък за ВиК инсталациите" },
    "heizung-abnahme": { name: "Приемане на отопление", description: "Контролен списък за отоплителните инсталации" },
    "sicherheit-baustelle": { name: "Безопасност на строежа", description: "Ежедневна проверка на безопасността на строежа" },
  },
  items: {
    r1: "Фундаменти и основна плоча проверени", r2: "Зидарията е отвесна и в равнина", r3: "Плочи и греди без пукнатини", r4: "Стълби с точни размери", r5: "Покривна конструкция завършена", r6: "Отводняването работи", r7: "Отвори за прозорци и врати с точни размери", r8: "Комин/вентилационни шахти уплътнени", r9: "Хидроизолация на външните сутеренни стени", r10: "Документацията е пълна",
    b1: "Евакуационни и спасителни пътища свободни", b2: "Пожарните врати се затварят сами", b3: "Пожарогасители налични и проверени", b4: "Датчици за дим монтирани и работещи", b5: "Пожарни клапи работещи", b6: "Кабелни уплътнения изпълнени", b7: "Пожарна сигнализация поставена", b8: "Водоснабдяване за гасене осигурено", b9: "Пожароизвестителна система работеща", b10: "Достъп за пожарната свободен",
    e1: "Проверка на защитния проводник премината", e2: "Изолационно съпротивление измерено", e3: "Дефектнотоковата защита (FI) сработи", e4: "Автоматичните прекъсвачи правилно оразмерени", e5: "Контактите работят", e6: "Осветлението е пълно", e7: "Разпределителното табло надписано", e8: "Изравняване на потенциалите изпълнено", e9: "Полагането на кабелите коректно", e10: "Протокол от изпитване изготвен",
    s1: "Изпитване на налягане на питейната вода преминато", s2: "Проверка за херметичност на канализацията преминато", s3: "Приготвянето на топла вода работи", s4: "Арматурата е уплътнена и работеща", s5: "Казанчето на тоалетната работи", s6: "Наклонът на канализацията е правилен", s7: "Защита срещу подприщване монтирана", s8: "Изолацията на тръбите е пълна", s9: "Циркулационната линия работи", s10: "Документация/екзекутив изготвен",
    h1: "Изпитване на налягане на отоплителния кръг преминато", h2: "Котел/термопомпа в работа", h3: "Радиаторите се затоплят", h4: "Термостатите работят", h5: "Хидравличното балансиране извършено", h6: "Подовото отопление е равномерно", h7: "Димоотводната система проверена", h8: "Разширителният съд е правилен", h9: "Регулирането е настроено", h10: "Протокол за пускане в експлоатация изготвен",
    si1: "Ограждението/оградата на строежа е здрава", si2: "Скелето е устойчиво и проверено", si3: "Защита срещу падане налична", si4: "Материали за първа помощ налични", si5: "ЛПС се носят", si6: "Транспортните пътища свободни и осветени", si7: "Електрическите инсталации обезопасени", si8: "Опасните материали съхранявани правилно", si9: "Кран/подемни средства проверени", si10: "Инструктажът документиран",
  },
};

const TR: Tr = {
  categories: { "Abnahme": "Kabul", "Brandschutz": "Yangın koruması", "Elektro": "Elektrik", "Sanitär": "Tesisat", "Heizung": "Isıtma", "Sicherheit": "Güvenlik" },
  checklists: {
    "abnahme-rohbau": { name: "Kaba yapı kabulü", description: "Kaba yapı kabulü için kontrol listesi" },
    "brandschutz": { name: "Yangın koruması kontrolü", description: "Yangından korunma önlemleri kontrol listesi" },
    "elektro-abnahme": { name: "Elektrik kabulü", description: "Elektrik tesisatı kontrol listesi" },
    "sanitaer-abnahme": { name: "Tesisat kabulü", description: "Sıhhi tesisat kontrol listesi" },
    "heizung-abnahme": { name: "Isıtma kabulü", description: "Isıtma tesisatı kontrol listesi" },
    "sicherheit-baustelle": { name: "Şantiye güvenliği", description: "Günlük şantiye güvenlik kontrolü" },
  },
  items: {
    r1: "Temeller ve taban plakası kontrol edildi", r2: "Duvar şakulünde ve hizada", r3: "Döşemeler ve kirişler çatlaksız", r4: "Merdivenler ölçüsünde", r5: "Çatı konstrüksiyonu tam", r6: "Drenaj çalışıyor", r7: "Pencere ve kapı boşlukları ölçüsünde", r8: "Baca/havalandırma şaftları sızdırmaz", r9: "Bodrum dış duvarları su yalıtımı", r10: "Dokümantasyon tam",
    b1: "Kaçış ve kurtarma yolları açık", b2: "Yangın kapıları kendiliğinden kapanıyor", b3: "Yangın söndürücüler mevcut ve kontrollü", b4: "Duman dedektörleri kurulu ve çalışıyor", b5: "Yangın damperleri çalışıyor", b6: "Kablo geçiş yalıtımları tam", b7: "Yangın işaretlemeleri yerinde", b8: "Yangın söndürme suyu temini sağlanmış", b9: "Yangın alarm sistemi çalışıyor", b10: "İtfaiye erişimi açık",
    e1: "Koruma iletkeni testi geçti", e2: "Yalıtım direnci ölçüldü", e3: "Kaçak akım rölesi (FI) attı", e4: "Devre kesiciler doğru boyutlandırıldı", e5: "Prizler çalışıyor", e6: "Aydınlatma tam", e7: "Dağıtım panosu etiketlendi", e8: "Potansiyel dengelemesi yapıldı", e9: "Kablo döşemesi uygun", e10: "Test raporu oluşturuldu",
    s1: "İçme suyu basınç testi geçti", s2: "Atık su sızdırmazlık testi geçti", s3: "Sıcak su üretimi çalışıyor", s4: "Armatürler sızdırmaz ve çalışıyor", s5: "Klozet sifonu çalışıyor", s6: "Drenaj eğimi doğru", s7: "Geri tepme emniyeti takıldı", s8: "Boru yalıtımı tam", s9: "Sirkülasyon hattı çalışıyor", s10: "Dokümantasyon/as-built plan oluşturuldu",
    h1: "Isıtma devresi basınç testi geçti", h2: "Kazan/ısı pompası çalışır durumda", h3: "Radyatörler ısınıyor", h4: "Termostatlar çalışıyor", h5: "Hidrolik dengeleme yapıldı", h6: "Yerden ısıtma düzgün", h7: "Baca gazı sistemi kontrol edildi", h8: "Genleşme tankı doğru", h9: "Regülasyon ayarlandı", h10: "Devreye alma raporu oluşturuldu",
    si1: "Şantiye güvenliği/çiti sağlam", si2: "İskeleler sağlam ve kontrollü", si3: "Düşme koruması mevcut", si4: "İlk yardım malzemesi mevcut", si5: "KKD kullanılıyor", si6: "Geçiş yolları açık ve aydınlatılmış", si7: "Elektrik tesisatları emniyete alınmış", si8: "Tehlikeli maddeler uygun depolanmış", si9: "Vinç/kaldırma ekipmanı kontrollü", si10: "Eğitim belgelendi",
  },
};

const TRANSLATIONS: Partial<Record<Language, Tr>> = { en: EN, fr: FR, es: ES, pl: PL, ru: RU, uk: UK, ro: RO, bg: BG, tr: TR };

/**
 * Return a built-in checklist with its name/description/category/items in the
 * given language. German (and custom checklists) are returned unchanged.
 */
export function localizeChecklist(c: Checklist, lang: Language): Checklist {
  if (!c.isBuiltIn || lang === "de") return c;
  const tr = TRANSLATIONS[lang];
  if (!tr) return c;
  const cl = tr.checklists[c.id];
  return {
    ...c,
    name: cl?.name ?? c.name,
    description: cl?.description ?? c.description,
    category: tr.categories[c.category] ?? c.category,
    items: c.items.map((it) => ({ ...it, text: tr.items[it.id] ?? it.text })),
  };
}
