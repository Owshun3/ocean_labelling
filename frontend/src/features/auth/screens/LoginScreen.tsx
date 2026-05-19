import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import axios from 'axios';
import { CvatAuthService } from '@/services/api/CvatAuthService';
import { consumeBanInfo, consumeSessionExpired, formatRemaining, BanSessionInfo, SessionExpiredInfo } from '@/services/api/banInterceptor';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

interface BanState {
	username: string | null;
	reason: string | null;
	expires_at: string | null;
}

export const LoginScreen: React.FC = () => {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);
	const [rememberMe, setRememberMe] = useState(false);
	const [ban, setBan] = useState<BanState | null>(null);
	const [sessionExpired, setSessionExpired] = useState<SessionExpiredInfo | null>(null);
	const [, forceRerender] = useState(0);
	const router = useRouter();
	const settings = usePublicSettings();

	useEffect(() => {
		const banInfo: BanSessionInfo | null = consumeBanInfo();
		if (banInfo) {
			setBan({ username: null, reason: banInfo.reason, expires_at: banInfo.expires_at });
			return;
		}
		const expiredInfo = consumeSessionExpired();
		if (expiredInfo) setSessionExpired(expiredInfo);
	}, []);

	useEffect(() => {
		if (!ban || !ban.expires_at) return;
		const id = setInterval(() => forceRerender((n) => n + 1), 30_000);
		return () => clearInterval(id);
	}, [ban]);

	const checkBanForUsername = async (uname: string): Promise<BanSessionInfo | null> => {
		try {
			const resp = await axios.get<{ banned: boolean; reason: string | null; expires_at: string | null; banned_at: string | null }>(
				`${APP_API_BASE}/moderation/bans/check`,
				{ params: { username: uname } }
			);
			if (resp.data.banned) {
				return { reason: resp.data.reason, expires_at: resp.data.expires_at, banned_at: resp.data.banned_at };
			}
		} catch {}
		return null;
	};

	const handleLogin = async () => {
		if (!username || !password) {
			setError("Les champs sont obligatoires.");
			return;
		}

		setIsLoading(true);
		setError(null);
		setBan(null);

		try {
			const authService = new CvatAuthService();
			await authService.login(username, password, rememberMe);
			router.replace('/(main)' as Href);
		} catch (err) {
			const banInfo = await checkBanForUsername(username);
			if (banInfo) {
				setBan({ username, reason: banInfo.reason, expires_at: banInfo.expires_at });
			} else {
				setError(err instanceof Error ? err.message : "Échec de la connexion.");
			}
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.card}>
				<Text style={styles.brand}>{settings['platform.name']}</Text>
				<Text style={styles.title}>Connexion</Text>

				{ban ? (
					<View style={styles.banBox}>
						<Text style={styles.banTitle}>Compte banni</Text>
						<Text style={styles.banLine}>
							{ban.expires_at
								? `Bannissement actif — temps restant : ${formatRemaining(ban.expires_at)}`
								: 'Bannissement permanent'}
						</Text>
						{ban.reason ? <Text style={styles.banReason}>Motif : {ban.reason}</Text> : null}
					</View>
				) : null}

				{sessionExpired ? (
					<View style={styles.sessionExpiredBox}>
						<Text style={styles.sessionExpiredTitle}>Session expirée</Text>
						<Text style={styles.sessionExpiredLine}>
							{sessionExpired.reason === 'cvat_unreachable'
								? 'Le serveur d\'authentification n\'a pas pu être joint. Reconnectez-vous.'
								: 'Votre session n\'est plus valide. Veuillez vous reconnecter.'}
						</Text>
					</View>
				) : null}

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
				
				<Pressable onPress={() => setRememberMe(v => !v)} style={styles.rememberRow}>
					<View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
						{rememberMe ? <Ionicons name="checkmark" size={14} color={COLORS.text.inverse} /> : null}
					</View>
					<Text style={styles.rememberLabel}>Se souvenir de moi (30 jours)</Text>
				</Pressable>

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
	brand: { fontSize: 13, color: COLORS.text.secondary, textAlign: 'center', fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: SPACING.sm },
	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.lg, textAlign: 'center' },
	errorText: { color: COLORS.danger, marginBottom: SPACING.md, textAlign: 'center' },
	banBox: {
		backgroundColor: COLORS.background.main,
		borderWidth: 1,
		borderColor: COLORS.danger,
		borderRadius: 6,
		padding: SPACING.md,
		marginBottom: SPACING.md,
	},
	banTitle: { ...TYPOGRAPHY.body, fontWeight: 'bold', color: COLORS.danger, marginBottom: SPACING.xs },
	banLine: { ...TYPOGRAPHY.body, color: COLORS.text.primary },
	banReason: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginTop: SPACING.xs, fontStyle: 'italic' },
	sessionExpiredBox: {
		backgroundColor: COLORS.background.main,
		borderWidth: 1,
		borderColor: COLORS.warning,
		borderRadius: 6,
		padding: SPACING.md,
		marginBottom: SPACING.md,
	},
	sessionExpiredTitle: { ...TYPOGRAPHY.body, fontWeight: 'bold', color: COLORS.warning, marginBottom: SPACING.xs },
	sessionExpiredLine: { ...TYPOGRAPHY.body, color: COLORS.text.primary },
	inputGroup: { marginBottom: SPACING.md },
	label: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.xs, fontWeight: '600' },
	input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: SPACING.md, ...TYPOGRAPHY.body },
	passwordRow: { flexDirection: 'row', alignItems: 'center' },
	passwordInput: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
	eyeButton: { borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 0, borderTopRightRadius: 4, borderBottomRightRadius: 4, paddingHorizontal: SPACING.sm, justifyContent: 'center', alignSelf: 'stretch' },
	rememberRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
	checkbox: { width: 18, height: 18, borderRadius: 3, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background.main, alignItems: 'center', justifyContent: 'center' },
	checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	rememberLabel: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontSize: 13 },
	contactBlock: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 4, alignItems: 'center' },
	contactLine: { fontSize: 12, color: COLORS.text.secondary },
	switchContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.xl, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
	switchText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
	link: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: 'bold' }
});