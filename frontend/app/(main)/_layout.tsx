import React from 'react';
import { View, StyleSheet } from 'react-native';
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
		// 'auto' n'est pas supporté côté RN natif mais RN-Web le passe en CSS overflow:auto
		// → scrollbar quand le contenu dépasse, sinon comportement normal.
		overflow: 'auto' as any,
		paddingHorizontal: SPACING.lg,
	}
});