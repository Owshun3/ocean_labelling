import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator, Platform } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import {
	AdminService, ExportFacets, ExportFilters, ExportPreview, ExportSourceType,
} from '@/services/api/AdminService';
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

export const AdminExportScreen: React.FC = () => {
	const service       = useMemo(() => new AdminService(), []);
	const speciesService = useMemo(() => new SpeciesService(), []);
	const tagService     = useMemo(() => new SpeciesTagService(), []);

	const [facets, setFacets] = useState<ExportFacets | null>(null);
	const [tagGroups, setTagGroups] = useState<SpeciesTagGroup[]>([]);
	const [facetsLoading, setFacetsLoading] = useState(true);

	const [dateFrom,    setDateFrom]    = useState('');
	const [dateTo,      setDateTo]      = useState('');
	const [selectedSpecies, setSelectedSpecies] = useState<Species[]>([]);
	const [selectedTags,    setSelectedTags]    = useState<Set<string>>(new Set());
	// groupValues : pour chaque groupe exclusif, la valeur sélectionnée (chaîne vide = aucune).
	const [groupValues,     setGroupValues]     = useState<Record<string, string>>({});
	const [sourceType,  setSourceType]  = useState<ExportSourceType>('all');
	const [includeMeta, setIncludeMeta] = useState(true);

	const [speciesQuery,    setSpeciesQuery]    = useState('');
	const [speciesResults,  setSpeciesResults]  = useState<Species[]>([]);

	const [preview, setPreview] = useState<ExportPreview | null>(null);
	const [previewing, setPreviewing] = useState(false);
	const [running, setRunning] = useState(false);
	const [previewError, setPreviewError] = useState<string | null>(null);

	useEffect(() => {
		Promise.all([
			service.getExportFacets(),
			tagService.list(),
		])
			.then(([f, groups]) => { setFacets(f); setTagGroups(groups); })
			.catch((err) => toast.error(err?.response?.data?.error || err?.message || 'Chargement impossible.'))
			.finally(() => setFacetsLoading(false));
	}, [service, tagService]);

	useEffect(() => {
		const q = speciesQuery.trim();
		if (q.length < 1) { setSpeciesResults([]); return; }
		const handler = setTimeout(() => {
			speciesService.search(q).then(setSpeciesResults).catch(() => setSpeciesResults([]));
		}, 200);
		return () => clearTimeout(handler);
	}, [speciesQuery, speciesService]);

	const exclusiveGroups    = useMemo(() => tagGroups.filter((g) => g.is_exclusive),  [tagGroups]);
	const nonExclusiveGroups = useMemo(() => tagGroups.filter((g) => !g.is_exclusive), [tagGroups]);
	// Tags appartenant à un groupe défini (exclu du multi-select « orphelins »).
	const knownValues = useMemo(() => {
		const s = new Set<string>();
		for (const g of tagGroups) for (const d of g.definitions) s.add(d.value);
		return s;
	}, [tagGroups]);
	// « Autres tags » = valeurs présentes sur des espèces mais hors taxonomie connue.
	// Sert de garde-fou pour les tags hérités ou ad-hoc à nettoyer.
	const orphanTags = useMemo(
		() => (facets?.tags ?? []).filter((t) => !knownValues.has(t)),
		[facets, knownValues],
	);

	const filters: ExportFilters = useMemo(() => {
		const tagsCombined = [
			...Array.from(selectedTags),
			...Object.values(groupValues).filter((v) => v),
		];
		return {
			date_from:    dateFrom || undefined,
			date_to:      dateTo   || undefined,
			species_ids:  selectedSpecies.map((s) => s.id),
			tags:         tagsCombined,
			source_type:  sourceType,
			include_metadata: includeMeta,
		};
	}, [dateFrom, dateTo, selectedSpecies, selectedTags, groupValues, sourceType, includeMeta]);

	const toggleTag = (tag: string) => {
		setSelectedTags((prev) => {
			const next = new Set(prev);
			if (next.has(tag)) next.delete(tag); else next.add(tag);
			return next;
		});
		setPreview(null);
	};
	const addSpecies = (s: Species) => {
		setSelectedSpecies((prev) => prev.some((p) => p.id === s.id) ? prev : [...prev, s]);
		setSpeciesQuery('');
		setSpeciesResults([]);
		setPreview(null);
	};
	const removeSpecies = (id: number) => {
		setSelectedSpecies((prev) => prev.filter((s) => s.id !== id));
		setPreview(null);
	};

	const setDateFromCoherent = (v: string) => {
		setDateFrom(v);
		// Garde-fou : si la nouvelle date_from dépasse date_to, on aligne date_to.
		if (v && dateTo && v > dateTo) setDateTo(v);
		setPreview(null);
	};
	const setDateToCoherent = (v: string) => {
		setDateTo(v);
		// Garde-fou symétrique.
		if (v && dateFrom && v < dateFrom) setDateFrom(v);
		setPreview(null);
	};

	const resetFilters = useCallback(() => {
		setDateFrom('');
		setDateTo('');
		setSelectedSpecies([]);
		setSelectedTags(new Set());
		setGroupValues({});
		setSourceType('all');
		setIncludeMeta(true);
		setPreview(null);
	}, []);

	const handlePreview = useCallback(async () => {
		setPreviewing(true);
		setPreviewError(null);
		try {
			const p = await service.previewExport(filters);
			setPreview(p);
		} catch (err: any) {
			const msg = err?.response?.data?.error || err?.message || 'Aperçu impossible.';
			setPreviewError(msg);
			setPreview(null);
		} finally {
			setPreviewing(false);
		}
	}, [service, filters]);

	// Rafraîchissement automatique : 400ms après le dernier changement de filtre,
	// on relance l'aperçu. Pas besoin de bouton manuel — le count reflète l'état courant.
	useEffect(() => {
		if (facetsLoading) return;
		const t = setTimeout(() => { handlePreview(); }, 400);
		return () => clearTimeout(t);
	}, [filters, facetsLoading, handlePreview]);

	const handleRun = useCallback(async () => {
		if (preview?.count === 0) {
			toast.error('Aucun item ne correspond aux filtres.');
			return;
		}
		setRunning(true);
		try {
			const { filename, blob } = await service.runExport(filters);
			if (Platform.OS === 'web') {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				toast.success(`Export terminé (${filename}).`);
			} else {
				toast.error('Téléchargement disponible sur web uniquement.');
			}
		} catch (err: any) {
			const data = err?.response?.data;
			let message = err?.message || 'Export impossible.';
			if (data instanceof Blob) {
				try { message = JSON.parse(await data.text())?.error || message; } catch {}
			} else if (data?.error) {
				message = data.error;
			}
			toast.error(message);
		} finally {
			setRunning(false);
		}
	}, [service, filters, preview]);

	if (facetsLoading) {
		return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;
	}

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>Export des données</Text>
			<Text style={styles.subtitle}>
				Export Datumaro 1.0 (zip) des médias <Text style={styles.bold}>validés par un curator</Text>. Utilise les filtres pour cibler le périmètre puis lance un aperçu avant de télécharger.
			</Text>

			<View style={styles.layout}>
				<View style={styles.formCol}>
					<Section title="Période (date de certification curator)">
						<View style={styles.dateRow}>
							<DateField
								label="Du" value={dateFrom}
								max={dateTo || undefined}
								onChange={setDateFromCoherent}
							/>
							<DateField
								label="Au" value={dateTo}
								min={dateFrom || undefined}
								onChange={setDateToCoherent}
							/>
						</View>
						<View style={styles.periodFooter}>
							<Pressable
								onPress={() => { setDateFrom(''); setDateTo(''); setPreview(null); }}
								style={[
									styles.allPeriodsBtn,
									(!dateFrom && !dateTo) && styles.allPeriodsBtnActive,
								]}
							>
								<Text style={[
									styles.allPeriodsBtnText,
									(!dateFrom && !dateTo) && styles.allPeriodsBtnTextActive,
								]}>
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
									<Pressable
										onPress={() => { setGroupValues((p) => ({ ...p, [g.key]: '' })); setPreview(null); }}
										style={[styles.tagChip, current === '' && styles.tagChipActive]}
									>
										<Text style={[styles.tagChipText, current === '' && styles.tagChipTextActive]}>Toutes</Text>
									</Pressable>
									{g.definitions.filter((d) => !d.archived_at).map((d) => (
										<Pressable
											key={d.id}
											onPress={() => { setGroupValues((p) => ({ ...p, [g.key]: d.value })); setPreview(null); }}
											style={[styles.tagChip, current === d.value && styles.tagChipActive]}
										>
											<Text style={[styles.tagChipText, current === d.value && styles.tagChipTextActive]}>{d.label}</Text>
										</Pressable>
									))}
								</View>
								<Text style={styles.helperText}>
									Choix unique — défini par le curator à la création d'une espèce. L'admin gère la liste depuis « Tags d'espèces ».
								</Text>
							</Section>
						);
					})}

					{nonExclusiveGroups.map((g) => {
						const active = new Set(Array.from(selectedTags).filter((t) =>
							g.definitions.some((d) => d.value === t),
						));
						return (
							<Section key={g.key} title={`${g.label}${g.is_required ? ' *' : ''} (${g.definitions.filter((d) => !d.archived_at).length})`}>
								<View style={styles.chipRow}>
									{g.definitions.filter((d) => !d.archived_at).map((d) => (
										<Pressable
											key={d.id}
											onPress={() => {
												setSelectedTags((prev) => {
													const next = new Set(prev);
													if (next.has(d.value)) next.delete(d.value); else next.add(d.value);
													return next;
												});
												setPreview(null);
											}}
											style={[styles.tagChip, active.has(d.value) && styles.tagChipActive]}
										>
											<Text style={[styles.tagChipText, active.has(d.value) && styles.tagChipTextActive]}>{d.label}</Text>
										</Pressable>
									))}
									{g.definitions.filter((d) => !d.archived_at).length === 0 ? (
										<Text style={styles.emptyHint}>Aucune valeur.</Text>
									) : null}
								</View>
							</Section>
						);
					})}

					<Section title="Espèces">
						<TextInput
							value={speciesQuery}
							onChangeText={setSpeciesQuery}
							placeholder="Rechercher une espèce…"
							placeholderTextColor={COLORS.text.placeholder}
							style={styles.input}
						/>
						{speciesResults.length > 0 ? (
							<View style={styles.suggestList}>
								{speciesResults.slice(0, 6).map((s) => (
									<Pressable key={s.id} onPress={() => addSpecies(s)} style={styles.suggestItem}>
										<Text style={styles.suggestText}>{s.scientific_name || s.usage_name || s.name}</Text>
										{s.usage_name && s.scientific_name ? (
											<Text style={styles.suggestSub}>{s.usage_name}</Text>
										) : null}
									</Pressable>
								))}
							</View>
						) : null}
						<View style={styles.chipRow}>
							{selectedSpecies.map((s) => (
								<Chip key={s.id} label={s.scientific_name || s.usage_name || s.name} onRemove={() => removeSpecies(s.id)} />
							))}
							{selectedSpecies.length === 0 ? <Text style={styles.emptyHint}>Aucun filtre — toutes les espèces.</Text> : null}
						</View>
					</Section>

					{orphanTags.length > 0 ? (
						<Section title={`Tags orphelins (${orphanTags.length})`}>
							<Text style={styles.helperText}>
								Tags présents sur des espèces mais non rattachés à un groupe — à nettoyer côté admin.
							</Text>
							<View style={styles.chipRow}>
								{orphanTags.map((t) => (
									<Pressable
										key={t}
										onPress={() => toggleTag(t)}
										style={[styles.tagChip, selectedTags.has(t) && styles.tagChipActive]}
									>
										<Text style={[styles.tagChipText, selectedTags.has(t) && styles.tagChipTextActive]}>{t}</Text>
									</Pressable>
								))}
							</View>
						</Section>
					) : null}

					<Section title="Type de média">
						<View style={styles.chipRow}>
							{SOURCE_OPTIONS.map((opt) => (
								<Pressable
									key={opt.value}
									onPress={() => { setSourceType(opt.value); setPreview(null); }}
									style={[styles.tagChip, sourceType === opt.value && styles.tagChipActive]}
								>
									<Text style={[styles.tagChipText, sourceType === opt.value && styles.tagChipTextActive]}>{opt.label}</Text>
								</Pressable>
							))}
						</View>
					</Section>

					<Section title="Options">
						<Pressable
							onPress={() => { setIncludeMeta((v) => !v); setPreview(null); }}
							style={styles.checkboxRow}
						>
							<View style={[styles.checkbox, includeMeta && styles.checkboxOn]} />
							<View style={{ flex: 1 }}>
								<Text style={styles.checkboxLabel}>Inclure les métadonnées image</Text>
								<Text style={styles.checkboxHint}>
									GPS, date de prise de vue, appareil photo, vidéo source. Désactiver pour un export plus léger sans données contextuelles.
								</Text>
							</View>
						</Pressable>
					</Section>

					<View style={styles.actions}>
						<Pressable onPress={resetFilters} style={[styles.btn, styles.btnGhost]}>
							<Text style={styles.btnGhostText}>Réinitialiser</Text>
						</Pressable>
					</View>
				</View>

				<View style={styles.sideCol}>
					<View style={styles.previewHeader}>
						<Text style={styles.sideTitle}>Aperçu</Text>
						{previewing ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
					</View>
					{preview ? (
						<View style={styles.previewBox}>
							<Text style={styles.previewCount}>{preview.count}</Text>
							<Text style={styles.previewLabel}>item(s) sélectionné(s)</Text>
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
						<Pressable
							onPress={handleRun}
							disabled={running || (preview?.count === 0)}
							style={[styles.btn, styles.btnPrimary, (running || preview?.count === 0) && styles.btnDisabled]}
						>
							<Text style={styles.btnPrimaryText}>
								{running ? 'Génération en cours…'
									: preview?.count === 0 ? 'Aucun item à exporter'
									: preview ? `Télécharger le zip (${preview.count} item${preview.count > 1 ? 's' : ''})`
									: 'Télécharger'}
							</Text>
						</Pressable>
					</View>

					<View style={styles.formatBox}>
						<Text style={styles.formatTitle}>Format</Text>
						<Text style={styles.formatText}>
							Datumaro 1.0 — un fichier <Text style={styles.bold}>annotations/default.json</Text> + un dossier <Text style={styles.bold}>images/</Text>{'\n'}
							Bbox finale du curator, label scientifique, attributs avec les noms d'usage / polynésien / tags.
						</Text>
					</View>
				</View>
			</View>
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

const Chip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
	<View style={styles.chip}>
		<Text style={styles.chipText}>{label}</Text>
		<Pressable onPress={onRemove} hitSlop={6} style={styles.chipClose}>
			<Text style={styles.chipCloseText}>✕</Text>
		</Pressable>
	</View>
);

interface DateFieldProps {
	label: string;
	value: string;
	min?: string;
	max?: string;
	onChange: (v: string) => void;
}

const DateField: React.FC<DateFieldProps> = ({ label, value, min, max, onChange }) => {
	if (Platform.OS === 'web') {
		return (
			<View style={{ flex: 1 }}>
				<Text style={styles.fieldLabel}>{label}</Text>
				{/* @ts-ignore RN-Web rend les inputs HTML natifs */}
				<input
					type="date"
					value={value}
					min={min}
					max={max}
					onChange={(e: any) => onChange(e.target.value)}
					style={dateInputStyle as any}
				/>
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
	border: `1px solid ${COLORS.border}`,
	borderRadius: 6,
	padding: '8px 10px',
	fontSize: 13,
	backgroundColor: COLORS.background.main,
	color: COLORS.text.primary,
	width: '100%',
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },

	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.xs },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginBottom: SPACING.lg },
	bold: { fontWeight: '700', color: COLORS.text.primary },

	layout: { flexDirection: 'row', gap: SPACING.lg, alignItems: 'flex-start' },
	formCol: { flex: 1, gap: SPACING.md },
	sideCol: { width: 340, gap: SPACING.md },

	section: { gap: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
	sectionTitle: { ...TYPOGRAPHY.h2, fontSize: 14 },
	fieldLabel: { fontSize: 12, color: COLORS.text.secondary, marginBottom: 4, fontWeight: '600' },
	helperText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic', marginTop: 4 },

	dateRow: { flexDirection: 'row', gap: SPACING.md },
	periodFooter: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 4 },
	allPeriodsBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 999, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	allPeriodsBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	allPeriodsBtnText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	allPeriodsBtnTextActive: { color: COLORS.text.inverse },
	input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main },

	suggestList: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, marginTop: 4, overflow: 'hidden' },
	suggestItem: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background.main },
	suggestText: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	suggestSub: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },

	chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, alignItems: 'center' },
	emptyHint: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },

	chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.sm, paddingVertical: 4, backgroundColor: COLORS.primary, borderRadius: 999 },
	chipText: { color: COLORS.text.inverse, fontSize: 12, fontWeight: '600' },
	chipClose: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
	chipCloseText: { color: COLORS.text.inverse, fontSize: 11, fontWeight: '700' },

	tagChip: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 999, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	tagChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	tagChipText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	tagChipTextActive: { color: COLORS.text.inverse },

	checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.background.main, marginTop: 2 },
	checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	checkboxLabel: { ...TYPOGRAPHY.body, fontWeight: '600' },
	checkboxHint: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginTop: 2 },

	actions: { flexDirection: 'row', justifyContent: 'flex-start', gap: SPACING.sm },
	btn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, alignItems: 'center' },
	btnPrimary: { backgroundColor: COLORS.success },
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '700' },
	btnSecondary: { backgroundColor: COLORS.primary },
	btnSecondaryText: { color: COLORS.text.inverse, fontWeight: '600' },
	btnGhost: { backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	btnGhostText: { color: COLORS.text.primary, fontWeight: '600' },
	btnDisabled: { opacity: 0.4 },

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

	formatBox: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.sm },
	formatTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4, color: COLORS.text.primary },
	formatText: { fontSize: 12, color: COLORS.text.secondary, lineHeight: 18 },
});
