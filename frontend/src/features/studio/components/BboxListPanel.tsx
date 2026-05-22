import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { StudioShape } from '../types';

interface Props {
	shapes: StudioShape[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	onDelete: (id: string) => void;
}

export const BboxListPanel: React.FC<Props> = ({ shapes, selectedId, onSelect, onDelete }) => {
	return (
		<View style={styles.col}>
			<Text style={styles.colTitle}>Boîtes</Text>
			<Text style={styles.metaText}>
				{shapes.length === 0
					? 'Aucune boîte tracée.'
					: `${shapes.length} boîte${shapes.length > 1 ? 's' : ''} · ${shapes.filter((s) => s.status === 'saved').length} enregistrée${shapes.filter((s) => s.status === 'saved').length > 1 ? 's' : ''}`}
			</Text>

			<ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
				{shapes.length === 0 ? (
					<View style={styles.emptyState}>
						<Text style={styles.emptyText}>Trace un rectangle sur l'image avec l'outil Rect (R).</Text>
					</View>
				) : shapes.map((s, idx) => (
					<BboxEntry
						key={s.id}
						shape={s}
						index={idx}
						selected={s.id === selectedId}
						onSelect={() => onSelect(s.id)}
						onDelete={() => onDelete(s.id)}
					/>
				))}
			</ScrollView>
		</View>
	);
};

const BboxEntry: React.FC<{
	shape: StudioShape;
	index: number;
	selected: boolean;
	onSelect: () => void;
	onDelete: () => void;
}> = ({ shape, index, selected, onSelect, onDelete }) => {
	const hasSpecies = !!shape.speciesName;
	const saved = shape.status === 'saved' && hasSpecies;
	const dotColor = saved ? COLORS.status.validated : hasSpecies ? COLORS.warning : COLORS.text.placeholder;

	return (
		<Pressable
			onPress={onSelect}
			style={[styles.entry, selected && styles.entrySelected]}
		>
			<View style={[styles.dot, { backgroundColor: dotColor }]} />
			<View style={styles.entryBody}>
				<Text style={styles.entryIndex}>#{index + 1}</Text>
				<Text style={styles.entrySpecies} numberOfLines={1}>
					{hasSpecies ? shape.speciesName : <Text style={styles.entryPlaceholder}>pas encore nommée</Text>}
				</Text>
			</View>
			<Pressable onPress={onDelete} hitSlop={6} style={styles.delBtn}>
				<Text style={styles.delBtnText}>✕</Text>
			</Pressable>
		</Pressable>
	);
};

const styles = StyleSheet.create({
	col: {
		width: 220,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.sm,
		gap: SPACING.xs,
	},
	colTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	metaText: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },

	list: { flex: 1 },
	listContent: { gap: 6, paddingVertical: 6 },

	emptyState: {
		borderWidth: 1, borderColor: COLORS.border,
		borderRadius: 6, padding: SPACING.md,
		alignItems: 'center', justifyContent: 'center',
		backgroundColor: COLORS.background.main,
	},
	emptyText: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic', textAlign: 'center', lineHeight: 16 },

	entry: {
		flexDirection: 'row', alignItems: 'center', gap: 8,
		paddingHorizontal: SPACING.sm, paddingVertical: 8,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	entrySelected: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}11` },
	dot: { width: 8, height: 8, borderRadius: 4 },
	entryBody: { flex: 1, gap: 1 },
	entryIndex: { fontSize: 10, color: COLORS.text.secondary, fontWeight: '700' },
	entrySpecies: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	entryPlaceholder: { color: COLORS.text.placeholder, fontWeight: '400', fontStyle: 'italic' },

	delBtn: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
	delBtnText: { fontSize: 13, color: COLORS.text.secondary, fontWeight: '700' },
});
