import { Slot, useSegments, useRouter, Redirect, Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { isSessionAlive, getUserProfile } from '@/services/api/authStorage';
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
	const target = decide(segments);

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

	if (target !== 'pass') {
		return <Redirect href={target as Href} />;
	}

	return (
		<>
			<Slot />
			<ToastHost />
		</>
	);
}
