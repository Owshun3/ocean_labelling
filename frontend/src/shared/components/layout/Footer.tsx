import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export const Footer: React.FC = () => {
	const settings = usePublicSettings();
	const router = useRouter();

	const platformName = settings['platform.name'] || 'Ora te Fenua';
	const email   = settings['platform.contact_email']   || '';
	const phone   = settings['platform.contact_phone']   || '';
	const hours   = settings['platform.contact_hours']   || '';
	const address = settings['platform.contact_address'] || '';
	const hasContact = !!(email || phone || hours || address);

	const year = new Date().getFullYear();

	return (
		<View style={styles.footer}>
			<View style={styles.columns}>
				<View style={styles.col}>
					<Text style={styles.colTitle}>{platformName}</Text>
					<Text style={styles.colText}>
						Plateforme d'annotation collaborative de biodiversité polynésienne.
					</Text>
					<Text style={styles.colTextMuted}>
						© {year} Open Data Polynésie
					</Text>
				</View>

				{hasContact ? (
					<View style={styles.col}>
						<Text style={styles.colTitle}>Contact</Text>
						{email ? (
							<Text style={styles.contactLine}>
								<Text style={styles.contactIcon}>✉</Text>  {email}
							</Text>
						) : null}
						{phone ? (
							<Text style={styles.contactLine}>
								<Text style={styles.contactIcon}>☎</Text>  {phone}
							</Text>
						) : null}
						{hours ? (
							<Text style={styles.contactLine}>
								<Text style={styles.contactIcon}>◷</Text>  {hours}
							</Text>
						) : null}
						{address ? (
							<Text style={styles.contactLine}>
								<Text style={styles.contactIcon}>◉</Text>  {address}
							</Text>
						) : null}
					</View>
				) : null}

				<View style={styles.col}>
					<Text style={styles.colTitle}>Liens utiles</Text>
					<Pressable onPress={() => router.push('/(main)/help' as Href)}>
						<Text style={styles.link}>Besoin d'aide ?</Text>
					</Pressable>
					<Pressable onPress={() => router.push('/(main)/profile' as Href)}>
						<Text style={styles.link}>Mon profil</Text>
					</Pressable>
				</View>
			</View>

			<View style={styles.bottomBar}>
				<Text style={styles.bottomText}>
					{platformName} · v1 · construit avec CVAT et Expo Web
				</Text>
				<Pressable onPress={() => router.push('/(main)/privacy' as Href)} hitSlop={8}>
					<Text style={styles.bottomLink}>Politique de confidentialité</Text>
				</Pressable>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	footer: {
		backgroundColor: COLORS.background.card,
		borderTopWidth: 1,
		borderTopColor: COLORS.border,
		paddingHorizontal: SPACING.xl,
		paddingTop: SPACING.lg,
	},
	columns: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: SPACING.xl,
		paddingBottom: SPACING.md,
	},
	col: { flex: 1, minWidth: 220, gap: 6 },
	colTitle: {
		...TYPOGRAPHY.body,
		fontWeight: '700',
		color: COLORS.text.primary,
		marginBottom: 4,
	},
	colText: {
		...TYPOGRAPHY.caption,
		color: COLORS.text.secondary,
		lineHeight: 18,
	},
	colTextMuted: {
		...TYPOGRAPHY.caption,
		color: COLORS.text.placeholder,
		marginTop: SPACING.sm,
	},

	contactLine: {
		...TYPOGRAPHY.caption,
		color: COLORS.text.primary,
		paddingVertical: 3,
	},
	contactIcon: {
		color: COLORS.primary,
		fontWeight: '600',
	},

	link: {
		...TYPOGRAPHY.caption,
		color: COLORS.primary,
		fontWeight: '600',
		paddingVertical: 3,
		textDecorationLine: 'underline',
	},

	bottomBar: {
		borderTopWidth: 1,
		borderTopColor: COLORS.border,
		paddingVertical: SPACING.sm,
		alignItems: 'center',
		gap: 4,
	},
	bottomText: {
		...TYPOGRAPHY.caption,
		color: COLORS.text.placeholder,
		fontSize: 11,
	},
	bottomLink: {
		...TYPOGRAPHY.caption,
		color: COLORS.text.secondary,
		fontSize: 11,
		textDecorationLine: 'underline',
	},
});
