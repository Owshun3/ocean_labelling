import { Slot, useRouter, useSegments, Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ActivityIndicator, View, StyleSheet } from 'react-native';
import { CvatAuthService } from '@/services/api/CvatAuthService';
import { COLORS } from '@/shared/theme/colors';

export default function RootLayout() {
	const [isAuthChecked, setIsAuthChecked] = useState(false);
	const router = useRouter();
	const segments = useSegments() as string[];

	useEffect(() => {
		let isMounted = true;

		const verifyRouting = async () => {
			try {
				const authService = new CvatAuthService();
				const token = await authService.getToken();
				
				let hasSeenWelcome = true;
				if (Platform.OS === 'web') {
					hasSeenWelcome = localStorage.getItem('has_seen_welcome') === 'true';
				}

				const inAuthGroup = segments[0] === '(auth)';

				if (!isMounted) return;

				if (!token) {
					if (!inAuthGroup) {
						router.replace('/(auth)/login' as Href);
					}
				} else {
					if (!hasSeenWelcome) {
						if (segments[1] !== 'welcome') {
							router.replace('/(main)/welcome' as Href);
						}
					} else if (inAuthGroup || segments.length === 0) {
						router.replace('/(main)' as Href);
					}
				}
			} catch (error) {
				if (isMounted) {
					router.replace('/(auth)/login' as Href);
				}
			} finally {
				if (isMounted) {
					setIsAuthChecked(true);
				}
			}
		};

		verifyRouting();

		return () => {
			isMounted = false;
		};
	}, [segments]);

	if (!isAuthChecked) {
		return (
			<View style={styles.loaderContainer}>
				<ActivityIndicator size="large" color={COLORS.primary} />
			</View>
		);
	}

	return <Slot />;
}

const styles = StyleSheet.create({
	loaderContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: COLORS.background.main,
	}
});