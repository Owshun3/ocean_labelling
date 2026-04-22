import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

export interface UseMediaUploadReturn {
	readonly localUri: string | null;
	readonly file: File | null;
	readonly isLoading: boolean;
	readonly error: string | null;
	readonly pickImage: () => Promise<void>;
	readonly clearSelection: () => void;
}

export const useMediaUpload = (): UseMediaUploadReturn => {
	const [localUri, setLocalUri] = useState<string | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	const clearSelection = () => {
		setLocalUri(null);
		setFile(null);
		setError(null);
	};

	const pickImage = async () => {
		try {
			setError(null);
			
			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ImagePicker.MediaTypeOptions.Images,
				allowsEditing: false,
				quality: 1,
			});

			if (!result.canceled && result.assets && result.assets.length > 0) {
				const selectedAsset = result.assets[0];
                setLocalUri(selectedAsset.uri);
                setFile(selectedAsset.file as unknown as File | null);
			}
		} catch (err) {
			setError("Échec de l'ouverture de l'explorateur de fichiers.");
		}
	};

	return {
		localUri,
		file,
		isLoading,
		error,
		pickImage,
		clearSelection
	};
};