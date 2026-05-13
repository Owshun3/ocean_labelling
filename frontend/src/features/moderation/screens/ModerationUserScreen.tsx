import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
	Platform,
} from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { useRouter, Href } from 'expo-router';
import { ModerationService, ModerationMediaEntry, ModerationUploader } from '@/services/api/ModerationService';
import { appApiClient } from '@/services/api/AppApiService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { BanModal } from '../components/BanModal';
import { RejectReasonPicker } from '../components/RejectReasonPicker';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const DOUBLE_CLICK_MS = 400;

interface Props {
	userId: number;
}

export const ModerationUserScreen: React.FC<Props> = ({ userId }) => {
	const router = useRouter();
	const service = new ModerationService();

	const [user, setUser] = useState<ModerationUploader | null>(null);
	const [media, setMedia] = useState<ModerationMediaEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [lastClicked, setLastClicked] = useState<number | null>(null);
	const [rejectComment, setRejectComment] = useState('');
	const [banModalOpen, setBanModalOpen] = useState(false);

	const lastClickRef = useRef<{ id: number; time: number } | null>(null);
	const filtersState = useMemo(() => ({ filters: null as unknown, sort: null as unknown }), []);

	const orderedMedia = useMemo<ModerationMediaEntry[]>(() => {
		void filtersState;
		return media;
	}, [media, filtersState]);

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

	const handleClick = (taskId: number, evt: any) => {
		const now = Date.now();
		const last = lastClickRef.current;
		if (last && last.id === taskId && now - last.time < DOUBLE_CLICK_MS) {
			lastClickRef.current = null;
			router.push(`/(main)/moderation/${userId}/${taskId}` as Href);
			return;
		}
		lastClickRef.current = { id: taskId, time: now };

		const native = evt?.nativeEvent || {};
		const shift = !!native.shiftKey;
		const ctrlOrMeta = !!native.ctrlKey || !!native.metaKey;

		if (shift && lastClicked !== null) {
			const ids = orderedMedia.map((m) => m.cvat_task_id);
			const a = ids.indexOf(lastClicked);
			const b = ids.indexOf(taskId);
			if (a >= 0 && b >= 0) {
				const [start, end] = a < b ? [a, b] : [b, a];
				setSelected(new Set(ids.slice(start, end + 1)));
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

	const handleValidate = async () => {
		if (selected.size === 0 || submitting) return;
		setSubmitting(true);
		const count = selected.size;
		try {
			await service.validateMedia(Array.from(selected));
			toast.success(count === 1 ? 'Média validé.' : `${count} médias validés.`);
			await load();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Validation impossible.');
		} finally {
			setSubmitting(false);
		}
	};

	const proposeBanAfterReject = (count: number): boolean => {
		if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
		const label = count === 1 ? '1 média rejeté' : `${count} médias rejetés`;
		return window.confirm(`${label}. Veux-tu aussi sanctionner cet utilisateur (bannissement) ?`);
	};

	const handleReject = async () => {
		if (selected.size === 0 || submitting) return;
		const count = selected.size;
		setSubmitting(true);
		try {
			await service.rejectMedia(Array.from(selected), rejectComment || undefined);
			toast.success(count === 1 ? 'Média rejeté.' : `${count} médias rejetés.`);
			setRejectComment('');
			await load();
			setSubmitting(false);
			if (proposeBanAfterReject(count)) setBanModalOpen(true);
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Rejet impossible.');
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
		return (
			<View style={styles.center}>
				<ActivityIndicator color={COLORS.primary} />
			</View>
		);
	}

	if (!user) {
		return (
			<View style={styles.center}>
				<Text style={TYPOGRAPHY.body}>Utilisateur introuvable.</Text>
			</View>
		);
	}

	const selectionEmpty = selected.size === 0;

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
						<Text style={styles.rankPlaceholder}>Rang : —</Text>
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>Sélection</Text>
						<Text style={styles.legendItem}>Clic → choisir un média</Text>
						<Text style={styles.legendItem}>Maj + clic → plage</Text>
						<Text style={styles.legendItem}>Ctrl/Cmd + clic → ajouter/retirer</Text>
						<Text style={styles.legendItem}>Double-clic → ouvrir le détail</Text>
					</View>
				</View>

				<View style={styles.centerColumn}>
					<View style={styles.toolbar}>
						<Text style={styles.toolbarText}>
							{orderedMedia.length} média(s) · {selected.size} sélectionné(s)
						</Text>
					</View>
					<ScrollView contentContainerStyle={styles.grid}>
						{orderedMedia.length === 0 ? (
							<View style={styles.emptyState}>
								<Text style={styles.emptyText}>Aucun média en attente pour cet utilisateur.</Text>
							</View>
						) : (
							orderedMedia.map((entry) => {
								const isSelected = selected.has(entry.cvat_task_id);
								return (
									<Pressable
										key={entry.cvat_task_id}
										onPress={(e) => handleClick(entry.cvat_task_id, e)}
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
						<RejectReasonPicker
							value={rejectComment}
							onChange={setRejectComment}
							disabled={submitting}
						/>
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
						<Pressable
							onPress={() => setBanModalOpen(true)}
							disabled={submitting}
							style={[styles.actionBtn, styles.banBtn, submitting && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Bannir l'utilisateur</Text>
						</Pressable>
					</View>
				</View>
			</View>

			<BanModal
				visible={banModalOpen}
				userLabel={`${user.username}#${user.id}`}
				submitting={submitting}
				onCancel={() => setBanModalOpen(false)}
				onConfirm={handleBan}
			/>
		</View>
	);
};

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
	roleBadge: {
		alignSelf: 'flex-start',
		marginTop: SPACING.sm,
		paddingHorizontal: SPACING.sm,
		paddingVertical: 2,
		borderRadius: 4,
		backgroundColor: COLORS.background.main,
	},
	roleBadgeText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600' },
	rankPlaceholder: { marginTop: SPACING.sm, fontSize: 13, color: COLORS.text.placeholder, fontStyle: 'italic' },

	legendItem: { fontSize: 13, color: COLORS.text.secondary, marginVertical: 2 },

	toolbar: {
		paddingVertical: SPACING.sm,
		paddingHorizontal: SPACING.md,
		borderRadius: 8,
		backgroundColor: COLORS.background.card,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginBottom: SPACING.md,
	},
	toolbarText: { fontSize: 13, color: COLORS.text.secondary },

	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
	tile: {
		width: 140,
		padding: SPACING.xs,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: 'transparent',
		backgroundColor: COLORS.background.card,
	},
	tileSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.background.main },
	tileImage: { width: 124, height: 124, borderRadius: 4 },
	tileName: { fontSize: 12, marginTop: SPACING.xs, color: COLORS.text.primary },

	emptyState: {
		flex: 1,
		padding: SPACING.xl,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: COLORS.border,
		borderStyle: 'dashed',
		borderRadius: 8,
	},
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	actionBtn: {
		paddingHorizontal: SPACING.md,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		marginTop: SPACING.sm,
		alignItems: 'center',
	},
	validateBtn: { backgroundColor: COLORS.success },
	rejectBtn: { backgroundColor: COLORS.warning },
	banBtn: { backgroundColor: COLORS.danger },
	btnDisabled: { opacity: 0.5 },
	actionBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 14 },

	fieldLabel: { fontSize: 12, color: COLORS.text.secondary, marginTop: SPACING.md, marginBottom: SPACING.xs, fontWeight: '600' },
	cascadeHint: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic', marginBottom: SPACING.xs },
});
