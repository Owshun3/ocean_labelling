import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { Proposal, ProposalSpecies } from '@/services/api/CuratorService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

export interface SpeciesOption {
	key: string;
	speciesId: number | null;
	species: ProposalSpecies | null;
	displayName: string;
	fallbackLabel: string | null;
	count: number;
}

export function buildSpeciesOptions(proposals: Proposal[]): SpeciesOption[] {
	const map = new Map<string, SpeciesOption>();
	proposals.forEach((p) => {
		const key = p.species ? `id:${p.species.id}` : `name:${p.label_name ?? ''}`;
		const existing = map.get(key);
		if (existing) { existing.count += 1; return; }
		map.set(key, {
			key,
			speciesId: p.species?.id ?? null,
			species: p.species,
			displayName: p.species?.usage_name
				?? p.species?.scientific_name
				?? p.species?.name
				?? p.label_name
				?? '—',
			fallbackLabel: p.label_name,
			count: 1,
		});
	});
	return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
}

interface Props {
	options: SpeciesOption[];
	selectedKey: string | null;
	onSelect: (opt: SpeciesOption) => void;
}

export const SpeciesProposalList: React.FC<Props> = ({ options, selectedKey, onSelect }) => {
	if (options.length === 0) {
		return <Text style={styles.empty}>Aucune espèce proposée.</Text>;
	}
	return (
		<ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
			{options.map((opt) => {
				const active = opt.key === selectedKey;
				const status = opt.species?.status;
				return (
					<Pressable
						key={opt.key}
						onPress={() => onSelect(opt)}
						style={[styles.row, active && styles.rowActive]}
					>
						<View style={[styles.radio, active && styles.radioActive]}>
							{active ? <View style={styles.radioDot} /> : null}
						</View>
						<View style={styles.info}>
							<Text style={styles.name} numberOfLines={1}>{opt.displayName}</Text>
							{opt.species?.scientific_name && opt.species.scientific_name !== opt.displayName ? (
								<Text style={styles.sub} numberOfLines={1}>{opt.species.scientific_name}</Text>
							) : null}
						</View>
						{status === 'pending'  ? <Text style={styles.pendingTag}>NV</Text> : null}
						{status === 'approved' ? <Text style={styles.approvedTag}>✓</Text> : null}
						<Text style={styles.count}>×{opt.count}</Text>
					</Pressable>
				);
			})}
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	scroll: { maxHeight: 180 },
	content: { gap: 4 },
	empty: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.sm },
	row: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
		paddingVertical: 6, paddingHorizontal: SPACING.sm,
		borderRadius: 6, borderWidth: 1, borderColor: 'transparent',
		backgroundColor: COLORS.background.main,
	},
	rowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.background.card },
	radio: {
		width: 16, height: 16, borderRadius: 8,
		borderWidth: 1.5, borderColor: COLORS.border,
		alignItems: 'center', justifyContent: 'center',
		backgroundColor: COLORS.background.main,
	},
	radioActive: { borderColor: COLORS.primary },
	radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
	info: { flex: 1, gap: 1 },
	name: { fontSize: 13, color: COLORS.text.primary, fontWeight: '500' },
	sub: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
	pendingTag: { fontSize: 9, color: COLORS.warning, fontWeight: '700', backgroundColor: `${COLORS.warning}22`, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
	approvedTag: { fontSize: 9, color: COLORS.success, fontWeight: '700', backgroundColor: `${COLORS.success}22`, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
	count: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700' },
});
