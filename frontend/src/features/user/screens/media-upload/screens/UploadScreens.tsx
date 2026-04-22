import React from 'react';
import { View, Text, StyleSheet, Button, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const UploadScreen: React.FC = () => {
	const { localUri, pickImage, clearSelection } = useMediaUpload();

	return (
		<SafeAreaView style={styles.container}>
			<Text style={styles.title}>Nouveau Téléversement</Text>
			
			<View style={styles.uploadCard}>
				{localUri ? (
					<View style={{ width: '100%', alignItems: 'center' }}>
						<Image source={{ uri: localUri }} style={styles.previewImage} />
						
						{/* Correction du nom de la fonction (clearSelection) */}
						<Button title="Retirer l'image" onPress={clearSelection} color={COLORS.danger} />
					</View>
				) : (
					<Button title="Parcourir les images" onPress={pickImage} color={COLORS.primary} />
				)}
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: COLORS.background.main,
		padding: SPACING.md,
	},
	title: {
		...TYPOGRAPHY.h1,
		marginBottom: SPACING.lg,
	},
	uploadCard: {
		backgroundColor: COLORS.background.card,
		padding: SPACING.lg,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: 250,
		borderWidth: 1,
		borderColor: COLORS.border,
		borderStyle: 'dashed',
	},
	previewImage: {
		width: '100%',
		height: 200,
		borderRadius: 4,
		marginBottom: SPACING.md,
	}
});