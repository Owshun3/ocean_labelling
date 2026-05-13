import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';

interface Props {
	username: string;
	color: string;
}

export const AnnotatorBadge: React.FC<Props> = ({ username, color }) => (
	<View style={styles.wrap}>
		<View style={[styles.dot, { backgroundColor: color }]} />
		<Text style={styles.name} numberOfLines={1}>{username}</Text>
		{/* TODO rank badge — slot réservé pour afficher plus tard le rang dérivé de curator_certifications */}
	</View>
);

const styles = StyleSheet.create({
	wrap: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 16 },
	dot: { width: 8, height: 8, borderRadius: 4 },
	name: { fontSize: 12, color: COLORS.text.primary, fontWeight: '500' },
});
