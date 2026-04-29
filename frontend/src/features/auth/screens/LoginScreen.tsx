import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { CvatAuthService } from '@/services/api/CvatAuthService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export const LoginScreen: React.FC = () => {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);
	const router = useRouter();

	const handleLogin = async () => {
		if (!username || !password) {
			setError("Les champs sont obligatoires.");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const authService = new CvatAuthService();
			await authService.login(username, password);
			router.replace('/(main)' as Href);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Échec de la connexion.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.card}>
				<Text style={styles.title}>Connexion</Text>
				
				{error ? <Text style={styles.errorText}>{error}</Text> : null}
				
				<View style={styles.inputGroup}>
					<Text style={styles.label}>Nom d'utilisateur</Text>
					<TextInput
						style={[styles.input, { fontStyle: username === '' ? 'italic' : 'normal' }]}
						placeholder="Votre identifiant"
						placeholderTextColor={COLORS.text.placeholder}
						value={username}
						onChangeText={setUsername}
						autoCapitalize="none"
					/>
				</View>
				
				<View style={styles.inputGroup}>
					<Text style={styles.label}>Mot de passe</Text>
					<View style={styles.passwordRow}>
						<TextInput
							style={[styles.input, styles.passwordInput, { fontStyle: password === '' ? 'italic' : 'normal' }]}
							placeholder="Votre mot de passe"
							placeholderTextColor={COLORS.text.placeholder}
							value={password}
							onChangeText={setPassword}
							secureTextEntry={!showPassword}
						/>
						<Pressable onPress={() => setShowPassword(v => !v)} style={styles.eyeButton}>
							<Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.text.secondary} />
						</Pressable>
					</View>
				</View>
				
				{isLoading ? (
					<ActivityIndicator size="large" color={COLORS.primary} />
				) : (
					<Button title="Se connecter" onPress={handleLogin} color={COLORS.primary} />
				)}

				<View style={styles.switchContainer}>
					<Text style={styles.switchText}>Vous n'avez pas de compte ? </Text>
					<Pressable onPress={() => router.replace('/(auth)/register' as Href)}>
						<Text style={styles.link}>Créer un compte</Text>
					</Pressable>
				</View>
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background.main, justifyContent: 'center', padding: SPACING.md },
	card: { backgroundColor: COLORS.background.card, padding: SPACING.lg, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, maxWidth: 400, width: '100%', alignSelf: 'center' },
	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.lg, textAlign: 'center' },
	errorText: { color: COLORS.danger, marginBottom: SPACING.md, textAlign: 'center' },
	inputGroup: { marginBottom: SPACING.md },
	label: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.xs, fontWeight: '600' },
	input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: SPACING.md, ...TYPOGRAPHY.body },
	passwordRow: { flexDirection: 'row', alignItems: 'center' },
	passwordInput: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
	eyeButton: { borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 0, borderTopRightRadius: 4, borderBottomRightRadius: 4, paddingHorizontal: SPACING.sm, justifyContent: 'center', alignSelf: 'stretch' },
	switchContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.xl, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
	switchText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
	link: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: 'bold' }
});