import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator, Platform } from 'react-native';
import { confirm } from '@/shared/utils/dialog';
import { toast } from '@/shared/toast/Toast';
import { SpeciesTagService, SpeciesTagGroup, SpeciesTagDefinition } from '@/services/api/SpeciesTagService';
import { FilterSortBar, useFilteredAndSorted } from '@/shared/components/filters';
import type { FilterField, FilterSortState, SortOption, FieldExtractors } from '@/shared/components/filters';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

// Vocabulaire UI ≠ schéma DB : « Catégorie » = species_tag_groups,
// « Étiquette » = species_tag_definitions.

function slugify(input: string): string {
	return input
		.normalize('NFD').replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 40);
}

type RuleKey = 'unique_required' | 'multi_required' | 'unique_optional' | 'free';

function ruleOf(g: { is_required: boolean; is_exclusive: boolean }): { key: RuleKey; summary: string; detail: string; tone: 'required' | 'optional' } {
	if (g.is_required && g.is_exclusive) return {
		key: 'unique_required', tone: 'required',
		summary: 'Une option à choisir',
		detail: 'Chaque espèce doit choisir une et une seule étiquette de cette catégorie (radio).',
	};
	if (g.is_required) return {
		key: 'multi_required', tone: 'required',
		summary: 'Au moins une option à cocher',
		detail: 'Chaque espèce doit cocher au moins une étiquette ; plusieurs étiquettes simultanées autorisées.',
	};
	if (g.is_exclusive) return {
		key: 'unique_optional', tone: 'optional',
		summary: 'Au plus une option à cocher',
		detail: 'Une espèce peut ne rien cocher, ou cocher exactement une étiquette (radio facultatif).',
	};
	return {
		key: 'free', tone: 'optional',
		summary: 'Libre — zéro ou plusieurs',
		detail: 'Catégorie purement descriptive : l\'espèce peut cocher autant d\'étiquettes qu\'elle veut, ou aucune.',
	};
}

const CATEGORY_SORTS: SortOption[] = [
	{ key: 'name',         label: 'Nom (A-Z)',           defaultDirection: 'asc'  },
	{ key: 'active_count', label: 'Nombre d\'étiquettes', defaultDirection: 'desc' },
];

const CATEGORY_DEFAULT_STATE: FilterSortState = {
	filters: {},
	sort: { key: 'name', direction: 'asc' },
};

const CATEGORY_FILTERS: FilterField[] = [
	{ kind: 'text',  key: 'search', label: 'Rechercher', placeholder: 'Nom de catégorie ou d\'étiquette…' },
	{ kind: 'chips', key: 'rule',   label: 'Règle', multi: true, options: [
		{ value: 'unique_required', label: 'Une option à choisir' },
		{ value: 'multi_required',  label: 'Au moins une à cocher' },
		{ value: 'unique_optional', label: 'Au plus une à cocher' },
		{ value: 'free',            label: 'Libre' },
	] },
];

