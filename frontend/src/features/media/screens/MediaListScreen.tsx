import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { confirm } from '@/shared/utils/dialog';
import { toast } from '@/shared/toast/Toast';
import { useRouter, Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AppApiService, ContestItem, ModerationStatus, ModerationStatusEntry } from '@/services/api/AppApiService';
import { VideoService, UserVideo } from '@/services/api/VideoService';
import { ImageLightbox } from '@/shared/components/images/ImageLightbox';
import { ContestModal } from '../components/ContestModal';
import { MediaTile, MediaItem, MediaKind } from '../components/MediaTile';
import { VideoPreviewModal } from '../components/VideoPreviewModal';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

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

// Item interne avec statut de modération attaché, séparé du type MediaTile (UI).
// Type intersection (pas `interface extends`) car MediaItem est une union discriminée.
type MediaWithStatus = MediaItem & { status: ModerationStatus };

// Clé composite utilisée pour la sélection : "image:42" / "video:5".
type MediaKey = `${MediaKind}:${number}`;
function makeKey(kind: MediaKind, id: number): MediaKey { return `${kind}:${id}`; }
function parseKey(key: MediaKey): { kind: MediaKind; id: number } {
	const [kind, idStr] = key.split(':') as [MediaKind, string];
	return { kind, id: Number(idStr) };
}

