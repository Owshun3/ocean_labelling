import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import axios from 'axios';
import { CvatAuthService, LoginLockoutError } from '@/services/api/CvatAuthService';
import { startGuestSession } from '@/services/api/authStorage';
import { consumeBanInfo, consumeSessionExpired, formatRemaining, BanSessionInfo, SessionExpiredInfo } from '@/services/api/banInterceptor';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

import { APP_API_BASE } from '@/services/api/runtimeUrls';

interface BanState {
	username: string | null;
	reason: string | null;
	expires_at: string | null;
}

type AccountStatus =
	| { kind: 'ok' }
	| { kind: 'banned'; reason: string | null; expires_at: string | null; banned_at: string | null }
	| { kind: 'deactivated' };

// Persistance localStorage du timer de lockout : si l'utilisateur recharge ou
// change d'onglet, le timer reprend sans round-trip serveur. Le serveur reste
// la SEULE source de vérité — si le user efface localStorage, la prochaine
// tentative renverra 429 et on remettra le timer.
const LOCKOUT_LS_PREFIX = 'login_lockout:';
function readLockoutFromStorage(username: string): number | null {
	if (!username || typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(LOCKOUT_LS_PREFIX + username.toLowerCase());
		if (!raw) return null;
		const until = Number(raw);
		if (!Number.isFinite(until) || until <= Date.now()) return null;
		return until;
	} catch { return null; }
}
function writeLockoutToStorage(username: string, until: number | null): void {
	if (!username || typeof window === 'undefined') return;
	try {
		const key = LOCKOUT_LS_PREFIX + username.toLowerCase();
		if (until && until > Date.now()) window.localStorage.setItem(key, String(until));
		else window.localStorage.removeItem(key);
	} catch { /* quota / private mode */ }
}
function formatCountdown(ms: number): string {
	const totalSec = Math.ceil(ms / 1000);
	if (totalSec < 60) return `${totalSec}s`;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	if (min < 60) return `${min} min ${sec.toString().padStart(2, '0')}s`;
	const h = Math.floor(min / 60);
	const m = min % 60;
	return `${h} h ${m.toString().padStart(2, '0')}`;
}

