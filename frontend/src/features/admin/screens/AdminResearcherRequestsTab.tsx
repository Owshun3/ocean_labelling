import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { confirm } from '@/shared/utils/dialog';
import { toast } from '@/shared/toast/Toast';
import { AdminService, ChercheurExportRequestAdminView } from '@/services/api/AdminService';
import { FilterSortBar, useFilteredAndSorted } from '@/shared/components/filters';
import type { FilterField, FilterSortState, SortOption, FieldExtractors } from '@/shared/components/filters';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const RESEARCHER_SORTS: SortOption[] = [
	{ key: 'created_at', label: 'Date de demande', defaultDirection: 'desc' },
	{ key: 'requester',  label: 'Demandeur (A-Z)', defaultDirection: 'asc'  },
];

const DEFAULT_STATE: FilterSortState = {
	filters: {},
	sort: { key: 'created_at', direction: 'desc' },
};

const RESEARCHER_EXTRACTORS: FieldExtractors<ChercheurExportRequestAdminView> = {
	search:     (r) => `${r.requester_username ?? ''} ${r.organization ?? ''} ${r.message ?? ''}`.toLowerCase(),
	created_at: (r) => r.created_at,
	requester:  (r) => (r.requester_username ?? '').toLowerCase(),
};

const RESEARCHER_FILTERS: FilterField[] = [
	{ kind: 'text', key: 'search', label: 'Rechercher', placeholder: 'Demandeur, organisation ou justification…' },
];

interface Props { onChanged?: () => void; }

