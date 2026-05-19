import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { getPublicSettings, refreshPublicSettings, subscribePublicSettings } from '@/services/api/publicSettings';
import type { PublicSettings } from '@/services/api/publicSettings';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

import { APP_API_BASE } from '@/services/api/runtimeUrls';
const STREAM_URL = `${APP_API_BASE}/help-video/stream`;

export const HelpScreen: React.FC = () => {
	const [settings, setSettings] = useState<PublicSettings>(getPublicSettings());

	useEffect(() => {
		refreshPublicSettings().then(setSettings).catch(() => {});
		return subscribePublicSettings(setSettings);
	}, []);

	const platformName = settings?.['platform.name'] || 'Ora te Fenua';
	const helpVideoFilename = settings?.['platform.help_video_filename'] || '';
	const email   = settings?.['platform.contact_email'] || '';
	const phone   = settings?.['platform.contact_phone'] || '';
	const hours   = settings?.['platform.contact_hours'] || '';
	const address = settings?.['platform.contact_address'] || '';
	const hasContacts = !!(email || phone || hours || address);

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>Besoin d'aide ?</Text>
			<Text style={styles.subtitle}>
				Bienvenue dans l'aide de la plateforme <Text style={styles.bold}>{platformName}</Text>.
				Tu trouveras ci-dessous une vidéo de présentation et les coordonnées de contact.
				Une FAQ avec les questions les plus fréquentes sera ajoutée prochainement.
			</Text>

			<Section title="Vidéo explicative">
				{helpVideoFilename ? (
					Platform.OS === 'web' ? (
						<div style={{ width: '100%', display: 'flex', justifyContent: 'center', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
							{/* @ts-ignore RN-web supporte les tags HTML natifs */}
							<video
								src={STREAM_URL}
								controls
								crossOrigin="use-credentials"
								controlsList="nodownload"
								onContextMenu={(e: any) => e.preventDefault()}
								style={{ width: '100%', maxHeight: '60vh', display: 'block' }}
							/>
						</div>
					) : (
						<Text style={styles.muted}>Lecture vidéo disponible sur web uniquement.</Text>
					)
				) : (
					<View style={styles.emptyVideoBox}>
						<Text style={styles.emptyVideoTitle}>Aucune vidéo disponible pour l'instant</Text>
						<Text style={styles.emptyVideoText}>
							L'administrateur peut téléverser une vidéo de présentation depuis les paramètres système.
						</Text>
					</View>
				)}
			</Section>

			<Section title="Contacter l'équipe">
				{!hasContacts ? (
					<Text style={styles.muted}>Aucune coordonnée n'a encore été renseignée par l'administrateur.</Text>
				) : (
					<View style={styles.contactList}>
						{email   ? <ContactRow icon="✉" label="Email"      value={email}   /> : null}
						{phone   ? <ContactRow icon="☎" label="Téléphone"  value={phone}   /> : null}
						{hours   ? <ContactRow icon="◷" label="Horaires"   value={hours}   /> : null}
						{address ? <ContactRow icon="◉" label="Adresse"    value={address} /> : null}
					</View>
				)}
			</Section>

			<Section title="Questions fréquentes">
				<View style={styles.placeholderBox}>
					<Text style={styles.placeholderTitle}>Section en construction</Text>
					<Text style={styles.placeholderText}>
						Un éventail de questions/réponses sera ajouté ici prochainement.
						En attendant, n'hésite pas à contacter l'équipe via les coordonnées ci-dessus.
					</Text>
				</View>
			</Section>
		</ScrollView>
	);
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
	<View style={styles.section}>
		<Text style={styles.sectionTitle}>{title}</Text>
		<View style={styles.sectionBody}>{children}</View>
	</View>
);

const ContactRow: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
	<View style={styles.contactRow}>
		<Text style={styles.contactIcon}>{icon}</Text>
		<View style={{ flex: 1 }}>
			<Text style={styles.contactLabel}>{label}</Text>
			<Text style={styles.contactValue}>{value}</Text>
		</View>
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, maxWidth: 900, alignSelf: 'center', width: '100%' },

	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.xs },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginBottom: SPACING.lg, lineHeight: 22 },
	bold: { fontWeight: '700', color: COLORS.text.primary },

	section: { gap: SPACING.sm, marginBottom: SPACING.lg },
	sectionTitle: { ...TYPOGRAPHY.h2 },
	sectionBody: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },

	emptyVideoBox: { padding: SPACING.lg, alignItems: 'center', backgroundColor: COLORS.background.main, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed' as any, borderColor: COLORS.border, gap: 4 },
	emptyVideoTitle: { ...TYPOGRAPHY.body, fontWeight: '600' },
	emptyVideoText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, textAlign: 'center' },

	muted: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },

	contactList: { gap: SPACING.sm },
	contactRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xs },
	contactIcon: { fontSize: 20, width: 28, textAlign: 'center', color: COLORS.primary },
	contactLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	contactValue: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontWeight: '500' },

	placeholderBox: { padding: SPACING.md, backgroundColor: COLORS.background.main, borderRadius: 6, gap: 4 },
	placeholderTitle: { ...TYPOGRAPHY.body, fontWeight: '600' },
	placeholderText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, lineHeight: 19 },
});
