import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Button, Image, Pressable, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { AppApiService } from '@/services/api/AppApiService';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

const DEFAULT_MAX_BATCH_BYTES = 200 * 1024 * 1024;
const MEGABYTE = 1024 * 1024;

const fileSize = (img: any): number => {
	if (typeof img?.fileSize === 'number') return img.fileSize;
	if (img?.file && typeof img.file.size === 'number') return img.file.size;
	return 0;
};

export const UploadScreen: React.FC = () => {
	const [selectedImages, setSelectedImages] = useState<any[]>([]);
	const [maxBatchBytes, setMaxBatchBytes] = useState<number>(DEFAULT_MAX_BATCH_BYTES);
	const { upload, isUploading, progress } = useMediaUpload();
	const router = useRouter();
	const appService = useMemo(() => new AppApiService(), []);

	useEffect(() => {
		appService.getSettings()
			.then((s) => {
				const n = Number(s.upload_max_bytes);
				if (Number.isFinite(n) && n > 0) setMaxBatchBytes(n);
			})
			.catch(() => { /* fallback to default */ });
	}, [appService]);

	const totalBytes = useMemo(
		() => selectedImages.reduce((sum, img) => sum + fileSize(img), 0),
		[selectedImages]
	);
	const totalMB  = totalBytes / MEGABYTE;
	const limitMB  = maxBatchBytes / MEGABYTE;
	const fillPct  = Math.min(100, (totalBytes / maxBatchBytes) * 100);
	const overLimit = totalBytes > maxBatchBytes;

	const uploadProgressPct = progress.total > 0
		? Math.round((progress.current / progress.total) * 100)
		: 0;
	const animatedFill = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		Animated.timing(animatedFill, {
			toValue: uploadProgressPct,
			duration: 350,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: false,
		}).start();
	}, [uploadProgressPct, animatedFill]);
	const animatedWidth = animatedFill.interpolate({
		inputRange: [0, 100],
		outputRange: ['0%', '100%'],
	});

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

	const removeImage = (index: number) => {
		setSelectedImages((prev) => prev.filter((_, i) => i !== index));
	};

	const handleUpload = async () => {
		if (overLimit) return;
		try {
			const taskIds = await upload(selectedImages);
			if (taskIds.length > 0) {
				toast.success(
					taskIds.length === 1
						? 'Média téléversé et soumis à la modération.'
						: `${taskIds.length} médias téléversés et soumis à la modération.`,
				);
				router.replace('/(main)/media');
			}
		} catch (error: any) {
			toast.error(error?.message || "L'envoi a échoué. Vérifiez la connexion.");
		}
	};

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Button title="Sélectionner des photos" onPress={pickImage} />

			<View style={styles.grid}>
				{selectedImages.map((img, idx) => (
					<View key={idx} style={styles.thumbnailWrapper}>
						<Image source={{ uri: img.uri }} style={styles.thumbnail} />
						<Pressable
							onPress={() => removeImage(idx)}
							style={styles.removeBtn}
							hitSlop={8}
							disabled={isUploading}
						>
							<Text style={styles.removeBtnText}>✕</Text>
						</Pressable>
					</View>
				))}
			</View>

			{selectedImages.length > 0 && (
				<View style={styles.gaugeBox}>
					<View style={styles.gaugeRow}>
						<Text style={styles.gaugeText}>
							{totalMB.toFixed(1)} / {limitMB.toFixed(0)} MB · {selectedImages.length} fichier(s)
						</Text>
						{overLimit && <Text style={styles.gaugeError}>Limite dépassée</Text>}
					</View>
					<View style={styles.gaugeTrack}>
						<View
							style={[
								styles.gaugeFill,
								{ width: `${fillPct}%`, backgroundColor: overLimit ? COLORS.danger : COLORS.primary },
							]}
						/>
					</View>
				</View>
			)}

			{selectedImages.length > 0 && (
				<View style={styles.footer}>
					{isUploading ? (
						<View style={styles.uploadProgressBox}>
							<View style={styles.uploadProgressHeader}>
								<Text style={styles.uploadProgressLabel}>
									Téléversement en cours · {progress.current} / {progress.total}
								</Text>
								<Text style={styles.uploadProgressPct}>{uploadProgressPct}%</Text>
							</View>
							<View style={styles.uploadProgressTrack}>
								<Animated.View
									style={[
										styles.uploadProgressFill,
										{ width: animatedWidth },
									]}
								/>
							</View>
						</View>
					) : (
						<Button
							title={`Téléverser ${selectedImages.length} fichier(s)`}
							onPress={handleUpload}
							color={COLORS.primary}
							disabled={overLimit}
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
	thumbnailWrapper: { position: 'relative', width: 100, height: 100 },
	thumbnail: { width: 100, height: 100, borderRadius: 4 },
	removeBtn: {
		position: 'absolute',
		top: -6,
		right: -6,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: COLORS.danger,
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#000',
		shadowOpacity: 0.25,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
		elevation: 3,
	},
	removeBtnText: { color: COLORS.text.inverse, fontSize: 13, fontWeight: 'bold', lineHeight: 14 },
	footer: { marginTop: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md },
	gaugeBox: { padding: SPACING.md, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
	gaugeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
	gaugeText: { fontSize: 14, color: COLORS.text.primary, fontWeight: '500' },
	gaugeError: { fontSize: 13, color: COLORS.danger, fontWeight: '600' },
	gaugeTrack: { height: 8, backgroundColor: COLORS.background.main, borderRadius: 4, overflow: 'hidden' },
	gaugeFill: { height: '100%', borderRadius: 4 },
	uploadProgressBox: {
		padding: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		gap: SPACING.sm,
	},
	uploadProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
	uploadProgressLabel: { fontSize: 14, color: COLORS.text.primary, fontWeight: '500' },
	uploadProgressPct: { fontSize: 18, color: COLORS.primary, fontWeight: '700', fontVariant: ['tabular-nums'] },
	uploadProgressTrack: {
		height: 12,
		backgroundColor: COLORS.background.main,
		borderRadius: 6,
		overflow: 'hidden',
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	uploadProgressFill: {
		height: '100%',
		backgroundColor: COLORS.primary,
		borderRadius: 6,
	},
});
