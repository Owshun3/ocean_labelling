import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { CuratorService, CuratorTask } from '@/services/api/CuratorService';
import { CuratorTile } from '../components/CuratorTile';
import { openCurationStudio } from './CuratorHubScreen';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props {
	completedTaskId: number | null;
}

export const CuratorPostValidationScreen: React.FC<Props> = ({ completedTaskId }) => {
	const router = useRouter();
	const service = useMemo(() => new CuratorService(), []);
	const [tasks, setTasks] = useState<CuratorTask[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(() => {
		setLoading(true);
		setError(null);
		service.getTasks()
			.then((resp) => setTasks(resp.results.filter((t) => t.id !== completedTaskId)))
			.catch((err) => setError(err?.response?.data?.error ?? err.message))
			.finally(() => setLoading(false));
	}, [service, completedTaskId]);

	useEffect(() => { load(); }, [load]);

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<View style={styles.confirmCard}>
				<View style={styles.checkCircle}><Text style={styles.checkIcon}>✓</Text></View>
				<View style={{ flex: 1 }}>
					<Text style={styles.confirmTitle}>Modifications enregistrées</Text>
					<Text style={styles.confirmSubtitle}>
						{completedTaskId
							? `Ta validation pour le média #${completedTaskId} a bien été prise en compte.`
							: 'Ta validation a bien été prise en compte.'}
					</Text>
				</View>
				<Pressable
					style={styles.backBtn}
					onPress={() => router.replace('/(main)/curator' as Href)}
				>
					<Text style={styles.backBtnText}>Retour à la file</Text>
				</Pressable>
			</View>

			<Text style={styles.sectionTitle}>Continuer avec un autre média</Text>

			<View style={styles.filterBar}>
				<Text style={styles.filterPlaceholderLabel}>Filtres :</Text>
				<View style={styles.filterPill}><Text style={styles.filterPillText}>tous</Text></View>
				<Text style={styles.filterHint}>changer les filtres · bientôt disponible</Text>
			</View>

			<Text style={styles.legendItem}>Double-clic pour ouvrir directement le studio de curation.</Text>

			{loading ? (
				<View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
			) : error ? (
				<View style={styles.center}>
					<Text style={styles.errorText}>Erreur : {error}</Text>
				</View>
			) : tasks.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Plus aucun média à curer pour le moment.</Text>
				</View>
			) : (
				<View style={styles.grid}>
					{tasks.map((t) => (
						<CuratorTile key={t.id} task={t} onOpen={openCurationStudio} />
					))}
				</View>
			)}
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },

	confirmCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: COLORS.success,
		borderLeftWidth: 5,
		padding: SPACING.lg,
		marginBottom: SPACING.lg,
	},
	checkCircle: {
		width: 44, height: 44, borderRadius: 22,
		backgroundColor: COLORS.success,
		alignItems: 'center', justifyContent: 'center',
	},
	checkIcon: { color: COLORS.text.inverse, fontSize: 22, fontWeight: '700' },
	confirmTitle: { ...TYPOGRAPHY.h2, marginBottom: 2 },
	confirmSubtitle: { fontSize: 13, color: COLORS.text.secondary },

	backBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.background.main, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
	backBtnText: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontWeight: '600' },

	sectionTitle: { ...TYPOGRAPHY.h2, marginBottom: SPACING.sm },

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

	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },

	center: { padding: SPACING.lg, alignItems: 'center', justifyContent: 'center' },
	empty: { padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 8 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
	errorText: { ...TYPOGRAPHY.body, color: '#dc2626' },
});
