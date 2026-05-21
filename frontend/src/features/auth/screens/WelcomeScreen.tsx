import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { appApiClient } from '@/services/api/AppApiService';
import { getUserProfile, saveUserProfile } from '@/services/api/authStorage';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const WelcomeScreen: React.FC = () => {
	const router = useRouter();
	const settings = usePublicSettings();
	const message = settings['platform.welcome_message'] || 'Bienvenue.';

	const acknowledgeWelcome = async () => {
		try {
			await appApiClient.post('/auth/welcome-seen');
		} catch { /* best-effort */ }
		const stored = getUserProfile();
		if (stored) saveUserProfile({ ...stored, hasSeenWelcome: true });
		router.replace('/(main)' as Href);
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.card}>
				<Text style={styles.title}>Première Connexion</Text>
				
				<Text style={styles.message}>{message}</Text>
				
				<Button title="Commencer" onPress={acknowledgeWelcome} color={COLORS.primary} />
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: COLORS.background.main,
		justifyContent: 'center',
		padding: SPACING.md,
	},
	card: {
		backgroundColor: COLORS.background.card,
		padding: SPACING.lg,
		borderRadius: 8,
		alignItems: 'center',
	},
	title: {
		...TYPOGRAPHY.h1,
		marginBottom: SPACING.lg,
	},
	message: {
		...TYPOGRAPHY.body,
		marginBottom: SPACING.lg,
		textAlign: 'center',
	}
});