import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter, Href } from 'expo-router';
import { AnnotationState, FeedTask, StudioFeed, StudioService } from '@/services/api/StudioService';
import { StudioFeedTile } from '../components/StudioFeedTile';
import { ContestModal } from '@/features/media/components/ContestModal';
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
	const [contestTarget, setContestTarget] = useState<FeedTask | null>(null);
	const [contestSubmitting, setContestSubmitting] = useState(false);

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
		if (task.annotation_state === 'curator_validated') {
			Alert.alert('Vue annotation finale', 'Cette vue sera disponible quand le studio curator sera construit.');
			return;
		}
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

	const handleContestConfirm = async (message: string) => {
		if (!contestTarget) return;
		setContestSubmitting(true);
		try {
			await service.contestAnnotation(contestTarget.cvat_task_id, message);
			setContestTarget(null);
			Alert.alert('Contestation envoyée', 'Ton message sera relayé à un administrateur.');
		} catch (err: any) {
			const msg = err?.response?.data?.error ?? err?.message ?? 'Contestation impossible.';
			Alert.alert('Erreur', typeof msg === 'string' ? msg : JSON.stringify(msg));
		} finally {
			setContestSubmitting(false);
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

	const ownByState: Record<AnnotationState, FeedTask[]> = {
		not_annotated:     [],
		annotated:         [],
		curator_validated: [],
	};
	own.forEach((t) => ownByState[t.annotation_state].push(t));

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<View style={styles.headerRow}>
				<Text style={styles.title}>Annotation</Text>
				<Pressable onPress={() => router.push('/(main)' as Href)} style={styles.homeBtn}>
					<Text style={styles.homeBtnText}>Retour à l'accueil</Text>
				</Pressable>
			</View>

			<View style={styles.filtersBar}>
				<Text style={styles.filterLabel}>Filtres :</Text>
				<View style={styles.filterPill}><Text style={styles.filterPillText}>moins annoté en premier</Text></View>
				<Text style={styles.filterHint}>{'// TODO filtres v2 (géoloc, espèces, dates…)'}</Text>
			</View>

			<View style={styles.legendBox}>
				<Text style={styles.legendIcon}>i</Text>
				<Text style={styles.legendText}>
					<Text style={styles.legendStrong}>Double-clic</Text> sur un média pour démarrer l'annotation. Sur un média validé, choisis « Voir » ou « Contester ».
				</Text>
			</View>

			<View style={styles.columns}>
				<View style={styles.ownCol}>
					<View style={styles.colHeader}>
						<View style={[styles.colDot, { backgroundColor: COLORS.primary }]} />
						<Text style={styles.colTitle}>Mes médias</Text>
						<View style={styles.colCountWrap}>
							<Text style={styles.colCount}>{own.length}</Text>
						</View>
					</View>
					<View style={[styles.colAccent, { backgroundColor: COLORS.primary }]} />

					<SubSection
						title="Non annoté"
						accent={COLORS.text.secondary}
						items={ownByState.not_annotated}
						claiming={claiming}
						emptyMsg="Tout est entamé."
						onOpen={openTask}
					/>
					<SubSection
						title="Annoté"
						accent={COLORS.primary}
						items={ownByState.annotated}
						claiming={claiming}
						emptyMsg="Pas encore d'annotation déposée."
						onOpen={openTask}
					/>
					<SubSection
						title="Validé par curator"
						accent={COLORS.success}
						items={ownByState.curator_validated}
						claiming={claiming}
						emptyMsg="Aucune validation finale pour le moment."
						onOpen={openTask}
						onContest={(t) => setContestTarget(t)}
					/>
				</View>

				<View style={styles.communityCol}>
					<View style={styles.colHeader}>
						<View style={[styles.colDot, { backgroundColor: COLORS.success }]} />
						<Text style={styles.colTitle}>Mur communautaire</Text>
						<View style={styles.colCountWrap}>
							<Text style={styles.colCount}>{community.length}</Text>
						</View>
					</View>
					<View style={[styles.colAccent, { backgroundColor: COLORS.success }]} />

					{community.length === 0 ? (
						<Text style={styles.subEmpty}>Aucun média validé disponible pour le moment.</Text>
					) : (
						<View style={styles.tileGrid}>
							{community.map((t) => (
								<StudioFeedTile
									key={`com-${t.cvat_task_id}`}
									task={t}
									disabled={claiming}
									onOpen={openTask}
								/>
							))}
						</View>
					)}
				</View>
			</View>

			<ContestModal
				visible={!!contestTarget}
				count={contestTarget ? 1 : 0}
				submitting={contestSubmitting}
				onCancel={() => setContestTarget(null)}
				onConfirm={handleContestConfirm}
			/>
		</ScrollView>
	);
};

const SubSection: React.FC<{
	title: string;
	accent: string;
	items: FeedTask[];
	claiming: boolean;
	emptyMsg: string;
	onOpen: (t: FeedTask) => void;
	onContest?: (t: FeedTask) => void;
}> = ({ title, accent, items, claiming, emptyMsg, onOpen, onContest }) => (
	<View style={styles.subSection}>
		<View style={styles.subHeader}>
			<View style={[styles.subDot, { backgroundColor: accent }]} />
			<Text style={styles.subTitle}>{title}</Text>
			<View style={styles.subCountWrap}>
				<Text style={styles.subCount}>{items.length}</Text>
			</View>
		</View>
		{items.length === 0 ? (
			<Text style={styles.subEmpty}>{emptyMsg}</Text>
		) : (
			<View style={styles.tileGrid}>
				{items.map((t) => (
					<StudioFeedTile
						key={`own-${t.cvat_task_id}`}
						task={t}
						disabled={claiming}
						onOpen={onOpen}
						onContest={onContest}
					/>
				))}
			</View>
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

	legendBox: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: SPACING.sm,
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		borderLeftWidth: 4,
		borderLeftColor: COLORS.primary,
		marginBottom: SPACING.md,
	},
	legendIcon: {
		width: 20, height: 20, borderRadius: 10,
		backgroundColor: COLORS.primary, color: COLORS.text.inverse,
		textAlign: 'center', fontWeight: '700', fontSize: 13, lineHeight: 20,
	},
	legendText: { fontSize: 13, color: COLORS.text.primary, flex: 1 },
	legendStrong: { fontWeight: '700', color: COLORS.primary },

	columns: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },

	ownCol: {
		flex: 2,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		overflow: 'hidden',
	},
	communityCol: {
		flex: 1,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		overflow: 'hidden',
	},
	colHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
	colDot: { width: 10, height: 10, borderRadius: 5 },
	colTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	colCountWrap: { marginLeft: 'auto', backgroundColor: COLORS.background.main, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 999, minWidth: 28, alignItems: 'center' },
	colCount: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700' },
	colAccent: { height: 3, width: '100%' },

	subSection: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
	subHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.sm },
	subDot: { width: 8, height: 8, borderRadius: 4 },
	subTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text.primary, textTransform: 'uppercase' },
	subCountWrap: { marginLeft: 'auto', backgroundColor: COLORS.background.main, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, minWidth: 22, alignItems: 'center' },
	subCount: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700' },
	subEmpty: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.md },

	tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, padding: SPACING.sm },

	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
	retryBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: 8 },
	retryText: { ...TYPOGRAPHY.body, color: COLORS.text.inverse, fontWeight: '600' },
});
