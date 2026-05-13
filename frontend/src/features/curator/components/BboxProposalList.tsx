import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { Proposal } from '@/services/api/CuratorService';
import { AnnotatorBadge } from './AnnotatorBadge';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	proposals: Proposal[];
	selectedIds: Set<number>;
	annotatorColor: string;
	onToggle: (shapeId: number, kind: 'single' | 'toggle' | 'range', ordered: number[]) => void;
}

export const BboxProposalList: React.FC<Props> = ({ proposals, selectedIds, annotatorColor, onToggle }) => {
	const ordered = proposals.map((p) => p.cvat_shape_id);

	if (proposals.length === 0) {
		return <Text style={styles.empty}>Aucune proposition.</Text>;
	}

	return (
		<ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
			{proposals.map((p) => {
				const isSelected = selectedIds.has(p.cvat_shape_id);
				const speciesLabel =
					p.species?.usage_name
					?? p.species?.scientific_name
					?? p.label_name
					?? '—';
				const isPending = p.species?.status === 'pending';

				return (
					<Pressable
						key={p.cvat_shape_id}
						onPress={(e: any) => {
							const native = e.nativeEvent || {};
							const kind: 'single' | 'toggle' | 'range' =
								native.shiftKey ? 'range'
								: (native.ctrlKey || native.metaKey) ? 'toggle'
								: 'single';
							onToggle(p.cvat_shape_id, kind, ordered);
						}}
						style={[styles.row, isSelected && styles.rowSelected]}
					>
						<View style={[styles.check, isSelected && styles.checkActive]}>
							{isSelected ? <Text style={styles.checkMark}>✓</Text> : null}
						</View>
						<View style={[styles.dot, { backgroundColor: annotatorColor }]} />
						<View style={styles.info}>
							<View style={styles.titleRow}>
								<Text style={styles.species} numberOfLines={1}>{speciesLabel}</Text>
								{isPending ? <Text style={styles.pendingTag}>NV</Text> : null}
							</View>
							<AnnotatorBadge username={p.annotator_username} color={annotatorColor} />
						</View>
					</Pressable>
				);
			})}
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	scroll: { maxHeight: 280 },
	content: { gap: 4 },
	empty: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.sm },
	row: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
		paddingVertical: 6, paddingHorizontal: SPACING.sm,
		borderRadius: 6, borderWidth: 1, borderColor: 'transparent',
		backgroundColor: COLORS.background.main,
	},
	rowSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.background.card },
	check: {
		width: 16, height: 16, borderRadius: 4,
		borderWidth: 1.5, borderColor: COLORS.border,
		alignItems: 'center', justifyContent: 'center',
	},
	checkActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
	checkMark: { color: COLORS.text.inverse, fontSize: 10, fontWeight: '700' },
	dot: { width: 10, height: 10, borderRadius: 5 },
	info: { flex: 1, gap: 2 },
	titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	species: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600', flex: 1 },
	pendingTag: { fontSize: 9, color: COLORS.warning, fontWeight: '700', backgroundColor: `${COLORS.warning}22`, paddingHorizontal: 4, borderRadius: 3 },
});
