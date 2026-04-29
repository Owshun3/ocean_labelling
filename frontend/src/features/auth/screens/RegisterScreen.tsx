import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { CvatAuthService } from '@/services/api/CvatAuthService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export const RegisterScreen: React.FC = () => {
	const [username, setUsername] = useState('');
	const [email, setEmail] = useState('');
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);
	const router = useRouter();

	const handleRegister = async () => {
		if (!username || !email || !password || !confirmPassword) {
			setError("Les champs principaux sont obligatoires.");
			return;
		}
		if (username.length < 5) {
			setError("Le nom d'utilisateur doit contenir au moins 5 caractères.");
			return;
		}
		if (password.length < 8) {
			setError("Le mot de passe doit contenir au moins 8 caractères.");
			return;
		}
		if (password !== confirmPassword) {
			setError("Les mots de passe ne correspondent pas.");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const authService = new CvatAuthService();
			await authService.register(username, email, firstName, lastName, password);
			router.replace('/(main)/welcome' as Href);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erreur lors de l'inscription.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.card}>
				<Text style={styles.title}>Inscription CVAT</Text>
				
				{error ? <Text style={styles.errorText}>{error}</Text> : null}
				
				<View style={styles.inputGroup}>
					<Text style={styles.label}>Identifiant</Text>
					<TextInput style={[styles.input, { fontStyle: username === '' ? 'italic' : 'normal' }]} placeholder="ex: Utilisateur123" placeholderTextColor={COLORS.text.placeholder} value={username} onChangeText={setUsername} autoCapitalize="none" />
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>Prénom</Text>
					<TextInput style={[styles.input, { fontStyle: firstName === '' ? 'italic' : 'normal' }]} placeholder="Jean" placeholderTextColor={COLORS.text.placeholder} value={firstName} onChangeText={setFirstName} />
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>Nom de famille</Text>
					<TextInput style={[styles.input, { fontStyle: lastName === '' ? 'italic' : 'normal' }]} placeholder="Dupont" placeholderTextColor={COLORS.text.placeholder} value={lastName} onChangeText={setLastName} />
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>Adresse email</Text>
					<TextInput style={[styles.input, { fontStyle: email === '' ? 'italic' : 'normal' }]} placeholder="ex: jean@upf.pf" placeholderTextColor={COLORS.text.placeholder} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
				</View>
				
				<View style={styles.inputGroup}>
					<Text style={styles.label}>Mot de passe</Text>
					<View style={styles.passwordRow}>
						<TextInput style={[styles.input, styles.passwordInput, { fontStyle: password === '' ? 'italic' : 'normal' }]} placeholder="Min. 8 caractères" placeholderTextColor={COLORS.text.placeholder} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
						<Pressable onPress={() => setShowPassword(v => !v)} style={styles.eyeButton}>
							<Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.text.secondary} />
						</Pressable>
					</View>
				</View>

				<View style={styles.inputGroup}>
					<Text style={styles.label}>Confirmer</Text>
					<View style={styles.passwordRow}>
						<TextInput style={[styles.input, styles.passwordInput, { fontStyle: confirmPassword === '' ? 'italic' : 'normal' }]} placeholder="Min. 8 caractères" placeholderTextColor={COLORS.text.placeholder} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} />
						<Pressable onPress={() => setShowPassword(v => !v)} style={styles.eyeButton}>
							<Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.text.secondary} />
						</Pressable>
					</View>
				</View>
				
				{isLoading ? (
					<ActivityIndicator size="large" color={COLORS.primary} />
				) : (
					<Button title="S'inscrire" onPress={handleRegister} color={COLORS.primary} />
				)}

				<View style={styles.switchContainer}>
					<Text style={styles.switchText}>Vous avez déjà un compte ? </Text>
					<Pressable onPress={() => router.replace('/(auth)/login' as Href)}>
						<Text style={styles.link}>S'identifier</Text>
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