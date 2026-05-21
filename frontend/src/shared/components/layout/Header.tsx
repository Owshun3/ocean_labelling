import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Platform } from 'react-native';
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

// Le rôle 'guest' n'a accès qu'à /landing et /privacy (gate dans app/_layout.tsx).
// Aucune entrée de nav n'a donc lieu d'être affichée pour les invités.
const NAV_ROUTES: NavRoute[] = [
	{ name: 'Accueil',         path: '/(main)'           as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator'] },
	{ name: 'Mes Médias',      path: '/(main)/media'     as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator'] },
	{ name: 'Annotation',      path: '/(main)/studio/select' as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator'] },
	{ name: 'Curation',        path: '/(main)/curator'    as Href, roles: ['admin', 'moderator', 'curator', 'chercheur'] },
	{ name: 'Modération',      path: '/(main)/moderation' as Href, roles: ['admin', 'moderator'] },
	{ name: 'Mes exports',     path: '/(main)/chercheur/export-requests' as Href, roles: ['chercheur'] },
	{ name: 'Administration',  path: '/(main)/admin'     as Href, roles: ['admin'] },
	{ name: 'Besoin d\'aide ?', path: '/(main)/help'     as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator'] },
	{ name: 'Mon Profil',      path: '/(main)/profile'   as Href, roles: ['admin', 'moderator', 'curator', 'chercheur', 'annotator'] },
];

import { APP_API_BASE } from '@/services/api/runtimeUrls';

const LOGO_HEIGHT = 40;

export const Header: React.FC = () => {
	const router = useRouter();
	const settings = usePublicSettings();
	const [userRole, setUserRole] = useState<string>('annotator');
	const [logoAspect, setLogoAspect] = useState<number | null>(null);

	useEffect(() => {
		const profile = getUserProfile();
		if (!profile) return;
		setUserRole(profile.appRole ?? (profile.is_superuser ? 'admin' : 'annotator'));
	}, []);

	const authorizedRoutes = NAV_ROUTES.filter(route => route.roles.includes(userRole));
	const hasLogo = !!settings['platform.logo_filename'];
	const logoCacheBust = settings['platform.logo_filename'] || '';
	const logoUri = hasLogo ? `${APP_API_BASE}/logo/stream?v=${encodeURIComponent(logoCacheBust)}` : null;

	useEffect(() => {
		if (!logoUri) { setLogoAspect(null); return; }
		let cancelled = false;
		Image.getSize(
			logoUri,
			(w, h) => { if (!cancelled && h > 0) setLogoAspect(w / h); },
			() => { if (!cancelled) setLogoAspect(1); },
		);
		return () => { cancelled = true; };
	}, [logoUri]);

	return (
		<View style={styles.header}>
			<Pressable onPress={() => router.push('/(main)' as Href)} style={styles.brand}>
				{hasLogo && logoUri ? (
					<Image
						source={{ uri: logoUri }}
						style={{ height: LOGO_HEIGHT, width: logoAspect ? LOGO_HEIGHT * logoAspect : LOGO_HEIGHT }}
						resizeMode="contain"
					/>
				) : null}
				<Text style={styles.logo}>{settings['platform.name']}</Text>
			</Pressable>
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
	brand: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
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
