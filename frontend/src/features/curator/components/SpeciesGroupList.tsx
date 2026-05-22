import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import type { SpeciesPreview, DecisionStatus } from '../hooks/useCuratorState';
import type { SpeciesDraftValues } from './SpeciesMiniSheet';

interface Props {
	proposedGroups: SpeciesPreview[];
	manualGroups: SpeciesPreview[];
	selectedSpeciesKey: string | null;
	statusOf: (key: string) => DecisionStatus;
	certCountOf: (key: string) => number;
	draftFor?: (key: string) => SpeciesDraftValues | undefined;
	onSelect: (key: string) => void;
	onAddMissing: () => void;
	pendingCount: number;
	totalCount: number;
}

const STATUS_LABEL: Record<DecisionStatus, string> = {
	pending: 'à traiter',
	accepted: 'certifié',
	rejected: 'rejeté',
};

function dotColor(status: DecisionStatus): string {
	if (status === 'accepted') return COLORS.status.validated;
	if (status === 'rejected') return COLORS.danger;
	return COLORS.text.placeholder;
}

function speciesLabel(g: SpeciesPreview, draft?: SpeciesDraftValues): string {
	const draftSci = draft?.scientific_name?.trim();
	if (draftSci) return draftSci;
	if (!g.species) return g.speciesKey;
	return g.species.scientific_name || g.species.usage_name || g.species.name || g.speciesKey;
}

function speciesSub(g: SpeciesPreview, draft?: SpeciesDraftValues): string | null {
	const draftUsa = draft?.usage_name?.trim();
	const draftSci = draft?.scientific_name?.trim();
	if (draftUsa && draftUsa !== draftSci) return draftUsa;
	if (!g.species) return null;
	if (g.species.usage_name && g.species.usage_name !== g.species.scientific_name) return g.species.usage_name;
	return null;
}

type FicheState = 'certified' | 'filled' | 'todo';
function ficheStateOf(g: SpeciesPreview, draft?: SpeciesDraftValues): FicheState {
	const s = g.species;
	if (!s) return 'todo';
	if (s.id > 0 && s.status === 'approved') return 'certified';
	const sci = draft?.scientific_name?.trim() || s.scientific_name;
	const usa = draft?.usage_name?.trim()      || s.usage_name;
	const pol = draft?.polynesian_name?.trim() || s.polynesian_name;
	const complete = !!(sci && usa && pol);
	return complete ? 'filled' : 'todo';
}

export const SpeciesGroupList: React.FC<Props> = ({
	proposedGroups, manualGroups, selectedSpeciesKey, statusOf, certCountOf, draftFor,
	onSelect, onAddMissing, pendingCount, totalCount,
}) => {
	return (
		<View style={styles.col}>
			<Text style={styles.colTitle}>Espèces à certifier</Text>
			<Text style={styles.metaText}>
				{totalCount === 0
					? 'Aucune espèce proposée par les annotateurs.'
					: `${totalCount - pendingCount} / ${totalCount} traitée${(totalCount - pendingCount) > 1 ? 's' : ''}`}
			</Text>

			<ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
				{proposedGroups.length === 0 && manualGroups.length === 0 ? (
					<View style={styles.emptyState}>
						<Text style={styles.emptyText}>Aucune proposition pour ce média. Utilise « + Ajouter une espèce » pour démarrer.</Text>
					</View>
				) : null}

				{proposedGroups.length > 0 ? (
					<>
						<Text style={styles.sectionLabel}>Proposées par les annotateurs</Text>
						{proposedGroups.map((g) => (
							<GroupEntry
								key={g.speciesKey}
								group={g}
								draft={draftFor?.(g.speciesKey)}
								status={statusOf(g.speciesKey)}
								certCount={certCountOf(g.speciesKey)}
								selected={g.speciesKey === selectedSpeciesKey}
								onPress={() => onSelect(g.speciesKey)}
							/>
						))}
					</>
				) : null}

				{manualGroups.length > 0 ? (
					<>
						<Text style={styles.sectionLabel}>Ajoutées manuellement</Text>
						{manualGroups.map((g) => (
							<GroupEntry
								key={g.speciesKey}
								group={g}
								draft={draftFor?.(g.speciesKey)}
								status={statusOf(g.speciesKey)}
								certCount={certCountOf(g.speciesKey)}
								selected={g.speciesKey === selectedSpeciesKey}
								onPress={() => onSelect(g.speciesKey)}
							/>
						))}
					</>
				) : null}
			</ScrollView>

			<Pressable
				onPress={onAddMissing}
				style={({ hovered, pressed }: any) => [styles.addBtn, (hovered || pressed) && styles.addBtnActive]}
			>
				<Text style={styles.addBtnText}>+ Ajouter une espèce manquante</Text>
			</Pressable>
		</View>
	);
};

