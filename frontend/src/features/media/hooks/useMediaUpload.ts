import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as exifr from 'exifr';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AppApiService } from '@/services/api/AppApiService';
import { MediaMetadataService } from '@/services/api/MediaMetadataService';

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
				const exifPromise = extractExif(files[i]);
				const uploadNum = await cvat.getNextUploadNumber();
				const baseName = `${self.username}_${date}_${String(uploadNum).padStart(4, '0')}`;
				const taskId = await cvat.uploadMedia(baseName, [files[i]]);
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
				const summary = moderationErrors
					.map((m) => `task ${m.taskId} (${m.status ?? 'no status'}) : ${m.message}`)
					.join('\n');
				Alert.alert(
					'Modération non enregistrée',
					`${moderationErrors.length}/${files.length} média(s) uploadé(s) mais non inscrit(s) dans la file de modération :\n\n${summary}\n\nLes fichiers sont sur CVAT mais invisibles pour le modérateur.`
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
