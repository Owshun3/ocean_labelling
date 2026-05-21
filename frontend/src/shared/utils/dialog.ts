import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
	title?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
}

export function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
	const { title = 'Confirmer', confirmLabel = 'OK', cancelLabel = 'Annuler', destructive } = opts;

	if (Platform.OS === 'web') {
		const text = title && title !== 'Confirmer' ? `${title}\n\n${message}` : message;
		return Promise.resolve(window.confirm(text));
	}

	return new Promise<boolean>((resolve) => {
		Alert.alert(title, message, [
			{ text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
			{ text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
		], { cancelable: true, onDismiss: () => resolve(false) });
	});
}

export function alert(message: string, title = 'Information'): Promise<void> {
	if (Platform.OS === 'web') {
		const text = title && title !== 'Information' ? `${title}\n\n${message}` : message;
		window.alert(text);
		return Promise.resolve();
	}

	return new Promise<void>((resolve) => {
		Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
			cancelable: true,
			onDismiss: () => resolve(),
		});
	});
}
