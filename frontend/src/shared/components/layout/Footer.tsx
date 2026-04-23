import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export const Footer: React.FC = () => {
	return (
		<View style={styles.footer}>
			<Text style={styles.text}>© {new Date().getFullYear()} Open Data Polynésie </Text>
		</View>
	);
};

const styles = StyleSheet.create({
	footer: {
		padding: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderTopWidth: 1,
		borderTopColor: COLORS.border,
		alignItems: 'center',
	},
	text: {
		...TYPOGRAPHY.caption,
		color: COLORS.text.secondary,
	}
});