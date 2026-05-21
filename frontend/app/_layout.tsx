import 'react-native-gesture-handler';
import { Slot, useSegments, useRouter, Redirect, Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { isSessionAlive, getUserProfile } from '@/services/api/authStorage';
import { setRouterRef } from '@/services/api/routerRef';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';
import { MaintenanceScreen } from '@/features/maintenance/MaintenanceScreen';
import { ToastHost } from '@/shared/toast/Toast';

type Target = 'pass' | '/(auth)/login' | '/(main)' | '/(main)/welcome';

function decide(segments: string[]): Target {
	const alive = isSessionAlive();
	const inAuthGroup = segments[0] === '(auth)';

	if (!alive) {
		return inAuthGroup ? 'pass' : '/(auth)/login';
	}

	const profile = getUserProfile();
	const hasSeenWelcome = profile?.hasSeenWelcome ?? true;

	if (!hasSeenWelcome) {
		return segments[1] === 'welcome' ? 'pass' : '/(main)/welcome';
	}
	if (inAuthGroup || segments.length === 0) {
		return '/(main)';
	}
	return 'pass';
}

export default function RootLayout() {
	const segments = useSegments() as string[];
	const router = useRouter();
	const settings = usePublicSettings();
	const target = decide(segments);

	useEffect(() => {
		setRouterRef(router);
		return () => setRouterRef(null);
	}, [router]);

	useEffect(() => {
		if (Platform.OS !== 'web' || typeof window === 'undefined') return;
		const onStorage = (e: StorageEvent) => {
			if (e.key === 'ocean_session_alive' && e.newValue === null) {
				setTimeout(() => router.replace('/(auth)/login' as Href), 0);
			}
		};
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	}, [router]);

	useEffect(() => {
		if (Platform.OS !== 'web' || typeof document === 'undefined') return;
		document.title = settings['platform.name'] || 'Ocean Labelling';
	}, [settings]);

	// Empêche la sélection accidentelle du texte des boutons quand l'utilisateur
	// clique un peu vite ou drague la souris. Cible toutes les Pressable RN Web
	// (rendues `role="button"`) + les <button> HTML natifs + leur descendance.
	useEffect(() => {
		if (Platform.OS !== 'web' || typeof document === 'undefined') return;
		const styleId = 'ocean-no-select-buttons';
		if (document.getElementById(styleId)) return;
		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
			[role="button"], [role="button"] *,
			button, button * {
				user-select: none;
				-webkit-user-select: none;
				-ms-user-select: none;
			}
			/* Masque l'icône œil natif des navigateurs (Edge/IE) sur les champs
			 * password : on a déjà notre propre toggle Ionicons à droite, le doublon
			 * gênait à la saisie. */
			input::-ms-reveal,
			input::-ms-clear {
				display: none;
			}
		`;
		document.head.appendChild(style);
	}, []);

	if (settings['platform.maintenance_mode']) {
		const profile = getUserProfile();
		const isAdmin = !!profile && (profile.appRole === 'admin' || profile.is_superuser);
		const inAuthGroup = segments[0] === '(auth)';
		// Toujours laisser passer le groupe (auth) : un visiteur doit pouvoir tenter le login pour
		// vérifier s'il est admin. Sinon le site peut se retrouver verrouillé indéfiniment.
		// Admin authentifié : accès complet (le middleware backend bypass maintenance pour lui).
		if (!(inAuthGroup || isAdmin)) {
			return (
				<GestureHandlerRootView style={{ flex: 1 }}>
					<MaintenanceScreen />
					<ToastHost />
				</GestureHandlerRootView>
			);
		}
	}

	if (target !== 'pass') {
		return <Redirect href={target as Href} />;
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<Slot />
			<ToastHost />
		</GestureHandlerRootView>
	);
}