export const MediaListScreen: React.FC = () => {
	const router = useRouter();
	const cvatService = useRef(new CvatMediaService()).current;
	const appService  = useRef(new AppApiService()).current;
	const videoService = useRef(new VideoService()).current;

	const [media,         setMedia]         = useState<MediaWithStatus[]>([]);
	const [selected,      setSelected]      = useState<Set<MediaKey>>(new Set());
	const [lastClicked,   setLastClicked]   = useState<MediaKey | null>(null);
	const [lightboxUrl,   setLightboxUrl]   = useState<string | null>(null);
	const [previewVideoId, setPreviewVideoId] = useState<number | null>(null);
	const [submitting,    setSubmitting]    = useState(false);
	const [contestOpen,   setContestOpen]   = useState(false);
	const lastClickRef = useRef<{ key: MediaKey; time: number } | null>(null);

	const loadMedia = useCallback(async () => {
		const [cvatTasks, moderationEntries, videos] = await Promise.all([
			cvatService.getTasks({ ownedByMe: true }),
			appService.getMyModerationStatuses().catch(() => [] as ModerationStatusEntry[]),
			videoService.list().catch(() => [] as UserVideo[]),
		]);

		const imageStatusById = new Map<number, ModerationStatusEntry>();
		moderationEntries.forEach((entry) => {
			if (entry.media_kind === 'image' && entry.cvat_task_id != null) {
				imageStatusById.set(entry.cvat_task_id, entry);
			}
		});

		const images: MediaWithStatus[] = cvatTasks.map((task: any) => {
			const entry = imageStatusById.get(task.id);
			const status = (entry?.status ?? 'pending') as ModerationStatus;
			return {
				kind: 'image',
				id: task.id,
				name: task.name,
				status,
				statusComment: status === 'rejected' ? entry?.review_comment ?? null : null,
			};
		});

		const videoItems: MediaWithStatus[] = videos.map((video) => {
			const status = (video.moderation_status ?? 'pending') as ModerationStatus;
			return {
				kind: 'video',
				id: video.id,
				name: video.filename,
				status,
				statusComment: status === 'rejected' ? video.moderation_review_comment ?? null : null,
				hasPoster: video.has_poster,
				durationSeconds: video.duration_seconds,
			};
		});

		const merged = [...images, ...videoItems];
		setMedia(merged);

		// Nettoie la sélection des items disparus (média supprimé, vidéo soft-deleted).
		setSelected((prev) => {
			const validKeys = new Set(merged.map((m) => makeKey(m.kind, m.id)));
			const next = new Set<MediaKey>();
			prev.forEach((key) => { if (validKeys.has(key)) next.add(key); });
			return next;
		});
	}, [cvatService, appService, videoService]);

	useFocusEffect(useCallback(() => {
		let cancelled = false;
		const tick = () => { if (!cancelled) loadMedia().catch(() => {}); };
		tick();
		const id = setInterval(tick, POLL_INTERVAL_MS);
		return () => { cancelled = true; clearInterval(id); };
	}, [loadMedia]));

	const groupedByStatus = useMemo(() => {
		const groups: Record<ModerationStatus, MediaWithStatus[]> = {
			validated: [], pending: [], rejected: [],
		};
		media.forEach((m) => groups[m.status].push(m));
		return groups;
	}, [media]);

	const orderedKeys: MediaKey[] = useMemo(
		() => SECTION_ORDER.flatMap((s) => groupedByStatus[s].map((m) => makeKey(m.kind, m.id))),
		[groupedByStatus],
	);

	const selectionCount = selected.size;
	const selectedItems = useMemo(
		() => media.filter((m) => selected.has(makeKey(m.kind, m.id))),
		[media, selected],
	);
	// Contestation : exige que TOUS les médias sélectionnés soient rejetés. Un seul
	// validé/pending dans la sélection désactive le bouton.
	const canContest = selectedItems.length > 0
		&& selectedItems.every((m) => m.status === 'rejected');

	const handleTilePress = (item: MediaWithStatus, evt: any) => {
		const key = makeKey(item.kind, item.id);
		const now = Date.now();
		const last = lastClickRef.current;

		// Double-clic image → lightbox plein écran.
		if (item.kind === 'image' && last && last.key === key && now - last.time < DOUBLE_CLICK_MS) {
			lastClickRef.current = null;
			setLightboxUrl(`/tasks/${item.id}/data?type=frame&number=0&quality=original`);
			return;
		}
		lastClickRef.current = { key, time: now };

		const native = evt?.nativeEvent || {};
		const shiftPressed = !!native.shiftKey;
		const ctrlOrMeta = !!native.ctrlKey || !!native.metaKey;

		if (shiftPressed && lastClicked) {
			const a = orderedKeys.indexOf(lastClicked);
			const b = orderedKeys.indexOf(key);
			if (a >= 0 && b >= 0) {
				const [start, end] = a < b ? [a, b] : [b, a];
				setSelected(new Set(orderedKeys.slice(start, end + 1)));
			}
			return;
		}
		if (ctrlOrMeta) {
			const next = new Set(selected);
			if (next.has(key)) next.delete(key); else next.add(key);
			setSelected(next);
			setLastClicked(key);
			return;
		}
		setSelected(new Set([key]));
		setLastClicked(key);
	};

	const handleDeleteSelected = async () => {
		if (selectionCount === 0 || submitting) return;
		const keys = Array.from(selected);
		const confirmMsg = `Supprimer ${keys.length} média${keys.length > 1 ? 's' : ''} ? Cette action est irréversible.`;
		const proceed = await confirm(confirmMsg, { title: 'Supprimer la sélection', confirmLabel: 'Supprimer', destructive: true });
		if (!proceed) return;
		setSubmitting(true);
		try {
			await Promise.all(keys.map((key) => {
				const { kind, id } = parseKey(key);
				return kind === 'image' ? cvatService.deleteTask(id) : videoService.delete(id);
			}));
			toast.success(keys.length === 1 ? 'Média supprimé.' : `${keys.length} médias supprimés.`);
			setSelected(new Set());
			await loadMedia();
		} catch {
			toast.error('Impossible de supprimer la sélection.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleConfirmContest = async (message: string) => {
		if (!canContest || submitting) return;
		setSubmitting(true);
		const count = selectionCount;
		try {
			const items: ContestItem[] = Array.from(selected).map((key) => {
				const { kind, id } = parseKey(key);
				return { kind, id };
			});
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
				toast.error(data?.error || err?.message || 'Impossible d\'envoyer la contestation.');
			}
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.topBar}>
				<Text style={styles.title}>Mes Médias</Text>
				<Pressable onPress={() => router.push('/(main)/upload' as Href)} style={styles.uploadBtn}>
					<Text style={styles.uploadBtnText}>+ Nouveau Dépôt</Text>
				</Pressable>
			</View>

			<View style={styles.toolbar}>
				<Text style={styles.toolbarText}>
					{media.length} média{media.length > 1 ? 's' : ''} · {selectionCount} sélectionné{selectionCount > 1 ? 's' : ''}
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
				<Text style={styles.legendItem}>Clic → choisir</Text>
				<Text style={styles.legendDot}>·</Text>
				<Text style={styles.legendItem}>Maj + clic → plage</Text>
				<Text style={styles.legendDot}>·</Text>
				<Text style={styles.legendItem}>Ctrl/Cmd + clic → ajouter/retirer</Text>
				<Text style={styles.legendDot}>·</Text>
				<Text style={styles.legendItem}>Double-clic image → aperçu</Text>
				<Text style={styles.legendDot}>·</Text>
				<Text style={styles.legendItem}>▶ → lire la vidéo</Text>
			</View>

			{media.length === 0 ? (
				<View style={styles.emptyState}>
					<Text style={styles.emptyText}>Aucun média téléversé pour l'instant.</Text>
				</View>
			) : (
				<View style={styles.columns}>
					{SECTION_ORDER.map((status, idx) => {
						const items = groupedByStatus[status];
						return (
							<React.Fragment key={status}>
								<View style={styles.column}>
									<View style={styles.columnHeader}>
										<View style={[styles.columnDot, { backgroundColor: SECTION_COLORS[status] }]} />
										<Text style={styles.columnTitle}>{SECTION_LABELS[status]}</Text>
										<View style={styles.columnCountWrap}>
											<Text style={styles.columnCount}>{items.length}</Text>
										</View>
									</View>
									<View style={[styles.columnAccent, { backgroundColor: SECTION_COLORS[status] }]} />
									<ScrollView contentContainerStyle={styles.tileGrid}>
										{items.length === 0 ? (
											<Text style={styles.columnEmpty}>Aucun média.</Text>
										) : items.map((item) => (
											<MediaTile
												key={makeKey(item.kind, item.id)}
												item={item}
												selected={selected.has(makeKey(item.kind, item.id))}
												onPress={(evt) => handleTilePress(item, evt)}
												onPlayVideo={item.kind === 'video' ? setPreviewVideoId : undefined}
											/>
										))}
									</ScrollView>
								</View>
								{idx < SECTION_ORDER.length - 1 ? <View style={styles.divider} /> : null}
							</React.Fragment>
						);
					})}
				</View>
			)}

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

			<VideoPreviewModal
				videoId={previewVideoId}
				onClose={() => setPreviewVideoId(null)}
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

	actionBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6 },
	deleteBtn: { backgroundColor: COLORS.danger },
	contestBtn: { backgroundColor: COLORS.primary },
	btnDisabled: { opacity: 0.4 },
	actionBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },

	legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.md },
	legendItem: { fontSize: 12, color: COLORS.text.secondary },
	legendDot: { fontSize: 12, color: COLORS.text.placeholder },

	columns: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
	column: { flex: 1, backgroundColor: COLORS.background.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
	columnHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
	columnDot: { width: 10, height: 10, borderRadius: 5 },
	columnTitle: { ...TYPOGRAPHY.h2, fontSize: 15 },
	columnCountWrap: { marginLeft: 'auto', backgroundColor: COLORS.background.main, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 999, minWidth: 28, alignItems: 'center' },
	columnCount: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700' },
	columnAccent: { height: 3, width: '100%' },
	columnEmpty: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.md, textAlign: 'center' },

	tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, padding: SPACING.sm },
	divider: { width: SPACING.md },

	emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
});
