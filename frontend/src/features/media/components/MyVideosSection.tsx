import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, Alert, Platform, ActivityIndicator } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { toast } from '@/shared/toast/Toast';
import { VideoService, UserVideo, videoApiBase } from '@/services/api/VideoService';
import { AppApiService, ContestItem } from '@/services/api/AppApiService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { ContestModal } from './ContestModal';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const POLL_INTERVAL_MS = 20_000;

const STATUS_LABEL: Record<string, string> = {
	validated: 'Validé',
	pending:   'En attente',
	rejected:  'Rejeté',
};
const STATUS_COLOR: Record<string, string> = {
	validated: COLORS.status.validated,
	pending:   COLORS.status.pending,
	rejected:  COLORS.status.error,
};

interface Props {
	mode: 'media' | 'studio';   // media = mes médias (peut tout faire), studio = sélection annotation
}

function fmtDuration(s: number | null): string {
	if (!s || s <= 0) return '—';
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60);
	return `${m}:${String(sec).padStart(2, '0')}`;
}

export const MyVideosSection: React.FC<Props> = ({ mode }) => {
	const router = useRouter();
	const svc = useRef(new VideoService()).current;
	const appSvc = useRef(new AppApiService()).current;
	const [videos, setVideos] = useState<UserVideo[]>([]);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [lastClicked, setLastClicked] = useState<number | null>(null);
	const [previewVideoId, setPreviewVideoId] = useState<number | null>(null);
	const [contestOpen, setContestOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		try {
			const rows = await svc.list();
			setVideos(rows);
		} catch (err: any) {
			console.warn('[videos] list failed', err?.message);
		} finally {
			setLoading(false);
		}
	}, [svc]);

	useEffect(() => {
		load();
		const id = setInterval(load, POLL_INTERVAL_MS);
		return () => clearInterval(id);
	}, [load]);

	const orderedIds = useMemo(() => videos.map((v) => v.id), [videos]);

	const handleClick = (id: number, evt: any) => {
		const native = evt?.nativeEvent || {};
		const shift = !!native.shiftKey;
		const ctrlOrMeta = !!native.ctrlKey || !!native.metaKey;
		if (shift && lastClicked !== null) {
			const a = orderedIds.indexOf(lastClicked);
			const b = orderedIds.indexOf(id);
			if (a >= 0 && b >= 0) {
				const [start, end] = a < b ? [a, b] : [b, a];
				setSelected(new Set(orderedIds.slice(start, end + 1)));
			}
			return;
		}
		if (ctrlOrMeta) {
			const next = new Set(selected);
			if (next.has(id)) next.delete(id); else next.add(id);
			setSelected(next);
			setLastClicked(id);
			return;
		}
		setSelected(new Set([id]));
		setLastClicked(id);
	};

	const selectionCount = selected.size;
	const selectedStatuses = new Set<string>();
	videos.forEach((v) => { if (selected.has(v.id) && v.moderation_status) selectedStatuses.add(v.moderation_status); });
	const canContest = mode === 'media' && selectionCount > 0
		&& selectedStatuses.size === 1 && selectedStatuses.has('rejected');

	const handleDelete = async () => {
		if (selectionCount === 0 || submitting) return;
		const ids = Array.from(selected);
		const msg = `Supprimer ${ids.length} vidéo${ids.length > 1 ? 's' : ''} ? Cette action est irréversible.`;
		const doDelete = async () => {
			setSubmitting(true);
			try {
				await Promise.all(ids.map((id) => svc.delete(id)));
				toast.success(ids.length === 1 ? 'Vidéo supprimée.' : `${ids.length} vidéos supprimées.`);
				setSelected(new Set());
				await load();
			} catch {
				toast.error('Suppression échouée.');
			} finally {
				setSubmitting(false);
			}
		};
		if (Platform.OS === 'web') { if (window.confirm(msg)) doDelete(); }
		else Alert.alert('Supprimer', msg, [
			{ text: 'Annuler', style: 'cancel' },
			{ text: 'Supprimer', style: 'destructive', onPress: doDelete },
		]);
	};

	const handleContest = async (message: string) => {
		if (!canContest || submitting) return;
		setSubmitting(true);
		const ids = Array.from(selected);
		try {
			const items: ContestItem[] = ids.map((id) => ({ kind: 'video', id }));
			const res = await appSvc.contestRejection(items, message);
			const already = res.already_contested ?? 0;
			if (res.created === 0 && already > 0) {
				toast.error(already === 1 ? 'Cette vidéo a déjà été contestée.' : `Ces ${already} vidéos ont déjà été contestées.`);
			} else if (already > 0) {
				toast.info(`${res.created} contestation(s) envoyée(s), ${already} déjà contestée(s).`);
			} else {
				toast.success(ids.length === 1 ? 'Contestation envoyée.' : `${res.created} contestations envoyées.`);
			}
			setContestOpen(false);
			setSelected(new Set());
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Contestation impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const openExtract = (videoId: number) => {
		router.push(`/(main)/studio/video/${videoId}` as Href);
	};

	const renderVideo = (v: UserVideo) => {
		const isSelected = selected.has(v.id);
		const status = v.moderation_status || 'pending';
		// Extraction autorisée tant que la vidéo n'est pas rejetée — pending et validated OK.
		// L'écran d'extraction n'est accessible que depuis la page Annoter (mode='studio'),
		// pas depuis Mes médias (mode='media').
		const canExtract = mode === 'studio' && status !== 'rejected';
		return (
			<Pressable
				key={v.id}
				onPress={(e) => handleClick(v.id, e)}
				style={[styles.tile, isSelected && styles.tileSelected]}
			>
				<View style={styles.posterWrap}>
					{v.has_poster
						? <AuthenticatedImage url={`${videoApiBase}/${v.id}/poster`} style={styles.poster} />
						: <View style={[styles.poster, styles.posterFallback]}><Text style={styles.posterFallbackText}>🎬</Text></View>}
					<View style={styles.playOverlay}>
						<Pressable onPress={() => setPreviewVideoId(v.id)} hitSlop={8} style={styles.playBtn}>
							<Text style={styles.playBtnText}>▶</Text>
						</Pressable>
					</View>
					<View style={styles.durationBadge}>
						<Text style={styles.durationBadgeText}>{fmtDuration(v.duration_seconds)}</Text>
					</View>
				</View>
				<Text style={styles.tileName} numberOfLines={1}>{v.filename}</Text>
				<View style={[styles.tileBadge, { backgroundColor: STATUS_COLOR[status] }]}>
					<Text style={styles.tileBadgeText}>{STATUS_LABEL[status]}</Text>
				</View>
				{status === 'rejected' && v.moderation_review_comment ? (
					<Text style={styles.tileComment} numberOfLines={2}>{v.moderation_review_comment}</Text>
				) : null}
				{canExtract ? (
					<Pressable onPress={() => openExtract(v.id)} style={styles.extractBtn}>
						<Text style={styles.extractBtnText}>Extraire des frames</Text>
					</Pressable>
				) : null}
			</Pressable>
		);
	};

	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<View style={[styles.titleDot, { backgroundColor: COLORS.primary }]} />
				<Text style={styles.title}>Mes vidéos</Text>
				<View style={styles.countWrap}>
					<Text style={styles.countText}>{videos.length}</Text>
				</View>
			</View>
			<View style={[styles.accent, { backgroundColor: COLORS.primary }]} />

			{mode === 'media' && videos.length > 0 ? (
				<View style={styles.toolbar}>
					<Text style={styles.toolbarText}>
						{selectionCount} sélectionnée{selectionCount > 1 ? 's' : ''}
					</Text>
					<View style={styles.toolbarActions}>
						<Pressable
							onPress={handleDelete}
							disabled={selectionCount === 0 || submitting}
							style={[styles.actionBtn, styles.deleteBtn, (selectionCount === 0 || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Supprimer</Text>
						</Pressable>
						<Pressable
							onPress={() => setContestOpen(true)}
							disabled={!canContest || submitting}
							style={[styles.actionBtn, styles.contestBtn, (!canContest || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Contester</Text>
						</Pressable>
					</View>
				</View>
			) : null}

			{loading ? (
				<View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
			) : videos.length === 0 ? (
				<Text style={styles.empty}>Aucune vidéo téléversée pour l'instant.</Text>
			) : (
				<ScrollView contentContainerStyle={styles.list}>
					{videos.map(renderVideo)}
				</ScrollView>
			)}

			<ContestModal
				visible={contestOpen}
				count={selectionCount}
				submitting={submitting}
				onCancel={() => setContestOpen(false)}
				onConfirm={handleContest}
			/>

			<VideoPreviewModal
				videoId={previewVideoId}
				onClose={() => setPreviewVideoId(null)}
			/>
		</View>
	);
};

const VideoPreviewModal: React.FC<{ videoId: number | null; onClose: () => void }> = ({ videoId, onClose }) => {
	if (videoId === null) return null;
	const src = `${videoApiBase}/${videoId}/stream`;
	return (
		<Modal visible animationType="fade" transparent onRequestClose={onClose}>
			<View style={styles.previewBackdrop}>
				<View style={styles.previewCard}>
					<View style={styles.previewHeader}>
						<Text style={styles.previewTitle}>Aperçu vidéo</Text>
						<Pressable onPress={onClose} style={styles.previewClose} hitSlop={8}>
							<Text style={styles.previewCloseText}>✕</Text>
						</Pressable>
					</View>
					{Platform.OS === 'web' ? (
						// eslint-disable-next-line react/no-danger
						<div style={{ width: '100%', maxHeight: '70vh', display: 'flex', justifyContent: 'center' }}>
							{/* @ts-ignore RN web supports raw HTML via raw JSX */}
							<video
								src={src}
								controls
								crossOrigin="use-credentials"
								controlsList="nodownload"
								onContextMenu={(e: any) => e.preventDefault()}
								style={{ maxWidth: '100%', maxHeight: '70vh', background: '#000' }}
							/>
						</div>
					) : (
						<Text style={styles.empty}>Aperçu vidéo : web uniquement.</Text>
					)}
				</View>
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	container: {
		width: 300,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		overflow: 'hidden',
	},
	headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
	titleDot: { width: 10, height: 10, borderRadius: 5 },
	title: { ...TYPOGRAPHY.h2, fontSize: 16 },
	countWrap: { marginLeft: 'auto', backgroundColor: COLORS.background.main, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 999, minWidth: 28, alignItems: 'center' },
	countText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700' },
	accent: { height: 3, width: '100%' },

	toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
	toolbarText: { fontSize: 12, color: COLORS.text.secondary },
	toolbarActions: { flexDirection: 'row', gap: SPACING.xs },

	actionBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 6 },
	deleteBtn: { backgroundColor: COLORS.danger },
	contestBtn: { backgroundColor: COLORS.primary },
	btnDisabled: { opacity: 0.4 },
	actionBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 12 },

	list: { padding: SPACING.sm, gap: SPACING.sm },
	center: { padding: SPACING.lg, alignItems: 'center' },
	empty: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', padding: SPACING.md, textAlign: 'center' },

	tile: { padding: SPACING.sm, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', backgroundColor: COLORS.background.main, marginBottom: SPACING.sm },
	tileSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.background.card },
	posterWrap: { position: 'relative', width: '100%', aspectRatio: 16 / 9, borderRadius: 4, overflow: 'hidden', backgroundColor: '#000' },
	poster: { width: '100%', height: '100%' },
	posterFallback: { justifyContent: 'center', alignItems: 'center' },
	posterFallbackText: { fontSize: 32, color: '#fff' },
	playOverlay: { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' } as any,
	playBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
	playBtnText: { color: '#fff', fontSize: 18, marginLeft: 2 },
	durationBadge: { position: 'absolute', right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.75)' },
	durationBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },

	tileName: { fontSize: 12, marginTop: SPACING.xs, color: COLORS.text.primary },
	tileBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
	tileBadgeText: { ...TYPOGRAPHY.badge, color: COLORS.text.inverse },
	tileComment: { fontSize: 11, color: COLORS.text.secondary, marginTop: 4, fontStyle: 'italic' },

	extractBtn: { marginTop: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.success, alignSelf: 'flex-start' },
	extractBtnText: { color: COLORS.text.inverse, fontSize: 12, fontWeight: '600' },

	previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
	previewCard: { width: '100%', maxWidth: 900, backgroundColor: COLORS.background.card, borderRadius: 10, padding: SPACING.md },
	previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
	previewTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	previewClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.background.main, alignItems: 'center', justifyContent: 'center' },
	previewCloseText: { fontSize: 16, fontWeight: '600' },
});
