import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Button, Image, Pressable, ScrollView, StyleSheet, Animated, Easing, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { useVideoUpload } from '../hooks/useVideoUpload';
import { AppApiService } from '@/services/api/AppApiService';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

const DEFAULT_MAX_BATCH_BYTES = 200 * 1024 * 1024;
const MEGABYTE = 1024 * 1024;

const ACCEPTED_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];

const fileSize = (img: any): number => {
	if (typeof img?.fileSize === 'number') return img.fileSize;
	if (img?.file && typeof img.file.size === 'number') return img.file.size;
	if (img instanceof File) return img.size;
	return 0;
};

type Mode = 'photos' | 'videos';

export const UploadScreen: React.FC = () => {
	const [mode, setMode] = useState<Mode>('photos');
	const [maxBatchBytes, setMaxBatchBytes] = useState<number>(DEFAULT_MAX_BATCH_BYTES);
	const router = useRouter();
	const appService = useMemo(() => new AppApiService(), []);

	useEffect(() => {
		appService.getSettings()
			.then((s) => {
				const n = Number(s.upload_max_bytes);
				if (Number.isFinite(n) && n > 0) setMaxBatchBytes(n);
			})
			.catch(() => { /* fallback */ });
	}, [appService]);

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<View style={styles.modeRow}>
				<Pressable
					onPress={() => setMode('photos')}
					style={[styles.modeBtn, mode === 'photos' && styles.modeBtnActive]}
				>
					<Text style={[styles.modeBtnText, mode === 'photos' && styles.modeBtnTextActive]}>Photos</Text>
				</Pressable>
				<Pressable
					onPress={() => setMode('videos')}
					style={[styles.modeBtn, mode === 'videos' && styles.modeBtnActive]}
				>
					<Text style={[styles.modeBtnText, mode === 'videos' && styles.modeBtnTextActive]}>Vidéos</Text>
				</Pressable>
			</View>

			{mode === 'photos'
				? <PhotosUpload maxBatchBytes={maxBatchBytes} router={router} />
				: <VideosUpload maxBatchBytes={maxBatchBytes} router={router} />}
		</ScrollView>
	);
};

