import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { CvatAuthService } from '@/services/api/CvatAuthService';
import { useRouter, Href } from 'expo-router';

export const ProfileScreen: React.FC = () => {
	const router = useRouter();

	const handleLogout = async () => {
		const authService = new CvatAuthService();
		await authService.logout();
		router.replace('/(auth)/login' as Href);
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Mon Profil</Text>
			<Button title="Se déconnecter" onPress={handleLogout} color={COLORS.danger} />
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
	title: { ...TYPOGRAPHY.h1, marginBottom: 20 },
});