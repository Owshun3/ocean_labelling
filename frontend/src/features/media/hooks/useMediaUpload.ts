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
			const taskName = `Upload_${new Date().getTime()}`;
			const taskId = await service.uploadMedia(taskName, files);
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