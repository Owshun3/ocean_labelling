import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

// `formPart` est opaque : File natif sur web, { uri, name, type } sur mobile.
// Toujours passer par appendToFormData() plutôt que d'y accéder directement.
export interface PickedFile {
	uri: string;
	name: string;
	mimeType: string;
	size: number;
	formPart: unknown;
}

export function appendToFormData(form: FormData, key: string, file: PickedFile, overrideName?: string): void {
	const name = overrideName ?? file.name;
	form.append(key, file.formPart as any, name);
}

function fromExpoImagePickerAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
	const name = asset.fileName ?? `image-${Date.now()}.jpg`;
	const mimeType = asset.mimeType ?? guessMimeFromName(name) ?? 'image/jpeg';
	const size = asset.fileSize ?? 0;
	const formPart = Platform.OS === 'web' && (asset as any).file instanceof File
		? (asset as any).file
		: { uri: asset.uri, name, type: mimeType };
	return { uri: asset.uri, name, mimeType, size, formPart };
}

function fromExpoDocumentPickerAsset(asset: DocumentPicker.DocumentPickerAsset): PickedFile {
	const name = asset.name ?? `file-${Date.now()}`;
	const mimeType = asset.mimeType ?? guessMimeFromName(name) ?? 'application/octet-stream';
	const size = asset.size ?? 0;
	const formPart = Platform.OS === 'web' && (asset as any).file instanceof File
		? (asset as any).file
		: { uri: asset.uri, name, type: mimeType };
	return { uri: asset.uri, name, mimeType, size, formPart };
}

function guessMimeFromName(name: string): string | null {
	const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
	if (!m) return null;
	switch (m[1]) {
		case 'jpg': case 'jpeg': return 'image/jpeg';
		case 'png':              return 'image/png';
		case 'webp':             return 'image/webp';
		case 'svg':              return 'image/svg+xml';
		case 'mp4':              return 'video/mp4';
		case 'webm':             return 'video/webm';
		case 'mov':              return 'video/quicktime';
		default:                 return null;
	}
}

export interface PickImagesOptions {
	allowsMultiple?: boolean;
	quality?: number;
}

export async function pickImages(opts: PickImagesOptions = {}): Promise<PickedFile[]> {
	const result = await ImagePicker.launchImageLibraryAsync({
		mediaTypes: ImagePicker.MediaTypeOptions.Images,
		allowsMultipleSelection: opts.allowsMultiple ?? true,
		quality: opts.quality ?? 0.8,
	});
	if (result.canceled) return [];
	return result.assets.map(fromExpoImagePickerAsset);
}

// Pourquoi pickVideos via ImagePicker et pas DocumentPicker :
// Sur certains setups Windows + Chrome, l'ouverture du dialogue de fichier
// via DocumentPicker freeze plusieurs secondes (voire infiniment) AVANT meme
// que l'utilisateur selectionne quoi que ce soit, alors qu'ImagePicker ouvre
// le meme dialogue OS quasi instantanement avec le meme genre d'`accept`.
// Cause exacte non identifiee (probablement comportement Chrome lie a la
// pre-enumeration des miniatures video), mais empiriquement le switch suffit.
export async function pickVideos(opts: PickImagesOptions = {}): Promise<PickedFile[]> {
	const result = await ImagePicker.launchImageLibraryAsync({
		mediaTypes: ImagePicker.MediaTypeOptions.Videos,
		allowsMultipleSelection: opts.allowsMultiple ?? true,
		quality: opts.quality ?? 1.0,
	});
	if (result.canceled) return [];
	return result.assets.map(fromExpoImagePickerAsset);
}

export interface PickFilesOptions {
	mimeTypes?: string[];
	allowsMultiple?: boolean;
}

// Chrome a un codepath lent quand `accept` contient des MIMEs explicites :
// il pre-filtre chaque fichier du dossier individuellement -> freeze de
// plusieurs secondes a l'OUVERTURE du picker sur les dossiers contenant
// beaucoup de fichiers. Avec un wildcard `video/*` ou `image/*` il utilise
// un codepath optimise. On garde la validation stricte post-selection chez
// l'appelant — le wildcard ne sert qu'au filtre UI du picker systeme.
function widenMimePattern(mimes: string[] | undefined): string {
	if (!mimes || mimes.length === 0) return '*/*';
	const types = new Set(mimes.map((m) => m.split('/')[0]).filter(Boolean));
	if (types.size === 1) return `${[...types][0]}/*`;
	return mimes.join(',');
}

export async function pickFiles(opts: PickFilesOptions = {}): Promise<PickedFile[]> {
	const result = await DocumentPicker.getDocumentAsync({
		type: widenMimePattern(opts.mimeTypes),
		multiple: opts.allowsMultiple ?? false,
		copyToCacheDirectory: true,
		// base64=true (defaut) declenche un readAsDataURL synchrone qui freeze
		// le browser plusieurs secondes sur les gros fichiers (videos). On n'a
		// pas besoin du base64, on utilise le File natif via formPart.
		base64: false,
	});
	if (result.canceled) return [];
	return result.assets.map(fromExpoDocumentPickerAsset);
}

export async function pickSingleFile(opts: Omit<PickFilesOptions, 'allowsMultiple'> = {}): Promise<PickedFile | null> {
	const files = await pickFiles({ ...opts, allowsMultiple: false });
	return files[0] ?? null;
}
