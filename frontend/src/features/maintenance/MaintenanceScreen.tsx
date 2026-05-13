import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { isSessionAlive, getUserProfile, clearUserProfile, clearSessionAlive } from '@/services/api/authStorage';
import { CvatAuthService } from '@/services/api/CvatAuthService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export const MaintenanceScreen: React.FC = () => {
	const router = useRouter();
	const settings = usePublicSettings();
	const alive = isSessionAlive();
	const profile = getUserProfile();
	const isAdmin = !!profile && (profile.appRole === 'admin' || profile.is_superuser);

	const logout = async () => {
		try { await new CvatAuthService().logout(); } catch {}
		clearSessionAlive();
		clearUserProfile();
		router.replace('/(auth)/login' as Href);
	};

	return (
		<View style={styles.container}>
			<View style={styles.card}>
				<Ionicons name="construct" size={48} color={COLORS.warning} />
				<Text style={styles.title}>{settings['platform.name']}</Text>
				<Text style={styles.heading}>Maintenance en cours</Text>
				<Text style={styles.message}>{settings['platform.maintenance_message']}</Text>

				{(settings['platform.contact_email'] || settings['platform.contact_phone']) ? (
					<View style={styles.contactBlock}>
						<Text style={styles.contactTitle}>Une urgence ?</Text>
						{settings['platform.contact_email'] ? (
							<Text style={styles.contactLine}>✉ {settings['platform.contact_email']}</Text>
						) : null}
						{settings['platform.contact_phone'] ? (
							<Text style={styles.contactLine}>☎ {settings['platform.contact_phone']}</Text>
						) : null}
						{settings['platform.contact_hours'] ? (
							<Text style={styles.contactLine}>🕐 {settings['platform.contact_hours']}</Text>
						) : null}
					</View>
				) : null}

				<View style={styles.actions}>
					{!alive ? (
						<Pressable onPress={() => router.replace('/(auth)/login' as Href)} style={styles.adminBtn}>
							<Text style={styles.adminBtnText}>Espace administrateur</Text>
						</Pressable>
					) : isAdmin ? (
						<Pressable onPress={() => router.replace('/(main)/admin' as Href)} style={styles.adminBtn}>
							<Text style={styles.adminBtnText}>Tableau de bord admin</Text>
						</Pressable>
					) : (
						<Pressable onPress={logout} style={styles.logoutBtn}>
							<Text style={styles.logoutBtnText}>Se déconnecter</Text>
						</Pressable>
					)}
				</View>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background.main, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
		padding: SPACING.xl, gap: SPACING.md, maxWidth: 520, width: '100%',
		alignItems: 'center',
	},
	title: { ...TYPOGRAPHY.h1, fontSize: 20, color: COLORS.text.primary, marginTop: SPACING.xs },
	heading: { ...TYPOGRAPHY.h2, fontSize: 17, color: COLORS.warning },
	message: { ...TYPOGRAPHY.body, color: COLORS.text.primary, textAlign: 'center', lineHeight: 22 },

	contactBlock: {
		marginTop: SPACING.md,
		paddingTop: SPACING.md,
		borderTopWidth: 1, borderTopColor: COLORS.border,
		alignSelf: 'stretch', gap: 4, alignItems: 'center',
	},
	contactTitle: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	contactLine: { fontSize: 13, color: COLORS.text.primary },

	actions: { marginTop: SPACING.md, flexDirection: 'row', gap: SPACING.sm },
	adminBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.primary },
	adminBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },
	logoutBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
	logoutBtnText: { color: COLORS.text.primary, fontWeight: '600', fontSize: 13 },
});
