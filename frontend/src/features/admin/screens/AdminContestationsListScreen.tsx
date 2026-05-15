import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { AdminService, ContestationUploaderEntry, ContestationKind } from '@/services/api/AdminService';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

type SortKey = 'oldest' | 'newest' | 'count' | 'user';

const KIND_TABS: { value: ContestationKind; label: string; hint: string }[] = [
	{ value: 'media',      label: 'Rejets média',          hint: 'Uploadeurs contestant un rejet en modération' },
	{ value: 'annotation', label: 'Annotations curator',   hint: 'Annotateurs contestant une annotation certifiée' },
];

const SORT_LABELS: Record<SortKey, string> = {
	oldest: 'Plus ancienne',
	newest: 'Plus récente',
	count:  'Nombre',
	user:   'Utilisateur',
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

interface ListProps { embedded?: boolean }

export const AdminContestationsListScreen: React.FC<ListProps> = ({ embedded }) => {
	const router = useRouter();
	const service = useMemo(() => new AdminService(), []);
	const [entries, setEntries] = useState<ContestationUploaderEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [sort, setSort]       = useState<SortKey>('oldest');
	const [kind, setKind]       = useState<ContestationKind>('media');

	useEffect(() => {
		setLoading(true);
		service.listContestationUploaders(kind)
			.then(setEntries)
			.catch((err) => toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.'))
			.finally(() => setLoading(false));
	}, [service, kind]);

	const sorted = useMemo(() => {
		const copy = [...entries];
		copy.sort((a, b) => {
			switch (sort) {
				case 'oldest': return new Date(a.oldest_contestation).getTime() - new Date(b.oldest_contestation).getTime();
				case 'newest': return new Date(b.newest_contestation).getTime() - new Date(a.newest_contestation).getTime();
				case 'count':  return b.contestation_count - a.contestation_count;
				case 'user':   return (a.username ?? '').localeCompare(b.username ?? '', 'fr');
			}
		});
		return copy;
	}, [entries, sort]);

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}

	const tabHint = KIND_TABS.find((t) => t.value === kind)?.hint ?? '';

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
					return (
						<Pressable key={t.value} onPress={() => setKind(t.value)} style={[styles.tab, active && styles.tabActive]}>
							<Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
						</Pressable>
					);
				})}
			</View>
			<Text style={styles.tabHint}>{tabHint}</Text>

			<View style={styles.sortBar}>
				<Text style={styles.sortLabel}>Trier :</Text>
				{(Object.keys(SORT_LABELS) as SortKey[]).map((k) => {
					const active = sort === k;
					return (
						<Pressable
							key={k}
							onPress={() => setSort(k)}
							style={[styles.sortPill, active && styles.sortPillActive]}
						>
							<Text style={[styles.sortPillText, active && styles.sortPillTextActive]}>
								{SORT_LABELS[k]}
							</Text>
						</Pressable>
					);
				})}
			</View>

			{sorted.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Aucune contestation en attente.</Text>
				</View>
			) : (
				<FlatList
					data={sorted}
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
	tab: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	tabText: { fontSize: 13, fontWeight: '600', color: COLORS.text.secondary },
	tabTextActive: { color: COLORS.text.inverse },
	tabHint: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic', marginBottom: SPACING.sm },
	sortBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.sm },
	sortLabel: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '700' },
	sortPill: {
		paddingHorizontal: SPACING.sm, paddingVertical: 4,
		borderRadius: 99,
		backgroundColor: COLORS.background.card,
		borderWidth: 1, borderColor: COLORS.border,
	},
	sortPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	sortPillText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600' },
	sortPillTextActive: { color: COLORS.text.inverse },

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
