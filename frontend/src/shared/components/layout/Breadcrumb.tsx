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
	accounts:          'Gestion des comptes',
	activity:          'Historique d\'activité',
	admin:             'Administration',
	annotate:          'Annoter',
	chercheur:         'Espace chercheur',
	contestations:     'Contestations',
	curation:          'Pool de curation',
	curator:           'Curation',
	done:              'Validation enregistrée',
	edit:              'Modifier le profil',
	export:            'Export Datumaro',
	'export-requests': 'Mes exports',
	health:            'État système',
	help:              'Besoin d\'aide ?',
	media:             'Mes Médias',
	moderation:        'Modération',
	password:          'Mot de passe',
	profile:           'Mon Profil',
	requests:          'Demandes',
	select:            'Choisir un média',
	settings:          'Paramètres système',
	species:           'Espèces',
	'species-history': 'Historique des fiches espèces',
	'species-tags':    'Tags d\'espèces',
	studio:            'Annotation',
	upload:            'Nouveau Dépôt',
	welcome:           'Bienvenue',
};

// Overrides : utilisés quand l'URL contient un id technique ou quand un
// segment parent n'est pas une page navigable (linkSegments = 0).
interface RouteOverride {
	match: (parts: string[]) => boolean;
	linkSegments: number;
	currentLabel: string;
}

const ROUTE_OVERRIDES: RouteOverride[] = [
	{
		match: (p) => p[0] === 'studio' && p.length >= 3 && /^\d+$/.test(p[1]) && /^\d+$/.test(p[2]),
		linkSegments: 1,
		currentLabel: 'Annoter ce média',
	},
	{
		match: (p) => p[0] === 'studio' && p[1] === 'video' && p.length >= 3,
		linkSegments: 1,
		currentLabel: 'Extracteur de frames',
	},
	{
		match: (p) => p[0] === 'studio' && p[1] === 'view' && p.length >= 3,
		linkSegments: 1,
		currentLabel: 'Aperçu d\'annotation',
	},
	{
		match: (p) => p[0] === 'curator' && p[1] === 'studio',
		linkSegments: 1,
		currentLabel: 'Certifier ce média',
	},
	{
		// /chercheur tout court n'est pas une page → linkSegments 0
		match: (p) => p[0] === 'chercheur' && p[1] === 'export-requests',
		linkSegments: 0,
		currentLabel: 'Mes exports',
	},
	{
		// /species index n'existe pas → linkSegments 0
		match: (p) => p[0] === 'species' && p.length >= 2 && /^\d+$/.test(p[1]),
		linkSegments: 0,
		currentLabel: 'Fiche d\'espèce',
	},
];

function labelForSegment(parts: string[], idx: number): string {
	const seg = parts[idx];
	if (/^\d+$/.test(seg)) {
		const parent = parts[idx - 1];
		if (parent === 'moderation' || parent === 'contestations') {
			return `Utilisateur #${seg}`;
		}
		if (idx >= 2 && parts[idx - 2] === 'moderation') {
			return `Média #${seg}`;
		}
		return `#${seg}`;
	}
	return STATIC_LABELS[seg] ?? seg;
}

function buildCrumbs(pathname: string): Crumb[] {
	const parts = pathname.split('/').filter(Boolean);
	if (parts.length === 0) return [];

	const crumbs: Crumb[] = [{ label: 'Accueil', href: '/' }];

	const override = ROUTE_OVERRIDES.find((r) => r.match(parts));
	if (override) {
		let cumulative = '';
		for (let i = 0; i < override.linkSegments; i++) {
			cumulative += '/' + parts[i];
			crumbs.push({ label: labelForSegment(parts, i), href: cumulative });
		}
		crumbs.push({ label: override.currentLabel });
		return crumbs;
	}

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
						{c.href ? (
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
