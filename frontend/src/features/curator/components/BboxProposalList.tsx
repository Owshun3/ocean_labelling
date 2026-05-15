import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { Proposal } from '@/services/api/CuratorService';
import { AnnotatorBadge } from './AnnotatorBadge';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	proposals: Proposal[];
	selectedIds: Set<number>;
	onToggle: (shapeId: number, kind: 'single' | 'toggle' | 'range', ordered: number[]) => void;
}

type SortKey = 'order' | 'rank_desc' | 'rank_asc';

const SORT_LABELS: Record<SortKey, string> = {
	order:     'Ordre',
	rank_desc: 'Rang ↓',
	rank_asc:  'Rang ↑',
};

export const BboxProposalList: React.FC<Props> = ({ proposals, selectedIds, onToggle }) => {
	const [sort, setSort] = useState<SortKey>('order');

	const sortedProposals = useMemo(() => {
		if (sort === 'order') return proposals;
		const copy = [...proposals];
		copy.sort((a, b) => {
			const aa = a.annotator_actions_total ?? 0;
			const bb = b.annotator_actions_total ?? 0;
			return sort === 'rank_desc' ? bb - aa : aa - bb;
		});
		return copy;
	}, [proposals, sort]);

	const ordered = sortedProposals.map((p) => p.cvat_shape_id);

	if (proposals.length === 0) {
		return <Text style={styles.empty}>Aucune proposition.</Text>;
	}

	return (
		<View style={{ gap: 4 }}>
			<View style={styles.sortBar}>
				<Text style={styles.sortLabel}>Trier</Text>
				{(Object.keys(SORT_LABELS) as SortKey[]).map((k) => {
					const active = sort === k;
					return (
						<Pressable key={k} onPress={() => setSort(k)} style={[styles.sortPill, active && styles.sortPillActive]}>
							<Text style={[styles.sortPillText, active && styles.sortPillTextActive]}>{SORT_LABELS[k]}</Text>
						</Pressable>
					);
				})}
			</View>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
				{sortedProposals.map((p) => {
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
							<View style={styles.info}>
								<View style={styles.titleRow}>
									<Text style={styles.species} numberOfLines={1}>{speciesLabel}</Text>
									{isPending ? <Text style={styles.pendingTag}>NV</Text> : null}
								</View>
								<AnnotatorBadge username={p.annotator_username} actionsTotal={p.annotator_actions_total} />
							</View>
						</Pressable>
					);
				})}
			</ScrollView>
		</View>
	);
};

const styles = StyleSheet.create({
	scroll: { maxHeight: 280 },
	content: { gap: 4 },
	empty: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.sm },

	sortBar: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 2 },
	sortLabel: { fontSize: 10, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginRight: 4 },
	sortPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	sortPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	sortPillText: { fontSize: 10, fontWeight: '600', color: COLORS.text.secondary },
	sortPillTextActive: { color: COLORS.text.inverse },

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
	info: { flex: 1, gap: 2 },
	titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	species: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600', flex: 1 },
	pendingTag: { fontSize: 9, color: COLORS.warning, fontWeight: '700', backgroundColor: `${COLORS.warning}22`, paddingHorizontal: 4, borderRadius: 3 },
});
