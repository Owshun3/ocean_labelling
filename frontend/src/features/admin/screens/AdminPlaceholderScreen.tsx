import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props {
	title: string;
	hint?: string;
}

export const AdminPlaceholderScreen: React.FC<Props> = ({ title, hint }) => (
	<View style={styles.container}>
		<Text style={styles.title}>{title}</Text>
		<Text style={styles.placeholder}>Section à construire.</Text>
		{hint ? <Text style={styles.hint}>{hint}</Text> : null}
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg, gap: SPACING.sm },
	title: { ...TYPOGRAPHY.h1 },
	placeholder: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, fontStyle: 'italic' },
	hint: { fontSize: 12, color: COLORS.text.placeholder, marginTop: SPACING.md, maxWidth: 600, lineHeight: 18 },
});
