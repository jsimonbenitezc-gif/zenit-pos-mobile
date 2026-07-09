import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SvgIcon, { SVG_ICON_LABELS, SVG_ICON_CATEGORIES } from './SvgIcon';
import IconoProducto from './IconoProducto';
import { colors, spacing, radius, font } from '../theme';

const EMOJI_CATEGORIES = {
  'Comida': ['🍔','🍕','🍟','🌭','🌮','🌯','🫔','🥙','🥪','🥗','🥩','🍖','🍗','🥓','🍳','🥚','🧆','🥘','🍲','🫕','🥣','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡'],
  'Pan & Cereales': ['🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀'],
  'Frutas': ['🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🥥'],
  'Verduras': ['🍅','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🥜','🫘','🌰','🫒'],
  'Postres & Dulces': ['🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯'],
  'Bebidas': ['🥤','☕','🫖','🍵','🥛','🍼','🍺','🍻','🍷','🍸','🍹','🍾','🥂','🥃','🧋','🧃','🧉','🧊','🫗','🍶'],
  'Restaurante': ['🍽️','🍴','🥄','🔪','🫙','🧑‍🍳','🧾','💳'],
  'General': ['📦','🛒','🛍️','🏷️','🔥','⭐','✨','💡','✂️','📌','💰','🎉','❤️','👍','🏠','🚗','🛵','📱','📋','✅','⏰','🔔'],
};

const EMOJIS = Object.values(EMOJI_CATEGORIES).flat();

export default function IconPicker({ value, onSelect, visible, onClose }) {
  const [tab, setTab] = useState('svg');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Seleccionar icono</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelText}>Cerrar</Text>
          </TouchableOpacity>
        </View>

        {/* Current selection preview */}
        <View style={styles.preview}>
          <IconoProducto valor={value || 'svg:package'} size={40} color={colors.textPrimary} />
          <Text style={styles.previewLabel}>
            {value?.startsWith('svg:') ? (SVG_ICON_LABELS[value.slice(4)] || value.slice(4)) : (value || 'Sin icono')}
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'svg' && styles.tabActive]}
            onPress={() => setTab('svg')}
          >
            <Text style={[styles.tabText, tab === 'svg' && styles.tabTextActive]}>Iconos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'emoji' && styles.tabActive]}
            onPress={() => setTab('emoji')}
          >
            <Text style={[styles.tabText, tab === 'emoji' && styles.tabTextActive]}>Emojis</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.grid}>
          {tab === 'svg' ? (
            Object.entries(SVG_ICON_CATEGORIES).map(([catName, icons]) => (
              <View key={catName}>
                <Text style={styles.catLabel}>{catName}</Text>
                <View style={styles.iconRow}>
                  {icons.map(name => {
                    const val = `svg:${name}`;
                    const selected = value === val;
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.iconBtn, selected && styles.iconBtnSelected]}
                        onPress={() => { onSelect(val); onClose(); }}
                      >
                        <SvgIcon name={name} size={26} color={selected ? colors.primary : colors.textSecondary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          ) : (
            Object.entries(EMOJI_CATEGORIES).map(([catName, emojis]) => (
              <View key={catName}>
                <Text style={styles.catLabel}>{catName}</Text>
                <View style={styles.iconRow}>
                  {emojis.map(e => {
                    const selected = value === e;
                    return (
                      <TouchableOpacity
                        key={e}
                        style={[styles.iconBtn, selected && styles.iconBtnSelected]}
                        onPress={() => { onSelect(e); onClose(); }}
                      >
                        <Text style={{ fontSize: 24 }}>{e}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  cancelText: { color: colors.primary, fontWeight: '700', fontSize: font.md },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  previewLabel: { fontSize: font.md, color: colors.textSecondary, fontWeight: '600' },
  tabRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  tab: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: font.sm, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  grid: { padding: spacing.lg },
  catLabel: {
    fontSize: font.sm - 1, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.md, marginBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
  },
  iconRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  iconBtnSelected: {
    borderColor: colors.primary, backgroundColor: '#eff6ff',
  },
});