export const AdminSpeciesTagsScreen: React.FC = () => {
	const svc = useMemo(() => new SpeciesTagService(), []);
	const [categories, setCategories] = useState<SpeciesTagGroup[]>([]);
	const [loading, setLoading]       = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [helpHover, setHelpHover]   = useState(false);
	const [filterState, setFilterState] = useState<FilterSortState>(CATEGORY_DEFAULT_STATE);

	const [newCatName, setNewCatName]           = useState('');
	const [newCatRequired, setNewCatRequired]   = useState(false);
	const [newCatExclusive, setNewCatExclusive] = useState(false);
	const [newLabelDraft, setNewLabelDraft] = useState<Record<number, string>>({});

	const load = useCallback(async () => {
		setLoading(true);
		try {
			setCategories(await svc.listAdmin());
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Chargement impossible.');
		} finally {
			setLoading(false);
		}
	}, [svc]);

	useEffect(() => { load(); }, [load]);

	const handleCreateCategory = async () => {
		const trimmed = newCatName.trim();
		if (!trimmed) {
			toast.error('Donne un nom à la catégorie.');
			return;
		}
		const key = slugify(trimmed);
		if (!key) {
			toast.error('Nom invalide (uniquement caractères spéciaux ?).');
			return;
		}
		setSubmitting(true);
		try {
			await svc.createGroup({ key, label: trimmed, is_required: newCatRequired, is_exclusive: newCatExclusive });
			setNewCatName(''); setNewCatRequired(false); setNewCatExclusive(false);
			await load();
			toast.success(`Catégorie « ${trimmed} » créée.`);
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Création impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleToggleFlag = async (g: SpeciesTagGroup, field: 'is_required' | 'is_exclusive') => {
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

	const handleDeleteCategory = async (g: SpeciesTagGroup) => {
		const msg = `Supprimer la catégorie « ${g.label} » et ses ${g.definitions.length} étiquette(s) ?\n\nLes espèces qui les utilisent garderont les étiquettes orphelines jusqu'à leur prochaine édition.\n\nSi tu veux juste les cacher temporairement, préfère « Archiver » étiquette par étiquette.`;
		const proceed = await confirm(msg, { confirmLabel: 'Supprimer', destructive: true });
		if (!proceed) return;
		setSubmitting(true);
		try {
			await svc.deleteGroup(g.id);
			await load();
			toast.success('Catégorie supprimée.');
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Suppression impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleAddLabel = async (categoryId: number) => {
		const raw = (newLabelDraft[categoryId] ?? '').trim();
		if (!raw) {
			toast.error('Donne un nom à l\'étiquette.');
			return;
		}
		const value = slugify(raw);
		if (!value) {
			toast.error('Nom d\'étiquette invalide.');
			return;
		}
		setSubmitting(true);
		try {
			await svc.createDefinition({ group_id: categoryId, value, label: raw });
			setNewLabelDraft((p) => ({ ...p, [categoryId]: '' }));
			await load();
			toast.success(`Étiquette « ${raw} » ajoutée.`);
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

	const handleDeleteLabel = async (d: SpeciesTagDefinition) => {
		const msg = `Supprimer définitivement l'étiquette « ${d.label} » ?\n\nÀ utiliser uniquement si aucune espèce ne l'utilise. Sinon préfère « Archiver » : l'étiquette reste lisible mais n'apparaît plus dans les nouveaux choix.`;
		const proceed = await confirm(msg, { confirmLabel: 'Supprimer', destructive: true });
		if (!proceed) return;
		setSubmitting(true);
		try {
			await svc.deleteDefinition(d.id);
			await load();
			toast.success('Étiquette supprimée.');
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Suppression impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const enriched = useMemo(() => categories.map((c) => ({
		...c,
		_rule:         ruleOf(c).key,
		_active_count: c.definitions.filter((d) => !d.archived_at).length,
		_searchBlob:   `${c.label} ${c.definitions.map((d) => d.label).join(' ')}`.toLowerCase(),
	})), [categories]);

	const extractors: FieldExtractors<typeof enriched[number]> = useMemo(() => ({
		search:       (c) => c._searchBlob,
		rule:         (c) => c._rule,
		name:         (c) => c.label.toLowerCase(),
		active_count: (c) => c._active_count,
	}), []);

	const filteredCategories = useFilteredAndSorted(enriched, CATEGORY_FILTERS, CATEGORY_SORTS, filterState, extractors);

	if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<View style={styles.titleRow}>
				<Text style={styles.title}>Étiquetage des espèces</Text>
				<HelpInfoBox hovered={helpHover} onHover={setHelpHover} />
			</View>

			<CreateCategorySection
				name={newCatName}
				onNameChange={setNewCatName}
				required={newCatRequired}
				onToggleRequired={() => setNewCatRequired((v) => !v)}
				exclusive={newCatExclusive}
				onToggleExclusive={() => setNewCatExclusive((v) => !v)}
				submitting={submitting}
				onSubmit={handleCreateCategory}
			/>

			<View style={styles.sectionDivider} />

			<View style={styles.listHeader}>
				<Text style={styles.listTitle}>Catégories existantes</Text>
				<Text style={styles.listSubtitle}>
					{categories.length} catégorie{categories.length !== 1 ? 's' : ''} ·{' '}
					{categories.reduce((acc, c) => acc + c.definitions.filter((d) => !d.archived_at).length, 0)} étiquette(s) active(s) au total
				</Text>
			</View>

			{categories.length > 0 ? (
				<FilterSortBar
					filters={CATEGORY_FILTERS}
					sorts={CATEGORY_SORTS}
					value={filterState}
					onChange={setFilterState}
					defaultState={CATEGORY_DEFAULT_STATE}
					totalCount={categories.length}
					resultCount={filteredCategories.length}
					searchKey="search"
				/>
			) : null}

			{categories.length === 0 ? (
				<View style={styles.emptyState}>
					<Text style={styles.emptyTitle}>Aucune catégorie pour le moment</Text>
					<Text style={styles.emptyText}>Utilise le bloc bleu ci-dessus pour créer ta première catégorie.</Text>
				</View>
			) : filteredCategories.length === 0 ? (
				<View style={styles.emptyState}>
					<Text style={styles.emptyText}>Aucune catégorie ne correspond aux filtres.</Text>
				</View>
			) : (
				filteredCategories.map((cat) => {
					const rule = ruleOf(cat);
					const activeLabels   = cat.definitions.filter((d) => !d.archived_at);
					const archivedLabels = cat.definitions.filter((d) => !!d.archived_at);
					return (
						<CategoryCard
							key={cat.id}
							category={cat}
							rule={rule}
							activeLabels={activeLabels}
							archivedLabels={archivedLabels}
							submitting={submitting}
							labelDraft={newLabelDraft[cat.id] ?? ''}
							onLabelDraftChange={(v) => setNewLabelDraft((p) => ({ ...p, [cat.id]: v }))}
							onAddLabel={() => handleAddLabel(cat.id)}
							onToggleFlag={(field) => handleToggleFlag(cat, field)}
							onDeleteCategory={() => handleDeleteCategory(cat)}
							onToggleArchive={handleToggleArchive}
							onDeleteLabel={handleDeleteLabel}
						/>
					);
				})
			)}
		</ScrollView>
	);
};

const HelpInfoBox: React.FC<{ hovered: boolean; onHover: (h: boolean) => void }> = ({ hovered, onHover }) => (
	<View style={styles.helpAnchor}>
		<Pressable
			onHoverIn={() => onHover(true)}
			onHoverOut={() => onHover(false)}
			onPress={() => onHover(!hovered)}
			style={[styles.helpBox, hovered && styles.helpBoxHovered]}
		>
			<View style={styles.helpIcon}><Text style={styles.helpIconText}>i</Text></View>
			<Text style={styles.helpText}>Comment fonctionne cette page</Text>
		</Pressable>

		{hovered ? (
			<View style={styles.tooltip}>
				<Text style={styles.tooltipTitle}>Étiquettes d'espèces</Text>
				<Text style={styles.tooltipPara}>
					Cette page définit la <Text style={styles.tooltipBold}>taxonomie de tags</Text> que le curator pourra cocher
					sur chaque fiche d'espèce. C'est utilisé pour la classification (type d'animal, habitat, statut de protection…)
					et pour filtrer dans les exports.
				</Text>

				<Text style={styles.tooltipSection}>Catégorie</Text>
				<Text style={styles.tooltipPara}>
					Un regroupement d'étiquettes qui décrivent un même axe (ex : « Habitat », « Type », « Statut »).
				</Text>

				<Text style={styles.tooltipSection}>Étiquette</Text>
				<Text style={styles.tooltipPara}>
					Une valeur cochable dans une catégorie (ex : Récif, Lagon, Mangrove…).
				</Text>

				<Text style={styles.tooltipSection}>Règles d'usage</Text>
				<Text style={styles.tooltipPara}>
					Deux propriétés se combinent pour décider du comportement côté curator :
				</Text>
				<Text style={styles.tooltipBullet}>
					<Text style={styles.tooltipBold}>Obligatoire</Text> · oblige le curator à cocher au moins une étiquette de la catégorie.
				</Text>
				<Text style={styles.tooltipBullet}>
					<Text style={styles.tooltipBold}>Unique</Text> · n'autorise qu'une seule étiquette cochée à la fois dans la catégorie (style radio).
				</Text>

				<Text style={styles.tooltipSection}>Archiver vs Supprimer</Text>
				<Text style={styles.tooltipPara}>
					<Text style={styles.tooltipBold}>Archiver</Text> retire une étiquette des choix proposés sans casser les espèces qui l'avaient déjà cochée — c'est l'option sûre.
				</Text>
				<Text style={styles.tooltipPara}>
					<Text style={styles.tooltipBold}>Supprimer</Text> efface définitivement l'étiquette : à n'utiliser que si elle n'est référencée nulle part.
				</Text>
			</View>
		) : null}
	</View>
);

interface CreateCategorySectionProps {
	name: string;
	onNameChange: (v: string) => void;
	required: boolean;
	onToggleRequired: () => void;
	exclusive: boolean;
	onToggleExclusive: () => void;
	submitting: boolean;
	onSubmit: () => void;
}

const CreateCategorySection: React.FC<CreateCategorySectionProps> = ({
	name, onNameChange, required, onToggleRequired, exclusive, onToggleExclusive, submitting, onSubmit,
}) => {
	const ruleHint = ruleOf({ is_required: required, is_exclusive: exclusive });
	const canSubmit = !!name.trim() && !submitting;
	return (
		<View style={styles.createCard}>
			<View style={styles.createHeader}>
				<View style={styles.createBadge}>
				<View style={styles.plusHorizontal} />
				<View style={styles.plusVertical} />
			</View>
				<View>
					<Text style={styles.createTitle}>Créer une nouvelle catégorie</Text>
					<Text style={styles.createSubtitle}>Définis le nom et les règles d'utilisation.</Text>
				</View>
			</View>

			<TextInput
				value={name}
				onChangeText={onNameChange}
				placeholder="Nom de la catégorie (ex : Habitat, Statut, Type)"
				placeholderTextColor={COLORS.text.placeholder}
				style={styles.input}
			/>
			{name.trim() ? (
				<Text style={styles.slugPreview}>Clé interne générée : <Text style={styles.code}>{slugify(name)}</Text></Text>
			) : null}

			<Text style={styles.formLabel}>Règles d'utilisation par les curators</Text>
			<View style={styles.toggleGroup}>
				<Pressable onPress={onToggleRequired} style={[styles.bigToggle, required && styles.bigToggleOn]}>
					<View style={[styles.checkboxBox, required && styles.checkboxOn]} />
					<View style={{ flex: 1 }}>
						<Text style={[styles.bigToggleTitle, required && styles.bigToggleTitleOn]}>Obligatoire</Text>
						<Text style={styles.bigToggleHint}>Chaque espèce doit cocher au moins une étiquette.</Text>
					</View>
				</Pressable>
				<Pressable onPress={onToggleExclusive} style={[styles.bigToggle, exclusive && styles.bigToggleOn]}>
					<View style={[styles.checkboxBox, exclusive && styles.checkboxOn]} />
					<View style={{ flex: 1 }}>
						<Text style={[styles.bigToggleTitle, exclusive && styles.bigToggleTitleOn]}>Unique</Text>
						<Text style={styles.bigToggleHint}>Une seule étiquette cochable à la fois.</Text>
					</View>
				</Pressable>
			</View>

			<View style={styles.rulePreview}>
				<Text style={styles.rulePreviewLabel}>Résultat pour les curators :</Text>
				<Text style={styles.rulePreviewValue}>{ruleHint.detail}</Text>
			</View>

			<Pressable
				onPress={onSubmit}
				disabled={!canSubmit}
				style={[styles.btn, styles.btnPrimary, !canSubmit && styles.btnDisabled]}
			>
				<Text style={styles.btnPrimaryText}>Créer la catégorie</Text>
			</Pressable>
		</View>
	);
};

interface CategoryCardProps {
	category: SpeciesTagGroup;
	rule: ReturnType<typeof ruleOf>;
	activeLabels: SpeciesTagDefinition[];
	archivedLabels: SpeciesTagDefinition[];
	submitting: boolean;
	labelDraft: string;
	onLabelDraftChange: (v: string) => void;
	onAddLabel: () => void;
	onToggleFlag: (field: 'is_required' | 'is_exclusive') => void;
	onDeleteCategory: () => void;
	onToggleArchive: (d: SpeciesTagDefinition) => void;
	onDeleteLabel: (d: SpeciesTagDefinition) => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
	category, rule, activeLabels, archivedLabels, submitting, labelDraft,
	onLabelDraftChange, onAddLabel, onToggleFlag, onDeleteCategory, onToggleArchive, onDeleteLabel,
}) => (
	<View style={styles.categoryCard}>
		<View style={styles.categoryHeader}>
			<View style={{ flex: 1 }}>
				<Text style={styles.categoryTitle}>{category.label}</Text>
				<Text style={styles.categoryRule}>
					<Text style={[styles.rulePill, rule.tone === 'required' ? styles.rulePillRequired : styles.rulePillOptional]}>
						{rule.summary}
					</Text>
				</Text>
				<Text style={styles.categoryRuleDetail}>{rule.detail}</Text>
			</View>
		</View>

		<View style={styles.categoryFlagsRow}>
			<Pressable
				onPress={() => onToggleFlag('is_required')}
				disabled={submitting}
				style={[styles.flagToggle, category.is_required && styles.flagToggleOn]}
			>
				<View style={[styles.checkboxBox, category.is_required && styles.checkboxOn]} />
				<Text style={[styles.flagToggleText, category.is_required && styles.flagToggleTextOn]}>Obligatoire</Text>
			</Pressable>
			<Pressable
				onPress={() => onToggleFlag('is_exclusive')}
				disabled={submitting}
				style={[styles.flagToggle, category.is_exclusive && styles.flagToggleOn]}
			>
				<View style={[styles.checkboxBox, category.is_exclusive && styles.checkboxOn]} />
				<Text style={[styles.flagToggleText, category.is_exclusive && styles.flagToggleTextOn]}>Unique</Text>
			</Pressable>
			<View style={{ flex: 1 }} />
			<Pressable
				onPress={onDeleteCategory}
				disabled={submitting}
				style={[styles.btn, styles.btnDangerOutline]}
			>
				<Text style={styles.btnDangerOutlineText}>Supprimer la catégorie</Text>
			</Pressable>
		</View>

		<View style={styles.previewCard}>
			<Text style={styles.previewLabel}>Aperçu côté curator :</Text>
			{activeLabels.length === 0 ? (
				<Text style={styles.previewEmpty}>(aucune étiquette pour l'instant)</Text>
			) : (
				<View style={styles.previewChips}>
					{activeLabels.map((d) => (
						<View key={d.id} style={[styles.previewChip, category.is_exclusive ? styles.previewChipRadio : styles.previewChipBox]}>
							<View style={[styles.previewChipMark, category.is_exclusive ? styles.previewChipMarkRadio : styles.previewChipMarkBox]} />
							<Text style={styles.previewChipText}>{d.label}</Text>
						</View>
					))}
				</View>
			)}
		</View>

		{activeLabels.length > 0 ? (
			<>
				<Text style={styles.labelsSectionTitle}>Étiquettes actives ({activeLabels.length})</Text>
				<View style={styles.labelsList}>
					{activeLabels.map((d) => (
						<View key={d.id} style={styles.labelRow}>
							<View style={{ flex: 1 }}>
								<Text style={styles.labelTitle}>{d.label}</Text>
								<Text style={styles.labelSlug}>clé : <Text style={styles.code}>{d.value}</Text></Text>
							</View>
							<Pressable onPress={() => onToggleArchive(d)} disabled={submitting} style={[styles.btn, styles.btnGhost]}>
								<Text style={styles.btnGhostText}>Archiver</Text>
							</Pressable>
							<Pressable onPress={() => onDeleteLabel(d)} disabled={submitting} style={[styles.btn, styles.btnDangerIcon]}>
								<Text style={styles.btnDangerIconText}>✕</Text>
							</Pressable>
						</View>
					))}
				</View>
			</>
		) : null}

		{archivedLabels.length > 0 ? (
			<>
				<Text style={styles.labelsSectionTitle}>Étiquettes archivées ({archivedLabels.length})</Text>
				<Text style={styles.archivedHint}>
					Ces étiquettes ne sont plus proposées dans les nouveaux choix, mais restent lisibles sur les espèces qui les avaient déjà cochées.
				</Text>
				<View style={styles.labelsList}>
					{archivedLabels.map((d) => (
						<View key={d.id} style={[styles.labelRow, styles.labelRowArchived]}>
							<View style={{ flex: 1 }}>
								<Text style={styles.labelTitle}>{d.label}</Text>
								<Text style={styles.labelSlug}>clé : <Text style={styles.code}>{d.value}</Text></Text>
							</View>
							<Pressable onPress={() => onToggleArchive(d)} disabled={submitting} style={[styles.btn, styles.btnGhost]}>
								<Text style={styles.btnGhostText}>Réactiver</Text>
							</Pressable>
							<Pressable onPress={() => onDeleteLabel(d)} disabled={submitting} style={[styles.btn, styles.btnDangerIcon]}>
								<Text style={styles.btnDangerIconText}>✕</Text>
							</Pressable>
						</View>
					))}
				</View>
			</>
		) : null}

		<View style={styles.addLabelRow}>
			<TextInput
				value={labelDraft}
				onChangeText={onLabelDraftChange}
				placeholder={`Nouvelle étiquette pour « ${category.label} »…`}
				placeholderTextColor={COLORS.text.placeholder}
				style={styles.input}
				onSubmitEditing={onAddLabel}
			/>
			<Pressable
				onPress={onAddLabel}
				disabled={submitting || !labelDraft.trim()}
				style={[styles.btn, styles.btnPrimary, (submitting || !labelDraft.trim()) && styles.btnDisabled]}
			>
				<Text style={styles.btnPrimaryText}>Ajouter</Text>
			</Pressable>
		</View>
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },

	// stacking context (position+zIndex) requis pour que la tooltip reste devant
	// les cartes suivantes ; sans ça l'ordre du document gagne.
	titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap', position: 'relative' as any, zIndex: 9999 as any },
	title: { ...TYPOGRAPHY.h1 },
	code: { fontFamily: Platform.OS === 'web' ? ('ui-monospace, Menlo, monospace' as any) : 'monospace', fontSize: 11, color: COLORS.text.secondary },

	helpAnchor: { position: 'relative' as any, zIndex: 9999 as any },
	helpBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 99, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	helpBoxHovered: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}11` },
	helpIcon: { width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
	helpIconText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 11, fontStyle: 'italic' },
	helpText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	tooltip: {
		position: 'absolute' as any, top: '120%', left: 0,
		width: 420, maxWidth: 420,
		padding: SPACING.md, gap: 4,
		backgroundColor: COLORS.background.card,
		borderWidth: 1, borderColor: COLORS.primary,
		borderRadius: 8,
		zIndex: 9999 as any,
		elevation: 8,
		...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } as any) : {}),
	},
	tooltipTitle: { ...TYPOGRAPHY.h2, fontSize: 15, marginBottom: 2 },
	tooltipSection: { fontSize: 11, color: COLORS.primary, fontWeight: '700', textTransform: 'uppercase', marginTop: SPACING.sm },
	tooltipPara: { fontSize: 12, color: COLORS.text.primary, lineHeight: 18 },
	tooltipBullet: { fontSize: 12, color: COLORS.text.primary, lineHeight: 18, marginLeft: SPACING.sm },
	tooltipBold: { fontWeight: '700' },

	createCard: {
		padding: SPACING.md, gap: SPACING.sm,
		backgroundColor: `${COLORS.primary}0d`,
		borderRadius: 10,
		borderWidth: 2, borderColor: COLORS.primary,
	},
	createHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
	createBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', position: 'relative' as any },
	// + dessiné en 2 barres pour éviter les baseline-inconsistencies d'un glyphe « + »
	plusHorizontal: { position: 'absolute' as any, width: 14, height: 2, borderRadius: 1, backgroundColor: COLORS.text.inverse },
	plusVertical:   { position: 'absolute' as any, width: 2, height: 14, borderRadius: 1, backgroundColor: COLORS.text.inverse },
	createTitle: { ...TYPOGRAPHY.h2, fontSize: 16, color: COLORS.primary },
	createSubtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	formLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
	slugPreview: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic' },

	input: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main },

	toggleGroup: { flexDirection: 'row', gap: SPACING.sm },
	bigToggle: {
		flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
		padding: SPACING.sm,
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		backgroundColor: COLORS.background.main,
	},
	bigToggleOn: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}11` },
	bigToggleTitle: { ...TYPOGRAPHY.body, fontSize: 13, fontWeight: '700', color: COLORS.text.primary },
	bigToggleTitleOn: { color: COLORS.primary },
	bigToggleHint: { fontSize: 11, color: COLORS.text.secondary, marginTop: 2, lineHeight: 15 },
	checkboxBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.background.main, marginTop: 1 },
	checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },

	rulePreview: { padding: SPACING.sm, backgroundColor: COLORS.background.card, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
	rulePreviewLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	rulePreviewValue: { fontSize: 13, color: COLORS.text.primary, lineHeight: 18, marginTop: 2 },

	sectionDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },

	listHeader: { gap: 2 },
	listTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	listSubtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	emptyState: { padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' as any, borderRadius: 8 },
	emptyTitle: { ...TYPOGRAPHY.h2 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, textAlign: 'center' },

	categoryCard: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
	categoryHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	categoryTitle: { ...TYPOGRAPHY.h2, fontSize: 17 },
	categoryRule: { marginTop: 4 },
	rulePill: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' as any },
	rulePillRequired: { backgroundColor: COLORS.danger,         color: COLORS.text.inverse },
	rulePillOptional: { backgroundColor: COLORS.text.secondary, color: COLORS.text.inverse },
	categoryRuleDetail: { fontSize: 12, color: COLORS.text.secondary, marginTop: 4, lineHeight: 17 },

	categoryFlagsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
	flagToggle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	flagToggleOn: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}11` },
	flagToggleText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	flagToggleTextOn: { color: COLORS.primary },

	previewCard: { padding: SPACING.sm, gap: 4, backgroundColor: COLORS.background.main, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' as any },
	previewLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	previewEmpty: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic' },
	previewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
	previewChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	previewChipRadio: { borderRadius: 99 },
	previewChipBox: { borderRadius: 6 },
	previewChipMark: { width: 12, height: 12, borderWidth: 2, borderColor: COLORS.text.secondary },
	previewChipMarkRadio: { borderRadius: 99 },
	previewChipMarkBox: { borderRadius: 2 },
	previewChipText: { fontSize: 11, color: COLORS.text.primary },

	labelsSectionTitle: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
	archivedHint: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic' },
	labelsList: { gap: 4 },
	labelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	labelRowArchived: { opacity: 0.6, borderStyle: 'dashed' as any },
	labelTitle: { ...TYPOGRAPHY.body, fontSize: 13, fontWeight: '600' },
	labelSlug: { fontSize: 11, color: COLORS.text.placeholder, marginTop: 2 },

	addLabelRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, marginTop: SPACING.xs },

	btn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, alignItems: 'center' },
	btnPrimary: { backgroundColor: COLORS.primary },
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },
	btnGhost: { backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 6 },
	btnGhostText: { color: COLORS.text.primary, fontWeight: '600', fontSize: 12 },
	btnDangerOutline: { borderWidth: 1, borderColor: COLORS.danger, backgroundColor: 'transparent', paddingVertical: 6 },
	btnDangerOutlineText: { color: COLORS.danger, fontWeight: '700', fontSize: 12 },
	btnDangerIcon: { borderWidth: 1, borderColor: COLORS.danger, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
	btnDangerIconText: { color: COLORS.danger, fontWeight: '700' },
	btnDisabled: { opacity: 0.4 },
});
