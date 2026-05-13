import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CuratorService, CuratorTask } from '@/services/api/CuratorService';
import { CuratorTile } from '../components/CuratorTile';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export function openCurationStudio(task: CuratorTask): void {
	const jobId = task.jobs?.[0]?.id;
	if (!jobId) {
		window.alert('Aucun job d\'annotation disponible pour ce média.');
		return;
	}
	router.push(`/(main)/curator/studio/${task.id}/${jobId}` as any);
}

export const CuratorHubScreen: React.FC = () => {
	const [tasks, setTasks] = useState<CuratorTask[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const service = useMemo(() => new CuratorService(), []);

	const load = useCallback(() => {
		setLoading(true);
		setError(null);
		service.getTasks()
			.then(setTasks)
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
				<Text style={styles.title}>Curation</Text>
				<Text style={styles.subtitle}>{tasks.length} média{tasks.length !== 1 ? 's' : ''} à curer</Text>
			</View>

			<View style={styles.filterBar}>
				<Text style={styles.filterPlaceholderLabel}>Filtres :</Text>
				<View style={styles.filterPill}><Text style={styles.filterPillText}>tous</Text></View>
				<Text style={styles.filterHint}>tri par date / géoloc / nb annotations · bientôt disponible</Text>
			</View>

			<Text style={styles.legendItem}>Double-clic sur un média pour entrer dans le studio de curation.</Text>

			{tasks.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Aucun média disponible pour la curation.</Text>
				</View>
			) : (
				<ScrollView contentContainerStyle={styles.grid}>
					{tasks.map((t) => (
						<CuratorTile key={t.id} task={t} onOpen={openCurationStudio} />
					))}
				</ScrollView>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
	headerRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm, marginBottom: SPACING.md },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	filterBar: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: SPACING.sm,
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginBottom: SPACING.sm,
	},
	filterPlaceholderLabel: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '700' },
	filterPill: {
		paddingHorizontal: SPACING.sm,
		paddingVertical: 4,
		borderRadius: 99,
		backgroundColor: COLORS.primary,
	},
	filterPillText: { fontSize: 12, color: COLORS.text.inverse, fontWeight: '600' },
	filterHint: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic', marginLeft: 'auto' },

	legendItem: { fontSize: 12, color: COLORS.text.secondary, marginBottom: SPACING.md },

	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingBottom: SPACING.lg },

	empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	errorText: { ...TYPOGRAPHY.body, color: '#dc2626' },
	retryBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: 8 },
	retryText: { ...TYPOGRAPHY.body, color: COLORS.text.inverse, fontWeight: '600' },
});