export const LoginScreen: React.FC = () => {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);
	const [rememberMe, setRememberMe] = useState(false);
	const [ban, setBan] = useState<BanState | null>(null);
	const [deactivated, setDeactivated] = useState(false);
	const [sessionExpired, setSessionExpired] = useState<SessionExpiredInfo | null>(null);
	const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
	const [, forceRerender] = useState(0);
	const router = useRouter();
	const settings = usePublicSettings();

	// Quand le username change, charger le lockout persisté pour ce compte.
	useEffect(() => {
		setLockoutUntil(readLockoutFromStorage(username));
	}, [username]);

	// Tick chaque seconde tant qu'un lockout est actif (pour rafraîchir
	// l'affichage du compte à rebours et lever automatiquement le blocage).
	useEffect(() => {
		if (!lockoutUntil) return;
		const id = setInterval(() => {
			if (Date.now() >= lockoutUntil) {
				setLockoutUntil(null);
				writeLockoutToStorage(username, null);
			} else {
				forceRerender((n) => n + 1);
			}
		}, 1000);
		return () => clearInterval(id);
	}, [lockoutUntil, username]);

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

	const checkAccountStatus = async (uname: string): Promise<AccountStatus> => {
		try {
			const resp = await axios.get<{ banned: boolean; deactivated?: boolean; reason: string | null; expires_at: string | null; banned_at: string | null }>(
				`${APP_API_BASE}/moderation/bans/check`,
				{ params: { username: uname } }
			);
			if (resp.data.banned) {
				return { kind: 'banned', reason: resp.data.reason, expires_at: resp.data.expires_at, banned_at: resp.data.banned_at };
			}
			if (resp.data.deactivated) {
				return { kind: 'deactivated' };
			}
		} catch {}
		return { kind: 'ok' };
	};

	const handleLogin = async () => {
		if (!username || !password) {
			setError("Les champs sont obligatoires.");
			return;
		}
		// Garde-fou client : si un lockout est encore actif, refuser sans toucher
		// au serveur (le serveur tranchera de toute façon avec un 429).
		if (lockoutUntil && lockoutUntil > Date.now()) return;

		setIsLoading(true);
		setError(null);
		setBan(null);
		setDeactivated(false);

		try {
			const authService = new CvatAuthService();
			await authService.login(username, password, rememberMe);
			// Login OK → nettoyer le lockout local s'il en restait un.
			writeLockoutToStorage(username, null);
			setLockoutUntil(null);
			router.replace('/(main)' as Href);
		} catch (err) {
			if (err instanceof LoginLockoutError) {
				const until = Date.now() + err.retryAfterMs;
				setLockoutUntil(until);
				writeLockoutToStorage(username, until);
				setError(err.message);
				return;
			}
			const status = await checkAccountStatus(username);
			if (status.kind === 'banned') {
				setBan({ username, reason: status.reason, expires_at: status.expires_at });
			} else if (status.kind === 'deactivated') {
				setDeactivated(true);
			} else {
				setError(err instanceof Error ? err.message : "Échec de la connexion.");
			}
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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

				{deactivated ? (
					<View style={styles.deactivatedBox}>
						<Text style={styles.deactivatedTitle}>Compte désactivé</Text>
						<Text style={styles.deactivatedLine}>
							Cet identifiant existe mais a été désactivé par un administrateur. Contacte l'équipe pour en discuter.
						</Text>
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

				{lockoutUntil && lockoutUntil > Date.now() ? (
					<View style={styles.lockoutBox}>
						<Text style={styles.lockoutTitle}>Trop de tentatives</Text>
						<Text style={styles.lockoutMsg}>
							Pour protéger ce compte, la connexion est temporairement bloquée.
							Nouvelle tentative dans <Text style={styles.lockoutTimer}>{formatCountdown(lockoutUntil - Date.now())}</Text>.
						</Text>
					</View>
				) : null}

				{isLoading ? (
					<ActivityIndicator size="large" color={COLORS.primary} />
				) : (
					<Button
						title="Se connecter"
						onPress={handleLogin}
						color={COLORS.primary}
						disabled={!!(lockoutUntil && lockoutUntil > Date.now())}
					/>
				)}

				<View style={styles.guestRow}>
					<View style={styles.guestDivider} />
					<Text style={styles.guestDividerText}>ou</Text>
					<View style={styles.guestDivider} />
				</View>
				<Pressable
					onPress={() => { startGuestSession(); router.replace('/(main)/landing' as Href); }}
					style={({ hovered, pressed }: any) => [
						styles.guestBtn,
						(hovered || pressed) && styles.guestBtnActive,
					]}
				>
					<Text style={styles.guestBtnText}>Continuer en invité</Text>
				</Pressable>

				<View style={styles.switchContainer}>
					<Text style={styles.switchText}>Vous n'avez pas de compte ? </Text>
					<Pressable onPress={() => router.replace('/(auth)/register' as Href)}>
						<Text style={styles.link}>Créer un compte</Text>
					</Pressable>
				</View>

			</View>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: COLORS.background.main },
	// flexGrow:1 + justifyContent:center -> centre vertical si court, scroll si dépasse.
	scrollContent: { flexGrow: 1, justifyContent: 'center', padding: SPACING.md },
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

	lockoutBox: {
		backgroundColor: COLORS.background.main,
		borderWidth: 1,
		borderColor: COLORS.warning,
		borderRadius: 6,
		padding: SPACING.md,
		marginBottom: SPACING.md,
	},
	lockoutTitle: { ...TYPOGRAPHY.body, fontWeight: 'bold', color: COLORS.warning, marginBottom: SPACING.xs },
	lockoutMsg: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 20 },
	lockoutTimer: { fontWeight: '700', color: COLORS.danger },
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
	deactivatedBox: {
		backgroundColor: COLORS.background.main,
		borderWidth: 1,
		borderColor: COLORS.text.secondary,
		borderRadius: 6,
		padding: SPACING.md,
		marginBottom: SPACING.md,
	},
	deactivatedTitle: { ...TYPOGRAPHY.body, fontWeight: 'bold', color: COLORS.text.secondary, marginBottom: SPACING.xs },
	deactivatedLine: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 20 },
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
	link: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: 'bold' },

	guestRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, marginBottom: SPACING.sm },
	guestDivider: { flex: 1, height: 1, backgroundColor: COLORS.border },
	guestDividerText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
	guestBtn: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		backgroundColor: COLORS.background.main,
		paddingVertical: 10, paddingHorizontal: SPACING.md,
		alignItems: 'center',
	},
	guestBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.background.card },
	guestBtnText: { ...TYPOGRAPHY.body, color: COLORS.text.primary, fontWeight: '600', fontSize: 13 },
});