import { useState } from 'react';
import { Alert } from 'react-native';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AppApiService } from '@/services/api/AppApiService';

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

			for (let i = 0; i < files.length; i++) {
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
