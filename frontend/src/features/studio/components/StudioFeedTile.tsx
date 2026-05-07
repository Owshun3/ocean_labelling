import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { studioClient, FeedTask, ModerationStatus } from '@/services/api/StudioService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const DOUBLE_CLICK_MS = 400;

const STATUS_LABELS: Record<ModerationStatus, string> = {
	pending: 'En attente',
	validated: 'Validé',
	rejected: 'Rejeté',
};

const STATUS_COLORS: Record<ModerationStatus, string> = {
	pending: COLORS.status.pending,
	validated: COLORS.status.validated,
	rejected: COLORS.status.error,
};

interface Props {
	task: FeedTask;
	variant: 'own' | 'community';
	disabled?: boolean;
	onOpen: (task: FeedTask) => void;
}

export const StudioFeedTile: React.FC<Props> = ({ task, variant, disabled, onOpen }) => {
	const lastClickRef = useRef(0);

	const handlePress = () => {
		if (disabled) return;
		const now = Date.now();
		if (now - lastClickRef.current < DOUBLE_CLICK_MS) {
			lastClickRef.current = 0;
			onOpen(task);
			return;
		}
		lastClickRef.current = now;
	};

	const date = task.created_date
		? new Date(task.created_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
		: '—';

	return (
		<Pressable
			onPress={handlePress}
			disabled={disabled}
			style={({ hovered }: any) => [
				styles.tile,
				disabled && styles.tileDisabled,
				hovered && !disabled && styles.tileHovered,
			]}
		>
			<AuthenticatedImage
				url={`/tasks/${task.cvat_task_id}/preview`}
				style={styles.thumb}
				client={studioClient}
			/>
			<Text style={styles.name} numberOfLines={1}>{task.name}</Text>

			<View style={styles.metaRow}>
				<Text style={styles.metaText}>
					{task.completed_count}/{task.jobs_count} annot.
				</Text>
				<Text style={styles.metaDot}>·</Text>
				<Text style={styles.metaText}>{date}</Text>
			</View>

			{variant === 'own' && (
				<View style={[styles.badge, { backgroundColor: STATUS_COLORS[task.moderation_status] }]}>
					<Text style={styles.badgeText}>{STATUS_LABELS[task.moderation_status]}</Text>
				</View>
			)}
			{variant === 'community' && task.my_job_id && (
				<View style={[styles.badge, { backgroundColor: COLORS.primary }]}>
					<Text style={styles.badgeText}>EN COURS</Text>
				</View>
			)}
		</Pressable>
	);
};

const styles = StyleSheet.create({
	tile: {
		width: 170,
		padding: SPACING.sm,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.card,
	},
	tileDisabled: { opacity: 0.5 },
	tileHovered: { borderColor: COLORS.primary, transform: [{ translateY: -2 }] },
	thumb: { width: '100%', height: 130, borderRadius: 6, backgroundColor: COLORS.background.main },
	name: { ...TYPOGRAPHY.body, fontWeight: '600', marginTop: SPACING.sm },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
	metaText: { fontSize: 12, color: COLORS.text.secondary },
	metaDot: { fontSize: 12, color: COLORS.text.placeholder },
	badge: {
		marginTop: SPACING.sm,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		alignSelf: 'flex-start',
	},
	badgeText: { ...TYPOGRAPHY.badge, color: COLORS.text.inverse },
});
