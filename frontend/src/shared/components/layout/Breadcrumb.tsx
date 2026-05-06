import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

interface Crumb {
	label: string;
	href?: string;
}

const STATIC_LABELS: Record<string, string> = {
	media:      'Mes Médias',
	upload:     'Nouveau Dépôt',
	annotate:   'Annoter',
	curator:    'Curation',
	moderation: 'Modération',
	profile:    'Mon Profil',
	admin:      'Administration',
	welcome:    'Bienvenue',
};

function labelForSegment(parts: string[], idx: number): string {
	const seg = parts[idx];
	if (/^\d+$/.test(seg)) {
		const parent = parts[idx - 1];
		if (parent === 'moderation') return `Utilisateur #${seg}`;
		if (idx >= 2 && parts[idx - 2] === 'moderation') return `Média #${seg}`;
		return `#${seg}`;
	}
	return STATIC_LABELS[seg] ?? seg;
}

function buildCrumbs(pathname: string): Crumb[] {
	const parts = pathname.split('/').filter(Boolean);
	if (parts.length === 0) return [];
	const crumbs: Crumb[] = [{ label: 'Accueil', href: '/' }];
	let cumulative = '';
	parts.forEach((seg, i) => {
		cumulative += '/' + seg;
		const isLast = i === parts.length - 1;
		crumbs.push({
			label: labelForSegment(parts, i),
			href: isLast ? undefined : cumulative,
		});
	});
	return crumbs;
}

export const Breadcrumb: React.FC = () => {
	const router = useRouter();
	const pathname = usePathname();
	const crumbs = buildCrumbs(pathname);

	if (crumbs.length === 0) return null;

	return (
		<View style={styles.container}>
			{crumbs.map((c, i) => {
				const isLast = i === crumbs.length - 1;
				return (
					<View key={i} style={styles.itemRow}>
						{c.href && !isLast ? (
							<Pressable
								onPress={() => router.push(c.href as Href)}
								style={({ hovered }) => [
									styles.linkBtn,
									Platform.OS === 'web' && hovered && styles.linkBtnHovered,
								] as any}
							>
								<Text style={styles.linkText}>{c.label}</Text>
							</Pressable>
						) : (
							<Text style={styles.currentText}>{c.label}</Text>
						)}
						{!isLast ? <Text style={styles.separator}>›</Text> : null}
					</View>
				);
			})}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignItems: 'center',
		paddingHorizontal: SPACING.xl,
		paddingVertical: SPACING.sm,
		backgroundColor: COLORS.background.main,
		borderBottomWidth: 1,
		borderBottomColor: COLORS.border,
	},
	itemRow: { flexDirection: 'row', alignItems: 'center' },
	linkBtn: {
		paddingHorizontal: SPACING.xs,
		paddingVertical: 2,
		borderRadius: 4,
	},
	linkBtnHovered: { backgroundColor: COLORS.background.card },
	linkText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
	currentText: {
		color: COLORS.text.secondary,
		fontWeight: '500',
		fontSize: 14,
		paddingHorizontal: SPACING.xs,
	},
	separator: {
		color: COLORS.text.placeholder,
		fontSize: 14,
		marginHorizontal: 2,
	},
});
