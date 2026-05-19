import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator, Platform, Alert } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { ChercheurService, ChercheurExportRequest, ExportRequestStatus } from '@/services/api/ChercheurService';
import type { ExportFilters, ExportPreview, ExportSourceType } from '@/services/api/AdminService';
import { SpeciesService, Species } from '@/services/api/SpeciesService';
import { SpeciesTagService, SpeciesTagGroup } from '@/services/api/SpeciesTagService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const SOURCE_OPTIONS: { value: ExportSourceType; label: string }[] = [
	{ value: 'all',         label: 'Tous' },
	{ value: 'image',       label: 'Photos uniquement' },
	{ value: 'video_frame', label: 'Frames vidéos uniquement' },
];

const STATUS_COLOR: Record<ExportRequestStatus, string> = {
	pending:   COLORS.status.pending,
	approved:  COLORS.success,
	rejected:  COLORS.status.error,
	withdrawn: COLORS.text.placeholder,
};
const STATUS_LABEL: Record<ExportRequestStatus, string> = {
	pending:   'En attente',
	approved:  'Approuvée',
	rejected:  'Rejetée',
	withdrawn: 'Annulée',
};

export const ChercheurExportRequestsScreen: React.FC = () => {
	const svc        = useMemo(() => new ChercheurService(), []);
	const speciesSvc = useMemo(() => new SpeciesService(), []);
	const tagSvc     = useMemo(() => new SpeciesTagService(), []);

	const [tagGroups, setTagGroups] = useState<SpeciesTagGroup[]>([]);
	const [facets, setFacets]       = useState<{ tags: string[] }>({ tags: [] });
	const [history, setHistory]     = useState<ChercheurExportRequest[]>([]);
	const [loading, setLoading]     = useState(true);

	// Form state — identique à l'admin + message + organisation
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo,   setDateTo]   = useState('');
	const [selectedSpecies, setSelectedSpecies] = useState<Species[]>([]);
	const [selectedTags,    setSelectedTags]    = useState<Set<string>>(new Set());
	const [groupValues,     setGroupValues]     = useState<Record<string, string>>({});
	const [sourceType,  setSourceType]  = useState<ExportSourceType>('all');
	const [includeMeta, setIncludeMeta] = useState(true);
	const [message,       setMessage]       = useState('');
	const [organization,  setOrganization]  = useState('');

	const [speciesQuery,   setSpeciesQuery]   = useState('');
	const [speciesResults, setSpeciesResults] = useState<Species[]>([]);

	const [preview, setPreview]       = useState<ExportPreview | null>(null);
	const [previewing, setPreviewing] = useState(false);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [f, g, h] = await Promise.all([svc.getFacets(), tagSvc.list(), svc.listMyRequests()]);
			setFacets(f); setTagGroups(g); setHistory(h);
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Chargement impossible.');
		} finally {
			setLoading(false);
		}
	}, [svc, tagSvc]);

	useEffect(() => { load(); }, [load]);

	useEffect(() => {
		const q = speciesQuery.trim();
		if (q.length < 1) { setSpeciesResults([]); return; }
		const h = setTimeout(() => {
			speciesSvc.search(q).then(setSpeciesResults).catch(() => setSpeciesResults([]));
		}, 200);
		return () => clearTimeout(h);
	}, [speciesQuery, speciesSvc]);

	const exclusiveGroups    = useMemo(() => tagGroups.filter((g) => g.is_exclusive), [tagGroups]);
	const nonExclusiveGroups = useMemo(() => tagGroups.filter((g) => !g.is_exclusive), [tagGroups]);

	const filters: ExportFilters = useMemo(() => {
		const tags = [...Array.from(selectedTags), ...Object.values(groupValues).filter(Boolean)];
		return {
			date_from: dateFrom || undefined,
			date_to:   dateTo   || undefined,
			species_ids: selectedSpecies.map((s) => s.id),
			tags,
			source_type: sourceType,
			include_metadata: includeMeta,
		};
	}, [dateFrom, dateTo, selectedSpecies, selectedTags, groupValues, sourceType, includeMeta]);

	const handlePreview = useCallback(async () => {
		setPreviewing(true);
		setPreviewError(null);
		try { setPreview(await svc.preview(filters)); }
		catch (err: any) {
			const m = err?.response?.data?.error || err?.message || 'Aperçu impossible.';
			setPreviewError(m);
			setPreview(null);
		}
		finally { setPreviewing(false); }
	}, [svc, filters]);

	// Auto-refresh dès qu'un filtre change (debounce 400 ms).
	useEffect(() => {
		if (loading) return;
		const t = setTimeout(() => { handlePreview(); }, 400);
		return () => clearTimeout(t);
	}, [filters, loading, handlePreview]);

	const handleSubmit = async () => {
		if (message.trim().length < 10) {
			toast.error('Le message de justification doit faire au moins 10 caractères.');
			return;
		}
		if (organization.trim().length < 2) {
			toast.error('L\'organisation affiliée est obligatoire.');
			return;
		}
		setSubmitting(true);
		try {
			await svc.submitRequest({ scope: filters, message: message.trim(), organization: organization.trim() });
			toast.success('Demande envoyée à l\'administrateur.');
			setMessage(''); setOrganization(''); setPreview(null);
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Envoi impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDownload = async (req: ChercheurExportRequest) => {
		try {
			const { filename, blob } = await svc.download(req.id);
			if (Platform.OS === 'web') {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url; a.download = filename;
				document.body.appendChild(a); a.click(); a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				toast.success('Export téléchargé.');
			}
		} catch (err: any) {
			const data = err?.response?.data;
			let msg = err?.message || 'Téléchargement impossible.';
			if (data instanceof Blob) {
				try { msg = JSON.parse(await data.text())?.error || msg; } catch {}
			} else if (data?.error) msg = data.error;
			toast.error(msg);
		}
	};

	const handleWithdraw = async (req: ChercheurExportRequest) => {
		const m = 'Annuler cette demande en attente ?';
		const proceed = Platform.OS === 'web' ? window.confirm(m) : await new Promise<boolean>((res) => Alert.alert('Annuler', m, [
			{ text: 'Non', style: 'cancel', onPress: () => res(false) },
			{ text: 'Oui',  style: 'destructive', onPress: () => res(true) },
		]));
		if (!proceed) return;
		try {
			await svc.withdraw(req.id);
			toast.success('Demande annulée.');
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Annulation impossible.');
		}
	};

	if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>Demande d'accès à l'export</Text>
			<Text style={styles.subtitle}>
				En tant que chercheur, tu peux demander à l'administrateur l'accès à un sous-ensemble de données certifiées.
				Sélectionne le périmètre exact, justifie ta demande, puis envoie. Une fois approuvée, tu pourras télécharger
				l'export Datumaro autant de fois que nécessaire jusqu'à la date d'expiration fixée par l'admin.
			</Text>

			<View style={styles.layout}>
				<View style={styles.formCol}>
					<Section title="Période (date de certification curator)">
						<View style={styles.dateRow}>
							<DateField label="Du" value={dateFrom} max={dateTo || undefined} onChange={(v) => { setDateFrom(v); setPreview(null); }} />
							<DateField label="Au" value={dateTo} min={dateFrom || undefined} onChange={(v) => { setDateTo(v); setPreview(null); }} />
						</View>
						<View style={styles.periodFooter}>
							<Pressable
								onPress={() => { setDateFrom(''); setDateTo(''); setPreview(null); }}
								style={[styles.allPeriodsBtn, (!dateFrom && !dateTo) && styles.allPeriodsBtnActive]}
							>
								<Text style={[styles.allPeriodsBtnText, (!dateFrom && !dateTo) && styles.allPeriodsBtnTextActive]}>
									{!dateFrom && !dateTo ? '✓ Toutes les périodes' : 'Toutes les périodes'}
								</Text>
							</Pressable>
						</View>
					</Section>

					{exclusiveGroups.map((g) => {
						const current = groupValues[g.key] ?? '';
						return (
							<Section key={g.key} title={g.label + (g.is_required ? ' *' : '')}>
								<View style={styles.chipRow}>
									<Pressable onPress={() => { setGroupValues((p) => ({ ...p, [g.key]: '' })); setPreview(null); }}
										style={[styles.tagChip, current === '' && styles.tagChipActive]}>
										<Text style={[styles.tagChipText, current === '' && styles.tagChipTextActive]}>Toutes</Text>
									</Pressable>
									{g.definitions.filter((d) => !d.archived_at).map((d) => (
										<Pressable key={d.id}
											onPress={() => { setGroupValues((p) => ({ ...p, [g.key]: d.value })); setPreview(null); }}
											style={[styles.tagChip, current === d.value && styles.tagChipActive]}>
											<Text style={[styles.tagChipText, current === d.value && styles.tagChipTextActive]}>{d.label}</Text>
										</Pressable>
									))}
								</View>
							</Section>
						);
					})}

					{nonExclusiveGroups.map((g) => (
						<Section key={g.key} title={g.label + (g.is_required ? ' *' : '')}>
							<View style={styles.chipRow}>
								{g.definitions.filter((d) => !d.archived_at).map((d) => {
									const on = selectedTags.has(d.value);
									return (
										<Pressable key={d.id}
											onPress={() => { setSelectedTags((p) => { const n = new Set(p); n.has(d.value) ? n.delete(d.value) : n.add(d.value); return n; }); setPreview(null); }}
											style={[styles.tagChip, on && styles.tagChipActive]}>
											<Text style={[styles.tagChipText, on && styles.tagChipTextActive]}>{d.label}</Text>
										</Pressable>
									);
								})}
							</View>
						</Section>
					))}

					<Section title="Espèces">
						<TextInput value={speciesQuery} onChangeText={setSpeciesQuery}
							placeholder="Rechercher une espèce…" placeholderTextColor={COLORS.text.placeholder} style={styles.input} />
						{speciesResults.length > 0 ? (
							<View style={styles.suggestList}>
								{speciesResults.slice(0, 6).map((s) => (
									<Pressable key={s.id} onPress={() => {
										setSelectedSpecies((p) => p.some((x) => x.id === s.id) ? p : [...p, s]);
										setSpeciesQuery(''); setSpeciesResults([]); setPreview(null);
									}} style={styles.suggestItem}>
										<Text style={styles.suggestText}>{s.scientific_name || s.usage_name || s.name}</Text>
									</Pressable>
								))}
							</View>
						) : null}
						<View style={styles.chipRow}>
							{selectedSpecies.map((s) => (
								<View key={s.id} style={styles.chip}>
									<Text style={styles.chipText}>{s.scientific_name || s.usage_name || s.name}</Text>
									<Pressable onPress={() => { setSelectedSpecies((p) => p.filter((x) => x.id !== s.id)); setPreview(null); }} hitSlop={6}>
										<Text style={styles.chipClose}>✕</Text>
									</Pressable>
								</View>
							))}
							{selectedSpecies.length === 0 ? <Text style={styles.emptyHint}>Aucun filtre — toutes les espèces.</Text> : null}
						</View>
					</Section>

					<Section title="Type de média">
						<View style={styles.chipRow}>
							{SOURCE_OPTIONS.map((opt) => (
								<Pressable key={opt.value} onPress={() => { setSourceType(opt.value); setPreview(null); }}
									style={[styles.tagChip, sourceType === opt.value && styles.tagChipActive]}>
									<Text style={[styles.tagChipText, sourceType === opt.value && styles.tagChipTextActive]}>{opt.label}</Text>
								</Pressable>
							))}
						</View>
					</Section>

					<Section title="Justification de la demande *">
						<TextInput value={message} onChangeText={setMessage} multiline
							placeholder="Décris l'usage prévu, l'étude de recherche, le besoin scientifique précis qui motive l'accès à ces données."
							placeholderTextColor={COLORS.text.placeholder} style={[styles.input, styles.textarea]} maxLength={4000} />
						<Text style={styles.helperText}>
							{message.length} caractère(s) · minimum 10. L'administrateur lit ce texte pour décider.
						</Text>
					</Section>

					<Section title="Organisation affiliée *">
						<TextInput value={organization} onChangeText={setOrganization}
							placeholder="Université de Polynésie Française, IRD, CNRS, …"
							placeholderTextColor={COLORS.text.placeholder} style={styles.input} maxLength={200} />
						<Text style={styles.helperText}>
							Obligatoire — utilisée pour la traçabilité des accès aux données.
						</Text>
					</Section>
				</View>

				<View style={styles.sideCol}>
					<View style={styles.previewHeader}>
						<Text style={styles.sideTitle}>Aperçu</Text>
						{previewing ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
					</View>
					{preview ? (
						<View style={styles.previewBox}>
							<Text style={styles.previewCount}>{preview.count}</Text>
							<Text style={styles.previewLabel}>item(s) correspondants</Text>
							<View style={styles.previewBreakdown}>
								<Row label="Photos"             value={preview.breakdown.image_count} />
								<Row label="Frames vidéo"       value={preview.breakdown.frame_count} />
								<Row label="Espèces distinctes" value={preview.breakdown.distinct_species} />
								<Row label="Uploadeurs"         value={preview.breakdown.distinct_uploaders} />
							</View>
						</View>
					) : previewError ? (
						<Text style={[styles.previewEmpty, { color: COLORS.danger }]}>{previewError}</Text>
					) : (
						<Text style={styles.previewEmpty}>{previewing ? 'Calcul en cours…' : 'Aperçu en attente…'}</Text>
					)}

					<View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
						<Pressable onPress={handleSubmit}
							disabled={submitting || message.trim().length < 10 || organization.trim().length < 2}
							style={[styles.btn, styles.btnPrimary, (submitting || message.trim().length < 10 || organization.trim().length < 2) && styles.btnDisabled]}>
							<Text style={styles.btnPrimaryText}>{submitting ? 'Envoi…' : 'Envoyer la demande'}</Text>
						</Pressable>
						{message.trim().length < 10 || organization.trim().length < 2 ? (
							<Text style={styles.helperText}>
								Renseigne la justification (≥ 10 chars) et l'organisation pour activer l'envoi.
							</Text>
						) : null}
					</View>
				</View>
			</View>

			<View style={styles.historyHeader}>
				<Text style={styles.historyTitle}>Mes demandes</Text>
				<Text style={styles.historySub}>{history.length} demande(s)</Text>
			</View>
			{history.length === 0 ? (
				<Text style={styles.emptyHint}>Aucune demande pour l'instant.</Text>
			) : history.map((r) => (
				<View key={r.id} style={styles.historyCard}>
					<View style={styles.historyRow}>
						<View style={[styles.historyBadge, { backgroundColor: STATUS_COLOR[r.status] }]}>
							<Text style={styles.historyBadgeText}>{STATUS_LABEL[r.status]}</Text>
						</View>
						<Text style={styles.historyDate}>{new Date(r.created_at).toLocaleString('fr-FR')}</Text>
						{r.expires_at ? (
							<Text style={styles.historyExpires}>expire le {new Date(r.expires_at).toLocaleDateString('fr-FR')}</Text>
						) : null}
					</View>
					{r.organization ? <Text style={styles.historyOrg}>Organisation : {r.organization}</Text> : null}
					<Text style={styles.historyMessage} numberOfLines={3}>{r.message}</Text>
					{r.review_comment ? (
						<Text style={styles.historyReview}>Réponse admin : « {r.review_comment} »</Text>
					) : null}
					<View style={styles.historyActions}>
						{r.status === 'approved' ? (
							<Pressable onPress={() => handleDownload(r)} style={[styles.btn, styles.btnPrimary]}>
								<Text style={styles.btnPrimaryText}>Télécharger l'export</Text>
							</Pressable>
						) : null}
						{r.status === 'pending' ? (
							<Pressable onPress={() => handleWithdraw(r)} style={[styles.btn, styles.btnGhost]}>
								<Text style={styles.btnGhostText}>Annuler la demande</Text>
							</Pressable>
						) : null}
					</View>
				</View>
			))}
		</ScrollView>
	);
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
	<View style={styles.section}>
		<Text style={styles.sectionTitle}>{title}</Text>
		{children}
	</View>
);
const Row: React.FC<{ label: string; value: number }> = ({ label, value }) => (
	<View style={styles.rowKV}>
		<Text style={styles.rowKey}>{label}</Text>
		<Text style={styles.rowVal}>{value}</Text>
	</View>
);

interface DateFieldProps { label: string; value: string; min?: string; max?: string; onChange: (v: string) => void; }
const DateField: React.FC<DateFieldProps> = ({ label, value, min, max, onChange }) => {
	if (Platform.OS === 'web') {
		return (
			<View style={{ flex: 1 }}>
				<Text style={styles.fieldLabel}>{label}</Text>
				{/* @ts-ignore */}
				<input type="date" value={value} min={min} max={max}
					onChange={(e: any) => onChange(e.target.value)} style={dateInputStyle as any} />
			</View>
		);
	}
	return (
		<View style={{ flex: 1 }}>
			<Text style={styles.fieldLabel}>{label}</Text>
			<TextInput value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" style={styles.input} />
		</View>
	);
};
const dateInputStyle = {
	border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '8px 10px',
	fontSize: 13, backgroundColor: COLORS.background.main, color: COLORS.text.primary, width: '100%',
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },

	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.xs },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginBottom: SPACING.md },

	layout: { flexDirection: 'row', gap: SPACING.lg, alignItems: 'flex-start' },
	formCol: { flex: 1, gap: SPACING.md },
	sideCol: { width: 340, gap: SPACING.md, position: 'sticky' as any, top: 0 },

	section: { gap: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
	sectionTitle: { ...TYPOGRAPHY.h2, fontSize: 14 },
	fieldLabel: { fontSize: 12, color: COLORS.text.secondary, marginBottom: 4, fontWeight: '600' },

	dateRow: { flexDirection: 'row', gap: SPACING.md },
	periodFooter: { flexDirection: 'row', marginTop: 4 },
	allPeriodsBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 999, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	allPeriodsBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	allPeriodsBtnText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	allPeriodsBtnTextActive: { color: COLORS.text.inverse },

	input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main },
	textarea: { minHeight: 90, textAlignVertical: 'top' },
	helperText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },

	chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, alignItems: 'center' },
	tagChip: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 999, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	tagChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	tagChipText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	tagChipTextActive: { color: COLORS.text.inverse },

	chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.sm, paddingVertical: 4, backgroundColor: COLORS.primary, borderRadius: 999 },
	chipText: { color: COLORS.text.inverse, fontSize: 12, fontWeight: '600' },
	chipClose: { color: COLORS.text.inverse, fontSize: 11, fontWeight: '700' },

	suggestList: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, marginTop: 4, overflow: 'hidden' },
	suggestItem: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background.main },
	suggestText: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },

	emptyHint: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },

	sideTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	previewBox: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 4 },
	previewCount: { fontSize: 36, fontWeight: '800', color: COLORS.primary, fontVariant: ['tabular-nums'] },
	previewLabel: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
	previewBreakdown: { width: '100%', marginTop: SPACING.sm, gap: 4 },
	previewEmpty: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', textAlign: 'center', padding: SPACING.md },

	rowKV: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	rowKey: { fontSize: 12, color: COLORS.text.secondary },
	rowVal: { fontSize: 14, color: COLORS.text.primary, fontWeight: '700', fontVariant: ['tabular-nums'] },

	btn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, alignItems: 'center' },
	btnPrimary: { backgroundColor: COLORS.success },
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '700' },
	btnSecondary: { backgroundColor: COLORS.primary },
	btnSecondaryText: { color: COLORS.text.inverse, fontWeight: '600' },
	btnGhost: { backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	btnGhostText: { color: COLORS.text.primary, fontWeight: '600' },
	btnDisabled: { opacity: 0.4 },

	historyHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: SPACING.lg, marginBottom: SPACING.sm },
	historyTitle: { ...TYPOGRAPHY.h2 },
	historySub: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
	historyCard: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: 4, marginBottom: SPACING.sm },
	historyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
	historyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
	historyBadgeText: { color: COLORS.text.inverse, fontSize: 11, fontWeight: '700' },
	historyDate: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
	historyExpires: { ...TYPOGRAPHY.caption, color: COLORS.text.primary, fontStyle: 'italic' },
	historyOrg: { ...TYPOGRAPHY.caption, color: COLORS.text.primary, fontWeight: '600' },
	historyMessage: { ...TYPOGRAPHY.body, color: COLORS.text.primary },
	historyReview: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic', borderLeftWidth: 2, borderLeftColor: COLORS.border, paddingLeft: SPACING.sm },
	historyActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
});
