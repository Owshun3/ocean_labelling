import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { AdminService, ContestationUploaderEntry, ContestationKind } from '@/services/api/AdminService';
import { toast } from '@/shared/toast/Toast';
import { FilterSortBar, useFilteredAndSorted } from '@/shared/components/filters';
import type { FilterField, FilterSortState, SortOption, FieldExtractors } from '@/shared/components/filters';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const KIND_TABS: { value: ContestationKind; label: string; hint: string }[] = [
	{ value: 'media',      label: 'Rejets média',        hint: 'Uploadeurs contestant un rejet en modération' },
	{ value: 'annotation', label: 'Annotations curator', hint: 'Annotateurs contestant une annotation certifiée' },
];

const CONTESTATIONS_SORTS: SortOption[] = [
	{ key: 'oldest_contestation', label: 'Plus ancienne',           defaultDirection: 'asc'  },
	{ key: 'newest_contestation', label: 'Plus récente',            defaultDirection: 'desc' },
	{ key: 'contestation_count',  label: 'Nombre de contestations', defaultDirection: 'desc' },
	{ key: 'username',            label: 'Utilisateur (A-Z)',       defaultDirection: 'asc'  },
];

const DEFAULT_STATE: FilterSortState = {
	filters: {},
	sort: { key: 'oldest_contestation', direction: 'asc' },
};

const CONTESTATIONS_EXTRACTORS: FieldExtractors<ContestationUploaderEntry> = {
	search:               (e) => (e.username ?? '').toLowerCase(),
	role:                 (e) => e.role,
	oldest_contestation:  (e) => e.oldest_contestation,
	newest_contestation:  (e) => e.newest_contestation,
	contestation_count:   (e) => e.contestation_count,
	username:             (e) => (e.username ?? '').toLowerCase(),
};

