import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export type AdminCardSeverity = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

interface Props {
	title: string;
	href: Href;
	icon: keyof typeof Ionicons.glyphMap;
	description?: string;
	kpiValue?: string | number | null;
	kpiLabel?: string;
	severity?: AdminCardSeverity;
}

const SEVERITY_DOT: Record<AdminCardSeverity, string | null> = {
	neutral: null,
	info:    '#0284c7',
	warning: '#f59e0b',
	danger:  '#dc2626',
	success: '#16a34a',
};

export const AdminCard: React.FC<Props> = ({
	title, href, icon, description, kpiValue, kpiLabel, severity = 'neutral',
}) => {
	const router = useRouter();
	const dot = SEVERITY_DOT[severity];

	return (
		<Pressable
			onPress={() => router.push(href)}
			style={({ hovered }: any) => [
				styles.card,
				Platform.OS === 'web' && hovered && styles.cardHovered,
			]}
		>
			<View style={styles.header}>
				<View style={styles.iconWrap}>
					<Ionicons name={icon} size={20} color={COLORS.primary} />
				</View>
				<Text style={styles.title}>{title}</Text>
				{dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
			</View>

			{kpiValue !== undefined && kpiValue !== null ? (
				<View style={styles.kpiBlock}>
					<Text style={styles.kpiValue}>{kpiValue}</Text>
					{kpiLabel ? <Text style={styles.kpiLabel}>{kpiLabel}</Text> : null}
				</View>
			) : null}

			{description ? <Text style={styles.description}>{description}</Text> : null}
		</Pressable>
	);
};

const styles = StyleSheet.create({
	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: SPACING.sm,
		flex: 1,
		minWidth: 260,
		minHeight: 130,
	},
	cardHovered: { backgroundColor: COLORS.background.main, borderColor: COLORS.primary },
	header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
	iconWrap: {
		width: 32, height: 32, borderRadius: 6,
		backgroundColor: COLORS.background.main,
		alignItems: 'center', justifyContent: 'center',
	},
	title: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.text.primary, flex: 1, fontSize: 14 },
	dot: { width: 10, height: 10, borderRadius: 5 },
	kpiBlock: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
	kpiValue: { fontSize: 26, fontWeight: '700', color: COLORS.primary },
	kpiLabel: { fontSize: 12, color: COLORS.text.secondary, flex: 1 },
	description: { fontSize: 12, color: COLORS.text.secondary, lineHeight: 16 },
});
