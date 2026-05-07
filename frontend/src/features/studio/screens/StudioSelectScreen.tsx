import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter, Href } from 'expo-router';
import { FeedTask, StudioFeed, StudioService } from '@/services/api/StudioService';
import { StudioFeedTile } from '../components/StudioFeedTile';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const StudioSelectScreen: React.FC = () => {
	const router = useRouter();
	const service = useMemo(() => new StudioService(), []);
	const [feed, setFeed] = useState<StudioFeed | null>(null);
	const [loading, setLoading] = useState(true);
	const [claiming, setClaiming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setFeed(await service.getFeed());
		} catch (err: any) {
			setError(err?.response?.data?.error ?? err.message);
		} finally {
			setLoading(false);
		}
	}, [service]);

	useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

	const openTask = async (task: FeedTask) => {
		if (claiming) return;
		setClaiming(true);
		try {
			const { jobId } = await service.claim(task.cvat_task_id);
			router.push(`/(main)/studio/${task.cvat_task_id}/${jobId}` as Href);
		} catch (err: any) {
			const msg = err?.response?.data?.error ?? err?.message ?? 'Impossible de réserver ce média.';
			Alert.alert('Erreur', typeof msg === 'string' ? msg : JSON.stringify(msg));
		} finally {
			setClaiming(false);
		}
	};

	if (loading && !feed) {
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

	const own = feed?.own ?? [];
	const community = feed?.community ?? [];

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<View style={styles.headerRow}>
				<Text style={styles.title}>Annotation</Text>
				<Pressable
					onPress={() => router.push('/(main)' as Href)}
					style={styles.homeBtn}
				>
					<Text style={styles.homeBtnText}>Retour à l'accueil</Text>
				</Pressable>
			</View>

			<View style={styles.filtersBar}>
				<Text style={styles.filterLabel}>Filtres :</Text>
				<View style={styles.filterPill}><Text style={styles.filterPillText}>moins annoté en premier</Text></View>
				<Text style={styles.filterHint}>{'// TODO filtres v2 (géoloc, espèces, dates…)'}</Text>
			</View>

			<Text style={styles.legend}>Double-clic pour démarrer l'annotation.</Text>

			<Section
				title="Mes médias"
				count={own.length}
				accent={COLORS.primary}
				emptyMsg="Tu n'as encore rien posté. Va dans « Mes Médias » pour faire un dépôt."
			>
				{own.map((t) => (
					<StudioFeedTile
						key={`own-${t.cvat_task_id}`}
						task={t}
						variant="own"
						disabled={claiming}
						onOpen={openTask}
					/>
				))}
			</Section>

			<Section
				title="Flux communautaire"
				count={community.length}
				accent={COLORS.success}
				emptyMsg="Aucun média validé disponible pour le moment. Reviens plus tard."
			>
				{community.map((t) => (
					<StudioFeedTile
						key={`com-${t.cvat_task_id}`}
						task={t}
						variant="community"
						disabled={claiming}
						onOpen={openTask}
					/>
				))}
			</Section>
		</ScrollView>
	);
};

const Section: React.FC<{
	title: string;
	count: number;
	accent: string;
	emptyMsg: string;
	children: React.ReactNode;
}> = ({ title, count, accent, emptyMsg, children }) => (
	<View style={styles.section}>
		<View style={styles.sectionHeader}>
			<View style={[styles.sectionDot, { backgroundColor: accent }]} />
			<Text style={styles.sectionTitle}>{title}</Text>
			<View style={styles.sectionCountWrap}>
				<Text style={styles.sectionCount}>{count}</Text>
			</View>
		</View>
		<View style={[styles.sectionAccent, { backgroundColor: accent }]} />
		{count === 0 ? (
			<Text style={styles.sectionEmpty}>{emptyMsg}</Text>
		) : (
			<View style={styles.tileGrid}>{children}</View>
		)}
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
	center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md },

	headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
	title: { ...TYPOGRAPHY.h1 },
	homeBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.background.card, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
	homeBtnText: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontWeight: '600' },

	filtersBar: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
		paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
		backgroundColor: COLORS.background.card, borderRadius: 8,
		borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
	},
	filterLabel: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '700' },
	filterPill: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 99, backgroundColor: COLORS.primary },
	filterPillText: { fontSize: 12, color: COLORS.text.inverse, fontWeight: '600' },
	filterHint: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic', marginLeft: 'auto' },

	legend: { fontSize: 12, color: COLORS.text.secondary, marginBottom: SPACING.md },

	section: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginBottom: SPACING.lg,
		overflow: 'hidden',
	},
	sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
	sectionDot: { width: 10, height: 10, borderRadius: 5 },
	sectionTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	sectionCountWrap: { marginLeft: 'auto', backgroundColor: COLORS.background.main, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 999, minWidth: 28, alignItems: 'center' },
	sectionCount: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700' },
	sectionAccent: { height: 3, width: '100%' },
	sectionEmpty: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.md },

	tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, padding: SPACING.md },

	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
	retryBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: 8 },
	retryText: { ...TYPOGRAPHY.body, color: COLORS.text.inverse, fontWeight: '600' },
});
