import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { confirm } from '@/shared/utils/dialog';
import { toast } from '@/shared/toast/Toast';
import { AdminService, SpeciesEditHistoryEntry } from '@/services/api/AdminService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const EDITED_FIELDS: { key: keyof NonNullable<SpeciesEditHistoryEntry['payload']['before']>; label: string }[] = [
	{ key: 'scientific_name',     label: 'Nom scientifique' },
	{ key: 'usage_name',          label: 'Nom d\'usage' },
	{ key: 'polynesian_name',     label: 'Nom polynésien' },
	{ key: 'description',         label: 'Description' },
	{ key: 'description_source',  label: 'Source description' },
	{ key: 'reference_image_url', label: 'Image de référence' },
	{ key: 'category' as any,     label: 'Catégorie' },
];

export const AdminSpeciesHistoryScreen: React.FC = () => {
	const svc = useMemo(() => new AdminService(), []);
	const [items, setItems] = useState<SpeciesEditHistoryEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try { setItems(await svc.listSpeciesEditHistory()); }
		catch (err: any) { toast.error(err?.response?.data?.error || err?.message || 'Chargement impossible.'); }
		finally { setLoading(false); }
	}, [svc]);

	useEffect(() => { load(); }, [load]);

	const handleRevert = async (entry: SpeciesEditHistoryEntry) => {
		const m = `Annuler cette modification ? L'espèce reviendra à son état précédent et un nouvel événement sera enregistré dans l'historique pour traçabilité.`;
		const proceed = await confirm(m, { title: 'Annuler la modification', confirmLabel: 'Annuler', cancelLabel: 'Non', destructive: true });
		if (!proceed) return;
		setSubmitting(true);
		try {
			await svc.revertSpeciesEdit(entry.id);
			toast.success('Modification annulée.');
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Annulation impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

	return (
		<View style={[styles.container, styles.content]}>
			<Text style={styles.title}>Historique des modifications d'espèces</Text>
			<Text style={styles.subtitle}>
				Édition libre par les curators+ — chaque changement est enregistré ici, avec possibilité d'annulation.
				Les modifications annulées restent visibles dans l'historique pour audit (en grisé).
			</Text>

			{items.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Aucune modification d'espèce enregistrée.</Text>
				</View>
			) : items.map((entry) => {
				const isRevert = entry.action === 'species.reverted';
				const sp = entry.species;
				const speciesLabel = sp
					? (sp.scientific_name || sp.usage_name || sp.name || `#${sp.id}`)
					: `(supprimée) #${entry.species_id}`;
				return (
					<View
						key={entry.id}
						style={[styles.card, entry.already_reverted && styles.cardReverted]}
					>
						<View style={styles.cardHeader}>
							<View style={{ flex: 1 }}>
								<Text style={styles.cardSpecies}>
									{isRevert ? '↶  ' : ''}{speciesLabel}
								</Text>
								<Text style={styles.cardActor}>
									par {entry.actor.username ?? `#${entry.actor.id}`} ·{' '}
									{new Date(entry.created_at).toLocaleString('fr-FR')}
									{isRevert ? ' · ANNULATION' : ''}
								</Text>
							</View>
							{entry.already_reverted ? (
								<View style={styles.revertedBadge}>
									<Text style={styles.revertedBadgeText}>Annulée</Text>
								</View>
							) : !isRevert ? (
								<Pressable
									onPress={() => handleRevert(entry)}
									disabled={submitting}
									style={[styles.revertBtn, submitting && styles.btnDisabled]}
								>
									<Text style={styles.revertBtnText}>Annuler cette modification</Text>
								</Pressable>
							) : null}
						</View>

						<DiffBlock before={entry.payload.before} after={entry.payload.after} />
					</View>
				);
			})}
		</View>
	);
};

type TextDiffRow = { kind: 'text';  label: string; b: any; a: any };
type TagsDiffRow = { kind: 'tags';  label: string; added: string[]; removed: string[]; kept: string[] };
type DiffRow = TextDiffRow | TagsDiffRow;

