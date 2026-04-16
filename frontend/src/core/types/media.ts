export type ValidationStatus = 'PENDING' | 'MODERATED' | 'CERTIFIED' | 'REJECTED';

export interface BoundingBox{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface Annotation{
    readonly id: string;
    readonly label: string;
    readonly box: BoundingBox;
    readonly authorId: string;
}

export interface MediaEntity{
    readonly id: string;
    readonly uri: string;
    readonly status: ValidationStatus;
    readonly annotations: Annotation[];
}

export interface IMediaService{
    fetchQueue(): Promise<MediaEntity[]>;
    submitAnnotation(mediaId: string, annotation: Annotation): Promise<void>;
}