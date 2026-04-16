import { IMediaService, MediaEntity, Annotation } from '../../core/types/media';

export class MockMediaService implements IMediaService {
  private db: Map<string, MediaEntity>;

    constructor() {
        this.db = new Map();
        this.initializeMockData();
    }

    private initializeMockData(): void {
        this.db.set('media-1', {
            id: 'media-1',
            uri: 'https://images.unsplash.com/photo-1682687220063-4742bd7fd538', // Image sous-marine
            status: 'PENDING',
            annotations: []
        });
        this.db.set('media-2', {
            id: 'media-2',
            uri: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5', // Corail
            status: 'PENDING',
            annotations: []
        });
    }

    public async fetchQueue(): Promise<MediaEntity[]>{
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(Array.from(this.db.values()));
            }, 800);
        })
    }

    public async submitAnnotation(mediaId: string, annotation: Annotation): Promise<void> {
        const mediaExistant = this.db.get(mediaId);

        if (!mediaExistant) {
            throw new Error(`Corruption d'état : Le média d'id ${mediaId} est introuvable.`);
        }

        const mediaMisAJour: MediaEntity = {
            ...mediaExistant,
            annotations: [...mediaExistant.annotations, annotation]
        };

        this.db.set(mediaId, mediaMisAJour);

        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

export const mockMediaService = new MockMediaService();