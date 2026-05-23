import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import type { Proposal } from '@/services/api/CuratorService';
import type {
	SpeciesPreview,
	SpeciesDecision,
	WipCertification,
	CuratorBbox,
} from '../hooks/useCuratorState';
import type { SpeciesStyle } from '../hooks/useSpeciesStyles';
import { SpeciesStylePanel } from './SpeciesStylePanel';
import { SpeciesMiniSheet, type SpeciesDraftValues, type LocalMatch } from './SpeciesMiniSheet';
import type { SpeciesTagGroup } from '@/services/api/SpeciesTagService';
import type { SpeciesEditPayload } from '@/services/api/SpeciesService';

interface Props {
	selectedGroup: SpeciesPreview | null;
	decision: SpeciesDecision | undefined;
	proposalsInGroup: Proposal[];
	drawingBbox: CuratorBbox | null;
	speciesStyle: SpeciesStyle | null;
	tagGroups: SpeciesTagGroup[];
	draftValues: SpeciesDraftValues | null;

	onToggleProposal: (proposal: Proposal) => void;
	onStartTracing: () => void;
	onConfirmTracing: () => void;
	onCancelTracing: () => void;
	onRejectSpecies: () => void;
	onResetDecision: () => void;
	onRemoveCertification: (certLocalId: string) => void;
	onSetSpeciesColor:   (color: string) => void;
	onSetSpeciesOpacity: (opacity: number) => void;
	onSaveSpeciesSheet:  (speciesId: number, payload: SpeciesEditPayload) => Promise<void>;
	onSpeciesDraftChange: (patch: Partial<SpeciesDraftValues>) => void;
	onRemoveManualSpecies?: () => void;
	onImportInsteadOfManual?: (existing: import('@/services/api/CuratorService').ProposalSpecies) => void;
	findLocalMatch?: (sci: string, excludeKey: string) => LocalMatch | null;
	onJumpToLocalSpecies?: (speciesKey: string) => void;
}

function speciesLabel(g: SpeciesPreview): string {
	if (!g.species) return g.speciesKey;
	return g.species.scientific_name || g.species.usage_name || g.species.name || g.speciesKey;
}

