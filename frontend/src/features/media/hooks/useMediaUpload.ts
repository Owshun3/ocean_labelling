import { useState } from 'react';
import { Platform } from 'react-native';
// Import explicite du build ESM browser : évite que Metro tente de résoudre
// les fallbacks Node (`fs`, `zlib`) de la version UMD et warn au reload.
import * as exifr from 'exifr/dist/full.esm.js';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AppApiService } from '@/services/api/AppApiService';
import { MediaMetadataService } from '@/services/api/MediaMetadataService';
import { toast } from '@/shared/toast/Toast';

async function extractExif(asset: any): Promise<{
	gps_latitude?: number; gps_longitude?: number;
	taken_at?: string; camera_make?: string; camera_model?: string;
	image_width?: number; image_height?: number;
	raw?: Record<string, unknown>;
} | null> {
	if (Platform.OS !== 'web') return null;
	const file: File | null = asset?.file instanceof File ? asset.file : null;
	if (!file) return null;
	try {
		const data: any = await exifr.parse(file, true);
		if (!data) return null;
		return {
			gps_latitude:  typeof data.latitude  === 'number' ? data.latitude  : undefined,
			gps_longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
			taken_at:      data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal.toISOString() : undefined,
			camera_make:   typeof data.Make  === 'string' ? data.Make  : undefined,
			camera_model:  typeof data.Model === 'string' ? data.Model : undefined,
			image_width:   typeof data.ImageWidth  === 'number' ? data.ImageWidth  : (typeof data.ExifImageWidth  === 'number' ? data.ExifImageWidth  : undefined),
			image_height:  typeof data.ImageHeight === 'number' ? data.ImageHeight : (typeof data.ExifImageHeight === 'number' ? data.ExifImageHeight : undefined),
			raw: data as Record<string, unknown>,
		};
	} catch {
		return null;
	}
}

// EXIF strip: re-encode via canvas. Removes ALL metadata (GPS, camera, etc.).
// Only runs on web with a File asset. Returns the original asset unchanged on failure.
async function stripExifFromAsset(asset: any): Promise<any> {
	if (Platform.OS !== 'web') return asset;
	const file: File | null = asset?.file instanceof File ? asset.file : null;
	if (!file || !/^image\//.test(file.type)) return asset;

	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const im = new Image();
			im.onload  = () => { URL.revokeObjectURL(url); resolve(im); };
			im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
			im.src = url;
		});
		const c = document.createElement('canvas');
		c.width  = img.naturalWidth;
		c.height = img.naturalHeight;
		const ctx = c.getContext('2d');
		if (!ctx) return asset;
		ctx.drawImage(img, 0, 0);
		const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92));
		if (!blob) return asset;
		const newName = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
		const stripped = new File([blob], newName, { type: 'image/jpeg' });
		return { ...asset, file: stripped, fileSize: stripped.size, mimeType: 'image/jpeg' };
	} catch (err) {
		console.warn('[upload] EXIF strip failed, sending original', err);
		return asset;
	}
}

export interface UploadProgress {
	current: number;
	total: number;
}

export const useMediaUpload = () => {
	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState<UploadProgress>({ current: 0, total: 0 });

	const upload = async (files: any[]): Promise<number[]> => {
		if (files.length === 0) return [];

		setIsUploading(true);
		setProgress({ current: 0, total: files.length });

		const cvat = new CvatMediaService();
		const app  = new AppApiService();
		const taskIds: number[] = [];
		const moderationErrors: { taskId: number; status?: number; message: string }[] = [];

		try {
			const self = await cvat.getSelf();
			const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
			const metaService = new MediaMetadataService();

			for (let i = 0; i < files.length; i++) {
				const original = files[i];
				const exifPromise = extractExif(original);
				const strippedAsset = await stripExifFromAsset(original);

				const uploadNum = await cvat.getNextUploadNumber();
				const baseName = `${self.username}_${date}_${String(uploadNum).padStart(4, '0')}`;
				const taskId = await cvat.uploadMedia(baseName, [strippedAsset]);
				await cvat.waitForTaskData(taskId);
				try {
					await app.recordUpload(taskId, baseName, 1);
				} catch (e: any) {
					const status  = e?.response?.status;
					const payload = e?.response?.data;
					const message = payload?.error || e?.message || 'erreur inconnue';
					console.error('[upload] recordUpload failed', { taskId, status, payload, error: e });
					moderationErrors.push({ taskId, status, message });
				}
				try {
					const exif = await exifPromise;
					if (exif) {
						await metaService.set(taskId, {
							gps_latitude:  exif.gps_latitude  ?? null,
							gps_longitude: exif.gps_longitude ?? null,
							taken_at:      exif.taken_at      ?? null,
							camera_make:   exif.camera_make   ?? null,
							camera_model:  exif.camera_model  ?? null,
							image_width:   exif.image_width   ?? null,
							image_height:  exif.image_height  ?? null,
							raw_exif:      exif.raw           ?? null,
						});
					}
				} catch (e) {
					console.warn('[upload] EXIF save failed', e);
				}
				taskIds.push(taskId);
				setProgress({ current: i + 1, total: files.length });
			}

			if (moderationErrors.length > 0) {
				console.warn('[upload] moderation queue errors', moderationErrors);
				toast.error(
					`${moderationErrors.length}/${files.length} média(s) uploadé(s) mais non inscrit(s) dans la file de modération. Détails dans la console.`,
				);
			}
			return taskIds;
		} catch (error) {
			console.error('Upload failed', error);
			throw error;
		} finally {
			setIsUploading(false);
		}
	};

	return { upload, isUploading, progress };
};
