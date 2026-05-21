import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { getUserProfile } from '@/services/api/authStorage';
import { ModerationService } from '@/services/api/ModerationService';

interface ActionCard {
	id: string;
	category: string;
	title: string;
	description: string;
	cta: string;
	href: Href;
	accent: string;
}

export const DashboardScreen: React.FC = () => {
	const router = useRouter();
	const profile = getUserProfile();
	const userRole = profile?.appRole ?? 'annotator';

	const isCuratorOrAbove   = ['admin', 'moderator', 'curator', 'chercheur'].includes(userRole);
	const isModeratorOrAbove = ['admin', 'moderator'].includes(userRole);
	const isAdmin            = userRole === 'admin';

	const [pendingUsers, setPendingUsers] = useState<number | null>(null);

	useEffect(() => {
		if (!isModeratorOrAbove) return;
		new ModerationService().getQueue()
			.then((q) => setPendingUsers(q.length))
			.catch(() => setPendingUsers(null));
	}, [isModeratorOrAbove]);

	const moderationDescription = pendingUsers === null
		? 'File de modération.'
		: pendingUsers === 0
			? 'Aucun média en attente.'
			: `${pendingUsers} utilisateur(s) avec des médias à valider.`;

	const cards: ActionCard[] = [
		{ id: 'media',     category: 'Dépôt',         title: 'Mes médias',       description: 'Importez de nouvelles données à annoter.',              cta: 'Aller vers Mes Médias', href: '/(main)/media' as Href,         accent: COLORS.primary },
		{ id: 'studio',    category: 'Travail',       title: 'Annotation',       description: 'Rejoignez la page d\'annotation.',                       cta: 'Commencer à annoter',   href: '/(main)/studio/select' as Href, accent: COLORS.primary },
	];
	if (isCuratorOrAbove)   cards.push({ id: 'curator',    category: 'Validation',    title: 'Curation',       description: 'Révisez les annotations soumises par les pairs.',     cta: 'Mode curateur',     href: '/(main)/curator' as Href,    accent: COLORS.warning });
	if (isModeratorOrAbove) cards.push({ id: 'moderation', category: 'Modération',    title: 'File à modérer', description: moderationDescription,                                  cta: 'Ouvrir la file',    href: '/(main)/moderation' as Href, accent: COLORS.status.pending });
	if (isAdmin)            cards.push({ id: 'admin',      category: 'Administration', title: 'Panneau admin',  description: 'Gérez les utilisateurs, paramètres et exports.',     cta: 'Panneau admin',     href: '/(main)/admin' as Href,      accent: COLORS.danger });

	return (
		<View style={[styles.container, styles.content]}>
			<View style={styles.hero}>
				<Text style={styles.title}>Tableau de bord</Text>
				<Text style={styles.subtitle}>Que souhaitez-vous accomplir aujourd'hui ?</Text>
			</View>

			<View style={styles.grid}>
				{cards.map((c) => <ActionTile key={c.id} card={c} onPress={() => router.push(c.href)} />)}
			</View>
		</View>
	);
};

const ActionTile: React.FC<{ card: ActionCard; onPress: () => void }> = ({ card, onPress }) => (
	<View style={styles.card}>
		<Text style={[styles.category, { color: card.accent }]}>{card.category}</Text>
		<Text style={styles.cardTitle}>{card.title}</Text>
		<Text style={styles.cardText}>{card.description}</Text>
		<Pressable
			onPress={onPress}
			style={({ hovered, pressed }: any) => [
				styles.cta,
				{ backgroundColor: card.accent },
				(hovered || pressed) && styles.ctaActive,
			]}
		>
			<Text style={styles.ctaText}>{card.cta}</Text>
		</Pressable>
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background.main },
	content: {
		paddingHorizontal: SPACING.xl,
		paddingVertical: SPACING.xl * 1.5,
		alignItems: 'center',
		gap: SPACING.xl,
	},

	hero: { alignItems: 'center', maxWidth: 760, gap: SPACING.sm },
	title: { ...TYPOGRAPHY.title, fontSize: 36, lineHeight: 42, textAlign: 'center' },
	subtitle: { ...TYPOGRAPHY.body, fontSize: 16, lineHeight: 22, color: COLORS.text.secondary, textAlign: 'center' },

	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		gap: SPACING.lg,
		maxWidth: 1100,
		width: '100%',
	},

	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.lg,
		width: 320,
		minHeight: 180,
		gap: SPACING.sm,
		// boxShadow ignoré sur RN natif (élévation par défaut iOS/Android)
		...(({ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }) as any),
	},

	category: { ...TYPOGRAPHY.badge, fontSize: 11, letterSpacing: 0.6 },
	cardTitle: { ...TYPOGRAPHY.h2, fontSize: 20 },
	cardText:  { ...TYPOGRAPHY.body, color: COLORS.text.secondary, flexGrow: 1 },

	cta: {
		marginTop: SPACING.sm,
		paddingVertical: 10,
		paddingHorizontal: SPACING.md,
		borderRadius: 8,
		alignItems: 'center',
	},
	ctaActive: { opacity: 0.85 },
	ctaText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 14 },
});