export const SpeciesActionsPanel: React.FC<Props> = ({
	selectedGroup, decision, proposalsInGroup, drawingBbox, speciesStyle, tagGroups, draftValues,
	onToggleProposal, onStartTracing, onConfirmTracing, onCancelTracing,
	onRejectSpecies, onResetDecision, onRemoveCertification,
	onSetSpeciesColor, onSetSpeciesOpacity, onSaveSpeciesSheet, onSpeciesDraftChange,
	onRemoveManualSpecies, onImportInsteadOfManual, findLocalMatch, onJumpToLocalSpecies,
}) => {
	if (!selectedGroup) {
		return (
			<View style={styles.col}>
				<View style={styles.headerPad}>
					<Text style={styles.colTitle}>Détails</Text>
				</View>
				<View style={styles.emptyState}>
					<Text style={styles.emptyText}>Sélectionne une espèce dans la liste de gauche pour la traiter.</Text>
				</View>
			</View>
		);
	}

	const status = decision?.status ?? 'pending';
	const certifications = decision?.certifications ?? [];

	return (
		<View style={styles.col}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
				<Text style={styles.colTitle}>{speciesLabel(selectedGroup)}</Text>
				{selectedGroup.species?.usage_name ? (
					<Text style={styles.subtitle}>{selectedGroup.species.usage_name}</Text>
				) : null}
				{selectedGroup.species?.polynesian_name ? (
					<Text style={styles.subtitlePoly}>{selectedGroup.species.polynesian_name}</Text>
				) : null}

				<StatusPill status={status} />

				{/* La fiche mini est masquée quand l'espèce est rejetée : on ne
				    documente pas une espèce qu'on a dit absente de l'image. Pour
				    les espèces "inconnues" (species null), la condition courante
				    ne l'affiche déjà pas. */}
				{status !== 'rejected' && selectedGroup.species && selectedGroup.species.id !== 0 && draftValues ? (
					<SpeciesMiniSheet
						species={selectedGroup.species}
						speciesKey={selectedGroup.speciesKey}
						tagGroups={tagGroups}
						values={draftValues}
						onChange={onSpeciesDraftChange}
						onSave={(payload) => onSaveSpeciesSheet(selectedGroup.species!.id, payload)}
						onImportInstead={onImportInsteadOfManual}
						findLocalMatch={findLocalMatch}
						onJumpToLocalSpecies={onJumpToLocalSpecies}
					/>
				) : null}

				{speciesStyle ? (
					<SpeciesStylePanel
						style={speciesStyle}
						onChangeColor={onSetSpeciesColor}
						onChangeOpacity={onSetSpeciesOpacity}
					/>
				) : null}

				{status === 'rejected' ? (
					<View style={styles.rejectedBlock}>
						<Text style={styles.rejectedText}>
							Espèce marquée absente. Aucune certification ne sera créée pour cette espèce.
						</Text>
						<Pressable onPress={onResetDecision} style={styles.btnNeutral}>
							<Text style={styles.btnNeutralText}>Annuler le rejet</Text>
						</Pressable>
					</View>
				) : null}

				{status !== 'rejected' && certifications.length > 0 ? (
					<View style={styles.block}>
						<Text style={styles.sectionLabel}>
							{certifications.length === 1 ? 'Boîte retenue' : `Boîtes retenues (${certifications.length})`}
						</Text>
						{certifications.map((c) => (
							<CertificationRow
								key={c.localId}
								cert={c}
								proposalsInGroup={proposalsInGroup}
								onRemove={() => onRemoveCertification(c.localId)}
							/>
						))}
					</View>
				) : null}

				{status !== 'rejected' ? (
					<>
						{proposalsInGroup.length > 0 ? (
							<View style={styles.block}>
								<Text style={styles.sectionLabel}>Propositions des annotateurs ({proposalsInGroup.length})</Text>
								<Text style={styles.helpText}>
									Coche les boîtes à retenir. Une espèce peut être présente plusieurs fois sur la même image (plusieurs individus).
								</Text>
								{proposalsInGroup.map((p) => {
									const checked = certifications.some((c) => c.chosenProposalId === p.cvat_shape_id);
									return (
										<ProposalRow
											key={p.cvat_shape_id}
											proposal={p}
											checked={checked}
											onToggle={() => onToggleProposal(p)}
										/>
									);
								})}
							</View>
						) : null}

						<View style={styles.block}>
							<Text style={styles.sectionLabel}>
								{certifications.length > 0 ? 'Tracer une boîte de plus' : 'Ou tracer ma propre boîte'}
							</Text>

							{drawingBbox ? (
								<View style={styles.draftRow}>
									<Text style={styles.draftText}>
										Boîte tracée — {Math.round(drawingBbox.width)} × {Math.round(drawingBbox.height)} px.
									</Text>
									<View style={styles.btnRow}>
										<Pressable onPress={onCancelTracing} style={[styles.btnNeutral, { flex: 1 }]}>
											<Text style={styles.btnNeutralText}>Annuler</Text>
										</Pressable>
										<Pressable onPress={onConfirmTracing} style={[styles.btnSuccess, { flex: 1 }]}>
											<Text style={styles.btnSuccessText}>Confirmer</Text>
										</Pressable>
									</View>
								</View>
							) : (
								<Pressable onPress={onStartTracing} style={styles.btnPrimary}>
									<Text style={styles.btnPrimaryText}>Tracer une boîte</Text>
								</Pressable>
							)}
						</View>
					</>
				) : null}

				{status === 'pending' && !onRemoveManualSpecies ? (
					<View style={styles.block}>
						<Pressable onPress={onRejectSpecies} style={styles.btnReject}>
							<Text style={styles.btnRejectText}>Rejeter (espèce absente)</Text>
						</Pressable>
						<Text style={styles.helpText}>
							À utiliser si les annotateurs se sont trompés et qu'aucune occurrence de cette espèce n'est en réalité présente sur l'image.
						</Text>
					</View>
				) : null}

				{onRemoveManualSpecies ? (
					<View style={styles.block}>
						<Pressable onPress={onRemoveManualSpecies} style={styles.btnReject}>
							<Text style={styles.btnRejectText}>Supprimer cette espèce</Text>
						</Pressable>
						<Text style={styles.helpText}>
							Retire complètement l'espèce et ses certifications de la session. À utiliser si tu l'as ajoutée par erreur.
						</Text>
					</View>
				) : null}
			</ScrollView>
		</View>
	);
};

const StatusPill: React.FC<{ status: 'pending' | 'accepted' | 'rejected' }> = ({ status }) => {
	const label = status === 'accepted' ? 'Certifiée'
		: status === 'rejected' ? 'Rejetée'
		: 'À traiter';
	const color = status === 'accepted' ? COLORS.status.validated
		: status === 'rejected' ? COLORS.danger
		: COLORS.text.placeholder;
	return (
		<View style={[styles.pill, { borderColor: color }]}>
			<View style={[styles.pillDot, { backgroundColor: color }]} />
			<Text style={[styles.pillText, { color }]}>{label}</Text>
		</View>
	);
};

