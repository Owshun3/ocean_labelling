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
		await apiClient.post(`/tasks/${taskId}/data`, formData);

		return taskId;
	}

	async getTasks(params?: { sorting?: string; owner?: string }) {
        let url = '/tasks?page_size=20';
        if (params?.sorting) url += `&sort=${params.sorting}`;
        
        const response = await apiClient.get(url);
        return response.data.results;
    }

	async getFirstJobId(taskId: number): Promise<number> {
        const response = await apiClient.get(`/tasks/${taskId}/jobs`);
        if (response.data.results && response.data.results.length > 0) {
            return response.data.results[0].id;
        }
        throw new Error("Aucun job d'annotation trouvé pour cette image.");
    }
}