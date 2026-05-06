import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Slot } from 'expo-router';
import { Header } from '@/shared/components/layout/Header';
import { Breadcrumb } from '@/shared/components/layout/Breadcrumb';
import { Footer } from '@/shared/components/layout/Footer';
import { COLORS } from '@/shared/theme/colors';

export default function MainLayout() {
	return (
		<View style={styles.layout}>
			<Header />
			<Breadcrumb />
			<View style={styles.content}>
				<Slot />
			</View>
			<Footer />
		</View>
	);
}

const styles = StyleSheet.create({
	layout: {
		flex: 1,
		backgroundColor: COLORS.background.main,
	},
	content: {
		flex: 1,
		overflow: 'hidden',
	}
});