const DiffBlock: React.FC<{ before?: any; after?: any }> = ({ before, after }) => {
	if (!before && !after) return null;
	const rows: DiffRow[] = [];

	for (const { key, label } of EDITED_FIELDS) {
		const b = before?.[key];
		const a = after?.[key];
		if (b !== undefined || a !== undefined) {
			if (JSON.stringify(b) !== JSON.stringify(a)) {
				rows.push({ kind: 'text', label, b, a });
			}
		}
	}

	if (Array.isArray(before?.tags) || Array.isArray(after?.tags)) {
		const beforeArr: string[] = before?.tags ?? [];
		const afterArr:  string[] = after?.tags  ?? [];
		const beforeSet = new Set(beforeArr);
		const afterSet  = new Set(afterArr);
		const added   = afterArr.filter((t) => !beforeSet.has(t));
		const removed = beforeArr.filter((t) => !afterSet.has(t));
		const kept    = beforeArr.filter((t) => afterSet.has(t));
		if (added.length > 0 || removed.length > 0) {
			rows.push({ kind: 'tags', label: 'Tags', added, removed, kept });
		}
	}

	if (rows.length === 0) return <Text style={styles.diffEmpty}>Aucun champ modifié visible (snapshot vide).</Text>;

	return (
		<View style={styles.diffTable}>
			{rows.map((r, i) => r.kind === 'tags' ? (
				<View key={i} style={styles.diffRow}>
					<Text style={styles.diffLabel}>{r.label}</Text>
					<View style={styles.tagsDiffWrap}>
						{r.removed.map((t) => (
							<View key={`rm-${t}`} style={[styles.tagChip, styles.tagChipRemoved]}>
								<Text style={styles.tagChipRemovedText}>− {t}</Text>
							</View>
						))}
						{r.added.map((t) => (
							<View key={`add-${t}`} style={[styles.tagChip, styles.tagChipAdded]}>
								<Text style={styles.tagChipAddedText}>+ {t}</Text>
							</View>
						))}
						{r.kept.map((t) => (
							<View key={`kp-${t}`} style={[styles.tagChip, styles.tagChipKept]}>
								<Text style={styles.tagChipKeptText}>{t}</Text>
							</View>
						))}
					</View>
				</View>
			) : (
				<View key={i} style={styles.diffRow}>
					<Text style={styles.diffLabel}>{r.label}</Text>
					<Text style={styles.diffBefore} numberOfLines={3}>{fmt(r.b)}</Text>
					<Text style={styles.diffArrow}>→</Text>
					<Text style={styles.diffAfter} numberOfLines={3}>{fmt(r.a)}</Text>
				</View>
			))}
		</View>
	);
};

function fmt(v: any): string {
	if (v === null || v === undefined || v === '') return '—';
	if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ');
	return String(v);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },

	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.xs },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginBottom: SPACING.md },

	empty: { padding: SPACING.xl, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	card: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
	cardReverted: { opacity: 0.6 },
	cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	cardSpecies: { ...TYPOGRAPHY.h2, fontSize: 15 },
	cardActor: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginTop: 2 },

	revertBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: 6, backgroundColor: COLORS.danger },
	revertBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 12 },
	btnDisabled: { opacity: 0.5 },
	revertedBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 4, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	revertedBadgeText: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '600' },

	diffTable: { gap: 4, padding: SPACING.sm, backgroundColor: COLORS.background.main, borderRadius: 6 },
	diffRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	diffLabel: { width: 130, fontSize: 12, color: COLORS.text.secondary, fontWeight: '700' },
	diffBefore: { flex: 1, fontSize: 12, color: COLORS.danger, backgroundColor: `${COLORS.danger}22`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
	diffArrow:  { color: COLORS.text.secondary, fontWeight: '700' },
	diffAfter:  { flex: 1, fontSize: 12, color: COLORS.success, backgroundColor: `${COLORS.success}22`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
	diffEmpty: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },

	tagsDiffWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
	tagChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
	tagChipRemoved:     { backgroundColor: `${COLORS.danger}22`,  borderColor: COLORS.danger },
	tagChipRemovedText: { fontSize: 11, color: COLORS.danger,  fontWeight: '700', textDecorationLine: 'line-through' as any },
	tagChipAdded:       { backgroundColor: `${COLORS.success}22`, borderColor: COLORS.success },
	tagChipAddedText:   { fontSize: 11, color: COLORS.success, fontWeight: '700' },
	tagChipKept:        { backgroundColor: COLORS.background.card, borderColor: COLORS.border },
	tagChipKeptText:    { fontSize: 11, color: COLORS.text.secondary },
});
