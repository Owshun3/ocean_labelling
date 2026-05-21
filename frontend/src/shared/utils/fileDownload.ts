import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export type DownloadableData = Blob | ArrayBuffer;

/**
 * Sauvegarde un binaire côté utilisateur.
 *
 * - Web : déclenche un download natif via <a download>.
 * - Mobile : écrit dans le cacheDirectory puis ouvre la feuille de partage du
 *   système, laissant l'utilisateur choisir où sauvegarder (Files, Drive…).
 *
 * Accepte `Blob` (typique de `axios responseType: 'blob'` côté web) ou
 * `ArrayBuffer` (`responseType: 'arraybuffer'`, cross-platform fiable).
 */
export async function saveBinaryToDevice(
	data: DownloadableData,
	filename: string,
	mimeType: string = 'application/octet-stream',
): Promise<boolean> {
	if (Platform.OS === 'web') {
		if (typeof window === 'undefined') return false;
		const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		return true;
	}

	const base64 = data instanceof ArrayBuffer
		? arrayBufferToBase64(data)
		: await blobToBase64(data);
	const cacheDir = FileSystem.cacheDirectory;
	if (!cacheDir) return false;
	const dest = `${cacheDir}${filename}`;
	await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
	if (!(await Sharing.isAvailableAsync())) return false;
	await Sharing.shareAsync(dest, { mimeType, dialogTitle: filename });
	return true;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const slice = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
	}
	return globalThis.btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
	// blob.arrayBuffer() exists on web and is polyfilled on RN's Blob via fetch().
	const ab = await blob.arrayBuffer();
	return arrayBufferToBase64(ab);
}
