import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CuratorTask } from '@/services/api/CuratorService';
import { curatorClient } from '@/services/api/CuratorService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const DOUBLE_CLICK_MS = 400;

interface Props {
	task: CuratorTask;
	onOpen: (task: CuratorTask) => void;
}

export const CuratorTile: React.FC<Props> = ({ task, onOpen }) => {
	const lastClickRef = useRef<number>(0);

	const handlePress = () => {
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
		<Pressable onPress={handlePress} style={({ hovered }: any) => [styles.tile, hovered && styles.tileHovered]}>
			<AuthenticatedImage
				url={`/tasks/${task.id}/preview`}
				style={styles.thumb}
				client={curatorClient}
			/>
			{task.assigned_to ? (
				<View style={[styles.assignedBadge, task.is_assigned_to_me && styles.assignedBadgeMe]}>
					<Text style={[styles.assignedBadgeText, task.is_assigned_to_me && styles.assignedBadgeTextMe]} numberOfLines={1}>
						{task.is_assigned_to_me ? 'Attribué à toi' : `Attribué à ${task.assigned_to.username ?? '?'}`}
					</Text>
				</View>
			) : (
				<View style={styles.unassignedBadge}>
					<Text style={styles.unassignedBadgeText}>Non attribué</Text>
				</View>
			)}
			<Text style={styles.name} numberOfLines={1}>{task.name}</Text>
			<View style={styles.metaRow}>
				<Text style={styles.metaText}>
					{(task.annotated_jobs_count ?? 0) > 0
						? `${task.annotated_jobs_count} annotation${(task.annotated_jobs_count ?? 0) > 1 ? 's' : ''}`
						: 'Pas encore annoté'}
				</Text>
				<Text style={styles.metaDot}>·</Text>
				<Text style={styles.metaText}>{date}</Text>
			</View>
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
	tileHovered: { borderColor: COLORS.primary, transform: [{ translateY: -2 }] },
	thumb: { width: '100%', height: 130, borderRadius: 6, backgroundColor: COLORS.background.main },
	assignedBadge: {
		marginTop: SPACING.xs,
		paddingHorizontal: 6, paddingVertical: 2,
		borderRadius: 4,
		backgroundColor: `${COLORS.text.secondary}22`,
		alignSelf: 'flex-start',
	},
	assignedBadgeMe: { backgroundColor: `${COLORS.success}33` },
	assignedBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.text.secondary, textTransform: 'uppercase' },
	assignedBadgeTextMe: { color: COLORS.success },
	unassignedBadge: {
		marginTop: SPACING.xs,
		paddingHorizontal: 6, paddingVertical: 2,
		borderRadius: 4,
		backgroundColor: `${COLORS.warning}22`,
		alignSelf: 'flex-start',
	},
	unassignedBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.warning, textTransform: 'uppercase' },
	name: { ...TYPOGRAPHY.body, fontWeight: '600', marginTop: SPACING.sm },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
	metaText: { fontSize: 12, color: COLORS.text.secondary },
	metaDot: { fontSize: 12, color: COLORS.text.placeholder },
});
