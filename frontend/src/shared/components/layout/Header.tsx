import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { getUserProfile } from '@/services/api/authStorage';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';

interface NavRoute {
	name: string;
	path: Href;
	roles: string[];
}

const NAV_ROUTES: NavRoute[] = [
	{ name: 'Accueil',         path: '/(main)'           as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator', 'guest'] },
	{ name: 'Mes Médias',      path: '/(main)/media'     as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator'] },
	{ name: 'Annotation',      path: '/(main)/studio/select' as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator'] },
	{ name: 'Curation',        path: '/(main)/curator'    as Href, roles: ['admin', 'moderator', 'curator', 'chercheur'] },
	{ name: 'Modération',      path: '/(main)/moderation' as Href, roles: ['admin', 'moderator'] },
	{ name: 'Mes exports',     path: '/(main)/chercheur/export-requests' as Href, roles: ['chercheur'] },
	{ name: 'Administration',  path: '/(main)/admin'     as Href, roles: ['admin'] },
	{ name: 'Mon Profil',      path: '/(main)/profile'   as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator', 'guest'] },
];

export const Header: React.FC = () => {
	const router = useRouter();
	const settings = usePublicSettings();
	const [userRole, setUserRole] = useState<string>('annotator');

	useEffect(() => {
		const profile = getUserProfile();
		if (!profile) return;
		setUserRole(profile.appRole ?? (profile.is_superuser ? 'admin' : 'annotator'));
	}, []);

	const authorizedRoutes = NAV_ROUTES.filter(route => route.roles.includes(userRole));

	return (
		<View style={styles.header}>
			<Text style={styles.logo}>{settings['platform.name']}</Text>
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