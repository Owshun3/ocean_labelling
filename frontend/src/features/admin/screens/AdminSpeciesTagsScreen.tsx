import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator, Platform, Alert } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { SpeciesTagService, SpeciesTagGroup, SpeciesTagDefinition } from '@/services/api/SpeciesTagService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const AdminSpeciesTagsScreen: React.FC = () => {
	const svc = useMemo(() => new SpeciesTagService(), []);
	const [groups, setGroups] = useState<SpeciesTagGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	// Forms en haut
	const [newGroupKey, setNewGroupKey] = useState('');
	const [newGroupLabel, setNewGroupLabel] = useState('');
	const [newGroupRequired, setNewGroupRequired] = useState(false);
	const [newGroupExclusive, setNewGroupExclusive] = useState(false);

	// Formulaire « ajouter une valeur » par groupe
	const [newDefDraft, setNewDefDraft] = useState<Record<number, { value: string; label: string }>>({});

	const load = useCallback(async () => {
		setLoading(true);
		try {
			setGroups(await svc.listAdmin());
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Chargement impossible.');
		} finally {
			setLoading(false);
		}
	}, [svc]);

	useEffect(() => { load(); }, [load]);

	const handleCreateGroup = async () => {
		if (!newGroupKey || !newGroupLabel) {
			toast.error('Clé + libellé requis.');
			return;
		}
		setSubmitting(true);
		try {
			await svc.createGroup({
				key:          newGroupKey,
				label:        newGroupLabel,
				is_required:  newGroupRequired,
				is_exclusive: newGroupExclusive,
			});
			setNewGroupKey(''); setNewGroupLabel(''); setNewGroupRequired(false); setNewGroupExclusive(false);
			await load();
			toast.success('Groupe créé.');
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Création impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleToggleGroupFlag = async (g: SpeciesTagGroup, field: 'is_required' | 'is_exclusive') => {
		setSubmitting(true);
		try {
			await svc.updateGroup(g.id, { [field]: !g[field] });
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Mise à jour impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDeleteGroup = async (g: SpeciesTagGroup) => {
		const msg = `Supprimer le groupe « ${g.label} » et ses ${g.definitions.length} valeur(s) ? Les espèces qui référencent ces valeurs garderont les tags orphelins jusqu'à leur prochaine édition.`;
		const proceed = Platform.OS === 'web' ? window.confirm(msg) : await new Promise<boolean>((res) => Alert.alert('Confirmer', msg, [
			{ text: 'Annuler', style: 'cancel', onPress: () => res(false) },
			{ text: 'Supprimer', style: 'destructive', onPress: () => res(true) },
		]));
		if (!proceed) return;
		setSubmitting(true);
		try {
			await svc.deleteGroup(g.id);
			await load();
			toast.success('Groupe supprimé.');
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Suppression impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleAddDefinition = async (groupId: number) => {
		const draft = newDefDraft[groupId];
		if (!draft?.value || !draft?.label) {
			toast.error('Valeur (clé) + libellé requis.');
			return;
		}
		setSubmitting(true);
		try {
			await svc.createDefinition({ group_id: groupId, value: draft.value, label: draft.label });
			setNewDefDraft((p) => ({ ...p, [groupId]: { value: '', label: '' } }));
			await load();
			toast.success('Valeur ajoutée.');
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Création impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleToggleArchive = async (d: SpeciesTagDefinition) => {
		setSubmitting(true);
		try {
			await svc.updateDefinition(d.id, { archived: !d.archived_at });
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Mise à jour impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDeleteDefinition = async (d: SpeciesTagDefinition) => {
		const msg = `Supprimer définitivement « ${d.label} » (${d.value}) ? À utiliser uniquement si la valeur n'est utilisée par aucune espèce.`;
		const proceed = Platform.OS === 'web' ? window.confirm(msg) : await new Promise<boolean>((res) => Alert.alert('Confirmer', msg, [
			{ text: 'Annuler', style: 'cancel', onPress: () => res(false) },
			{ text: 'Supprimer', style: 'destructive', onPress: () => res(true) },
		]));
		if (!proceed) return;
		setSubmitting(true);
		try {
			await svc.deleteDefinition(d.id);
			await load();
			toast.success('Valeur supprimée.');
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Suppression impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>Tags d'espèces</Text>
			<Text style={styles.subtitle}>
				Gère la taxonomie utilisée par le curator à la création d'une espèce et par l'export.
				Un groupe <Text style={styles.bold}>obligatoire</Text> exige au moins une valeur par espèce.
				Un groupe <Text style={styles.bold}>exclusif</Text> n'autorise qu'une seule valeur par espèce (radio button côté UI).
				<Text style={styles.bold}> Privilégie « Archiver » à « Supprimer »</Text> pour ne pas casser les espèces qui référencent une valeur.
			</Text>

			<View style={styles.createCard}>
				<Text style={styles.sectionTitle}>+ Nouveau groupe</Text>
				<View style={styles.formRow}>
					<TextInput
						value={newGroupKey} onChangeText={setNewGroupKey}
						placeholder="clé (ex: habitat — lettres minuscules + _)"
						placeholderTextColor={COLORS.text.placeholder}
						style={styles.input}
						autoCapitalize="none"
					/>
					<TextInput
						value={newGroupLabel} onChangeText={setNewGroupLabel}
						placeholder="Libellé (ex: Habitat)"
						placeholderTextColor={COLORS.text.placeholder}
						style={styles.input}
					/>
				</View>
				<View style={styles.checkRow}>
					<Pressable onPress={() => setNewGroupRequired((v) => !v)} style={styles.checkbox}>
						<View style={[styles.checkboxBox, newGroupRequired && styles.checkboxOn]} />
						<Text style={styles.checkboxLabel}>Obligatoire</Text>
					</Pressable>
					<Pressable onPress={() => setNewGroupExclusive((v) => !v)} style={styles.checkbox}>
						<View style={[styles.checkboxBox, newGroupExclusive && styles.checkboxOn]} />
						<Text style={styles.checkboxLabel}>Exclusif (radio)</Text>
					</Pressable>
					<Pressable
						onPress={handleCreateGroup}
						disabled={submitting}
						style={[styles.btn, styles.btnPrimary, submitting && styles.btnDisabled]}
					>
						<Text style={styles.btnPrimaryText}>Créer le groupe</Text>
					</Pressable>
				</View>
			</View>

			{groups.map((g) => (
				<View key={g.id} style={styles.groupCard}>
					<View style={styles.groupHeader}>
						<View style={{ flex: 1 }}>
							<Text style={styles.groupTitle}>{g.label}</Text>
							<Text style={styles.groupKey}>{g.key}</Text>
						</View>
						<Pressable onPress={() => handleToggleGroupFlag(g, 'is_required')} disabled={submitting} style={[styles.flagBtn, g.is_required && styles.flagBtnOn]}>
							<Text style={[styles.flagBtnText, g.is_required && styles.flagBtnTextOn]}>Obligatoire</Text>
						</Pressable>
						<Pressable onPress={() => handleToggleGroupFlag(g, 'is_exclusive')} disabled={submitting} style={[styles.flagBtn, g.is_exclusive && styles.flagBtnOn]}>
							<Text style={[styles.flagBtnText, g.is_exclusive && styles.flagBtnTextOn]}>Exclusif</Text>
						</Pressable>
						<Pressable onPress={() => handleDeleteGroup(g)} disabled={submitting} style={[styles.btn, styles.btnDanger]}>
							<Text style={styles.btnDangerText}>Supprimer</Text>
						</Pressable>
					</View>

					<View style={styles.defsList}>
						{g.definitions.map((d) => (
							<View key={d.id} style={[styles.defRow, d.archived_at && styles.defRowArchived]}>
								<View style={{ flex: 1 }}>
									<Text style={styles.defLabel}>{d.label}</Text>
									<Text style={styles.defValue}>{d.value}{d.archived_at ? ' · archivée' : ''}</Text>
								</View>
								<Pressable onPress={() => handleToggleArchive(d)} disabled={submitting} style={[styles.btn, styles.btnGhost]}>
									<Text style={styles.btnGhostText}>{d.archived_at ? 'Réactiver' : 'Archiver'}</Text>
								</Pressable>
								<Pressable onPress={() => handleDeleteDefinition(d)} disabled={submitting} style={[styles.btn, styles.btnDangerOutline]}>
									<Text style={styles.btnDangerOutlineText}>✕</Text>
								</Pressable>
							</View>
						))}
						{g.definitions.length === 0 ? (
							<Text style={styles.emptyHint}>Aucune valeur — ajoute-en une ci-dessous.</Text>
						) : null}
					</View>

					<View style={styles.addDefRow}>
						<TextInput
							value={newDefDraft[g.id]?.value ?? ''}
							onChangeText={(v) => setNewDefDraft((p) => ({ ...p, [g.id]: { ...(p[g.id] || { label: '' }), value: v } }))}
							placeholder="valeur (clé)"
							placeholderTextColor={COLORS.text.placeholder}
							style={styles.input}
							autoCapitalize="none"
						/>
						<TextInput
							value={newDefDraft[g.id]?.label ?? ''}
							onChangeText={(v) => setNewDefDraft((p) => ({ ...p, [g.id]: { ...(p[g.id] || { value: '' }), label: v } }))}
							placeholder="Libellé"
							placeholderTextColor={COLORS.text.placeholder}
							style={styles.input}
						/>
						<Pressable
							onPress={() => handleAddDefinition(g.id)}
							disabled={submitting}
							style={[styles.btn, styles.btnPrimary, submitting && styles.btnDisabled]}
						>
							<Text style={styles.btnPrimaryText}>Ajouter</Text>
						</Pressable>
					</View>
				</View>
			))}
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },

	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
	bold: { fontWeight: '700', color: COLORS.text.primary },
	sectionTitle: { ...TYPOGRAPHY.h2, fontSize: 14 },

	createCard: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
	formRow: { flexDirection: 'row', gap: SPACING.sm },
	checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' },
	checkbox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
	checkboxBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.background.main },
	checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	checkboxLabel: { ...TYPOGRAPHY.body, fontSize: 13 },

	input: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main },

	groupCard: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
	groupHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
	groupTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	groupKey: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },

	flagBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	flagBtnOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	flagBtnText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	flagBtnTextOn: { color: COLORS.text.inverse },

	defsList: { gap: 4 },
	defRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	defRowArchived: { opacity: 0.6, borderStyle: 'dashed' as any },
	defLabel: { ...TYPOGRAPHY.body, fontWeight: '600' },
	defValue: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },
	emptyHint: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.sm },

	addDefRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm },

	btn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, alignItems: 'center' },
	btnPrimary: { backgroundColor: COLORS.primary },
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },
	btnGhost: { backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	btnGhostText: { color: COLORS.text.primary, fontWeight: '600', fontSize: 12 },
	btnDanger: { backgroundColor: COLORS.danger },
	btnDangerText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 12 },
	btnDangerOutline: { borderWidth: 1, borderColor: COLORS.danger, paddingHorizontal: SPACING.sm },
	btnDangerOutlineText: { color: COLORS.danger, fontWeight: '700' },
	btnDisabled: { opacity: 0.4 },
});