const ProposalRow: React.FC<{
	proposal: Proposal;
	checked: boolean;
	onToggle: () => void;
}> = ({ proposal, checked, onToggle }) => (
	<Pressable
		onPress={onToggle}
		style={[styles.proposalRow, checked && styles.proposalRowChecked]}
	>
		<View style={[styles.checkbox, checked && styles.checkboxChecked]}>
			{checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
		</View>
		<View style={styles.proposalInfo}>
			<Text style={styles.proposalAnnotator}>{proposal.annotator_username}</Text>
			<Text style={styles.proposalMeta}>
				{Math.round(proposal.width)} × {Math.round(proposal.height)} px
				{checked ? ' · retenue' : ''}
			</Text>
		</View>
	</Pressable>
);

const CertificationRow: React.FC<{
	cert: WipCertification;
	proposalsInGroup: Proposal[];
	onRemove: () => void;
}> = ({ cert, proposalsInGroup, onRemove }) => {
	const source = cert.mode === 'review'
		? proposalsInGroup.find((p) => p.cvat_shape_id === cert.chosenProposalId)?.annotator_username ?? 'annotateur inconnu'
		: 'tracée par le curator';
	return (
		<View style={styles.certRow}>
			<View style={styles.certInfo}>
				<Text style={styles.certSource}>{cert.mode === 'review' ? `Boîte de ${source}` : 'Boîte tracée par le curator'}</Text>
				<Text style={styles.certMeta}>
					{Math.round(cert.shape.width)} × {Math.round(cert.shape.height)} px
				</Text>
			</View>
			<Pressable onPress={onRemove} hitSlop={6} style={styles.removeBtn}>
				<Text style={styles.removeBtnText}>✕</Text>
			</Pressable>
		</View>
	);
};

const styles = StyleSheet.create({
	col: {
		width: 320,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		overflow: 'hidden',
	},
	scroll: { flex: 1 },
	scrollContent: { padding: SPACING.md, gap: SPACING.sm },

	colTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, fontStyle: 'italic' },
	subtitlePoly: { ...TYPOGRAPHY.body, color: COLORS.text.placeholder, fontSize: 12 },

	headerPad: { padding: SPACING.md, paddingBottom: 0 },
	emptyState: {
		alignItems: 'center', justifyContent: 'center',
		borderWidth: 1, borderColor: COLORS.border,
		borderRadius: 8, padding: SPACING.lg,
		minHeight: 100, margin: SPACING.md,
	},
	emptyText: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic', textAlign: 'center', lineHeight: 17 },

	pill: {
		flexDirection: 'row', alignItems: 'center', gap: 6,
		alignSelf: 'flex-start',
		paddingHorizontal: SPACING.sm, paddingVertical: 4,
		borderRadius: 12, borderWidth: 1,
	},
	pillDot: { width: 6, height: 6, borderRadius: 3 },
	pillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

	block: { gap: 6, paddingTop: SPACING.sm },
	sectionLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

	proposalRow: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	proposalRowChecked: { borderColor: COLORS.status.validated, backgroundColor: `${COLORS.status.validated}11` },
	proposalInfo: { flex: 1, gap: 2 },
	proposalAnnotator: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	proposalMeta: { fontSize: 11, color: COLORS.text.placeholder },

	checkbox: {
		width: 18, height: 18, borderRadius: 3,
		borderWidth: 1.5, borderColor: COLORS.border,
		backgroundColor: COLORS.background.card,
		alignItems: 'center', justifyContent: 'center',
	},
	checkboxChecked: { borderColor: COLORS.status.validated, backgroundColor: COLORS.status.validated },
	checkboxMark: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 12, lineHeight: 14 },

	draftRow: {
		borderWidth: 1, borderColor: COLORS.warning, borderRadius: 6,
		padding: SPACING.sm, gap: SPACING.sm,
		backgroundColor: `${COLORS.warning}11`,
	},
	draftText: { fontSize: 12, color: COLORS.text.primary, lineHeight: 17 },

	btnRow: { flexDirection: 'row', gap: SPACING.sm },

	btnPrimary: {
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		borderRadius: 6, backgroundColor: COLORS.primary,
		alignItems: 'center', justifyContent: 'center',
	},
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13, textAlign: 'center' },

	btnSuccess: {
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		borderRadius: 6, backgroundColor: COLORS.success,
		alignItems: 'center', justifyContent: 'center',
	},
	btnSuccessText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13, textAlign: 'center' },

	btnNeutral: {
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		borderRadius: 6, backgroundColor: COLORS.text.secondary,
		alignItems: 'center', justifyContent: 'center',
	},
	btnNeutralText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13, textAlign: 'center' },

	btnReject: {
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		borderRadius: 6, backgroundColor: COLORS.danger,
		alignItems: 'center', justifyContent: 'center',
	},
	btnRejectText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13, textAlign: 'center' },

	rejectedBlock: { gap: 8, paddingTop: SPACING.sm },
	rejectedText: { fontSize: 12, color: COLORS.text.secondary, fontStyle: 'italic', lineHeight: 17 },

	helpText: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic', lineHeight: 15, marginTop: 4 },

	certRow: {
		flexDirection: 'row', alignItems: 'center', gap: 8,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.status.validated,
		backgroundColor: `${COLORS.status.validated}11`,
	},
	certInfo: { flex: 1, gap: 2 },
	certSource: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	certMeta: { fontSize: 10, color: COLORS.text.placeholder },

	removeBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
	removeBtnText: { fontSize: 13, color: COLORS.text.secondary, fontWeight: '700' },
});
