import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
	Platform, Modal,
} from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { RankBadge } from '@/shared/components/RankBadge';
import { useRouter, Href } from 'expo-router';
import { ModerationService, ModerationItem, ModerationMediaEntry, ModerationUploader } from '@/services/api/ModerationService';
import { appApiClient } from '@/services/api/AppApiService';
import { videoApiBase } from '@/services/api/VideoService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { BanModal } from '../components/BanModal';
import { RejectReasonPicker } from '../components/RejectReasonPicker';
import { formatVideoDuration } from '@/shared/utils/formatters';
import { canSanction } from '@/shared/utils/permissions';
import { getUserProfile } from '@/services/api/authStorage';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const DOUBLE_CLICK_MS = 400;

interface Props { userId: number; }

function itemKey(e: ModerationMediaEntry): string {
	return e.kind === 'image' ? `image:${e.cvat_task_id}` : `video:${e.video_id}`;
}
function parseKey(k: string): ModerationItem | null {
	const [kind, idStr] = k.split(':');
	const id = Number(idStr);
	if ((kind !== 'image' && kind !== 'video') || !Number.isInteger(id)) return null;
	return { kind, id };
}

export const ModerationUserScreen: React.FC<Props> = ({ userId }) => {
	const router = useRouter();
	const service = new ModerationService();

	const [user, setUser] = useState<ModerationUploader | null>(null);
	const [media, setMedia] = useState<ModerationMediaEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [lastClicked, setLastClicked] = useState<string | null>(null);
	const [rejectComment, setRejectComment] = useState('');
	const [banModalOpen, setBanModalOpen] = useState(false);
	const [previewVideoId, setPreviewVideoId] = useState<number | null>(null);

	const lastClickRef = useRef<{ key: string; time: number } | null>(null);

	const orderedKeys = useMemo(() => media.map(itemKey), [media]);

	const load = async () => {
		setLoading(true);
		try {
			const data = await service.getUserMedia(userId);
			setUser(data.user);
			setMedia(data.results);
			setSelected(new Set());
			setLastClicked(null);
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Chargement impossible.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, [userId]);

	const handleClick = (entry: ModerationMediaEntry, evt: any) => {
		const key = itemKey(entry);
		const now = Date.now();
		const last = lastClickRef.current;
		if (last && last.key === key && now - last.time < DOUBLE_CLICK_MS) {
			lastClickRef.current = null;
			if (entry.kind === 'image') {
				router.push(`/(main)/moderation/${userId}/${entry.cvat_task_id}` as Href);
			} else {
				setPreviewVideoId(entry.video_id);
			}
			return;
		}
		lastClickRef.current = { key, time: now };

		const native = evt?.nativeEvent || {};
		const shift = !!native.shiftKey;
		const ctrlOrMeta = !!native.ctrlKey || !!native.metaKey;

		if (shift && lastClicked !== null) {
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

	const selectedItems = useMemo<ModerationItem[]>(() => {
		return Array.from(selected).map(parseKey).filter((x): x is ModerationItem => x !== null);
	}, [selected]);

	const handleValidate = async () => {
		if (selectedItems.length === 0 || submitting) return;
		setSubmitting(true);
		const count = selectedItems.length;
		try {
			const result = await service.validateMedia(selectedItems);
			const updated = result?.updated ?? count;
			if (updated !== count) {
				toast.info(`${updated} média(s) validé(s) (sur ${count} demandés — certains n'étaient plus en attente).`);
			} else {
				toast.success(count === 1 ? 'Média validé.' : `${count} médias validés.`);
			}
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Validation impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleReject = async () => {
		if (selectedItems.length === 0 || submitting) return;
		if (!rejectComment.trim()) {
			toast.error('Sélectionne un motif avant de rejeter.');
			return;
		}
		const count = selectedItems.length;
		setSubmitting(true);
		try {
			const result = await service.rejectMedia(selectedItems, rejectComment.trim());
			const updated = result?.updated ?? count;
			if (updated !== count) {
				toast.info(`${updated} média(s) rejeté(s) (sur ${count} demandés — certains n'étaient plus en attente).`);
			} else {
				toast.success(count === 1 ? 'Média rejeté.' : `${count} médias rejetés.`);
			}
			setRejectComment('');
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Rejet impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleBan = async (durationDays: number | null, reason: string) => {
		if (!user || submitting) return;
		setSubmitting(true);
		try {
			await service.banUser(user.id, { duration_days: durationDays, reason });
			toast.success('Utilisateur banni.');
			setBanModalOpen(false);
			router.replace('/(main)/moderation' as Href);
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Bannissement impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;
	}
	if (!user) {
		return <View style={styles.center}><Text style={TYPOGRAPHY.body}>Utilisateur introuvable.</Text></View>;
	}

	const selectionEmpty = selected.size === 0;
	const imageCount = media.filter((m) => m.kind === 'image').length;
	const videoCount = media.filter((m) => m.kind === 'video').length;

	return (
		<View style={styles.container}>
			<View style={styles.topBar}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Text style={styles.backText}>‹ File</Text>
				</Pressable>
				<Text style={styles.title}>Médias en attente — {user.username}#{user.id}</Text>
			</View>

			<View style={styles.row}>
				<View style={styles.leftColumn}>
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Auteur</Text>
						<Text style={styles.userName}>{user.username}#{user.id}</Text>
						<Text style={styles.userMeta}>{user.email}</Text>
						<View style={styles.roleBadge}>
							<Text style={styles.roleBadgeText}>{user.role}</Text>
						</View>
						<View style={{ marginTop: SPACING.sm }}>
							<RankBadge actions={user.actions_validated_total ?? 0} size="md" withCount />
						</View>
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>Sélection</Text>
						<Text style={styles.legendItem}>Clic → choisir</Text>
						<Text style={styles.legendItem}>Maj + clic → plage</Text>
						<Text style={styles.legendItem}>Ctrl/Cmd + clic → ajouter/retirer</Text>
						<Text style={styles.legendItem}>Double-clic photo → détail</Text>
						<Text style={styles.legendItem}>Double-clic vidéo → lecteur</Text>
					</View>
				</View>

				<View style={styles.centerColumn}>
					<View style={styles.toolbar}>
						<Text style={styles.toolbarText}>
							{media.length} média(s) · 🖼 {imageCount} · 🎥 {videoCount} · {selected.size} sélectionné(s)
						</Text>
					</View>
					<ScrollView contentContainerStyle={styles.grid}>
						{media.length === 0 ? (
							<View style={styles.emptyState}>
								<Text style={styles.emptyText}>Aucun média en attente pour cet utilisateur.</Text>
							</View>
						) : (
							media.map((entry) => {
								const key = itemKey(entry);
								const isSelected = selected.has(key);
								if (entry.kind === 'image') {
									return (
										<Pressable
											key={key}
											onPress={(e) => handleClick(entry, e)}
											style={[styles.tile, isSelected && styles.tileSelected]}
										>
											<AuthenticatedImage
												url={`/moderation/media/${entry.cvat_task_id}/preview`}
												style={styles.tileImage}
												client={appApiClient}
											/>
											<Text style={styles.tileName} numberOfLines={1}>{entry.task.name}</Text>
										</Pressable>
									);
								}
								return (
									<Pressable
										key={key}
										onPress={(e) => handleClick(entry, e)}
										style={[styles.tile, isSelected && styles.tileSelected]}
									>
										<View style={styles.videoPoster}>
											{entry.video.has_poster
												? <AuthenticatedImage url={`${videoApiBase}/${entry.video.id}/poster`} style={styles.tileImage} />
												: <View style={[styles.tileImage, styles.videoFallback]}><Text style={styles.videoFallbackText}>🎬</Text></View>}
											<View style={styles.videoBadge}>
												<Text style={styles.videoBadgeText}>VIDÉO</Text>
											</View>
											<View style={styles.videoDuration}>
												<Text style={styles.videoDurationText}>{formatVideoDuration(entry.video.duration_seconds)}</Text>
											</View>
										</View>
										<Text style={styles.tileName} numberOfLines={1}>{entry.video.filename}</Text>
									</Pressable>
								);
							})
						)}
					</ScrollView>
				</View>

				<View style={styles.rightColumn}>
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Validation</Text>
						<Pressable
							onPress={handleValidate}
							disabled={selectionEmpty || submitting}
							style={[styles.actionBtn, styles.validateBtn, (selectionEmpty || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Valider la sélection</Text>
						</Pressable>
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>Rejet</Text>
						<Text style={styles.fieldLabel}>Motif</Text>
						<RejectReasonPicker value={rejectComment} onChange={setRejectComment} disabled={submitting} />
						<Pressable
							onPress={handleReject}
							disabled={selectionEmpty || submitting}
							style={[styles.actionBtn, styles.rejectBtn, (selectionEmpty || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Rejeter la sélection</Text>
						</Pressable>
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>Sanction</Text>
						<Text style={styles.cascadeHint}>
							Tous les médias en attente de cet utilisateur seront automatiquement rejetés.
						</Text>
						{(() => {
							const profile = getUserProfile();
							const actor = profile ? { id: profile.id, role: profile.appRole ?? 'annotator', is_superuser: !!profile.is_superuser } : null;
							const target = { id: user.id, role: user.role, is_superuser: user.is_superuser, is_staff: user.is_staff };
							const check = actor ? canSanction(actor, target, 'bannir') : { allowed: false, reason: 'Session invalide.' };
							const blocked = !check.allowed;
							return (
								<>
									<Pressable
										onPress={() => setBanModalOpen(true)}
										disabled={submitting || blocked}
										style={[styles.actionBtn, styles.banBtn, (submitting || blocked) && styles.btnDisabled]}
									>
										<Text style={styles.actionBtnText}>Bannir l'utilisateur</Text>
									</Pressable>
									{blocked && check.reason ? (
										<Text style={styles.blockedReason}>🔒 {check.reason}</Text>
									) : null}
								</>
							);
						})()}
					</View>
				</View>
			</View>

			<BanModal
				visible={banModalOpen}
				userLabel={`${user.username}#${user.id}`}
				submitting={submitting}
				defaultReason={rejectComment}
				onCancel={() => setBanModalOpen(false)}
				onConfirm={handleBan}
			/>

			<VideoPreviewModal videoId={previewVideoId} onClose={() => setPreviewVideoId(null)} />
		</View>
	);
};

const VideoPreviewModal: React.FC<{ videoId: number | null; onClose: () => void }> = ({ videoId, onClose }) => {
	if (videoId === null) return null;
	const src = `${videoApiBase}/${videoId}/stream`;
	return (
		<Modal visible animationType="fade" transparent onRequestClose={onClose}>
			<View style={previewStyles.backdrop}>
				<View style={previewStyles.card}>
					<View style={previewStyles.header}>
						<Text style={previewStyles.title}>Lecture vidéo</Text>
						<Pressable onPress={onClose} style={previewStyles.close} hitSlop={8}>
							<Text style={previewStyles.closeText}>✕</Text>
						</Pressable>
					</View>
					{Platform.OS === 'web' ? (
						<div style={{ width: '100%', maxHeight: '70vh', display: 'flex', justifyContent: 'center' }}>
							{/* @ts-ignore */}
							<video
								src={src}
								controls
								crossOrigin="use-credentials"
								controlsList="nodownload"
								onContextMenu={(e: any) => e.preventDefault()}
								style={{ maxWidth: '100%', maxHeight: '70vh', background: '#000' }}
							/>
						</div>
					) : null}
				</View>
			</View>
		</Modal>
	);
};

const previewStyles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
	card: { width: '100%', maxWidth: 900, backgroundColor: COLORS.background.card, borderRadius: 10, padding: SPACING.md },
	header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
	title: { ...TYPOGRAPHY.h2, fontSize: 16 },
	close: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.background.main, alignItems: 'center', justifyContent: 'center' },
	closeText: { fontSize: 16, fontWeight: '600' },
});

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	topBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg },
	backBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
	backText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
	title: { ...TYPOGRAPHY.h1 },
	row: { flexDirection: 'row', flex: 1, gap: SPACING.md },
	leftColumn: { width: 240, gap: SPACING.md },
	rightColumn: { width: 280, gap: SPACING.md },
	centerColumn: { flex: 1 },

	card: {
		backgroundColor: COLORS.background.card,
		padding: SPACING.md,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	cardTitle: { ...TYPOGRAPHY.h2, marginBottom: SPACING.sm },
	userName: { ...TYPOGRAPHY.body, fontWeight: '600' },
	userMeta: { fontSize: 13, color: COLORS.text.secondary, marginTop: 2 },
	roleBadge: { alignSelf: 'flex-start', marginTop: SPACING.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 4, backgroundColor: COLORS.background.main },
	roleBadgeText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600' },

	legendItem: { fontSize: 13, color: COLORS.text.secondary, marginVertical: 2 },

	toolbar: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: 8, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
	toolbarText: { fontSize: 13, color: COLORS.text.secondary },

	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
	tile: { width: 140, padding: SPACING.xs, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', backgroundColor: COLORS.background.card },
	tileSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.background.main },
	tileImage: { width: 124, height: 124, borderRadius: 4 },
	tileName: { fontSize: 12, marginTop: SPACING.xs, color: COLORS.text.primary },

	videoPoster: { position: 'relative', width: 124, height: 124 },
	videoFallback: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
	videoFallbackText: { fontSize: 32, color: '#fff' },
	videoBadge: { position: 'absolute', top: 4, left: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: COLORS.primary },
	videoBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.text.inverse, letterSpacing: 0.5 },
	videoDuration: { position: 'absolute', right: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.75)' },
	videoDurationText: { color: '#fff', fontSize: 11, fontWeight: '600' },

	emptyState: { flex: 1, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 8 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	actionBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, marginTop: SPACING.sm, alignItems: 'center' },
	validateBtn: { backgroundColor: COLORS.success },
	rejectBtn: { backgroundColor: COLORS.warning },
	banBtn: { backgroundColor: COLORS.danger },
	btnDisabled: { opacity: 0.5 },
	actionBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 14 },

	fieldLabel: { fontSize: 12, color: COLORS.text.secondary, marginTop: SPACING.md, marginBottom: SPACING.xs, fontWeight: '600' },
	cascadeHint: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic', marginBottom: SPACING.xs },
	blockedReason: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic', marginTop: 6, lineHeight: 15 },
});
