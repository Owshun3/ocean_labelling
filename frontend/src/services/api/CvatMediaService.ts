import { IMediaService, MediaEntity, Annotation } from '../../core/types/media';
import { apiClient } from './axiosClient';

export class CvatMediaService implements IMediaService {

  public async fetchQueue(): Promise<MediaEntity[]> {
    try {
      const response = await apiClient.get('/tasks');

      return response.data.results.map((task: any): MediaEntity => ({
        id: task.id.toString(),
        uri: task.url,
        status: this.mapStatus(task.status),
        annotations: []
      }));

    } catch (error) {
      console.error("Erreur lors de la récupération de la file d'attente:", error);
      throw new Error("Impossible de charger les données du serveur.");
    }
  }

  public async submitAnnotation(mediaId: string, annotation: Annotation): Promise<void> {
    try {
      await apiClient.post(`/tasks/${mediaId}/annotations`, {
        shapes: [{
          label_id: annotation.label,
          points: [annotation.box.x, annotation.box.y, annotation.box.width, annotation.box.height],
          type: 'rectangle'
        }]
      });
    } catch (error) {
      console.error(`Erreur lors de la soumission de l'annotation ${mediaId}:`, error);
      throw error;
    }
  }

  private mapStatus(cvatStatus: string): any {
    const statusMap: Record<string, string> = {
      'completed': 'CERTIFIED',
      'validation': 'MODERATED',
      'annotation': 'PENDING'
    };
    return statusMap[cvatStatus] || 'PENDING';
  }

  public async uploadMedia(file: File, taskName: string = "Upload_Mobile"): Promise<void> {
		try {
			const taskResponse = await apiClient.post("/tasks", {
				name: taskName,
				labels: []
			});
			const taskId = taskResponse.data.id;

			const formData = new FormData();
			formData.append("client_files", file); 
			formData.append("image_quality", "80"); 

			await apiClient.post(`/tasks/${taskId}/data/`, formData, {
				headers: {
					"Content-Type": "multipart/form-data",
				},
			});
		} catch (error) {
			console.error("Erreur d'upload :", error);
			throw new Error("L'envoi du média a échoué.");
		}
	}

}

export const cvatMediaService = new CvatMediaService();
