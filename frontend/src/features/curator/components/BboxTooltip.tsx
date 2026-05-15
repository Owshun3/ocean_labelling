import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Proposal } from '@/services/api/CuratorService';
import { AnnotatorBadge } from './AnnotatorBadge';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	proposal: Proposal;
	x: number;
	y: number;
}

export const BboxTooltip: React.FC<Props> = ({ proposal, x, y }) => {
	const label =
		proposal.species?.usage_name
		?? proposal.species?.scientific_name
		?? proposal.label_name
		?? '—';
	const scientific = proposal.species?.scientific_name;
	const polynesian = proposal.species?.polynesian_name;
	const isPending  = proposal.species?.status === 'pending';

	return (
		<View pointerEvents="none" style={[styles.tooltip, { left: x + 12, top: y + 12 }]}>
			<Text style={styles.title}>{label}</Text>
			{(scientific || polynesian) ? (
				<Text style={styles.sub}>
					{scientific ?? ''}{scientific && polynesian ? ' · ' : ''}{polynesian ?? ''}
				</Text>
			) : null}
			{isPending ? <Text style={styles.pending}>en attente de validation</Text> : null}
			<View style={styles.spacer} />
			<AnnotatorBadge username={proposal.annotator_username} actionsTotal={proposal.annotator_actions_total} />
		</View>
	);
};

const styles = StyleSheet.create({
	tooltip: {
		position: 'absolute',
		minWidth: 160,
		maxWidth: 260,
		paddingVertical: 6,
		paddingHorizontal: SPACING.sm,
		backgroundColor: COLORS.background.card,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		shadowColor: '#000',
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 3,
	},
	title: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary },
	sub:   { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic', marginTop: 2 },
	pending: { fontSize: 10, color: COLORS.warning, fontWeight: '700', marginTop: 2 },
	spacer: { height: 4 },
});
