import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AdminService, RequestsSummary } from '@/services/api/AdminService';
import { AdminContestationsListScreen } from './AdminContestationsListScreen';
import { AdminResearcherRequestsTab } from './AdminResearcherRequestsTab';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

type Tab = 'contestations' | 'researcher';

const TABS: { value: Tab; label: string }[] = [
	{ value: 'contestations', label: 'Contestations' },
	{ value: 'researcher',    label: 'Accès chercheurs' },
];

export const AdminRequestsHubScreen: React.FC = () => {
	const service = useMemo(() => new AdminService(), []);
	const [tab, setTab] = useState<Tab>('contestations');
	const [summary, setSummary] = useState<RequestsSummary | null>(null);
	const [loadingSummary, setLoadingSummary] = useState(true);

	const loadSummary = useCallback(async () => {
		try {
			const s = await service.getRequestsSummary();
			setSummary(s);
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.');
		} finally {
			setLoadingSummary(false);
		}
	}, [service]);

	useEffect(() => { loadSummary(); }, [loadSummary]);

	const counts: Record<Tab, number> = {
		contestations: summary?.contestations ?? 0,
		researcher:    summary?.researcher_access ?? 0,
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Requêtes</Text>
				<Text style={styles.subtitle}>Demandes en attente de validation administrateur.</Text>
			</View>

			<View style={styles.tabs}>
				{TABS.map((t) => {
					const active = tab === t.value;
					const n = counts[t.value];
					return (
						<Pressable
							key={t.value}
							onPress={() => setTab(t.value)}
							style={[styles.tab, active && styles.tabActive]}
						>
							<Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
							{loadingSummary ? null : (
								<View style={[styles.badge, n === 0 && styles.badgeZero, active && styles.badgeActive]}>
									<Text style={[styles.badgeText, active && styles.badgeTextActive]}>{n}</Text>
								</View>
							)}
						</Pressable>
					);
				})}
			</View>

			<View style={styles.body}>
				{tab === 'contestations' ? (
					<AdminContestationsListScreen embedded breakdown={summary?.contestations_breakdown ?? null} />
				) : (
					<AdminResearcherRequestsTab onChanged={loadSummary} />
				)}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg, gap: SPACING.sm },
	header: { gap: 2 },
	title:    { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	tabs: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.sm },
	tab: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
		paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
		borderRadius: 8, backgroundColor: COLORS.background.card,
		borderWidth: 1, borderColor: COLORS.border,
	},
	tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	tabText: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary },
	tabTextActive: { color: COLORS.text.inverse },
	badge: {
		minWidth: 22, paddingHorizontal: 6, paddingVertical: 1,
		borderRadius: 99, backgroundColor: COLORS.danger,
		alignItems: 'center', justifyContent: 'center',
	},
	badgeZero: { backgroundColor: COLORS.text.placeholder },
	badgeActive: { backgroundColor: COLORS.background.card },
	badgeText: { fontSize: 11, fontWeight: '700', color: COLORS.text.inverse },
	badgeTextActive: { color: COLORS.primary },

	body: { flex: 1 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	placeholder: { padding: SPACING.lg, gap: SPACING.sm },
	placeholderTitle: { ...TYPOGRAPHY.h2, color: COLORS.text.primary },
	placeholderText:  { ...TYPOGRAPHY.body, color: COLORS.text.secondary, lineHeight: 21 },
});
