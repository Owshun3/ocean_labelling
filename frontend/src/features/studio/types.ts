export type ShapeStatus = 'unsaved' | 'saved';

export interface StudioShape {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	status: ShapeStatus;
	speciesId?: number;
	speciesName?: string;
	comment?: string;
	cvatClientId?: number;
}

export type StudioTool = 'rectangle' | 'select' | 'pan';
