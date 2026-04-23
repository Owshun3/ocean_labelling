import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface NavRoute {
	name: string;
	path: Href;
	roles: string[];
}

const NAV_ROUTES: NavRoute[] = [
	{ name: 'Accueil', path: '/(main)' as Href, roles: ['user', 'curator', 'admin'] },
	{ name: 'Mes Médias', path: '/(main)/media' as Href, roles: ['user', 'curator', 'admin'] },
	{ name: 'Annoter', path: '/(main)/annotate' as Href, roles: ['user', 'curator', 'admin'] },
	{ name: 'Mon Profil', path: '/(main)/profile' as Href, roles: ['user', 'curator', 'admin'] },
	// Exemple de route restreinte pour plus tard :
	// { name: 'Administration', path: '/(main)/admin' as Href, roles: ['admin'] },
];

export const Header: React.FC = () => {
	const router = useRouter();
	const userRole = 'user';

	const authorizedRoutes = NAV_ROUTES.filter(route => route.roles.includes(userRole));

	return (
		<View style={styles.header}>
			<Text style={styles.logo}>CVAT Hub</Text>
			<View style={styles.navContainer}>
				{authorizedRoutes.map((route) => (
					<Pressable 
						key={route.name} 
						onPress={() => router.push(route.path)}
						style={({ hovered }) => [
							styles.navItem,
							Platform.OS === 'web' && hovered && styles.navItemHovered
						] as any}
					>
						<Text style={styles.navText}>{route.name}</Text>
					</Pressable>
				))}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: SPACING.xl,
		paddingVertical: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderBottomWidth: 1,
		borderBottomColor: COLORS.border,

	},
	logo: {
		...TYPOGRAPHY.h2,
		color: COLORS.primary,
		fontWeight: 'bold',
	},
	navContainer: {
		flexDirection: 'row',
		gap: SPACING.md,
	},
	navItem: {
		padding: SPACING.sm,
		borderRadius: 4,
	},
	navItemHovered: {
		backgroundColor: COLORS.background.main,
	},
	navText: {
		...TYPOGRAPHY.body,
		color: COLORS.text.primary,
		fontWeight: '500',
	}
});