import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { useColors } from "@/hooks/use-colors";
import { TRADES, formatTradeLabel } from "@/lib/trades";

const ITEM_HEIGHT = 52;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

type TradeOption = { nr: number; name: string };

type TradePickerProps = {
  value: string;
  onChange: (trade: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  accessibilityLabel?: string;
};

export function TradePicker({
  value,
  onChange,
  placeholder = "Gewerk auswählen",
  allowEmpty = true,
  accessibilityLabel = "Gewerk auswählen",
}: TradePickerProps) {
  const colors = useColors();
  const listRef = useRef<FlatList<TradeOption>>(null);
  const [visible, setVisible] = useState(false);
  const options = useMemo<TradeOption[]>(
    () => (allowEmpty ? [{ nr: 0, name: "Kein Gewerk" }, ...TRADES] : [...TRADES]),
    [allowEmpty],
  );
  const selectedIndex = Math.max(0, options.findIndex((trade) => trade.name === value));
  const [draftIndex, setDraftIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!visible) return;
    setDraftIndex(selectedIndex);
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: selectedIndex, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedIndex, visible]);

  const openPicker = () => {
    Keyboard.dismiss();
    setVisible(true);
  };

  const updateFromScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    setDraftIndex(Math.max(0, Math.min(options.length - 1, nextIndex)));
  };

  const selectIndex = (index: number) => {
    setDraftIndex(index);
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  const confirmSelection = () => {
    const selected = options[draftIndex];
    onChange(selected?.nr === 0 ? "" : selected?.name ?? "");
    setVisible(false);
  };

  return (
    <>
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Öffnet ein nummeriertes Scrollrad mit allen Gewerken"
        style={({ pressed }) => [
          styles.trigger,
          { borderColor: colors.border, backgroundColor: colors.background },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[styles.triggerText, { color: value ? colors.foreground : colors.muted }]} numberOfLines={1}>
          {value ? formatTradeLabel(value) : placeholder}
        </Text>
        <MaterialIcons name="unfold-more" size={22} color={colors.primary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} accessibilityLabel="Gewerkeauswahl schließen" />
          <View style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.header}>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>Gewerk auswählen</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Scrollen oder Zeile antippen</Text>
              </View>
              <Pressable onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel="Schließen" style={styles.iconButton}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            <View style={[styles.wheel, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <FlatList
                ref={listRef}
                data={options}
                keyExtractor={(item) => String(item.nr)}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                initialScrollIndex={selectedIndex}
                getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                contentContainerStyle={styles.wheelContent}
                onMomentumScrollEnd={updateFromScroll}
                onScrollEndDrag={updateFromScroll}
                renderItem={({ item, index }) => {
                  const selected = index === draftIndex;
                  return (
                    <Pressable
                      onPress={() => selectIndex(index)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={item.nr === 0 ? item.name : `${item.nr}. ${item.name}`}
                      style={styles.wheelRow}
                    >
                      <Text style={[styles.tradeNumber, { color: selected ? colors.primary : colors.muted }]}>
                        {item.nr === 0 ? "–" : item.nr}
                      </Text>
                      <Text style={[styles.tradeName, { color: selected ? colors.foreground : colors.muted }, selected && styles.tradeNameSelected]}>
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                }}
              />
              <View pointerEvents="none" style={[styles.selectionFrame, { borderColor: colors.primary }]} />
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => setVisible(false)}
                style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.actionText, { color: colors.muted }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={confirmSelection}
                style={({ pressed }) => [styles.actionButton, { borderColor: colors.primary, backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.actionText, { color: "#FFFFFF" }]}>Übernehmen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, marginBottom: 12 },
  triggerText: { flex: 1, fontSize: 15, fontWeight: "600" },
  overlay: { flex: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: "rgba(0,0,0,0.62)" },
  dialog: { borderWidth: 1, borderRadius: 0, padding: 18 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  wheel: { height: WHEEL_HEIGHT, borderWidth: 1, borderRadius: 0, overflow: "hidden", position: "relative" },
  wheelContent: { paddingVertical: ITEM_HEIGHT * 2 },
  wheelRow: { height: ITEM_HEIGHT, flexDirection: "row", alignItems: "center", paddingHorizontal: 18 },
  tradeNumber: { width: 34, fontSize: 15, fontWeight: "800", textAlign: "right", marginRight: 14 },
  tradeName: { flex: 1, fontSize: 16, fontWeight: "500" },
  tradeNameSelected: { fontSize: 18, fontWeight: "800" },
  selectionFrame: { position: "absolute", top: ITEM_HEIGHT * 2, left: 8, right: 8, height: ITEM_HEIGHT, borderTopWidth: 1, borderBottomWidth: 1 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 0 },
  actionText: { fontSize: 15, fontWeight: "700" },
});