export const AdminResearcherRequestsTab: React.FC<Props> = ({ onChanged }) => {
	const svc = useMemo(() => new AdminService(), []);
	const [items, setItems] = useState<ChercheurExportRequestAdminView[] | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [comments, setComments]   = useState<Record<number, string>>({});
	const [durations, setDurations] = useState<Record<number, string>>({});
	const [filterState, setFilterState] = useState<FilterSortState>(DEFAULT_STATE);

	const filtered = useFilteredAndSorted(items ?? [], RESEARCHER_FILTERS, RESEARCHER_SORTS, filterState, RESEARCHER_EXTRACTORS);

	const load = useCallback(async () => {
		setItems(null);
		try {
			setItems(await svc.listChercheurExportRequests());
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Chargement impossible.');
			setItems([]);
		}
	}, [svc]);

	useEffect(() => { load(); }, [load]);

	const handleApprove = async (id: number) => {
		const days = Number(durations[id] ?? '7');
		if (!Number.isFinite(days) || days < 1 || days > 365) {
			toast.error('Durée d\'accès invalide (1 à 365 jours).');
			return;
		}
		setSubmitting(true);
		try {
			await svc.resolveChercheurExportRequest(id, {
				action: 'approve',
				duration_days: days,
				comment: comments[id]?.trim() || undefined,
			});
			toast.success(`Demande approuvée pour ${days} jour(s).`);
			await load();
			onChanged?.();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Action impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleReject = async (id: number) => {
		const c = comments[id]?.trim();
		if (!c) {
			toast.error('Motif de rejet obligatoire.');
			return;
		}
		const m = 'Confirmer le rejet de cette demande ?';
		const proceed = await confirm(m, { confirmLabel: 'Rejeter', destructive: true });
		if (!proceed) return;
		setSubmitting(true);
		try {
			await svc.resolveChercheurExportRequest(id, { action: 'reject', comment: c });
			toast.success('Demande rejetée.');
			await load();
			onChanged?.();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Action impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	if (items === null) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	if (items.length === 0) return (
		<View style={styles.empty}>
			<Text style={styles.emptyTitle}>Aucune demande en attente</Text>
			<Text style={styles.emptyText}>
				Les chercheurs peuvent soumettre une demande depuis « Mes demandes d'export » dans leur menu.
				Elles apparaîtront ici pour validation.
			</Text>
		</View>
	);

	return (
		<ScrollView contentContainerStyle={styles.list}>
			<FilterSortBar
				filters={RESEARCHER_FILTERS}
				sorts={RESEARCHER_SORTS}
				value={filterState}
				onChange={setFilterState}
				defaultState={DEFAULT_STATE}
				totalCount={items.length}
				resultCount={filtered.length}
				searchKey="search"
			/>
			{filtered.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Aucune demande ne correspond aux filtres.</Text>
				</View>
			) : null}
			{filtered.map((r) => (
				<View key={r.id} style={styles.card}>
					<View style={styles.cardHeader}>
						<View style={{ flex: 1 }}>
							<Text style={styles.requester}>{r.requester_username ?? `#${r.requester_id}`}</Text>
							<Text style={styles.organization}>
								<Text style={styles.organizationLabel}>Organisation :</Text>{' '}
								{r.organization ? r.organization : <Text style={styles.organizationMissing}>non renseignée</Text>}
							</Text>
						</View>
						<Text style={styles.date}>{new Date(r.created_at).toLocaleString('fr-FR')}</Text>
					</View>

					<Text style={styles.sectionLabel}>Justification</Text>
					<Text style={styles.message}>« {r.message} »</Text>

					<Text style={styles.sectionLabel}>Périmètre demandé</Text>
					<View style={styles.scopeBox}>
						<ScopeLine label="Période"   value={fmtPeriod(r.scope)} />
						<ScopeLine label="Espèces"   value={(r.scope.species_ids?.length ?? 0) === 0 ? 'Toutes' : `${r.scope.species_ids?.length} sélectionnée(s)`} />
						<ScopeLine label="Tags"      value={(r.scope.tags?.length ?? 0) === 0 ? 'Aucun' : (r.scope.tags ?? []).join(', ')} />
						<ScopeLine label="Type"      value={
							r.scope.source_type === 'image'       ? 'Photos uniquement' :
							r.scope.source_type === 'video_frame' ? 'Frames vidéos uniquement' : 'Tous'
						} />
						<ScopeLine label="Métadonnées" value={r.scope.include_metadata !== false ? 'Incluses' : 'Exclues'} />
					</View>

					<View style={styles.actionsRow}>
						<View style={styles.commentBox}>
							<Text style={styles.fieldLabel}>Commentaire (motif si rejet, note si approbation)</Text>
							<TextInput
								value={comments[r.id] ?? ''}
								onChangeText={(v) => setComments((p) => ({ ...p, [r.id]: v }))}
								placeholder="Note interne, condition d'usage, motif…"
								placeholderTextColor={COLORS.text.placeholder}
								style={styles.input}
								multiline
							/>
						</View>
						<View style={styles.durationBox}>
							<Text style={styles.fieldLabel}>Durée (jours, max 365)</Text>
							<TextInput
								value={durations[r.id] ?? '7'}
								onChangeText={(v) => setDurations((p) => ({ ...p, [r.id]: v.replace(/[^0-9]/g, '') }))}
								keyboardType="number-pad"
								style={[styles.input, { textAlign: 'center' }]}
							/>
						</View>
					</View>

					<View style={styles.btnRow}>
						<Pressable onPress={() => handleReject(r.id)} disabled={submitting} style={[styles.btn, styles.btnReject, submitting && styles.btnDisabled]}>
							<Text style={styles.btnRejectText}>Rejeter</Text>
						</Pressable>
						<Pressable onPress={() => handleApprove(r.id)} disabled={submitting} style={[styles.btn, styles.btnApprove, submitting && styles.btnDisabled]}>
							<Text style={styles.btnApproveText}>Approuver</Text>
						</Pressable>
					</View>
				</View>
			))}
		</ScrollView>
	);
};

const ScopeLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
	<View style={styles.scopeRow}>
		<Text style={styles.scopeKey}>{label}</Text>
		<Text style={styles.scopeVal}>{value}</Text>
	</View>
);

function fmtPeriod(scope: ChercheurExportRequestAdminView['scope']): string {
	const f = scope.date_from, t = scope.date_to;
	if (!f && !t) return 'Toutes les périodes';
	if (f && t)   return `du ${f} au ${t}`;
	if (f)        return `depuis ${f}`;
	return `jusqu'au ${t}`;
}

const styles = StyleSheet.create({
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
	empty: { padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
	emptyTitle: { ...TYPOGRAPHY.h2 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, textAlign: 'center', maxWidth: 520 },

	list: { padding: SPACING.md, gap: SPACING.md },
	card: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
	cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
	requester: { ...TYPOGRAPHY.h2, fontSize: 15 },
	organization: { ...TYPOGRAPHY.body, fontSize: 13, color: COLORS.text.primary, marginTop: 2 },
	organizationLabel: { color: COLORS.text.secondary, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
	organizationMissing: { color: COLORS.danger, fontStyle: 'italic' },
	date: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	sectionLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginTop: SPACING.xs },
	message: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontStyle: 'italic', paddingLeft: SPACING.sm, borderLeftWidth: 2, borderLeftColor: COLORS.primary },

	scopeBox: { backgroundColor: COLORS.background.main, padding: SPACING.sm, borderRadius: 6, gap: 4 },
	scopeRow: { flexDirection: 'row' },
	scopeKey: { width: 110, fontSize: 11, color: COLORS.text.secondary, fontWeight: '600' },
	scopeVal: { flex: 1, fontSize: 12, color: COLORS.text.primary },

	actionsRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-end' },
	commentBox: { flex: 2 },
	durationBox: { width: 120 },
	fieldLabel: { fontSize: 11, color: COLORS.text.secondary, marginBottom: 4, fontWeight: '600' },
	input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main, minHeight: 38 },

	btnRow: { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'flex-end' },
	btn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6 },
	btnApprove: { backgroundColor: COLORS.success },
	btnApproveText: { color: COLORS.text.inverse, fontWeight: '700' },
	btnReject: { backgroundColor: COLORS.danger },
	btnRejectText: { color: COLORS.text.inverse, fontWeight: '700' },
	btnDisabled: { opacity: 0.5 },
});
