import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as exifr from 'exifr/dist/full.esm.js';
import { PickedFile } from './filePicker';

export interface ExifInfo {
	gps_latitude?: number;
	gps_longitude?: number;
	taken_at?: string;
	camera_make?: string;
	camera_model?: string;
	image_width?: number;
	image_height?: number;
	raw?: Record<string, unknown>;
}

/**
 * Lit les métadonnées EXIF depuis l'URI d'un fichier image. Cross-platform :
 * fetch sur le file:// URI (RN) ou blob URI (web) puis parse via exifr.
 */
export async function readExif(file: PickedFile): Promise<ExifInfo | null> {
	if (!file.mimeType.startsWith('image/')) return null;
	try {
		const buf = await (await fetch(file.uri)).arrayBuffer();
		const data: any = await exifr.parse(buf, true);
		if (!data) return null;
		return {
			gps_latitude:  typeof data.latitude  === 'number' ? data.latitude  : undefined,
			gps_longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
			taken_at:      data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal.toISOString() : undefined,
			camera_make:   typeof data.Make  === 'string' ? data.Make  : undefined,
			camera_model:  typeof data.Model === 'string' ? data.Model : undefined,
			image_width:   typeof data.ImageWidth  === 'number' ? data.ImageWidth  : (typeof data.ExifImageWidth  === 'number' ? data.ExifImageWidth  : undefined),
			image_height:  typeof data.ImageHeight === 'number' ? data.ImageHeight : (typeof data.ExifImageHeight === 'number' ? data.ExifImageHeight : undefined),
			raw: data as Record<string, unknown>,
		};
	} catch {
		return null;
	}
}

/**
 * Re-encode l'image en JPEG via expo-image-manipulator. Strip implicitement
 * tous les segments EXIF/XMP (la sortie ne les conserve pas). Cross-platform.
 *
 * Renvoie un nouveau PickedFile pointant sur le résultat. Si le re-encode
 * échoue, renvoie le fichier d'origine inchangé.
 */
export async function stripExif(file: PickedFile, quality = 0.92): Promise<PickedFile> {
	if (!file.mimeType.startsWith('image/')) return file;
	try {
		const result = await ImageManipulator.manipulateAsync(file.uri, [], {
			compress: quality,
			format: ImageManipulator.SaveFormat.JPEG,
		});
		const newName = replaceExtension(file.name, '.jpg');
		return await uriToPickedFile(result.uri, newName, 'image/jpeg');
	} catch (err) {
		console.warn('[stripExif] failed, sending original', err);
		return file;
	}
}

function replaceExtension(name: string, newExt: string): string {
	return name.replace(/\.[^.]+$/, '') + newExt;
}

/**
 * Convertit une URI locale (file:// ou blob:) en `PickedFile`. Sur web on
 * fetche le blob pour produire un `File` natif compatible FormData. Sur mobile
 * on conserve l'URI et FormData accepte le shape `{ uri, name, type }`.
 */
export async function uriToPickedFile(uri: string, name: string, mimeType: string): Promise<PickedFile> {
	if (Platform.OS === 'web') {
		const blob = await (await fetch(uri)).blob();
		const file = new File([blob], name, { type: mimeType });
		return { uri, name, mimeType, size: file.size, formPart: file };
	}
	return { uri, name, mimeType, size: 0, formPart: { uri, name, type: mimeType } };
}

/**
 * Wrap un `Blob` (typiquement obtenu côté web via canvas.toBlob) dans un
 * `PickedFile` prêt à passer à `appendToFormData`.
 */
export function blobToPickedFile(blob: Blob, name: string, mimeType: string): PickedFile {
	if (Platform.OS === 'web') {
		const file = new File([blob], name, { type: mimeType });
		return { uri: '', name, mimeType, size: file.size, formPart: file };
	}
	// Sur mobile on n'utilise pas ce chemin (les frames sont extraites via expo-video-thumbnails
	// et arrivent en URI file://). Conserver la signature compile-safe pour un usage cross-platform.
	return { uri: '', name, mimeType, size: blob.size, formPart: blob as unknown };
}
