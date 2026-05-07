import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { studioClient, FeedTask } from '@/services/api/StudioService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const DOUBLE_CLICK_MS = 400;

interface Props {
	task: FeedTask;
	disabled?: boolean;
	onOpen: (task: FeedTask) => void;
	onContest?: (task: FeedTask) => void;
}

const STATE_BADGE: Record<FeedTask['annotation_state'], { label: string; color: string }> = {
	not_annotated:     { label: 'NON ANNOTÉ',     color: COLORS.text.secondary },
	annotated:         { label: 'ANNOTÉ',         color: COLORS.primary },
	curator_validated: { label: 'VALIDÉ',         color: COLORS.success },
};

export const StudioFeedTile: React.FC<Props> = ({ task, disabled, onOpen, onContest }) => {
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

	const isValidated = task.annotation_state === 'curator_validated';
	const badge = STATE_BADGE[task.annotation_state];

	return (
		<View style={[styles.tile, disabled && styles.tileDisabled]}>
			<Pressable
				onPress={handlePress}
				disabled={disabled}
				style={({ hovered }: any) => [styles.body, hovered && !disabled && styles.bodyHovered]}
			>
				<AuthenticatedImage
					url={`/tasks/${task.cvat_task_id}/preview`}
					style={styles.thumb}
					client={studioClient}
				/>
				<Text style={styles.name} numberOfLines={1}>{task.name}</Text>
				<View style={styles.metaRow}>
					<Text style={styles.metaText}>{date}</Text>
				</View>
				{badge ? (
					<View style={[styles.badge, { backgroundColor: badge.color }]}>
						<Text style={styles.badgeText}>{badge.label}</Text>
					</View>
				) : null}
			</Pressable>

			{isValidated ? (
				<View style={styles.footer}>
					<Pressable
						onPress={() => onOpen(task)}
						style={({ hovered }: any) => [styles.footerBtn, hovered && styles.footerBtnHover]}
					>
						<Text style={styles.footerBtnText}>Voir</Text>
					</Pressable>
					<View style={styles.footerSeparator} />
					<Pressable
						onPress={() => onContest?.(task)}
						style={({ hovered }: any) => [styles.footerBtn, hovered && styles.footerBtnHover]}
					>
						<Text style={[styles.footerBtnText, styles.footerBtnContest]}>Contester</Text>
					</Pressable>
				</View>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	tile: {
		width: 170,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.card,
		overflow: 'hidden',
	},
	tileDisabled: { opacity: 0.5 },

	body: { padding: SPACING.sm },
	bodyHovered: { backgroundColor: COLORS.background.main },

	thumb: { width: '100%', height: 130, borderRadius: 6, backgroundColor: COLORS.background.main },
	name: { ...TYPOGRAPHY.body, fontWeight: '600', marginTop: SPACING.sm },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
	metaText: { fontSize: 12, color: COLORS.text.secondary },

	badge: {
		marginTop: SPACING.sm,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		alignSelf: 'flex-start',
	},
	badgeText: { ...TYPOGRAPHY.badge, color: COLORS.text.inverse },

	footer: {
		flexDirection: 'row',
		borderTopWidth: 1,
		borderTopColor: COLORS.border,
	},
	footerBtn: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center' },
	footerBtnHover: { backgroundColor: COLORS.background.main },
	footerBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.text.primary },
	footerBtnContest: { color: COLORS.danger },
	footerSeparator: { width: 1, backgroundColor: COLORS.border },
});
