import React, { useState } from 'react';
import { View, Button, Image, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

export const UploadScreen: React.FC = () => {
	const [selectedImages, setSelectedImages] = useState<any[]>([]);
	const { upload, isUploading } = useMediaUpload();
	const router = useRouter();

	const pickImage = async () => {
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsMultipleSelection: true,
			quality: 0.8,
		});

		if (!result.canceled) {
			setSelectedImages(result.assets);
		}
	};

	const handleUpload = async () => {
		try {
			const success = await upload(selectedImages);
			if (success) router.replace('/(main)/media');
		} catch (error: any) {
			Alert.alert('Erreur', error?.message || "L'envoi a échoué. Vérifiez la connexion.");
		}
	};

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Button title="Sélectionner des photos" onPress={pickImage} />

			<View style={styles.grid}>
				{selectedImages.map((img, idx) => (
					<Image key={idx} source={{ uri: img.uri }} style={styles.thumbnail} />
				))}
			</View>

			{selectedImages.length > 0 && (
				<View style={styles.footer}>
					{isUploading ? (
						<ActivityIndicator color={COLORS.primary} />
					) : (
						<Button
							title={`Téléverser ${selectedImages.length} fichier(s)`}
							onPress={handleUpload}
							color={COLORS.primary}
						/>
					)}
				</View>
			)}
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: { padding: SPACING.lg },
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginVertical: SPACING.xl },
	thumbnail: { width: 100, height: 100, borderRadius: 4 },
	footer: { marginTop: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md },
});
