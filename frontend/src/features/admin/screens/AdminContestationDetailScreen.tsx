import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Href } from 'expo-router';
import {
	AdminService,
	ContestationUploaderDetail,
	ContestationLot,
	ContestationAction,
	ContestationKind,
} from '@/services/api/AdminService';
import { appApiClient } from '@/services/api/AppApiService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
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
														<Text style={styles.tileMissingText}>Tâche supprimée</Text>
													</View>
												) : (
													<AuthenticatedImage
														url={`/moderation/media/${item.cvat_task_id}/preview`}
														style={styles.tileImage}
														client={appApiClient}
													/>
												)}
												<View style={styles.tileFooter}>
													<Text style={styles.tileName} numberOfLines={1}>
														{item.task?.name ?? `#${item.cvat_task_id}`}
													</Text>
													{kind === 'media' ? (
														<Text style={styles.tileReason} numberOfLines={2}>
															Rejet : {item.rejection_reason || '—'}
														</Text>
													) : (
														<Text style={styles.tileReason} numberOfLines={2}>
															Mode : {item.certification_mode === 'create' ? 'bbox curator' : 'bbox annotateur retenue'}
															{item.certification_comment ? ` · « ${item.certification_comment} »` : ''}
														</Text>
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
								: 'Accepter rouvre la curation : le média redevient curateable, l\'audit reste. Refuser maintient l\'annotation telle quelle.'}
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
		</View>
	);
};

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
	tileImage: { width: '100%', height: 120 },
	tileImageMissing: { backgroundColor: COLORS.background.imagePlaceholder, alignItems: 'center', justifyContent: 'center' },
	tileMissingText: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
	tileFooter: { padding: SPACING.sm, gap: 2 },
	tileName: { fontSize: 12, fontWeight: '700', color: COLORS.text.primary },
	tileReason: { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
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
