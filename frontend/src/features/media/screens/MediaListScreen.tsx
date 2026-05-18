import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { useRouter, Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AppApiService, ContestItem, ModerationStatus, ModerationStatusEntry } from '@/services/api/AppApiService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { ImageLightbox } from '@/shared/components/images/ImageLightbox';
import { ContestModal } from '../components/ContestModal';
import { MyVideosSection } from '../components/MyVideosSection';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface TaskWithStatus {
	id: number;
	name: string;
	status: ModerationStatus;
	review_comment: string | null;
}

const SECTION_ORDER: ModerationStatus[] = ['validated', 'pending', 'rejected'];

const SECTION_LABELS: Record<ModerationStatus, string> = {
	validated: 'Validé',
	pending:   'En attente',
	rejected:  'Rejeté',
};

const SECTION_COLORS: Record<ModerationStatus, string> = {
	validated: COLORS.status.validated,
	pending:   COLORS.status.pending,
	rejected:  COLORS.status.error,
};

const POLL_INTERVAL_MS = 15_000;
const DOUBLE_CLICK_MS  = 400;

export const MediaListScreen: React.FC = () => {
	const router = useRouter();
	const cvatService = useRef(new CvatMediaService()).current;
	const appService  = useRef(new AppApiService()).current;

	const [tasks,        setTasks]        = useState<TaskWithStatus[]>([]);
	const [selected,     setSelected]     = useState<Set<number>>(new Set());
	const [lastClicked,  setLastClicked]  = useState<number | null>(null);
	const [lightboxUrl,  setLightboxUrl]  = useState<string | null>(null);
	const [submitting,   setSubmitting]   = useState(false);
	const [contestOpen,  setContestOpen]  = useState(false);
	const lastClickRef = useRef<{ id: number; time: number } | null>(null);

	const loadTasks = useCallback(async () => {
		const [cvatTasks, moderationEntries] = await Promise.all([
			cvatService.getTasks({ ownedByMe: true }),
			appService.getMyModerationStatuses().catch(() => [] as ModerationStatusEntry[]),
		]);
		const statusByTask = new Map<number, ModerationStatusEntry>();
		moderationEntries.forEach((e) => {
			if (e.media_kind === 'image' && e.cvat_task_id != null) statusByTask.set(e.cvat_task_id, e);
		});

		const merged: TaskWithStatus[] = cvatTasks.map((t: any) => {
			const entry = statusByTask.get(t.id);
			return {
				id: t.id,
				name: t.name,
				status: entry?.status ?? 'pending',
				review_comment: entry?.review_comment ?? null,
			};
		});
		setTasks(merged);
		setSelected((prev) => {
			const stillExisting = new Set<number>();
			const validIds = new Set(merged.map((m) => m.id));
			prev.forEach((id) => { if (validIds.has(id)) stillExisting.add(id); });
			return stillExisting;
		});
	}, [cvatService, appService]);

	useFocusEffect(useCallback(() => {
		let cancelled = false;
		const tick = () => { if (!cancelled) loadTasks().catch(() => {}); };
		tick();
		const id = setInterval(tick, POLL_INTERVAL_MS);
		return () => { cancelled = true; clearInterval(id); };
	}, [loadTasks]));

	const grouped: Record<ModerationStatus, TaskWithStatus[]> = {
		validated: [],
		pending:   [],
		rejected:  [],
	};
	tasks.forEach((t) => grouped[t.status].push(t));
	const orderedIds = SECTION_ORDER.flatMap((s) => grouped[s].map((t) => t.id));

	const handleClick = (taskId: number, evt: any) => {
		const now = Date.now();
		const last = lastClickRef.current;
		if (last && last.id === taskId && now - last.time < DOUBLE_CLICK_MS) {
			lastClickRef.current = null;
			setLightboxUrl(`/tasks/${taskId}/data?type=frame&number=0&quality=original`);
			return;
		}
		lastClickRef.current = { id: taskId, time: now };

		const native = evt?.nativeEvent || {};
		const shift = !!native.shiftKey;
		const ctrlOrMeta = !!native.ctrlKey || !!native.metaKey;

		if (shift && lastClicked !== null) {
			const a = orderedIds.indexOf(lastClicked);
			const b = orderedIds.indexOf(taskId);
			if (a >= 0 && b >= 0) {
				const [start, end] = a < b ? [a, b] : [b, a];
				setSelected(new Set(orderedIds.slice(start, end + 1)));
			}
			return;
		}
		if (ctrlOrMeta) {
			const next = new Set(selected);
			if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
			setSelected(next);
			setLastClicked(taskId);
			return;
		}
		setSelected(new Set([taskId]));
		setLastClicked(taskId);
	};

	const selectionCount = selected.size;
	const selectedStatuses = new Set<ModerationStatus>();
	tasks.forEach((t) => { if (selected.has(t.id)) selectedStatuses.add(t.status); });
	const canContest = selectionCount > 0
		&& selectedStatuses.size === 1
		&& selectedStatuses.has('rejected');

	const handleDeleteSelected = () => {
		if (selectionCount === 0 || submitting) return;
		const ids = Array.from(selected);
		const confirmMsg = `Supprimer ${ids.length} média${ids.length > 1 ? 's' : ''} ? Cette action est irréversible.`;
		const doDelete = async () => {
			setSubmitting(true);
			try {
				await Promise.all(ids.map((id) => cvatService.deleteTask(id)));
				toast.success(ids.length === 1 ? 'Média supprimé.' : `${ids.length} médias supprimés.`);
				setSelected(new Set());
				await loadTasks();
			} catch {
				toast.error('Impossible de supprimer la sélection.');
			} finally {
				setSubmitting(false);
			}
		};
		if (Platform.OS === 'web') {
			if (window.confirm(confirmMsg)) doDelete();
		} else {
			Alert.alert('Supprimer la sélection', confirmMsg, [
				{ text: 'Annuler', style: 'cancel' },
				{ text: 'Supprimer', style: 'destructive', onPress: doDelete },
			]);
		}
	};

	const handleConfirmContest = async (message: string) => {
		if (!canContest || submitting) return;
		setSubmitting(true);
		const count = selected.size;
		try {
			const items: ContestItem[] = Array.from(selected).map((id) => ({ kind: 'image', id }));
			const result = await appService.contestRejection(items, message);
			const alreadyContested = result.already_contested ?? 0;
			if (result.created === 0 && alreadyContested > 0) {
				toast.error(alreadyContested === 1
					? 'Ce média a déjà été contesté.'
					: `Ces ${alreadyContested} médias ont déjà été contestés.`);
			} else if (alreadyContested > 0) {
				toast.info(`${result.created} contestation(s) envoyée(s), ${alreadyContested} déjà contesté(s).`);
			} else {
				toast.success(count === 1 ? 'Contestation envoyée.' : `${result.created} contestations envoyées.`);
			}
			setContestOpen(false);
			setSelected(new Set());
		} catch (err: any) {
			const data = err?.response?.data;
			if (err?.response?.status === 409 && data?.already_contested) {
				toast.error(data.already_contested === 1
					? 'Ce média a déjà été contesté.'
					: `Ces ${data.already_contested} médias ont déjà été contestés.`);
			} else {
				toast.error(data?.error || err?.message || 'Contestation impossible.');
			}
		} finally {
			setSubmitting(false);
		}
	};

	const renderTile = (item: TaskWithStatus) => {
		const isSelected = selected.has(item.id);
		return (
			<Pressable
				key={item.id}
				onPress={(e) => handleClick(item.id, e)}
				style={[styles.tile, isSelected && styles.tileSelected]}
			>
				<AuthenticatedImage url={`/tasks/${item.id}/preview`} style={styles.tileImage} />
				<Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
				<View style={[styles.tileBadge, { backgroundColor: SECTION_COLORS[item.status] }]}>
					<Text style={styles.tileBadgeText}>{SECTION_LABELS[item.status]}</Text>
				</View>
				{item.status === 'rejected' && item.review_comment ? (
					<Text style={styles.tileComment} numberOfLines={2}>{item.review_comment}</Text>
				) : null}
			</Pressable>
		);
	};

	return (
		<View style={styles.container}>
			<View style={styles.topBar}>
				<Text style={styles.title}>Mes Médias</Text>
				<Pressable
					onPress={() => router.push('/(main)/upload' as Href)}
					style={styles.uploadBtn}
				>
					<Text style={styles.uploadBtnText}>+ Nouveau Dépôt</Text>
				</Pressable>
			</View>

			<View style={styles.toolbar}>
				<Text style={styles.toolbarText}>
					Photos : {tasks.length} · {selectionCount} sélectionnée{selectionCount > 1 ? 's' : ''}
				</Text>
				<View style={styles.toolbarActions}>
					<Pressable
						onPress={handleDeleteSelected}
						disabled={selectionCount === 0 || submitting}
						style={[styles.actionBtn, styles.deleteBtn, (selectionCount === 0 || submitting) && styles.btnDisabled]}
					>
						<Text style={styles.actionBtnText}>Supprimer ({selectionCount})</Text>
					</Pressable>
					<Pressable
						onPress={() => setContestOpen(true)}
						disabled={!canContest || submitting}
						style={[styles.actionBtn, styles.contestBtn, (!canContest || submitting) && styles.btnDisabled]}
					>
						<Text style={styles.actionBtnText}>Contester le rejet ({canContest ? selectionCount : 0})</Text>
					</Pressable>
				</View>
			</View>

			<View style={styles.legendRow}>
				<Text style={styles.legendItem}>Clic → choisir un média</Text>
				<Text style={styles.legendDot}>·</Text>
				<Text style={styles.legendItem}>Maj + clic → plage</Text>
				<Text style={styles.legendDot}>·</Text>
				<Text style={styles.legendItem}>Ctrl/Cmd + clic → ajouter/retirer</Text>
				<Text style={styles.legendDot}>·</Text>
				<Text style={styles.legendItem}>Double-clic → aperçu</Text>
			</View>

			<View style={styles.mainRow}>
				<MyVideosSection mode="media" />
				<View style={styles.dividerWide} />
				<View style={styles.photosWrap}>
					{tasks.length === 0 ? (
						<View style={styles.emptyState}>
							<Text style={styles.emptyText}>Aucune photo téléversée pour l'instant.</Text>
						</View>
					) : (
						<View style={styles.columns}>
							{SECTION_ORDER.map((status, idx) => {
								const list = grouped[status];
								return (
									<React.Fragment key={status}>
										<View style={styles.column}>
											<View style={styles.columnHeader}>
												<View style={[styles.columnDot, { backgroundColor: SECTION_COLORS[status] }]} />
												<Text style={styles.columnTitle}>{SECTION_LABELS[status]}</Text>
												<View style={styles.columnCountWrap}>
													<Text style={styles.columnCount}>{list.length}</Text>
												</View>
											</View>
											<View style={[styles.columnAccent, { backgroundColor: SECTION_COLORS[status] }]} />
											<ScrollView contentContainerStyle={styles.tileGrid}>
												{list.length === 0 ? (
													<Text style={styles.columnEmpty}>Aucun média.</Text>
												) : list.map(renderTile)}
											</ScrollView>
										</View>
										{idx < SECTION_ORDER.length - 1 ? <View style={styles.divider} /> : null}
									</React.Fragment>
								);
							})}
						</View>
					)}
				</View>
			</View>

			<ContestModal
				visible={contestOpen}
				count={selectionCount}
				submitting={submitting}
				onCancel={() => setContestOpen(false)}
				onConfirm={handleConfirmContest}
			/>

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

	topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
	title: { ...TYPOGRAPHY.h1 },
	uploadBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6 },
	uploadBtnText: { color: COLORS.text.inverse, fontWeight: '600' },

	toolbar: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginBottom: SPACING.sm,
	},
	toolbarText: { fontSize: 13, color: COLORS.text.secondary },
	toolbarActions: { flexDirection: 'row', gap: SPACING.sm },

	legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.md },
	legendItem: { fontSize: 12, color: COLORS.text.secondary },
	legendDot: { fontSize: 12, color: COLORS.text.placeholder },

	mainRow: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
	dividerWide: { width: SPACING.lg },
	photosWrap: { flex: 1 },

	emptyState: { padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 8 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	columns: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
	column: {
		flex: 1,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		overflow: 'hidden',
	},
	columnHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: SPACING.sm,
		paddingHorizontal: SPACING.md,
		paddingVertical: SPACING.sm,
	},
	columnDot: { width: 10, height: 10, borderRadius: 5 },
	columnTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	columnCountWrap: {
		marginLeft: 'auto',
		backgroundColor: COLORS.background.main,
		paddingHorizontal: SPACING.sm,
		paddingVertical: 2,
		borderRadius: 999,
		minWidth: 28,
		alignItems: 'center',
	},
	columnCount: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700' },
	columnAccent: { height: 3, width: '100%' },
	columnEmpty: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.md },
	divider: { width: SPACING.md },

	tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, padding: SPACING.sm },
	tile: {
		width: 130,
		padding: SPACING.xs,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: 'transparent',
		backgroundColor: COLORS.background.main,
	},
	tileSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.background.card },
	tileImage: { width: 114, height: 114, borderRadius: 4 },
	tileName: { fontSize: 12, marginTop: SPACING.xs, color: COLORS.text.primary },
	tileBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
	tileBadgeText: { ...TYPOGRAPHY.badge, color: COLORS.text.inverse },
	tileComment: { fontSize: 11, color: COLORS.text.secondary, marginTop: 4, fontStyle: 'italic' },

	actionBtn: {
		paddingHorizontal: SPACING.md,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		alignItems: 'center',
	},
	deleteBtn: { backgroundColor: COLORS.danger },
	contestBtn: { backgroundColor: COLORS.primary },
	btnDisabled: { opacity: 0.4 },
	actionBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },
});
