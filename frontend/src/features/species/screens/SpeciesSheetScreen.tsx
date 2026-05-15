import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Image, StyleSheet, Linking } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { SpeciesService, Species, WikipediaSummary } from '@/services/api/SpeciesService';
import { getUserProfile } from '@/services/api/authStorage';
import { toast } from '@/shared/toast/Toast';
import { BackButton } from '@/shared/components/BackButton';
import { RankBadge } from '@/shared/components/RankBadge';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props { speciesId: number }

const SOURCE_LABELS: Record<string, string> = {
	manual:              'Saisie manuelle (curator)',
	wikipedia:           'Importée depuis Wikipédia',
	annotator_proposal:  'Proposée par l\'annotateur, validée',
};

const CURATOR_ROLES = new Set(['admin', 'moderator', 'curator', 'chercheur']);

export const SpeciesSheetScreen: React.FC<Props> = ({ speciesId }) => {
	const router = useRouter();
	const service = useMemo(() => new SpeciesService(), []);
	const [species, setSpecies] = useState<Species | null>(null);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [wikiLoading, setWikiLoading] = useState(false);

	const [draftDescription,    setDraftDescription]    = useState('');
	const [draftSource,         setDraftSource]         = useState<'manual'|'wikipedia'|'annotator_proposal'|null>(null);
	const [draftImageUrl,       setDraftImageUrl]       = useState('');
	const [wikiPreview,         setWikiPreview]         = useState<WikipediaSummary | null>(null);

	const profile = getUserProfile();
	const canEdit = !!profile && CURATOR_ROLES.has(profile.appRole);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const s = await service.getOne(speciesId);
			setSpecies(s);
			setDraftDescription(s.description ?? '');
			setDraftSource(s.description_source ?? null);
			setDraftImageUrl(s.reference_image_url ?? '');
			setWikiPreview(null);
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Espèce introuvable.');
		} finally {
			setLoading(false);
		}
	}, [service, speciesId]);

	useEffect(() => { load(); }, [load]);

	const importWikipedia = async () => {
		setWikiLoading(true);
		try {
			const w = await service.fetchWikipedia(speciesId, 'fr');
			setWikiPreview(w);
		} catch (err: any) {
			const msg = err?.response?.status === 404
				? 'Aucune page Wikipédia trouvée pour cette espèce.'
				: (err?.response?.data?.error ?? err?.message ?? 'Erreur lors de la requête Wikipédia.');
			toast.error(msg);
		} finally {
			setWikiLoading(false);
		}
	};

	const applyWikipedia = () => {
		if (!wikiPreview) return;
		setDraftDescription(wikiPreview.extract);
		setDraftSource('wikipedia');
		toast.info('Texte Wikipédia copié dans la description. Pense à ajuster si besoin avant d\'enregistrer.');
	};

	const save = async () => {
		if (submitting) return;
		setSubmitting(true);
		try {
			const updated = await service.update(speciesId, {
				description:          draftDescription.trim() || null,
				description_source:   draftSource ?? null,
				reference_image_url:  draftImageUrl.trim() || null,
			});
			setSpecies(updated);
			setEditing(false);
			setWikiPreview(null);
			toast.success('Fiche espèce mise à jour.');
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Mise à jour impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const cancel = () => {
		if (!species) return;
		setDraftDescription(species.description ?? '');
		setDraftSource(species.description_source ?? null);
		setDraftImageUrl(species.reference_image_url ?? '');
		setWikiPreview(null);
		setEditing(false);
	};

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}
	if (!species) {
		return <View style={styles.center}><Text style={TYPOGRAPHY.body}>Espèce introuvable.</Text></View>;
	}

	const title = species.usage_name || species.scientific_name || species.name;

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>{title}</Text>
			{species.status === 'pending' ? (
				<View style={styles.pendingBlock}>
					<Text style={styles.pendingTag}>Espèce en attente de validation par un curator</Text>
					{species.proposer ? (
						<View style={styles.proposerRow}>
							<Text style={styles.proposerLabel}>Proposée par {species.proposer.username ?? '?'}</Text>
							<RankBadge actions={species.proposer.actions_validated_total} size="sm" withCount />
						</View>
					) : null}
				</View>
			) : null}

			<View style={styles.card}>
				<Text style={styles.sectionLabel}>Noms</Text>
				<NameRow label="Nom scientifique" value={species.scientific_name} />
				<NameRow label="Nom d'usage" value={species.usage_name ?? null} />
				<NameRow label="Nom polynésien" value={species.polynesian_name} />
				{species.name && species.name !== species.usage_name ? (
					<NameRow label="Étiquette legacy" value={species.name} />
				) : null}
			</View>

			<View style={styles.card}>
				<View style={styles.descHeader}>
					<Text style={styles.sectionLabel}>Description</Text>
					{species.description_source ? (
						<Text style={styles.sourceBadge}>
							{SOURCE_LABELS[species.description_source] || species.description_source}
						</Text>
					) : null}
					{canEdit && !editing ? (
						<Pressable onPress={() => setEditing(true)} style={styles.editBtn}>
							<Text style={styles.editBtnText}>{species.description ? 'Modifier' : 'Rédiger'}</Text>
						</Pressable>
					) : null}
				</View>

				{editing && canEdit ? (
					<View style={{ gap: SPACING.sm }}>
						<View style={styles.wikiRow}>
							<Pressable onPress={importWikipedia} disabled={wikiLoading} style={[styles.wikiBtn, wikiLoading && styles.btnDisabled]}>
								<Text style={styles.wikiBtnText}>{wikiLoading ? 'Chargement…' : 'Importer depuis Wikipédia'}</Text>
							</Pressable>
							<Text style={styles.hint}>Recherche FR sur scientifique → usage → étiquette legacy.</Text>
						</View>

						{wikiPreview ? (
							<View style={styles.wikiPreview}>
								<Text style={styles.wikiTitle}>{wikiPreview.title}</Text>
								<Text style={styles.wikiExtract}>{wikiPreview.extract}</Text>
								<View style={styles.wikiActions}>
									{wikiPreview.page_url ? (
										<Pressable onPress={() => Linking.openURL(wikiPreview.page_url!)}>
											<Text style={styles.wikiLink}>Voir l'article complet ↗</Text>
										</Pressable>
									) : null}
									<Pressable onPress={applyWikipedia} style={styles.applyWikiBtn}>
										<Text style={styles.applyWikiText}>Utiliser ce texte</Text>
									</Pressable>
								</View>
							</View>
						) : null}

						<Text style={styles.fieldLabel}>Texte de la description</Text>
						<TextInput
							value={draftDescription}
							onChangeText={(t) => { setDraftDescription(t); if (draftSource === 'wikipedia') setDraftSource('manual'); }}
							editable={!submitting}
							multiline
							placeholder="Décris l'espèce, son habitat, ses signes distinctifs…"
							placeholderTextColor={COLORS.text.placeholder}
							style={styles.descTextarea}
						/>

						<Text style={styles.fieldLabel}>Source</Text>
						<View style={styles.sourceRow}>
							{(['manual', 'wikipedia', 'annotator_proposal'] as const).map((src) => (
								<Pressable
									key={src}
									onPress={() => setDraftSource(src)}
									style={[styles.sourcePill, draftSource === src && styles.sourcePillActive]}
								>
									<Text style={[styles.sourcePillText, draftSource === src && styles.sourcePillTextActive]}>
										{SOURCE_LABELS[src]}
									</Text>
								</Pressable>
							))}
						</View>

						<Text style={styles.fieldLabel}>Image de référence (URL)</Text>
						<TextInput
							value={draftImageUrl}
							onChangeText={setDraftImageUrl}
							editable={!submitting}
							placeholder="https://…"
							placeholderTextColor={COLORS.text.placeholder}
							autoCapitalize="none"
							style={styles.input}
						/>

						<View style={styles.actionRow}>
							<Pressable onPress={cancel} disabled={submitting} style={[styles.actionBtn, styles.cancelBtn]}>
								<Text style={styles.cancelBtnText}>Annuler</Text>
							</Pressable>
							<Pressable onPress={save} disabled={submitting} style={[styles.actionBtn, styles.saveBtn, submitting && styles.btnDisabled]}>
								<Text style={styles.saveBtnText}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</Text>
							</Pressable>
						</View>
					</View>
				) : (
					<Text style={styles.descText}>
						{species.description?.trim() || 'Aucune description disponible pour le moment.'}
					</Text>
				)}
			</View>

			{species.reference_image_url ? (
				<View style={styles.card}>
					<Text style={styles.sectionLabel}>Image de référence</Text>
					<Image source={{ uri: species.reference_image_url }} style={styles.refImage} resizeMode="contain" />
				</View>
			) : null}

			<View style={styles.footer}>
				<BackButton />
			</View>
		</ScrollView>
	);
};

const NameRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
	<View style={styles.nameRow}>
		<Text style={styles.nameLabel}>{label}</Text>
		<Text style={styles.nameValue}>{value || '—'}</Text>
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	title: { ...TYPOGRAPHY.h1 },
	pendingBlock: { gap: 4 },
	pendingTag: { ...TYPOGRAPHY.body, color: COLORS.warning, fontStyle: 'italic' },
	proposerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	proposerLabel: { fontSize: 12, color: COLORS.text.secondary },

	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
		padding: SPACING.md, gap: SPACING.sm,
	},
	sectionLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },

	nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm, paddingVertical: 2 },
	nameLabel: { fontSize: 12, color: COLORS.text.secondary, width: 140 },
	nameValue: { fontSize: 14, color: COLORS.text.primary, fontWeight: '500', flex: 1 },

	descHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
	sourceBadge: { fontSize: 11, color: COLORS.primary, fontWeight: '600', fontStyle: 'italic' },
	editBtn: { marginLeft: 'auto', paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.primary },
	editBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 12 },

	descText: { fontSize: 14, color: COLORS.text.primary, lineHeight: 21 },

	wikiRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
	wikiBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: '#0ea5e9' },
	wikiBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },
	hint: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },

	wikiPreview: {
		padding: SPACING.sm, borderRadius: 6,
		backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border,
		gap: 4,
	},
	wikiTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text.primary },
	wikiExtract: { fontSize: 12, color: COLORS.text.primary, lineHeight: 18 },
	wikiActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: 4 },
	wikiLink: { fontSize: 12, color: '#0ea5e9', fontWeight: '600' },
	applyWikiBtn: { marginLeft: 'auto', paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 6, backgroundColor: '#0ea5e9' },
	applyWikiText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 12 },

	fieldLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginTop: SPACING.xs },
	descTextarea: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		padding: SPACING.sm, fontSize: 13, color: COLORS.text.primary,
		backgroundColor: COLORS.background.main,
		minHeight: 120, textAlignVertical: 'top',
	},
	input: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		padding: SPACING.sm, fontSize: 13, color: COLORS.text.primary,
		backgroundColor: COLORS.background.main,
	},
	sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
	sourcePill: {
		paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 99,
		backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border,
	},
	sourcePillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	sourcePillText: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '600' },
	sourcePillTextActive: { color: COLORS.text.inverse },

	actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, justifyContent: 'flex-end' },
	actionBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6 },
	cancelBtn: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	cancelBtnText: { color: COLORS.text.primary, fontWeight: '600', fontSize: 13 },
	saveBtn: { backgroundColor: COLORS.primary },
	saveBtnText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13 },
	btnDisabled: { opacity: 0.5 },

	refImage: { width: '100%', height: 320, borderRadius: 6, backgroundColor: COLORS.background.main },

	footer: { marginTop: SPACING.lg },
});
