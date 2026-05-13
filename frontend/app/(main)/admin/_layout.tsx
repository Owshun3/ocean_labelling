import React, { useEffect, useState } from 'react';
import { Slot, useRouter, usePathname, Href } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { getUserProfile } from '@/services/api/authStorage';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

export default function AdminLayout() {
	const router = useRouter();
	const pathname = usePathname();
	const onDashboard = pathname === '/admin' || pathname === '/(main)/admin';
	const [authorized, setAuthorized] = useState<boolean | null>(null);

	useEffect(() => {
		const profile = getUserProfile();
		const isAdmin = profile?.appRole === 'admin' || profile?.is_superuser === true;
		if (!isAdmin) {
			router.replace('/(main)' as Href);
			setAuthorized(false);
			return;
		}
		setAuthorized(true);
	}, [router]);

	if (authorized !== true) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}

	return (
		<View style={styles.layout}>
			{!onDashboard && (
				<Pressable onPress={() => router.push('/(main)/admin' as Href)} style={styles.backToDash}>
					<Text style={styles.backText}>← Tableau de bord administrateur</Text>
				</Pressable>
			)}
			<Slot />
		</View>
	);
}

const styles = StyleSheet.create({
	layout: { flex: 1 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	backToDash: {
		paddingHorizontal: SPACING.lg,
		paddingTop: SPACING.sm,
	},
	backText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600' },
});
