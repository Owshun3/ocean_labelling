import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Platform } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { useRouter, Href } from 'expo-router';
import { ModerationService, ModerationMediaDetail } from '@/services/api/ModerationService';
import { appApiClient } from '@/services/api/AppApiService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { BanModal } from '../components/BanModal';
import { RejectReasonPicker } from '../components/RejectReasonPicker';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	userId: number;
	taskId: number;
}

export const ModerationMediaScreen: React.FC<Props> = ({ userId, taskId }) => {
	const router = useRouter();
	const service = new ModerationService();

	const [detail, setDetail] = useState<ModerationMediaDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [rejectComment, setRejectComment] = useState('');
	const [banModalOpen, setBanModalOpen] = useState(false);

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			try {
				setDetail(await service.getMediaDetail(taskId));
			} catch (err: any) {
				toast.error(err?.response?.data?.error || err?.message || 'Chargement impossible.');
			} finally {
				setLoading(false);
			}
		};
		load();
	}, [taskId]);

	const goBackToUser = () => router.replace(`/(main)/moderation/${userId}` as Href);

	const handleValidate = async () => {
		if (submitting) return;
		setSubmitting(true);
		try {
			await service.validateMedia([taskId]);
			toast.success('Média validé.');
			goBackToUser();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Validation impossible.');
			setSubmitting(false);
		}
	};

	const proposeBanAfterReject = (): boolean => {
		if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
		return window.confirm('Média rejeté. Veux-tu aussi sanctionner cet utilisateur (bannissement) ?');
	};

	const handleReject = async () => {
		if (submitting) return;
		setSubmitting(true);
		try {
			await service.rejectMedia([taskId], rejectComment || undefined);
			toast.success('Média rejeté.');
			if (proposeBanAfterReject()) {
				setSubmitting(false);
				setBanModalOpen(true);
				return;
			}
			goBackToUser();
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Rejet impossible.');
			setSubmitting(false);
		}
	};

	const handleBan = async (durationDays: number | null, reason: string) => {
		setSubmitting(true);
		try {
			await service.banUser(userId, { duration_days: durationDays, reason });
			toast.success('Utilisateur banni.');
			setBanModalOpen(false);
			router.replace('/(main)/moderation' as Href);
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Bannissement impossible.');
			setSubmitting(false);
		}
	};

	if (loading) {
		return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;
	}
	if (!detail) {
		return <View style={styles.center}><Text style={TYPOGRAPHY.body}>Média introuvable.</Text></View>;
	}

	const { task, uploader, moderation } = detail;

	return (
		<View style={styles.container}>
			<View style={styles.topBar}>
				<Pressable onPress={goBackToUser} style={styles.backBtn}>
					<Text style={styles.backText}>‹ Médias de {uploader.username}#{uploader.id}</Text>
				</Pressable>
				<Text style={styles.title}>{task.name}</Text>
			</View>

			<View style={styles.row}>
				<View style={styles.leftColumn}>
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Auteur</Text>
						<Text style={styles.userName}>{uploader.username}#{uploader.id}</Text>
						<Text style={styles.userMeta}>{uploader.email}</Text>
						<View style={styles.roleBadge}>
							<Text style={styles.roleBadgeText}>{uploader.role}</Text>
						</View>
						<Text style={styles.rankPlaceholder}>Rang : —</Text>
					</View>

					<View style={styles.card}>
						<Text style={styles.cardTitle}>Métadonnées</Text>
						<Text style={styles.metaRow}>ID CVAT : {task.id}</Text>
						<Text style={styles.metaRow}>Soumis le : {new Date(moderation.created_at).toLocaleString()}</Text>
						<Text style={styles.metaRow}>Frames : {task.size}</Text>
						<Text style={styles.metaRow}>Statut CVAT : {task.status}</Text>
					</View>
				</View>

				<View style={styles.centerColumn}>
					<View style={styles.imageBox}>
						<AuthenticatedImage
							url={`/moderation/media/${task.id}/frame?number=0&quality=original`}
							style={styles.image}
							resizeMode="contain"
							client={appApiClient}
						/>
					</View>
				</View>

				<View style={styles.rightColumn}>
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Validation</Text>
						<Pressable
							onPress={handleValidate}
							disabled={submitting}
							style={[styles.actionBtn, styles.validateBtn, submitting && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Valider ce média</Text>
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
							disabled={submitting}
							style={[styles.actionBtn, styles.rejectBtn, submitting && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Rejeter ce média</Text>
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
				userLabel={`${uploader.username}#${uploader.id}`}
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
	leftColumn: { width: 280, gap: SPACING.md },
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
	metaRow: { fontSize: 13, color: COLORS.text.secondary, marginVertical: 2 },

	imageBox: {
		flex: 1,
		alignItems: 'stretch',
		justifyContent: 'stretch',
		backgroundColor: COLORS.background.card,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		minHeight: 400,
	},
	image: { flex: 1, width: '100%', height: '100%', borderRadius: 4 },

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