function fmtRelative(iso: string): string {
	const d = new Date(iso);
	const diffMs = Date.now() - d.getTime();
	const diffH = Math.floor(diffMs / 3_600_000);
	if (diffH < 1)  return 'il y a quelques minutes';
	if (diffH < 24) return `il y a ${diffH} h`;
	const diffD = Math.floor(diffH / 24);
	if (diffD < 7)  return `il y a ${diffD} j`;
	return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface ListProps {
	embedded?: boolean;
	/** Pré-comptes par kind (depuis RequestsSummary). Permet d'afficher un badge
	 * sur chaque sous-onglet sans déclencher un fetch supplémentaire. */
	breakdown?: { media: number; annotation: number } | null;
}

export const AdminContestationsListScreen: React.FC<ListProps> = ({ embedded, breakdown }) => {
	const router = useRouter();
	const service = useMemo(() => new AdminService(), []);
	const [entries, setEntries] = useState<ContestationUploaderEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [kind, setKind]       = useState<ContestationKind>('media');
	const [filterState, setFilterState] = useState<FilterSortState>(DEFAULT_STATE);

	useEffect(() => {
		setLoading(true);
		service.listContestationUploaders(kind)
			.then(setEntries)
			.catch((err) => toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.'))
			.finally(() => setLoading(false));
	}, [service, kind]);

	const presentRoles = useMemo(() => {
		const set = new Set(entries.map((e) => e.role).filter(Boolean));
		return Array.from(set).map((r) => ({ value: r, label: r }));
	}, [entries]);

	const filters = useMemo<FilterField[]>(() => [
		{ kind: 'text',  key: 'search', label: 'Rechercher', placeholder: 'Nom d\'utilisateur…' },
		{ kind: 'chips', key: 'role',   label: 'Rôle',       multi: true, options: presentRoles },
	], [presentRoles]);

	const filtered = useFilteredAndSorted(entries, filters, CONTESTATIONS_SORTS, filterState, CONTESTATIONS_EXTRACTORS);

	const tabHint = KIND_TABS.find((t) => t.value === kind)?.hint ?? '';
	const tabCounts: Record<ContestationKind, number | null> = {
		media:      breakdown?.media ?? null,
		annotation: breakdown?.annotation ?? null,
	};

	return (
		<View style={embedded ? styles.containerEmbedded : styles.container}>
			{embedded ? null : (
				<View style={styles.headerRow}>
					<Text style={styles.title}>Contestations</Text>
					<Text style={styles.subtitle}>
						{entries.length} utilisateur{entries.length > 1 ? 's' : ''} avec contestation(s) ouverte(s)
					</Text>
				</View>
			)}

			<View style={styles.tabBar}>
				{KIND_TABS.map((t) => {
					const active = kind === t.value;
					const count = tabCounts[t.value];
					return (
						<Pressable key={t.value} onPress={() => setKind(t.value)} style={[styles.tab, active && styles.tabActive]}>
							<Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
							{count !== null ? (
								<View style={[styles.tabBadge, (count ?? 0) === 0 && styles.tabBadgeZero, active && styles.tabBadgeActive]}>
									<Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
								</View>
							) : null}
						</Pressable>
					);
				})}
			</View>
			<Text style={styles.tabHint}>{tabHint}</Text>

			<FilterSortBar
				filters={filters}
				sorts={CONTESTATIONS_SORTS}
				value={filterState}
				onChange={setFilterState}
				defaultState={DEFAULT_STATE}
				totalCount={entries.length}
				resultCount={filtered.length}
				searchKey="search"
			/>

			{loading ? (
				<View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
			) : filtered.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>
						{entries.length === 0 ? 'Aucune contestation en attente.' : 'Aucun utilisateur ne correspond aux filtres.'}
					</Text>
				</View>
			) : (
				<FlatList
					data={filtered}
					keyExtractor={(e) => String(e.uploader_id)}
					renderItem={({ item }) => (
						<Pressable
							onPress={() => router.push(`/(main)/admin/contestations/${item.uploader_id}?kind=${kind}` as Href)}
							style={({ hovered }: any) => [styles.row, hovered && styles.rowHovered]}
						>
							<View style={styles.rowLeft}>
								<Text style={styles.rowUser}>
									{item.username ?? `Utilisateur #${item.uploader_id}`}
									<Text style={styles.rowRole}>  ·  {item.role}</Text>
								</Text>
								<Text style={styles.rowMeta}>
									Plus ancienne : {fmtRelative(item.oldest_contestation)} · Plus récente : {fmtRelative(item.newest_contestation)}
								</Text>
							</View>
							<View style={styles.countBadge}>
								<Text style={styles.countText}>{item.contestation_count}</Text>
							</View>
						</Pressable>
					)}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg, gap: SPACING.sm },
	containerEmbedded: { flex: 1, gap: SPACING.sm },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	headerRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	tabBar: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm },
	tab: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	tabText: { fontSize: 13, fontWeight: '600', color: COLORS.text.secondary },
	tabTextActive: { color: COLORS.text.inverse },
	tabBadge: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center' },
	tabBadgeZero: { backgroundColor: COLORS.text.placeholder },
	tabBadgeActive: { backgroundColor: COLORS.background.card },
	tabBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.text.inverse },
	tabBadgeTextActive: { color: COLORS.primary },
	tabHint: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic', marginBottom: SPACING.sm },

	row: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
		marginBottom: SPACING.sm,
	},
	rowHovered: { borderColor: COLORS.primary, backgroundColor: COLORS.background.main },
	rowLeft: { flex: 1, gap: 2 },
	rowUser: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.text.primary },
	rowRole: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '400' },
	rowMeta: { fontSize: 12, color: COLORS.text.secondary },

	countBadge: {
		minWidth: 32, height: 32, borderRadius: 16,
		paddingHorizontal: 10,
		backgroundColor: COLORS.warning,
		alignItems: 'center', justifyContent: 'center',
	},
	countText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 14 },

	empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
});
