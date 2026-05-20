import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Modal, Platform } from 'react-native';
import { useRouter, Href } from 'expo-router';
import {
	AdminService,
	ContestationItem,
	ContestationUploaderDetail,
	ContestationLot,
	ContestationAction,
	ContestationKind,
} from '@/services/api/AdminService';
import { appApiClient } from '@/services/api/AppApiService';
import { videoApiBase } from '@/services/api/VideoService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { ImageWithBbox } from '@/shared/components/images/ImageWithBbox';
import { BboxOverlay } from '@/shared/components/images/BboxOverlay';
import { toast } from '@/shared/toast/Toast';
import { RankBadge } from '@/shared/components/RankBadge';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props {
	userId: number;
	kind?: ContestationKind;
}

function fmtDate(iso: string | null): string {
	if (!iso) return '—';
	try {
		return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	} catch { return iso; }
}

export const AdminContestationDetailScreen: React.FC<Props> = ({ userId, kind = 'media' }) => {
	const router = useRouter();
	const service = useMemo(() => new AdminService(), []);
	const [detail, setDetail] = useState<ContestationUploaderDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [lastClicked, setLastClicked] = useState<number | null>(null);
	const [lightboxItem, setLightboxItem] = useState<ContestationItem | null>(null);
	const flatIdsRef = useRef<number[]>([]);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await service.getContestationsForUploader(userId, kind);
			setDetail(data);
			setSelected(new Set());
			setLastClicked(null);
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.');
		} finally {
			setLoading(false);
		}
	}, [service, userId, kind]);

	useEffect(() => { load(); }, [load]);

	useEffect(() => {
		flatIdsRef.current = detail
			? detail.lots.flatMap((lot) => lot.items.map((i) => i.contestation_id))
			: [];
	}, [detail]);

	const handleItemClick = (contestationId: number, evt: any) => {
		const native = evt?.nativeEvent || {};
		const shift = !!native.shiftKey;
		const ctrlOrMeta = !!native.ctrlKey || !!native.metaKey;

		if (shift && lastClicked !== null) {
			const ids = flatIdsRef.current;
			const a = ids.indexOf(lastClicked);
			const b = ids.indexOf(contestationId);
			if (a >= 0 && b >= 0) {
				const [start, end] = a < b ? [a, b] : [b, a];
				setSelected(new Set(ids.slice(start, end + 1)));
			}
			return;
		}
		if (ctrlOrMeta) {
			setSelected((prev) => {
				const next = new Set(prev);
				if (next.has(contestationId)) next.delete(contestationId);
				else next.add(contestationId);
				return next;
			});
			setLastClicked(contestationId);
			return;
		}
		setSelected(new Set([contestationId]));
		setLastClicked(contestationId);
	};

	const toggleLot = (lot: ContestationLot) => {
		const lotIds = lot.items.map((i) => i.contestation_id);
		const allSelected = lotIds.every((id) => selected.has(id));
		setSelected((prev) => {
			const next = new Set(prev);
			if (allSelected) lotIds.forEach((id) => next.delete(id));
			else lotIds.forEach((id) => next.add(id));
			return next;
		});
	};

	const resolveSelected = async (action: ContestationAction) => {
		if (selected.size === 0 || submitting) return;
		const ids = Array.from(selected);
		setSubmitting(true);
		try {
			const result = await service.resolveContestations(ids, action, kind);
			const label = action === 'overturned' ? 'contestation(s) acceptée(s)' : 'rejet(s) maintenu(s)';
			toast.success(`${result.resolved} ${label}.`);
			if (result.cvat_delete_errors && result.cvat_delete_errors.length > 0) {
				toast.info(`${result.cvat_delete_errors.length} suppression(s) CVAT échouée(s), à réessayer.`);
			}
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error ?? err?.message ?? 'Résolution impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}
	if (!detail) {
		return <View style={styles.center}><Text style={TYPOGRAPHY.body}>Données introuvables.</Text></View>;
	}

	const { uploader, lots } = detail;
	const totalItems = lots.reduce((s, l) => s + l.items.length, 0);
	const reviewerMap = new Map<string, { username: string; actions: number }>();
	lots.forEach((l) => l.items.forEach((i) => {
		const m = i.reviewer;
		if (!m?.username) return;
		const existing = reviewerMap.get(m.username);
		if (!existing) reviewerMap.set(m.username, { username: m.username, actions: m.actions_validated_total ?? 0 });
	}));
	const reviewers = Array.from(reviewerMap.values());
	const reviewerLabel = kind === 'annotation' ? 'Curator(s) certifiant(s)' : 'Modérateur(s) impliqué(s)';

	return (
		<View style={styles.container}>
			<View style={styles.topBar}>
				<Pressable onPress={() => router.replace('/(main)/admin/contestations' as Href)} style={styles.backBtn}>
					<Text style={styles.backText}>‹ Liste</Text>
				</Pressable>
				<Text style={styles.title}>
					Contestations — {uploader.username ?? `#${uploader.id}`}
				</Text>
			</View>

			<View style={styles.row}>
				<View style={styles.leftColumn}>
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Auteur</Text>
						<Text style={styles.userName}>{uploader.username}#{uploader.id}</Text>
						<Text style={styles.userMeta}>{uploader.email || '—'}</Text>
						<View style={styles.roleBadge}>
							<Text style={styles.roleBadgeText}>{uploader.role}</Text>
						</View>
						<View style={{ marginTop: 4 }}>
							<RankBadge actions={uploader.actions_validated_total ?? 0} size="sm" withCount />
						</View>
						{uploader.is_active === false ? (
							<Text style={styles.banWarn}>⚠ Compte actuellement désactivé</Text>
						) : null}
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>{reviewerLabel}</Text>
						{reviewers.length === 0 ? (
							<Text style={styles.subdued}>Inconnu</Text>
						) : reviewers.map((m) => (
							<View key={m.username} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
								<Text style={styles.modName}>{m.username}</Text>
								<RankBadge actions={m.actions} size="sm" />
							</View>
						))}
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>Sélection</Text>
						<Text style={styles.legendItem}>Clic → choisir un média</Text>
						<Text style={styles.legendItem}>Maj + clic → plage</Text>
						<Text style={styles.legendItem}>Ctrl/Cmd + clic → ajouter/retirer</Text>
						<Text style={styles.legendItem}>Bouton lot → coche/décoche tout le lot</Text>
						<Text style={styles.legendItem}>{selected.size} contestation(s) sélectionnée(s) sur {totalItems}</Text>
					</View>
				</View>

				<ScrollView style={styles.centerColumn} contentContainerStyle={styles.centerContent}>
					{lots.length === 0 ? (
						<View style={styles.emptyState}>
							<Text style={styles.emptyText}>Aucune contestation ouverte.</Text>
						</View>
					) : lots.map((lot, idx) => {
						const lotIds = lot.items.map((i) => i.contestation_id);
						const allSelected = lotIds.every((id) => selected.has(id));
						return (
							<View key={idx} style={styles.lot}>
								<View style={styles.lotHeader}>
									<View style={{ flex: 1 }}>
										<Text style={styles.lotMeta}>
											Lot · {lot.items.length} média{lot.items.length > 1 ? 's' : ''} · contesté{lot.items.length > 1 ? 's' : ''} {fmtDate(lot.first_contested_at)}
										</Text>
										<Text style={styles.lotMessage}>« {lot.message || '(message vide)'} »</Text>
									</View>
									<Pressable onPress={() => toggleLot(lot)} style={styles.lotSelectBtn}>
										<Text style={styles.lotSelectText}>
											{allSelected ? '☑ Tout désélectionner' : '☐ Tout sélectionner'}
										</Text>
									</Pressable>
								</View>

								<View style={styles.tiles}>
									{lot.items.map((item) => {
										const isSelected = selected.has(item.contestation_id);
										const orphan = !item.task;
										return (
											<Pressable
												key={item.contestation_id}
												onPress={(e) => handleItemClick(item.contestation_id, e)}
												style={[styles.tile, isSelected && styles.tileSelected, orphan && styles.tileOrphan]}
											>
												{orphan ? (
													<View style={[styles.tileImage, styles.tileImageMissing]}>
														<Text style={styles.tileMissingText}>Média supprimé</Text>
													</View>
												) : item.media_kind === 'video' ? (
													item.video?.has_poster
														? <AuthenticatedImage url={`${videoApiBase}/${item.video.id}/poster`} style={styles.tileImage} />
														: <View style={[styles.tileImage, styles.tileImageMissing]}><Text style={styles.tileMissingText}>🎬 Vidéo</Text></View>
												) : (
													<View style={styles.tileImageWrap}>
														<ImageWithBbox
															url={`/moderation/media/${item.cvat_task_id}/preview`}
															client={appApiClient}
															bboxPoints={kind === 'annotation' && item.chosen_bbox ? item.chosen_bbox.points : null}
															initialWidth={item.image_width ?? null}
															initialHeight={item.image_height ?? null}
															onDoubleClickWeb={kind === 'annotation' ? () => setLightboxItem(item) : undefined}
														/>
													</View>
												)}
												<View style={styles.tileFooter}>
													<Text style={styles.tileName} numberOfLines={1}>
														{item.media_kind === 'video'
															? (item.video?.filename ?? `Vidéo #${item.video_id}`)
															: (item.task?.name ?? `#${item.cvat_task_id}`)}
													</Text>
													{kind === 'media' ? (
														<Text style={styles.tileReason} numberOfLines={2}>
															Rejet : {item.rejection_reason || '—'}
														</Text>
													) : (
														<>
															{item.species ? (
																<View style={{ gap: 1 }}>
																	<Text style={styles.tileSpecies} numberOfLines={2}>
																		<Text style={styles.tileSpeciesLabel}>Espèce : </Text>
																		{item.species.usage_name || '—'}
																		{item.species.polynesian_name ? ` (${item.species.polynesian_name})` : ''}
																	</Text>
																	{item.species.scientific_name ? (
																		<Text style={styles.tileSpeciesScientific} numberOfLines={1}>
																			{item.species.scientific_name}
																		</Text>
																	) : null}
																</View>
															) : (
																<Text style={styles.tileReason}>Espèce inconnue</Text>
															)}
															<Text style={styles.tileReason} numberOfLines={2}>
																Mode : {item.certification_mode === 'create' ? 'bbox curator' : 'bbox annotateur retenue'}
																{item.certification_comment ? ` · « ${item.certification_comment} »` : ''}
															</Text>
														</>
													)}
													<Text style={styles.tileMod}>
														par {item.reviewer?.username ?? '?'} · {fmtDate(item.reviewed_at)}
													</Text>
												</View>
											</Pressable>
										);
									})}
								</View>
							</View>
						);
					})}
				</ScrollView>

				<View style={styles.rightColumn}>
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Verdict</Text>
						<Text style={styles.fieldHint}>
							{kind === 'media'
								? 'Accepter rétablit le média en « validé ». Refuser maintient le rejet et supprime la tâche CVAT (données binaires).'
								: 'Accepter efface complètement la certification du curator (bbox, espèce, audit) et renvoie le média en pool de curation. Refuser maintient l\'annotation telle quelle.'}
						</Text>
						<Pressable
							onPress={() => resolveSelected('overturned')}
							disabled={selected.size === 0 || submitting}
							style={[styles.actionBtn, styles.acceptBtn, (selected.size === 0 || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>
								Accepter la contestation ({selected.size})
							</Text>
						</Pressable>
						<Pressable
							onPress={() => resolveSelected('upheld')}
							disabled={selected.size === 0 || submitting}
							style={[styles.actionBtn, styles.rejectBtn, (selected.size === 0 || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>
								Refuser la contestation ({selected.size})
							</Text>
						</Pressable>
					</View>
				</View>
			</View>

			<BboxLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
		</View>
	);
};

function BboxLightbox({ item, onClose }: { item: ContestationItem | null; onClose: () => void }) {
	const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
	useEffect(() => {
		setNatural(item?.image_width && item?.image_height ? { w: item.image_width, h: item.image_height } : null);
	}, [item?.contestation_id, item?.image_width, item?.image_height]);

	if (!item || item.media_kind !== 'image' || !item.cvat_task_id) return null;

	const species = item.species;
	const bbox = item.chosen_bbox?.points ?? null;

	return (
		<Modal visible animationType="fade" transparent onRequestClose={onClose}>
			<Pressable style={lightboxStyles.backdrop} onPress={onClose}>
				<Pressable style={lightboxStyles.panel} onPress={(e) => e.stopPropagation()}>
					<View style={lightboxStyles.imageCol}>
						<View style={lightboxStyles.imageFrame}>
							<AuthenticatedImage
								url={`/moderation/media/${item.cvat_task_id}/frame?number=0&quality=original`}
								style={lightboxStyles.image}
								resizeMode="contain"
								client={appApiClient}
								onNaturalSize={natural ? undefined : (w, h) => setNatural({ w, h })}
							/>
							{bbox && natural ? (
								<BboxOverlay points={bbox} imageWidth={natural.w} imageHeight={natural.h} />
							) : null}
						</View>
					</View>

					<ScrollView style={lightboxStyles.sideCol} contentContainerStyle={lightboxStyles.sideContent}>
						<Text style={lightboxStyles.sideTitle}>Détails de la certification</Text>

						<View style={lightboxStyles.field}>
							<Text style={lightboxStyles.fieldLabel}>Média</Text>
							<Text style={lightboxStyles.fieldValue}>{item.task?.name ?? `#${item.cvat_task_id}`}</Text>
						</View>

						<View style={lightboxStyles.field}>
							<Text style={lightboxStyles.fieldLabel}>Espèce certifiée</Text>
							{species ? (
								<>
									<Text style={lightboxStyles.fieldValue}>
										{species.usage_name || '—'}
										{species.polynesian_name ? `  (${species.polynesian_name})` : ''}
									</Text>
									{species.scientific_name ? (
										<Text style={lightboxStyles.fieldScientific}>{species.scientific_name}</Text>
									) : null}
									{species.tags && species.tags.length > 0 ? (
										<View style={lightboxStyles.tagRow}>
											{species.tags.map((t) => (
												<View key={t} style={lightboxStyles.tag}>
													<Text style={lightboxStyles.tagText}>{t}</Text>
												</View>
											))}
										</View>
									) : null}
								</>
							) : (
								<Text style={lightboxStyles.fieldMissing}>Espèce inconnue</Text>
							)}
						</View>

						<View style={lightboxStyles.field}>
							<Text style={lightboxStyles.fieldLabel}>Bounding box</Text>
							{bbox ? (
								<>
									<Text style={lightboxStyles.fieldValueMono}>
										x1, y1 : {Math.round(bbox[0])}, {Math.round(bbox[1])}
									</Text>
									<Text style={lightboxStyles.fieldValueMono}>
										x2, y2 : {Math.round(bbox[2])}, {Math.round(bbox[3])}
									</Text>
									<Text style={lightboxStyles.fieldValueMono}>
										Taille : {Math.round(Math.abs(bbox[2] - bbox[0]))} × {Math.round(Math.abs(bbox[3] - bbox[1]))} px
									</Text>
								</>
							) : (
								<Text style={lightboxStyles.fieldMissing}>Aucune bbox enregistrée.</Text>
							)}
						</View>

						<View style={lightboxStyles.field}>
							<Text style={lightboxStyles.fieldLabel}>Mode</Text>
							<Text style={lightboxStyles.fieldValue}>
								{item.certification_mode === 'create' ? 'Bbox tracée par le curator' :
								 item.certification_mode === 'review' ? 'Bbox d\'un annotateur validée' : '—'}
							</Text>
						</View>

						{item.certification_comment ? (
							<View style={lightboxStyles.field}>
								<Text style={lightboxStyles.fieldLabel}>Commentaire du curator</Text>
								<Text style={lightboxStyles.fieldValue}>« {item.certification_comment} »</Text>
							</View>
						) : null}

						<View style={lightboxStyles.field}>
							<Text style={lightboxStyles.fieldLabel}>Certifié par</Text>
							<Text style={lightboxStyles.fieldValue}>
								{item.reviewer?.username ?? '?'}
								{item.reviewed_at ? ` · ${fmtDate(item.reviewed_at)}` : ''}
							</Text>
						</View>
					</ScrollView>

					<Pressable style={lightboxStyles.closeBtn} onPress={onClose}>
						<Text style={lightboxStyles.closeBtnText}>✕</Text>
					</Pressable>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

const lightboxStyles = StyleSheet.create({
	backdrop: {
		flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
		alignItems: 'center', justifyContent: 'center',
		padding: SPACING.xl,
	},
	panel: {
		flexDirection: 'row', backgroundColor: COLORS.background.card,
		borderRadius: 12, overflow: 'hidden',
		width: '95%', maxWidth: 1400, height: '90%',
	},
	imageCol: { flex: 1, backgroundColor: '#000', padding: SPACING.md },
	imageFrame: { flex: 1, position: 'relative' },
	image: { width: '100%', height: '100%' },
	sideCol: { width: 340, borderLeftWidth: 1, borderLeftColor: COLORS.border },
	sideContent: { padding: SPACING.lg, gap: SPACING.md },
	sideTitle: { ...TYPOGRAPHY.h2, fontSize: 16, marginBottom: SPACING.xs },
	field: { gap: 4 },
	fieldLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
	fieldValue: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontWeight: '600' },
	fieldScientific: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },
	fieldValueMono: { fontFamily: Platform.OS === 'web' ? ('ui-monospace, monospace' as any) : 'monospace', fontSize: 12, color: COLORS.text.primary },
	fieldMissing: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },
	tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
	tag: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 99, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	tagText: { fontSize: 11, color: COLORS.text.primary },
	closeBtn: { position: 'absolute', top: SPACING.sm, right: SPACING.sm, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
	closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg, gap: SPACING.sm },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	topBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
	backBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	backText: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.text.primary },
	title: { ...TYPOGRAPHY.h1 },

	row: { flex: 1, flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
	leftColumn: { width: 240, gap: SPACING.sm },
	centerColumn: { flex: 1 },
	centerContent: { gap: SPACING.md, paddingBottom: SPACING.lg },
	rightColumn: { width: 260, gap: SPACING.sm },

	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: 4,
	},
	cardTitle: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
	userName: { ...TYPOGRAPHY.body, fontWeight: '700' },
	userMeta: { fontSize: 12, color: COLORS.text.secondary },
	roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: COLORS.primary, marginTop: 4 },
	roleBadgeText: { fontSize: 11, color: COLORS.text.inverse, fontWeight: '700' },
	banWarn: { fontSize: 12, color: COLORS.danger, marginTop: 4 },
	subdued: { fontSize: 13, color: COLORS.text.secondary, fontStyle: 'italic' },
	modName: { fontSize: 13, color: COLORS.text.primary, fontWeight: '500' },
	legendItem: { fontSize: 11, color: COLORS.text.secondary, marginTop: 2 },

	lot: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: SPACING.sm,
	},
	lotHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	lotMeta: { fontSize: 11, color: COLORS.text.secondary, textTransform: 'uppercase', fontWeight: '700' },
	lotMessage: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontStyle: 'italic', marginTop: 2 },
	lotSelectBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	lotSelectText: { fontSize: 11, fontWeight: '600', color: COLORS.text.primary },

	tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
	tile: { width: 180, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', backgroundColor: COLORS.background.main },
	tileSelected: { borderColor: COLORS.primary, borderWidth: 2 },
	tileOrphan: { opacity: 0.7 },
	tileImageWrap: { width: '100%', height: 120, position: 'relative' },
	tileImage: { width: '100%', height: 120 },
	tileImageMissing: { backgroundColor: COLORS.background.imagePlaceholder, alignItems: 'center', justifyContent: 'center' },
	tileMissingText: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
	tileFooter: { padding: SPACING.sm, gap: 2 },
	tileName: { fontSize: 12, fontWeight: '700', color: COLORS.text.primary },
	tileReason: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
	tileSpeciesLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700' },
	tileSpecies: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	tileSpeciesScientific: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
	tileMod: { fontSize: 10, color: COLORS.text.placeholder },

	emptyState: { padding: SPACING.xl, alignItems: 'center' },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	actionBtn: { paddingVertical: SPACING.sm, borderRadius: 6, alignItems: 'center', marginTop: SPACING.xs },
	actionBtnText: { ...TYPOGRAPHY.body, color: COLORS.text.inverse, fontWeight: '700', fontSize: 13 },
	acceptBtn: { backgroundColor: '#16a34a' },
	rejectBtn: { backgroundColor: COLORS.danger },
	btnDisabled: { opacity: 0.4 },
	fieldHint: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic', marginBottom: 4, lineHeight: 16 },
});
