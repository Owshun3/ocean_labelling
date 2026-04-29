import { useState } from 'react';
import { CvatMediaService } from '@/services/api/CvatMediaService';

export const useMediaUpload = () => {
	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState(0);

	const upload = async (files: any[]) => {
		if (files.length === 0) return;
		
		setIsUploading(true);
		try {
			const service = new CvatMediaService();
			const [self, uploadNum] = await Promise.all([
				service.getSelf(),
				service.getNextUploadNumber(),
			]);
			const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
			const baseName = `${self.username}_${date}_${String(uploadNum).padStart(4, '0')}`;
			const taskId = await service.uploadMedia(baseName, files);
			await service.waitForTaskData(taskId);
			return true;
		} catch (error) {
			console.error("Upload failed", error);
			throw error;
		} finally {
			setIsUploading(false);
		}
	};

	return { upload, isUploading, progress };
};