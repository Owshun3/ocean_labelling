import { useState } from 'react';
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

		try {
			const self = await cvat.getSelf();
			const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

			for (let i = 0; i < files.length; i++) {
				const uploadNum = await cvat.getNextUploadNumber();
				const baseName = `${self.username}_${date}_${String(uploadNum).padStart(4, '0')}`;
				const taskId = await cvat.uploadMedia(baseName, [files[i]]);
				await cvat.waitForTaskData(taskId);
				try { await app.recordUpload(taskId, baseName, 1); } catch (e) { console.warn('recordUpload failed', e); }
				taskIds.push(taskId);
				setProgress({ current: i + 1, total: files.length });
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
