import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CuratorService, CuratorTask } from '@/services/api/CuratorService';
import { CuratorTile } from '../components/CuratorTile';
import { toast } from '@/shared/toast/Toast';
import { FilterSortBar, useFilteredAndSorted } from '@/shared/components/filters';
import type { FilterField, FilterSortState, SortOption, FieldExtractors } from '@/shared/components/filters';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const CURATOR_SORTS: SortOption[] = [
	{ key: 'created_date',      label: 'Date de création',      defaultDirection: 'asc' },
	{ key: 'annotations_count', label: 'Nombre de propositions', defaultDirection: 'desc' },
	{ key: 'name',              label: 'Nom (A-Z)',              defaultDirection: 'asc' },
];

const DEFAULT_STATE: FilterSortState = {
	filters: {},
	sort: { key: 'created_date', direction: 'asc' },
};

type AssignmentBucket = 'mine' | 'other' | 'unassigned';

function assignmentBucket(task: CuratorTask, isAdmin: boolean): AssignmentBucket {
	if (!task.assigned_to) return 'unassigned';
	return task.is_assigned_to_me || !isAdmin ? 'mine' : 'other';
}

// Concatène les 3 noms d'espèces proposées en une chaîne lowercase, pour
// permettre une recherche `text` qui matche n'importe lequel des 3 noms.
function speciesSearchBlob(task: CuratorTask): string {
	const list = task.proposed_species ?? [];
	return list
		.flatMap((s) => [s.scientific_name, s.usage_name, s.polynesian_name, s.name])
		.filter((v): v is string => !!v)
		.join(' ')
		.toLowerCase();
}

export function openCurationStudio(task: CuratorTask): void {
	const jobId = task.jobs?.[0]?.id;
	if (!jobId) {
		toast.error('Aucun job d\'annotation disponible pour ce média.');
		return;
	}
	router.push(`/(main)/curator/studio/${task.id}/${jobId}` as any);
}

export const CuratorHubScreen: React.FC = () => {
	const [tasks, setTasks] = useState<CuratorTask[]>([]);
	const [adminView, setAdminView] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filterState, setFilterState] = useState<FilterSortState>(DEFAULT_STATE);
	const service = useMemo(() => new CuratorService(), []);

	const filters = useMemo<FilterField[]>(() => {
		const base: FilterField[] = [
			{ kind: 'text', key: 'species_query', label: 'Rechercher une espèce', placeholder: 'Nom scientifique, usage ou polynésien…' },
			{ kind: 'number-range', key: 'proposals', label: 'Nombre de propositions', min: 2 },
		];
		// Filtre assignation visible uniquement en vue admin.
		if (adminView) {
			base.push({ kind: 'chips', key: 'assignment', label: 'Assignation', multi: false, options: [
				{ value: 'mine',       label: 'À moi' },
				{ value: 'other',      label: 'À un autre curator' },
				{ value: 'unassigned', label: 'Non assignée' },
			] });
		}
		return base;
	}, [adminView]);

	const enrichedTasks = useMemo(
		() => tasks.map((t) => ({
			...t,
			_assignment:    assignmentBucket(t, adminView),
			_speciesBlob:   speciesSearchBlob(t),
			_proposalsCount: t.annotations_count ?? 0,
		})),
		[tasks, adminView],
	);

	const extractors: FieldExtractors<typeof enrichedTasks[number]> = useMemo(() => ({
		name:               (t) => t.name,
		created_date:       (t) => t.created_date,
		annotations_count:  (t) => t.annotations_count ?? 0,
		species_query:      (t) => t._speciesBlob,
		proposals:          (t) => t._proposalsCount,
		assignment:         (t) => t._assignment,
	}), []);

	const filteredTasks = useFilteredAndSorted(
		enrichedTasks, filters, CURATOR_SORTS, filterState, extractors,
	);

	const load = useCallback(() => {
		setLoading(true);
		setError(null);
		service.getTasks()
			.then((resp) => { setTasks(resp.results); setAdminView(resp.admin_view); })
			.catch((err) => setError(err?.response?.data?.error ?? err.message))
			.finally(() => setLoading(false));
	}, [service]);

	useEffect(() => { load(); }, [load]);

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}
	if (error) {
		return (
			<View style={styles.center}>
				<Text style={styles.errorText}>Erreur : {error}</Text>
				<Pressable style={styles.retryBtn} onPress={load}>
					<Text style={styles.retryText}>Réessayer</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>Curation</Text>
					<Text style={styles.subtitle}>{tasks.length} média{tasks.length !== 1 ? 's' : ''} à curer</Text>
				</View>
				<Pressable
					onPress={() => router.push('/(main)/curator/species' as any)}
					style={styles.catalogBtn}
				>
					<Text style={styles.catalogBtnText}>📖 Catalogue des espèces</Text>
				</Pressable>
			</View>

			{adminView ? (
				<View style={styles.adminBanner}>
					<Text style={styles.adminBannerText}>
						<Text style={{ fontWeight: '700' }}>Vue administrateur</Text> · tu vois <Text style={{ fontWeight: '700' }}>tous</Text> les médias en attente de curation (attribués ou pas). Les curators ne voient que leurs attributions. Les badges sur les tuiles indiquent à qui chaque média est attribué.
					</Text>
				</View>
			) : null}

			<FilterSortBar
				filters={filters}
				sorts={CURATOR_SORTS}
				value={filterState}
				onChange={setFilterState}
				defaultState={DEFAULT_STATE}
				totalCount={tasks.length}
				resultCount={filteredTasks.length}
				searchKey="species_query"
			/>

			<Text style={styles.legendItem}>Double-clic sur un média pour entrer dans le studio de curation.</Text>

			{tasks.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Aucun média disponible pour la curation.</Text>
				</View>
			) : filteredTasks.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Aucun média ne correspond aux filtres.</Text>
				</View>
			) : (
				<ScrollView contentContainerStyle={styles.grid}>
					{filteredTasks.map((t) => (
						<CuratorTile key={t.id} task={t} onOpen={openCurationStudio} />
					))}
				</ScrollView>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	adminBanner: {
		backgroundColor: `${COLORS.warning}11`,
		borderLeftWidth: 3,
		borderLeftColor: COLORS.warning,
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
		borderRadius: 6,
		marginBottom: SPACING.sm,
	},
	adminBannerText: { fontSize: 12, color: COLORS.text.primary, lineHeight: 17 },

	container: { flex: 1, padding: SPACING.lg },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
	headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
	catalogBtn: {
		paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
		borderRadius: 6, backgroundColor: COLORS.background.card,
		borderWidth: 1, borderColor: COLORS.primary,
	},
	catalogBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

	legendItem: { fontSize: 12, color: COLORS.text.secondary, marginBottom: SPACING.md },

	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingBottom: SPACING.lg },

	empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	errorText: { ...TYPOGRAPHY.body, color: '#dc2626' },
	retryBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: 8 },
	retryText: { ...TYPOGRAPHY.body, color: COLORS.text.inverse, fontWeight: '600' },
});
