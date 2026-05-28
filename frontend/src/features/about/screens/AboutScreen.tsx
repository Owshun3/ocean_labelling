import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const AUTHOR = {
	name: 'Océan SHAN YAN',
	email: 'shanyanocean@gmail.com',
	linkedin: 'https://www.linkedin.com/in/océan-shan-yan',
	role: 'Développeur principal - stage L3 UPF, promotion 2026',
};

const SUPERVISION = [
	{ role: 'Tuteur GePaSud',  name: 'Sébastien CHABRIER' },
	{ role: 'Encadrement', name: 'Bryan DALLEST' },
];

const PARTNERS = [
	{ full: 'Direction des Ressources Marines',     context: 'commanditaire fonctionnel (Polynésie française)',  url: 'https://www.ressources-marines.gov.pf/' },
	{ full: 'Université de la Polynésie française', context: 'hébergement, infrastructure, encadrement académique', url: 'https://www.upf.pf/fr' },
	{ full: 'Laboratoire GePaSud',                  context: 'expertise scientifique et valorisation',           url: 'http://gepasud.upf.pf/' },
];

const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

export const AboutScreen: React.FC = () => {
	const settings = usePublicSettings();
	const platformName = settings['platform.name'] || 'Ora te Fenua';
	const year = new Date().getFullYear();

	return (
		<View style={[styles.container, styles.content]}>
			<View style={styles.header}>
				<Text style={styles.platformName}>{platformName}</Text>
				<Text style={styles.title}>À propos</Text>
				<Text style={styles.tagline}>
					Plateforme collaborative d'annotation d'images de biodiversité marine et terrestre polynésienne, conçue pour produire des jeux de données scientifiques exportables au profit de la recherche et de la conservation.
				</Text>
			</View>

			<View style={styles.card}>
				<Text style={styles.sectionLabel}>Auteur</Text>
				<Text style={styles.name}>{AUTHOR.name}</Text>
				<Text style={styles.role}>{AUTHOR.role}</Text>
				<View style={styles.linkRow}>
					<Pressable onPress={() => openUrl(`mailto:${AUTHOR.email}`)} style={styles.linkChip}>
						<Text style={styles.linkChipIcon}>✉</Text>
						<Text style={styles.linkChipText}>{AUTHOR.email}</Text>
					</Pressable>
					<Pressable onPress={() => openUrl(AUTHOR.linkedin)} style={styles.linkChip}>
						<Text style={styles.linkChipIcon}>in</Text>
						<Text style={styles.linkChipText}>LinkedIn</Text>
					</Pressable>
				</View>
			</View>

			<View style={styles.card}>
				<Text style={styles.sectionLabel}>Encadrement</Text>
				{SUPERVISION.map((s) => (
					<View key={s.role} style={styles.row}>
						<Text style={styles.rowLabel}>{s.role}</Text>
						<Text style={styles.rowValue}>{s.name}</Text>
					</View>
				))}
			</View>

			<View style={styles.card}>
				<Text style={styles.sectionLabel}>Partenaires</Text>
				{PARTNERS.map((p) => (
					<View key={p.url} style={styles.partnerRow}>
						<Pressable onPress={() => openUrl(p.url)}>
							<Text style={styles.partnerFull}>{p.full}</Text>
						</Pressable>
						<Text style={styles.partnerContext}>{p.context}</Text>
					</View>
				))}
			</View>

			<View style={styles.bottomRow}>
				<Text style={styles.bottomText}>© {year} {platformName} — Open Data Polynésie</Text>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background.main },
	content: { padding: SPACING.xl, maxWidth: 760, alignSelf: 'center', width: '100%', gap: SPACING.md },

	header: { gap: SPACING.xs, marginBottom: SPACING.sm },
	platformName: { ...TYPOGRAPHY.title, fontSize: 40, lineHeight: 46, color: COLORS.primary },
	title: { ...TYPOGRAPHY.h1, fontSize: 22, color: COLORS.text.secondary, fontWeight: '600' },
	tagline: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 22, marginTop: SPACING.sm },

	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.lg,
		gap: SPACING.sm,
	},
	sectionLabel: {
		fontSize: 11,
		color: COLORS.text.secondary,
		fontWeight: '700',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginBottom: 2,
	},

	name: { ...TYPOGRAPHY.h2, fontSize: 18, color: COLORS.text.primary },
	role: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, fontStyle: 'italic' },

	linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
	linkChip: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		borderRadius: 999,
		borderWidth: 1, borderColor: COLORS.primary,
		backgroundColor: `${COLORS.primary}11`,
	},
	linkChipIcon: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
	linkChipText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },

	row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingVertical: 4 },
	rowLabel: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontWeight: '700', minWidth: 160 },
	rowValue: { ...TYPOGRAPHY.body, color: COLORS.text.primary, flex: 1 },

	partnerRow: { paddingVertical: SPACING.xs, gap: 2 },
	partnerFull: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' },
	partnerContext: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },

	bottomRow: { alignItems: 'center', paddingVertical: SPACING.md },
	bottomText: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontSize: 11 },
});
