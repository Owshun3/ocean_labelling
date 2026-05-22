import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Linking, Platform } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { SpeciesTagPicker } from './SpeciesTagPicker';
import { validateSpeciesTags, SpeciesTagGroup } from '@/services/api/SpeciesTagService';
import type { ProposalSpecies } from '@/services/api/CuratorService';
import { SpeciesService, type DuplicateCheck, type SpeciesEditPayload, type Species } from '@/services/api/SpeciesService';

export interface SpeciesDraftValues {
	scientific_name: string;
	usage_name:      string;
	polynesian_name: string;
	tags:            string[];
}

export interface LocalMatch {
	speciesKey: string;
	label: string;
}

interface Props {
	species: ProposalSpecies;
	speciesKey: string;
	tagGroups: SpeciesTagGroup[];
	values: SpeciesDraftValues;
	onChange: (patch: Partial<SpeciesDraftValues>) => void;
	onSave: (payload: SpeciesEditPayload) => Promise<void>;
	onImportInstead?: (existing: ProposalSpecies) => void;
	findLocalMatch?: (sci: string, excludeKey: string) => LocalMatch | null;
	onJumpToLocalSpecies?: (speciesKey: string) => void;
}

const LIVE_CHECK_DEBOUNCE_MS = 400;

export const SpeciesMiniSheet: React.FC<Props> = ({
	species, speciesKey, tagGroups, values, onChange, onSave, onImportInstead,
	findLocalMatch, onJumpToLocalSpecies,
}) => {
	const isPersisted = species.id > 0;
	const isApproved = isPersisted && species.status === 'approved';
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [liveCheck, setLiveCheck] = useState<DuplicateCheck | null>(null);
	const checkServiceRef = useRef(new SpeciesService());
	const debRef = useRef<any>(null);

	const dirty = useMemo(() => {
		const a = values.scientific_name.trim() !== (species.scientific_name ?? '').trim();
		const b = values.usage_name.trim()      !== (species.usage_name ?? '').trim();
		const c = values.polynesian_name.trim() !== (species.polynesian_name ?? '').trim();
		const cur = species.tags ?? [];
		const d = values.tags.length !== cur.length || values.tags.some((t) => !cur.includes(t));
		return a || b || c || d;
	}, [values, species]);

	const namesReady = values.scientific_name.trim().length > 0
		&& values.usage_name.trim().length > 0
		&& values.polynesian_name.trim().length > 0;
	const tagValidation = useMemo(() => validateSpeciesTags(values.tags, tagGroups), [values.tags, tagGroups]);

	const speciesNamesPersisted = !!(species.scientific_name && species.usage_name && species.polynesian_name);
	const status: 'certified' | 'filled' | 'todo' = isApproved
		? 'certified'
		: speciesNamesPersisted ? 'filled' : 'todo';

	useEffect(() => {
		if (debRef.current) clearTimeout(debRef.current);
		const sci = values.scientific_name.trim();
		if (isApproved || sci.length === 0) { setLiveCheck(null); return; }
		debRef.current = setTimeout(async () => {
			try {
				const excludeId = species.id > 0 ? species.id : undefined;
				const result = await checkServiceRef.current.checkDuplicates({
					scientific_name: sci,
					usage_name:      values.usage_name.trim() || undefined,
					polynesian_name: values.polynesian_name.trim() || undefined,
					exclude_id:      excludeId,
				});
				setLiveCheck(result);
			} catch {
				setLiveCheck(null);
			}
		}, LIVE_CHECK_DEBOUNCE_MS);
		return () => { if (debRef.current) clearTimeout(debRef.current); };
	}, [values.scientific_name, values.usage_name, values.polynesian_name, species.id, isApproved]);

	const scientificMatch = liveCheck?.scientific_match ?? null;
	const localMatch = useMemo(() => {
		if (isApproved) return null;
		const sci = values.scientific_name.trim();
		if (!sci) return null;
		return findLocalMatch?.(sci, speciesKey) ?? null;
	}, [findLocalMatch, values.scientific_name, speciesKey, isApproved]);

	const speciesFromMatch = (m: Species): ProposalSpecies => ({
		id: m.id,
		name: m.name,
		scientific_name: m.scientific_name ?? null,
		usage_name: m.usage_name ?? null,
		polynesian_name: m.polynesian_name ?? null,
		tags: m.tags ?? [],
		status: m.status,
	});

	const handleSave = async () => {
		if (saving) return;
		if (!namesReady) {
			setError('Renseigne les 3 noms avant d\'enregistrer.');
			return;
		}
		if (!tagValidation.ok) {
			setError(tagValidation.error ?? 'Tags invalides.');
			return;
		}
		if (localMatch) {
			setError(`« ${localMatch.label} » est déjà dans cette tâche. Sélectionne-la dans la liste de gauche.`);
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const sci = values.scientific_name.trim();
			const usa = values.usage_name.trim();
			const pol = values.polynesian_name.trim();
			const check = await checkServiceRef.current.checkDuplicates({
				scientific_name: sci,
				usage_name: usa,
				polynesian_name: pol,
				exclude_id: species.id > 0 ? species.id : undefined,
			});
			if (check.scientific_match) {
				setLiveCheck(check);
				setError('Une espèce avec ce nom scientifique existe déjà. Importe-la plutôt.');
				return;
			}
			await onSave({
				scientific_name: sci,
				usage_name:      usa,
				polynesian_name: pol,
				tags:            values.tags,
			});
		} catch (err: any) {
			setError(err?.response?.data?.error ?? err?.message ?? 'Enregistrement impossible.');
		} finally {
			setSaving(false);
		}
	};

	const openFullSheet = () => {
		const path = `/species/${species.id}`;
		if (Platform.OS === 'web' && typeof window !== 'undefined') {
			window.open(`${window.location.origin}${path}`, '_blank', 'noopener');
		} else {
			Linking.openURL(path).catch(() => {});
		}
	};

	return (
		<View style={styles.wrap}>
			<View style={styles.headerRow}>
				<Text style={styles.title}>Fiche espèce</Text>
				{status === 'certified' ? (
					<View style={styles.certifiedPill}>
						<Text style={styles.certifiedText}>Certifiée</Text>
					</View>
				) : status === 'filled' ? (
					<View style={styles.filledPill}>
						<Text style={styles.filledText}>Remplie</Text>
					</View>
				) : (
					<View style={styles.pendingPill}>
						<Text style={styles.pendingText}>À remplir</Text>
					</View>
				)}
			</View>

			{isPersisted ? (
				<Pressable onPress={openFullSheet} style={styles.linkRow}>
					<Text style={styles.linkText}>↗ Voir la fiche complète</Text>
				</Pressable>
			) : null}

			{!isApproved ? (
				<Text style={styles.helpText}>
					{isPersisted
						? 'Les modifications sont conservées même si tu changes d\'espèce ; elles partent en base au moment de « Certifier tout ».'
						: 'Espèce ajoutée manuellement — sera créée en base au moment de « Certifier tout » ou via le bouton d\'enregistrement.'}
				</Text>
			) : null}

			<TextInput
				value={values.scientific_name}
				onChangeText={(t) => onChange({ scientific_name: t })}
				editable={!isApproved && !saving}
				placeholder="Nom scientifique"
				placeholderTextColor={COLORS.text.placeholder}
				style={[styles.input, isApproved && styles.inputReadOnly]}
			/>
			<TextInput
				value={values.usage_name}
				onChangeText={(t) => onChange({ usage_name: t })}
				editable={!isApproved && !saving}
				placeholder="Nom d'usage"
				placeholderTextColor={COLORS.text.placeholder}
				style={[styles.input, isApproved && styles.inputReadOnly]}
			/>
			<TextInput
				value={values.polynesian_name}
				onChangeText={(t) => onChange({ polynesian_name: t })}
				editable={!isApproved && !saving}
				placeholder="Nom polynésien"
				placeholderTextColor={COLORS.text.placeholder}
				style={[styles.input, isApproved && styles.inputReadOnly]}
			/>

			{!isApproved && localMatch ? (
				<View style={styles.dupBlock}>
					<Text style={styles.dupTitle}>Déjà dans cette tâche</Text>
					<Text style={styles.dupText}>
						« {localMatch.label} » est déjà présente parmi les espèces de cette tâche. Sélectionne-la au lieu de la recréer.
					</Text>
					{onJumpToLocalSpecies ? (
						<Pressable onPress={() => onJumpToLocalSpecies(localMatch.speciesKey)} style={styles.btnDup}>
							<Text style={styles.btnDupText}>Aller à cette espèce</Text>
						</Pressable>
					) : null}
				</View>
			) : null}

			{!isApproved && !localMatch && scientificMatch ? (
				<View style={styles.dupBlock}>
					<Text style={styles.dupTitle}>Espèce déjà en base</Text>
					<Text style={styles.dupText}>
						« {scientificMatch.scientific_name ?? scientificMatch.name} » existe avec ce nom scientifique
						{scientificMatch.usage_name ? ` · ${scientificMatch.usage_name}` : ''}
						{scientificMatch.polynesian_name ? ` · ${scientificMatch.polynesian_name}` : ''}.
					</Text>
					{onImportInstead ? (
						<Pressable onPress={() => onImportInstead(speciesFromMatch(scientificMatch))} style={styles.btnDup}>
							<Text style={styles.btnDupText}>Importer plutôt cette espèce</Text>
						</Pressable>
					) : null}
				</View>
			) : null}

			{!isApproved && liveCheck && (liveCheck.usage_matches.length > 0 || liveCheck.polynesian_matches.length > 0) ? (
				<View style={styles.warnInfoBlock}>
					<Text style={styles.warnInfoText}>
						{liveCheck.usage_matches.length > 0
							? `Le nom d'usage est aussi porté par : ${liveCheck.usage_matches.map((s) => s.scientific_name ?? s.name).join(', ')}. `
							: ''}
						{liveCheck.polynesian_matches.length > 0
							? `Le nom polynésien est aussi porté par : ${liveCheck.polynesian_matches.map((s) => s.scientific_name ?? s.name).join(', ')}.`
							: ''}
					</Text>
				</View>
			) : null}

			<View style={styles.tagsBlock}>
				<SpeciesTagPicker
					groups={tagGroups}
					tags={values.tags}
					disabled={isApproved || saving}
					onChange={(t) => onChange({ tags: t })}
				/>
			</View>

			{!isApproved ? (
				<>
					{!tagValidation.ok && tagGroups.length > 0 ? (
						<Text style={styles.warnText}>{tagValidation.error}</Text>
					) : null}
					{error ? <Text style={styles.errorText}>{error}</Text> : null}
					<Pressable
						onPress={handleSave}
						disabled={saving || !namesReady || !tagValidation.ok || !!scientificMatch || !!localMatch || (isPersisted && !dirty)}
						style={[
							styles.saveBtn,
							(saving || !namesReady || !tagValidation.ok || !!scientificMatch || !!localMatch || (isPersisted && !dirty)) && styles.saveBtnDisabled,
						]}
					>
						{saving ? (
							<ActivityIndicator size="small" color={COLORS.text.inverse} />
						) : (
							<Text style={styles.saveBtnText}>
								{!namesReady ? 'Noms manquants'
									: !tagValidation.ok ? 'Tags incomplets'
									: localMatch ? 'Déjà dans la tâche'
									: scientificMatch ? 'Doublon scientifique'
									: isPersisted && !dirty ? 'Aucun changement à enregistrer'
									: isPersisted ? 'Enregistrer maintenant' : 'Enregistrer la fiche en base'}
							</Text>
						)}
					</Pressable>
				</>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	wrap: {
		gap: SPACING.sm,
		padding: SPACING.sm,
		borderRadius: 6,
		borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	title: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

	certifiedPill: {
		paddingHorizontal: SPACING.sm, paddingVertical: 2,
		borderRadius: 12, backgroundColor: COLORS.status.validated,
	},
	certifiedText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },

	filledPill: {
		paddingHorizontal: SPACING.sm, paddingVertical: 2,
		borderRadius: 12, backgroundColor: COLORS.primary,
	},
	filledText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },

	pendingPill: {
		paddingHorizontal: SPACING.sm, paddingVertical: 2,
		borderRadius: 12, backgroundColor: COLORS.warning,
	},
	pendingText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },

	linkRow: { paddingVertical: 2 },
	linkText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },

	helpText: { fontSize: 10, color: COLORS.text.placeholder, fontStyle: 'italic', lineHeight: 14 },

	input: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		fontSize: 12, color: COLORS.text.primary,
		backgroundColor: COLORS.background.card,
	},
	inputReadOnly: { backgroundColor: COLORS.background.main, color: COLORS.text.secondary },

	dupBlock: {
		borderWidth: 1, borderColor: COLORS.danger, borderRadius: 6,
		padding: SPACING.sm, gap: 6,
		backgroundColor: `${COLORS.danger}11`,
	},
	dupTitle: { fontSize: 11, color: COLORS.danger, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
	dupText: { fontSize: 12, color: COLORS.text.primary, lineHeight: 16 },
	btnDup: {
		paddingVertical: 6, paddingHorizontal: SPACING.sm,
		borderRadius: 6, backgroundColor: COLORS.danger,
		alignItems: 'center', justifyContent: 'center',
	},
	btnDupText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 12, textAlign: 'center' },

	warnInfoBlock: {
		borderWidth: 1, borderColor: COLORS.warning, borderRadius: 6,
		padding: SPACING.sm,
		backgroundColor: `${COLORS.warning}11`,
	},
	warnInfoText: { fontSize: 11, color: COLORS.text.primary, lineHeight: 15 },

	tagsBlock: { marginTop: 2 },

	warnText: { fontSize: 11, color: COLORS.warning, fontStyle: 'italic' },
	errorText: { fontSize: 11, color: COLORS.danger, fontStyle: 'italic' },

	saveBtn: {
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		borderRadius: 6, backgroundColor: COLORS.primary,
		alignItems: 'center', justifyContent: 'center',
	},
	saveBtnDisabled: { opacity: 0.4 },
	saveBtnText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 12, textAlign: 'center' },
});
