import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from './axiosClient';

const CONSENSUS_REPLICAS_MAX = 50;
const CONSENSUS_REPLICAS = Math.min(2, CONSENSUS_REPLICAS_MAX);

export class CvatMediaService {
	private readonly COUNTER_KEY = 'media_upload_counter';

	async getNextUploadNumber(): Promise<number> {
		let current = 0;
		if (Platform.OS === 'web') {
			current = parseInt(localStorage.getItem(this.COUNTER_KEY) ?? '0', 10);
			localStorage.setItem(this.COUNTER_KEY, String(current + 1));
		} else {
			const stored = await SecureStore.getItemAsync(this.COUNTER_KEY);
			current = parseInt(stored ?? '0', 10);
			await SecureStore.setItemAsync(this.COUNTER_KEY, String(current + 1));
		}
		return current + 1;
	}

	async uploadMedia(baseName: string, files: any[]): Promise<number> {
		const taskResponse = await apiClient.post('/tasks', {
			name: baseName,
			labels: [{ name: 'item' }],
			...(CONSENSUS_REPLICAS >= 2 ? { consensus_replicas: CONSENSUS_REPLICAS } : {}),
		});

		const taskId = taskResponse.data.id;

		const formData = new FormData();
		formData.append('image_quality', '70');

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const originalName = file.fileName || file.name || 'image.jpg';
			const ext = originalName.match(/\.[^.]+$/)?.[0] ?? '.jpg';
			const fileName = `${baseName}_${String(i + 1).padStart(2, '0')}${ext}`;
			const key = `client_files[${i}]`;

			if (Platform.OS === 'web') {
				if (file.file instanceof File) {
					formData.append(key, file.file, fileName);
				} else {
					const response = await fetch(file.uri);
					const blob = await response.blob();
					const mimeType = file.mimeType || 'image/jpeg';
					formData.append(key, new File([blob], fileName, { type: mimeType }), fileName);
				}
			} else {
				formData.append(key, {
					uri: file.uri,
					name: fileName,
					type: file.mimeType || file.type || 'image/jpeg',
				} as any);
			}
		}

		await apiClient.post(`/tasks/${taskId}/data`, formData);
		return taskId;
	}

	async getTasks(params?: { sorting?: string; ownedByMe?: boolean }): Promise<any[]> {
		const query: string[] = ['page_size=50'];
		if (params?.sorting) query.push(`sort=${encodeURIComponent(params.sorting)}`);
		if (params?.ownedByMe) {
			const self = await this.getSelf();
			query.push(`owner=${encodeURIComponent(self.username)}`);
		}
		const baseQuery = query.join('&');

		const all: any[] = [];
		let page = 1;
		while (true) {
			const response = await apiClient.get(`/tasks?${baseQuery}&page=${page}`);
			all.push(...response.data.results);
			if (!response.data.next) break;
			page += 1;
		}
		return all;
	}

	async deleteTask(taskId: number): Promise<void> {
		await apiClient.delete(`/tasks/${taskId}`);
	}

	async getFirstJobId(taskId: number): Promise<number> {
		const response = await apiClient.get(`/jobs?task_id=${taskId}`);
		if (response.data.results && response.data.results.length > 0) {
			return response.data.results[0].id;
		}
		throw new Error("Aucun job d'annotation trouvé pour cette image.");
	}

	async waitForTaskData(taskId: number, maxWaitMs = 15000): Promise<void> {
		const deadline = Date.now() + maxWaitMs;
		while (Date.now() < deadline) {
			try {
				await apiClient.get(`/tasks/${taskId}/preview`);
				return;
			} catch {
				await new Promise(r => setTimeout(r, 1500));
			}
		}
		throw new Error('Timeout: le serveur CVAT na pas traité les fichiers à temps.');
	}

	async getSelf(): Promise<{ id: number; username: string }> {
		const response = await apiClient.get('/users/self');
		return response.data;
	}

	async assignJob(jobId: number, userId: number): Promise<void> {
		await apiClient.patch(`/jobs/${jobId}`, { assignee: userId });
	}

	async ensureJobEditable(jobId: number): Promise<void> {
		try {
			const response = await apiClient.get(`/jobs/${jobId}`);
			if (response.data.state === 'completed') {
				await apiClient.patch(`/jobs/${jobId}`, { state: 'in progress' });
			}
		} catch {}
	}
}