const PhotosUpload: React.FC<{ maxBatchBytes: number; router: any }> = ({ maxBatchBytes, router }) => {
	const [selectedImages, setSelectedImages] = useState<any[]>([]);
	const { upload, isUploading, progress } = useMediaUpload();

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
	const animatedWidth = animatedFill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

	const pickImage = async () => {
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsMultipleSelection: true,
			quality: 0.8,
		});
		if (!result.canceled) setSelectedImages(result.assets);
	};
	const removeImage = (index: number) => setSelectedImages((prev) => prev.filter((_, i) => i !== index));

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
		<View>
			<Text style={styles.limitHint}>
				Limite par lot : <Text style={styles.limitHintStrong}>{limitMB.toFixed(0)} Mo</Text>
			</Text>
			<Button title="Sélectionner des photos" onPress={pickImage} />
			<View style={styles.grid}>
				{selectedImages.map((img, idx) => (
					<View key={idx} style={styles.thumbnailWrapper}>
						<Image source={{ uri: img.uri }} style={styles.thumbnail} />
						<Pressable onPress={() => removeImage(idx)} style={styles.removeBtn} hitSlop={8} disabled={isUploading}>
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
						<View style={[styles.gaugeFill, { width: `${fillPct}%`, backgroundColor: overLimit ? COLORS.danger : COLORS.primary }]} />
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
								<Animated.View style={[styles.uploadProgressFill, { width: animatedWidth }]} />
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
		</View>
	);
};

const VideosUpload: React.FC<{ maxBatchBytes: number; router: any }> = ({ maxBatchBytes, router }) => {
	const [files, setFiles] = useState<File[]>([]);
	const { upload, isUploading, progress } = useVideoUpload();

	const totalBytes = files.reduce((s, f) => s + f.size, 0);
	const totalMB  = totalBytes / MEGABYTE;
	const limitMB  = maxBatchBytes / MEGABYTE;
	const overLimit = totalBytes > maxBatchBytes;

	const pickVideos = async () => {
		if (Platform.OS !== 'web') {
			toast.error('Upload vidéo : web uniquement pour l\'instant.');
			return;
		}
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = ACCEPTED_VIDEO_MIMES.join(',');
		input.multiple = true;
		input.style.display = 'none';
		input.addEventListener('change', () => {
			const list = Array.from(input.files || []);
			const valid = list.filter((f) => ACCEPTED_VIDEO_MIMES.includes(f.type) || /\.(mp4|webm|mov)$/i.test(f.name));
			if (valid.length === 0) {
				toast.error('Aucune vidéo valide. Formats acceptés : MP4, WebM, MOV.');
				return;
			}
			setFiles(valid);
		}, { once: true });
		document.body.appendChild(input);
		input.click();
		setTimeout(() => { input.parentNode?.removeChild(input); }, 0);
	};

	const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

	const handleUpload = async () => {
		if (overLimit) return;
		try {
			const ids = await upload(files);
			if (ids.length > 0) {
				toast.success(ids.length === 1
					? 'Vidéo téléversée et soumise à la modération.'
					: `${ids.length} vidéos téléversées et soumises à la modération.`);
				router.replace('/(main)/media');
			}
		} catch (err) {
			/* toast handled by hook */
		}
	};

	const stepPct = progress.total > 0
		? Math.round(((progress.current + progress.pct / 100) / progress.total) * 100)
		: 0;

	return (
		<View>
			<Text style={styles.limitHint}>
				Limite par lot : <Text style={styles.limitHintStrong}>{limitMB.toFixed(0)} Mo</Text> · Formats acceptés : MP4, WebM, MOV
			</Text>
			<Button title="Sélectionner des vidéos" onPress={pickVideos} />
			<View style={styles.grid}>
				{files.map((f, idx) => (
					<View key={idx} style={styles.videoChip}>
						<Text numberOfLines={1} style={styles.videoChipName}>{f.name}</Text>
						<Text style={styles.videoChipMeta}>{(f.size / MEGABYTE).toFixed(1)} MB · {f.type || 'video'}</Text>
						<Pressable onPress={() => removeFile(idx)} style={styles.removeBtn} hitSlop={8} disabled={isUploading}>
							<Text style={styles.removeBtnText}>✕</Text>
						</Pressable>
					</View>
				))}
			</View>
			{files.length > 0 && (
				<View style={styles.gaugeBox}>
					<View style={styles.gaugeRow}>
						<Text style={styles.gaugeText}>
							{totalMB.toFixed(1)} / {limitMB.toFixed(0)} MB · {files.length} fichier(s)
						</Text>
						{overLimit && <Text style={styles.gaugeError}>Limite dépassée</Text>}
					</View>
					<View style={styles.gaugeTrack}>
						<View style={[styles.gaugeFill, { width: `${Math.min(100, (totalBytes / maxBatchBytes) * 100)}%`, backgroundColor: overLimit ? COLORS.danger : COLORS.primary }]} />
					</View>
				</View>
			)}
			{files.length > 0 && (
				<View style={styles.footer}>
					{isUploading ? (
						<View style={styles.uploadProgressBox}>
							<View style={styles.uploadProgressHeader}>
								<Text style={styles.uploadProgressLabel}>
									Téléversement · {progress.current} / {progress.total} · vidéo en cours : {progress.pct}%
								</Text>
								<Text style={styles.uploadProgressPct}>{stepPct}%</Text>
							</View>
							<View style={styles.uploadProgressTrack}>
								<View style={[styles.uploadProgressFill, { width: `${stepPct}%` }]} />
							</View>
						</View>
					) : (
						<Button
							title={`Téléverser ${files.length} vidéo(s)`}
							onPress={handleUpload}
							color={COLORS.primary}
							disabled={overLimit}
						/>
					)}
				</View>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { padding: SPACING.lg },
	modeRow: {
		flexDirection: 'row',
		gap: SPACING.sm,
		marginBottom: SPACING.md,
		alignSelf: 'center',
		backgroundColor: COLORS.background.card,
		borderRadius: 999,
		padding: 4,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	modeBtn: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: 999 },
	modeBtnActive: { backgroundColor: COLORS.primary },
	modeBtnText: { color: COLORS.text.primary, fontWeight: '600' },
	modeBtnTextActive: { color: COLORS.text.inverse },

	limitHint: { fontSize: 12, color: COLORS.text.secondary, marginBottom: SPACING.sm, textAlign: 'center' },
	limitHintStrong: { fontWeight: '700', color: COLORS.text.primary },
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginVertical: SPACING.xl },
	thumbnailWrapper: { position: 'relative', width: 100, height: 100 },
	thumbnail: { width: 100, height: 100, borderRadius: 4 },

	videoChip: {
		position: 'relative',
		width: 220,
		padding: SPACING.sm,
		backgroundColor: COLORS.background.card,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	videoChipName: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary },
	videoChipMeta: { fontSize: 11, color: COLORS.text.secondary, marginTop: 2 },

	removeBtn: {
		position: 'absolute',
		top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
		backgroundColor: COLORS.danger,
		alignItems: 'center', justifyContent: 'center',
		shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
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
		padding: SPACING.md, backgroundColor: COLORS.background.card,
		borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm,
	},
	uploadProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
	uploadProgressLabel: { fontSize: 14, color: COLORS.text.primary, fontWeight: '500' },
	uploadProgressPct: { fontSize: 18, color: COLORS.primary, fontWeight: '700', fontVariant: ['tabular-nums'] },
	uploadProgressTrack: { height: 12, backgroundColor: COLORS.background.main, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
	uploadProgressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 6 },
});
