import { Platform } from 'react-native';
import { apiClient } from './axiosClient';

export class CvatMediaService {
	async uploadMedia(name: string, files: any[]): Promise<number> {
		const taskResponse = await apiClient.post('/tasks', {
			name: name,
			labels: [{ name: "item" }]
		});
		
		const taskId = taskResponse.data.id;

		const formData = new FormData();
		formData.append('image_quality', '70');
		
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const fileName = file.fileName || `image_${i}.jpg`;

			if (Platform.OS === 'web') {
				const response = await fetch(file.uri);
				const blob = await response.blob();
				formData.append('client_files', blob, fileName);
			} else {
				formData.append('client_files', {
					uri: file.uri,
					name: fileName,
					type: file.type || 'image/jpeg',
				} as any);
			}
		}
		await apiClient.post(`/tasks/${taskId}/data`, formData, {
			headers: { 
				'Content-Type': 'multipart/form-data',
			}
		});

		return taskId;
	}

	async getTasks() {
		const response = await apiClient.get('/tasks?page_size=20');
		return response.data.results;
	}
}