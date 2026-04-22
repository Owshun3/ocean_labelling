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
        // On adapte notre objet Annotation au format attendu par CVAT
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
}

export const cvatMediaService = new CvatMediaService();