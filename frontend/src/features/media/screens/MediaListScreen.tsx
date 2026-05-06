import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Button, Pressable, Alert, Platform } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AppApiService, ModerationStatus, ModerationStatusEntry } from '@/services/api/AppApiService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { ImageLightbox } from '@/shared/components/images/ImageLightbox';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface TaskWithStatus {
	id: number;
	name: string;
	status: ModerationStatus;
	review_comment: string | null;
	reviewed_at: string | null;
}

const SECTION_ORDER: ModerationStatus[] = ['validated', 'pending', 'rejected'];

const SECTION_LABELS: Record<ModerationStatus, string> = {
	validated: 'Validé',
	pending: 'En attente',
	rejected: 'Rejeté',
};

const SECTION_COLORS: Record<ModerationStatus, string> = {
	validated: COLORS.status.validated,
	pending:   COLORS.status.pending,
	rejected:  COLORS.status.error,
};

const SECTION_BADGE_LABEL: Record<ModerationStatus, string> = {
	validated: 'VALIDÉ',
	pending:   'EN ATTENTE',
	rejected:  'REJETÉ',
};

const POLL_INTERVAL_MS = 15_000;

export const MediaListScreen: React.FC = () => {
	const [tasks, setTasks] = useState<TaskWithStatus[]>([]);
	const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
	const router = useRouter();
	const cvatService = useRef(new CvatMediaService()).current;
	const appService  = useRef(new AppApiService()).current;

	const loadTasks = useCallback(async () => {
		const [cvatTasks, moderationEntries] = await Promise.all([
			cvatService.getTasks({ ownedByMe: true }),
			appService.getMyModerationStatuses().catch(() => [] as ModerationStatusEntry[]),
		]);
		const statusByTask = new Map<number, ModerationStatusEntry>();
		moderationEntries.forEach((e) => statusByTask.set(e.cvat_task_id, e));

		const merged: TaskWithStatus[] = cvatTasks.map((t: any) => {
			const entry = statusByTask.get(t.id);
			return {
				id: t.id,
				name: t.name,
				status: entry?.status ?? 'pending',
				review_comment: entry?.review_comment ?? null,
				reviewed_at: entry?.reviewed_at ?? null,
			};
		});
		setTasks(merged);
	}, [cvatService, appService]);

	useFocusEffect(useCallback(() => {
		let cancelled = false;
		const tick = () => { if (!cancelled) loadTasks().catch(() => {}); };
		tick();
		const id = setInterval(tick, POLL_INTERVAL_MS);
		return () => { cancelled = true; clearInterval(id); };
	}, [loadTasks]));

	const handleDelete = (taskId: number, taskName: string) => {
		const doDelete = async () => {
			try {
				await cvatService.deleteTask(taskId);
				setTasks((prev) => prev.filter((t) => t.id !== taskId));
			} catch {
				Alert.alert('Erreur', 'Impossible de supprimer ce média.');
			}
		};

		if (Platform.OS === 'web') {
			if (window.confirm(`Supprimer "${taskName}" ? Cette action est irréversible.`)) {
				doDelete();
			}
		} else {
			Alert.alert(
				'Supprimer le média',
				`Supprimer "${taskName}" ? Cette action est irréversible.`,
				[
					{ text: 'Annuler', style: 'cancel' },
					{ text: 'Supprimer', style: 'destructive', onPress: doDelete },
				]
			);
		}
	};

	const grouped: Record<ModerationStatus, TaskWithStatus[]> = {
		validated: [],
		pending:   [],
		rejected:  [],
	};
	tasks.forEach((t) => grouped[t.status].push(t));

	const renderTask = (item: TaskWithStatus) => {
		const previewUrl = `/tasks/${item.id}/preview`;
		const showRejectComment = item.status === 'rejected' && !!item.review_comment;
		return (
			<View key={item.id} style={styles.taskCard}>
				<Pressable onPress={() => setLightboxUrl(previewUrl)}>
					<AuthenticatedImage url={previewUrl} style={styles.thumbnail} />
				</Pressable>
				<View style={styles.info}>
					<Text style={TYPOGRAPHY.body}>{item.name}</Text>
					<View style={[styles.badge, { backgroundColor: SECTION_COLORS[item.status] }]}>
						<Text style={styles.badgeText}>{SECTION_BADGE_LABEL[item.status]}</Text>
					</View>
					{showRejectComment ? (
						<Text style={styles.rejectComment}>Motif : {item.review_comment}</Text>
					) : null}
				</View>
				<Pressable
					style={styles.deleteButton}
					onPress={() => handleDelete(item.id, item.name)}
				>
					<Text style={styles.deleteText}>✕</Text>
				</Pressable>
			</View>
		);
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Mes Médias</Text>
				<Button
					title="+ Nouveau Dépôt"
					onPress={() => router.push('/(main)/upload' as Href)}
					color={COLORS.primary}
				/>
			</View>

			<ScrollView contentContainerStyle={styles.scrollContent}>
				{tasks.length === 0 ? (
					<View style={styles.emptyState}>
						<Text style={styles.emptyText}>Aucun média trouvé.</Text>
					</View>
				) : SECTION_ORDER.map((status) => {
					const list = grouped[status];
					return (
						<View key={status} style={styles.section}>
							<View style={styles.sectionHeader}>
								<View style={[styles.sectionDot, { backgroundColor: SECTION_COLORS[status] }]} />
								<Text style={styles.sectionTitle}>{SECTION_LABELS[status]}</Text>
								<Text style={styles.sectionCount}>{list.length}</Text>
							</View>
							{list.length === 0 ? (
								<Text style={styles.sectionEmpty}>Aucun média dans cette catégorie.</Text>
							) : list.map(renderTask)}
						</View>
					);
				})}
			</ScrollView>

			<ImageLightbox
				isVisible={lightboxUrl !== null}
				imageUrl={lightboxUrl}
				onClose={() => setLightboxUrl(null)}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
	title: { ...TYPOGRAPHY.h1 },
	scrollContent: { paddingBottom: SPACING.xl },
	emptyState: { padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 8 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	section: { marginBottom: SPACING.lg },
	sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
	sectionDot: { width: 10, height: 10, borderRadius: 5 },
	sectionTitle: { ...TYPOGRAPHY.h2 },
	sectionCount: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '700' },
	sectionEmpty: {
		...TYPOGRAPHY.caption,
		color: COLORS.text.placeholder,
		fontStyle: 'italic',
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
	},

	taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background.card, padding: SPACING.md, borderRadius: 8, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
	thumbnail: { width: 60, height: 60, borderRadius: 4 },
	info: { flex: 1, marginLeft: SPACING.md, justifyContent: 'center' },
	badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
	badgeText: { ...TYPOGRAPHY.badge, color: COLORS.text.inverse },
	rejectComment: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginTop: 4, fontStyle: 'italic' },
	deleteButton: { padding: SPACING.sm, marginLeft: SPACING.sm },
	deleteText: { color: COLORS.status.error, fontSize: 16, fontWeight: 'bold' },
});
