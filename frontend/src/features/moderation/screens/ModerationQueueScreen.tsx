import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { useRouter, Href } from 'expo-router';
import { ModerationService, ModerationQueueEntry } from '@/services/api/ModerationService';
import { FilterSortBar, useFilteredAndSorted } from '@/shared/components/filters';
import type { FilterField, FilterSortState, SortOption, FieldExtractors } from '@/shared/components/filters';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const QUEUE_SORTS: SortOption[] = [
	{ key: 'oldest',        label: 'Plus ancien dépôt',     defaultDirection: 'asc' },
	{ key: 'pending_count', label: 'Volume à modérer',      defaultDirection: 'desc' },
	{ key: 'username',      label: 'Nom (A-Z)',             defaultDirection: 'asc' },
];

const DEFAULT_STATE: FilterSortState = {
	filters: {},
	sort: { key: 'oldest', direction: 'asc' },
};

type ContentType = 'images_only' | 'videos_only' | 'mixed';

function contentTypeOf(entry: ModerationQueueEntry): ContentType {
	const hasImages = (entry.image_count ?? 0) > 0;
	const hasVideos = (entry.video_count ?? 0) > 0;
	if (hasImages && !hasVideos) return 'images_only';
	if (!hasImages && hasVideos) return 'videos_only';
	return 'mixed';
}

const QUEUE_EXTRACTORS: FieldExtractors<ModerationQueueEntry & { _content: ContentType }> = {
	username:      (e) => (e.username || '').toLowerCase(),
	role:          (e) => e.role,
	content_type:  (e) => e._content,
	pending_count: (e) => e.pending_count,
	oldest:        (e) => e.oldest,
};

function formatRelativeDate(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 60) return `il y a ${diffMin} min`;
	const diffH = Math.floor(diffMin / 60);
	if (diffH < 24) return `il y a ${diffH} h`;
	const diffD = Math.floor(diffH / 24);
	return `il y a ${diffD} j`;
}

export const ModerationQueueScreen: React.FC = () => {
	const [entries, setEntries] = useState<ModerationQueueEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [filterState, setFilterState] = useState<FilterSortState>(DEFAULT_STATE);
	const router = useRouter();
	const service = useMemo(() => new ModerationService(), []);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			setEntries(await service.getQueue());
		} catch (err: any) {
			toast.error(err?.message || 'Impossible de charger la file de modération.');
		} finally {
			setLoading(false);
		}
	}, [service]);

	useEffect(() => { load(); }, [load]);

	const roleOptions = useMemo(() => {
		const set = new Set(entries.map((e) => e.role).filter(Boolean));
		return Array.from(set).map((r) => ({ value: r, label: r }));
	}, [entries]);

	const enrichedEntries = useMemo(
		() => entries.map((e) => ({ ...e, _content: contentTypeOf(e) })),
		[entries],
	);

	const filters = useMemo<FilterField[]>(() => [
		{ kind: 'text',  key: 'username',     label: 'Rechercher', placeholder: 'Nom d\'utilisateur…' },
		{ kind: 'chips', key: 'content_type', label: 'Contenu en attente', multi: false, options: [
			{ value: 'images_only', label: 'Images uniquement' },
			{ value: 'videos_only', label: 'Vidéos uniquement' },
			{ value: 'mixed',       label: 'Mixte' },
		] },
		{ kind: 'chips', key: 'role', label: 'Rôle', multi: true, options: roleOptions },
	], [roleOptions]);

	const filtered = useFilteredAndSorted(enrichedEntries, filters, QUEUE_SORTS, filterState, QUEUE_EXTRACTORS);

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>File de modération</Text>
				<Text style={styles.subtitle}>
					{entries.length === 0
						? 'Aucun utilisateur avec des médias à valider.'
						: `${entries.length} utilisateur(s) en attente`}
				</Text>
			</View>

			{entries.length > 0 ? (
				<FilterSortBar
					filters={filters}
					sorts={QUEUE_SORTS}
					value={filterState}
					onChange={setFilterState}
					defaultState={DEFAULT_STATE}
					totalCount={entries.length}
					resultCount={filtered.length}
					searchKey="username"
				/>
			) : null}

			{loading ? (
				<ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
			) : (
				<FlatList
					data={filtered}
					keyExtractor={(item) => String(item.uploader_id)}
					ListEmptyComponent={
						<View style={styles.emptyState}>
							<Text style={styles.emptyText}>
								{entries.length === 0 ? 'Aucun média en attente.' : 'Aucun utilisateur ne correspond aux filtres.'}
							</Text>
						</View>
					}
					renderItem={({ item }) => (
						<View style={styles.row}>
							<View style={styles.rowMain}>
								<Text style={styles.username}>
									{item.username ? `${item.username}#${item.uploader_id}` : `#${item.uploader_id}`}
								</Text>
								<Text style={styles.meta}>
									{item.pending_count} média(s) ({(item.image_count ?? 0)} 🖼 · {(item.video_count ?? 0)} 🎥) · plus ancien {formatRelativeDate(item.oldest)}
								</Text>
							</View>
							<Pressable
								style={styles.detailsBtn}
								onPress={() => router.push(`/(main)/moderation/${item.uploader_id}` as Href)}
							>
								<Text style={styles.detailsText}>Détails ›</Text>
							</Pressable>
						</View>
					)}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	header: { marginBottom: SPACING.md },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginTop: SPACING.xs },
	emptyState: {
		padding: SPACING.xl,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: COLORS.border,
		borderStyle: 'dashed',
		borderRadius: 8,
	},
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: COLORS.background.card,
		padding: SPACING.md,
		borderRadius: 8,
		marginBottom: SPACING.md,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	rowMain: { flex: 1 },
	username: { ...TYPOGRAPHY.body, fontWeight: '600' },
	meta: { fontSize: 13, color: COLORS.text.secondary, marginTop: 2 },
	detailsBtn: {
		paddingHorizontal: SPACING.md,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		backgroundColor: COLORS.primary,
	},
	detailsText: { color: COLORS.text.inverse, fontWeight: '600' },
});
