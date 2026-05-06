import { useState } from 'react';
import { CvatMediaService } from '@/services/api/CvatMediaService';

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

		const service = new CvatMediaService();
		const taskIds: number[] = [];

		try {
			const self = await service.getSelf();
			const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

			for (let i = 0; i < files.length; i++) {
				const uploadNum = await service.getNextUploadNumber();
				const baseName = `${self.username}_${date}_${String(uploadNum).padStart(4, '0')}`;
				const taskId = await service.uploadMedia(baseName, [files[i]]);
				await service.waitForTaskData(taskId);
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