const GroupEntry: React.FC<{
	group: SpeciesPreview;
	draft?: SpeciesDraftValues;
	status: DecisionStatus;
	certCount: number;
	selected: boolean;
	onPress: () => void;
}> = ({ group, draft, status, certCount, selected, onPress }) => {
	const sub = speciesSub(group, draft);
	const fiche = ficheStateOf(group, draft);
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.entry,
				selected && styles.entrySelected,
				fiche === 'todo' && styles.entryPending,
			]}
		>
			<View style={[styles.dot, { backgroundColor: dotColor(status) }]} />
			<View style={styles.entryBody}>
				<View style={styles.entryHeader}>
					<Text style={styles.entryLabel} numberOfLines={1}>{speciesLabel(group, draft)}</Text>
					{fiche === 'certified' ? (
						<View style={styles.certifiedTag}>
							<Text style={styles.tagText}>Certifiée</Text>
						</View>
					) : fiche === 'filled' ? (
						<View style={styles.filledTag}>
							<Text style={styles.tagText}>Remplie</Text>
						</View>
					) : (
						<View style={styles.pendingTag}>
							<Text style={styles.tagText}>À remplir</Text>
						</View>
					)}
				</View>
				{sub ? <Text style={styles.entrySub} numberOfLines={1}>{sub}</Text> : null}
				<Text style={styles.entryMeta}>
					{group.proposalsCount > 0
						? `${group.proposalsCount} annotateur${group.proposalsCount > 1 ? 's' : ''}`
						: 'manuelle'}
					{status === 'accepted' && certCount > 0 ? ` · ${certCount} certifié${certCount > 1 ? 's' : ''}` : ''}
					{status === 'rejected' ? ' · rejetée' : ''}
					{status === 'pending' && group.proposalsCount > 0 ? ' · à traiter' : ''}
				</Text>
			</View>
		</Pressable>
	);
};

const styles = StyleSheet.create({
	col: {
		width: 260,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.sm,
		gap: SPACING.xs,
		overflow: 'hidden',
	},
	colTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	metaText: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },

	list: { flex: 1 },
	listContent: { gap: 6, paddingVertical: 6 },

	sectionLabel: {
		fontSize: 10, color: COLORS.text.secondary, fontWeight: '700',
		textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
	},

	emptyState: {
		borderWidth: 1, borderColor: COLORS.border,
		borderRadius: 6, padding: SPACING.md,
		backgroundColor: COLORS.background.main,
	},
	emptyText: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic', textAlign: 'center', lineHeight: 16 },

	entry: {
		flexDirection: 'row', alignItems: 'flex-start', gap: 8,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	entrySelected: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}11` },
	entryPending:  { borderLeftWidth: 3, borderLeftColor: COLORS.warning },
	dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
	entryBody: { flex: 1, gap: 2 },
	entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'space-between' },
	entryLabel: { fontSize: 13, color: COLORS.text.primary, fontWeight: '700', flex: 1 },
	entrySub: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
	entryMeta: { fontSize: 10, color: COLORS.text.placeholder },
	certifiedTag: {
		paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8,
		backgroundColor: COLORS.status.validated,
	},
	filledTag: {
		paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8,
		backgroundColor: COLORS.primary,
	},
	pendingTag: {
		paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8,
		backgroundColor: COLORS.warning,
	},
	tagText: { color: COLORS.text.inverse, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },

	addBtn: {
		marginTop: SPACING.xs,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		backgroundColor: COLORS.primary,
		alignItems: 'center',
	},
	addBtnActive: { opacity: 0.85 },
	addBtnText: { fontSize: 12, color: COLORS.text.inverse, fontWeight: '700' },
});
