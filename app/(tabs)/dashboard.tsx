import { ScrollView, Text, View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

interface ToolItem {
  key: string;
  icon: string;
  color: string;
  route: string;
}

export default function ToolsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t } = useTranslation();

  const projectTools: ToolItem[] = [
    { key: 'grundriss', icon: 'map', color: '#4FC3F7', route: '/floor-plan' },
    { key: 'maengel', icon: 'warning', color: '#FF9800', route: '/defects' },
    { key: 'tagebuch', icon: 'menu-book', color: '#66BB6A', route: '/diary' },
    { key: 'checklist_title', icon: 'checklist', color: '#AB47BC', route: '/checklists' },
    { key: 'team_title', icon: 'groups', color: '#5C6BC0', route: '/team' },
    { key: 'statistik', icon: 'bar-chart', color: '#26A69A', route: '/dashboard-stats' },
  ];

  const exportTools: ToolItem[] = [
    { key: 'gallery_photos', icon: 'photo-library', color: '#EC407A', route: '/photo-gallery' },
    { key: 'qrscan', icon: 'qr-code-scanner', color: '#00BCD4', route: '/qr-scanner' },
    { key: 'zeiterfassung', icon: 'timer', color: '#FF5722', route: '/time-tracking' },
    { key: 'cloud', icon: 'cloud-download', color: '#607D8B', route: '/cloud-import' },
    { key: 'export', icon: 'ios-share', color: '#43A047', route: '/project-export' },
    { key: 'excel', icon: 'table-chart', color: '#2E7D32', route: '/project-export' },
  ];

  const moreTools: ToolItem[] = [
    { key: 'maengelxls', icon: 'assignment-late', color: '#FF6D00', route: '/defects' },
    { key: 'bericht', icon: 'merge-type', color: '#7C3AED', route: '/protocol-merge' },
    { key: 'vergleich', icon: 'compare', color: '#5C6BC0', route: '/photo-compare' },
    { key: 'kalender', icon: 'calendar-today', color: '#EF6C00', route: '/calendar-view' },
  ];

  const renderToolGrid = (tools: ToolItem[]) => (
    <View style={styles.toolGrid}>
      {tools.map((tool) => (
        <Pressable
          key={tool.key}
          onPress={() => router.push(tool.route as any)}
          style={({ pressed }) => [
            styles.toolCard,
            { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[styles.toolIconBg, { backgroundColor: tool.color + '15' }]}>
            <MaterialIcons name={tool.icon as any} size={24} color={tool.color} />
          </View>
          <Text style={[styles.toolLabel, { color: colors.foreground }]} numberOfLines={1}>
            {t(tool.key as any)}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <ScreenContainer className="p-0">
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0B1622" }}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: "#F0F4F8" }]}>{t('werkzeuge')}</Text>
          <Text style={[styles.subtitle, { color: "#8FA3B8" }]}>{t('tools_subtitle')}</Text>
        </View>

        {/* Big Recording Button */}
        <Pressable
          onPress={() => router.push('/(tabs)/' as any)}
          style={({ pressed }) => [
            styles.recordButton,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={styles.recordButtonContent}>
            <View style={styles.recordIconCircle}>
              <MaterialIcons name="mic" size={32} color="#fff" />
            </View>
            <View style={styles.recordTextContainer}>
              <Text style={styles.recordTitle}>{t('neue_aufnahme_starten')}</Text>
              <Text style={styles.recordDesc}>{t('tools_record_desc')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={28} color="rgba(255,255,255,0.7)" />
          </View>
        </Pressable>

        {/* Project Tools Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#8FA3B8" }]}>{t('tools_section_project')}</Text>
          {renderToolGrid(projectTools)}
        </View>

        {/* Export & Data Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#8FA3B8" }]}>{t('tools_section_export')}</Text>
          {renderToolGrid(exportTools)}
        </View>

        {/* More Tools Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#8FA3B8" }]}>{t('tools_section_more')}</Text>
          {renderToolGrid(moreTools)}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  recordButton: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#E53935',
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  recordButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  recordIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordTextContainer: {
    flex: 1,
  },
  recordTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  recordDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingLeft: 4,
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolCard: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(30, 58, 95, 0.5)',
  },
  toolIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  toolLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
