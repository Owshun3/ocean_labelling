import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { AppConfigService } from '@/services/api/AppConfigService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { Platform } from 'react-native';

export const WelcomeScreen: React.FC = () => {
	const [message, setMessage] = useState<string>('');
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const router = useRouter();

	useEffect(() => {
		let isMounted = true;
		
		const fetchMessage = async () => {
			try {
				const configService = new AppConfigService();
				const msg = await configService.getWelcomeMessage();
				if (isMounted) {
					setMessage(msg);
				}
			} catch (error) {
				if (isMounted) {
					setMessage("Bienvenue.");
				}
			} finally {
				if (isMounted) {
					setIsLoading(false);
				}
			}
		};

		fetchMessage();

		return () => {
			isMounted = false;
		};
	}, []);

	const acknowledgeWelcome = () => {
		if (Platform.OS === 'web') {
			localStorage.setItem('has_seen_welcome', 'true');
		}
		router.replace('/(main)' as Href);
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.card}>
				<Text style={styles.title}>Première Connexion</Text>
				
				{isLoading ? (
					<ActivityIndicator size="large" color={COLORS.primary} />
				) : (
					<Text style={styles.message}>{message}</Text>
				)}
				
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