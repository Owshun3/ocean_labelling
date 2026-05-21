import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Slot } from 'expo-router';
import { Header } from '@/shared/components/layout/Header';
import { Breadcrumb } from '@/shared/components/layout/Breadcrumb';
import { Footer } from '@/shared/components/layout/Footer';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

export default function MainLayout() {
	return (
		<View style={styles.layout}>
			<Header />
			<Breadcrumb />
			<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
				<View style={styles.content}>
					<Slot />
				</View>
				<Footer />
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	layout: {
		flex: 1,
		backgroundColor: COLORS.background.main,
	},
	scroll: { flex: 1 },
	scrollContent: { flexGrow: 1, minHeight: '100%' },
	content: { flex: 1, paddingHorizontal: SPACING.lg },
});