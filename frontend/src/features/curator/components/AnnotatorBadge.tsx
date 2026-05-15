import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RankBadge } from '@/shared/components/RankBadge';
import { COLORS } from '@/shared/theme/colors';

interface Props {
	username: string;
	actionsTotal?: number;
}

export const AnnotatorBadge: React.FC<Props> = ({ username, actionsTotal }) => (
	<View style={styles.wrap}>
		<Text style={styles.name} numberOfLines={1}>{username}</Text>
		{typeof actionsTotal === 'number' ? <RankBadge actions={actionsTotal} size="sm" /> : null}
	</View>
);

const styles = StyleSheet.create({
	wrap: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 16 },
	name: { fontSize: 12, color: COLORS.text.primary, fontWeight: '500' },
});
