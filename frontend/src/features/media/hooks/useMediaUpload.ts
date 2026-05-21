import { useState } from 'react';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AppApiService } from '@/services/api/AppApiService';
import { MediaMetadataService } from '@/services/api/MediaMetadataService';
import { toast } from '@/shared/toast/Toast';
import { PickedFile } from '@/shared/utils/filePicker';
import { readExif, stripExif } from '@/shared/utils/imageProcessing';

export interface UploadProgress {
	current: number;
	total: number;
}

export const useMediaUpload = () => {
	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState<UploadProgress>({ current: 0, total: 0 });

	const upload = async (files: PickedFile[]): Promise<number[]> => {
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
				const exifPromise = readExif(original);
				const stripped = await stripExif(original);

				const uploadNum = await cvat.getNextUploadNumber();
				const baseName = `${self.username}_${date}_${String(uploadNum).padStart(4, '0')}`;
				const taskId = await cvat.uploadMedia(baseName, [stripped]);
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
