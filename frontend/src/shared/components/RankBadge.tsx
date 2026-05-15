import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { computeRank } from '@/shared/ranks';
import { COLORS } from '@/shared/theme/colors';

interface Props {
	actions: number;
	size?: 'sm' | 'md';
	withLabel?: boolean;
	withCount?: boolean;
}

export const RankBadge: React.FC<Props> = ({ actions, size = 'sm', withLabel = true, withCount = false }) => {
	const rank = computeRank(actions);
	const dotSize = size === 'sm' ? 8 : 12;
	const fontSize = size === 'sm' ? 11 : 13;

	return (
		<View style={styles.row}>
			<View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: rank.current.color }} />
			{withLabel ? (
				<Text style={[styles.label, { color: rank.current.color, fontSize }]}>{rank.current.label}</Text>
			) : null}
			{withCount ? (
				<Text style={[styles.count, { fontSize: fontSize - 1 }]}>· {rank.actions}</Text>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
	label: { fontWeight: '700' },
	count: { color: COLORS.text.secondary },
});
