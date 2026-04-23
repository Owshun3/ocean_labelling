import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from './axiosClient';

export class CvatAuthService {
	private readonly TOKEN_KEY = 'cvat_token';

	private async saveTokenLocally(token: string): Promise<void> {
		if (Platform.OS === 'web') {
			localStorage.setItem(this.TOKEN_KEY, token);
		} else {
			await SecureStore.setItemAsync(this.TOKEN_KEY, token);
		}
	}

	public async getToken(): Promise<string | null> {
		if (Platform.OS === 'web') {
			return localStorage.getItem(this.TOKEN_KEY);
		} else {
			return await SecureStore.getItemAsync(this.TOKEN_KEY);
		}
	}

    private async ensureCsrfToken(): Promise<void> {
		try {
			await apiClient.get('/server/about');
		} catch (error) {
			console.warn("Avertissement : Impossible de récupérer le jeton CSRF préliminaire.");
		}
	}

	public async login(username: string, password: string): Promise<void> {
		try {
			await this.ensureCsrfToken();
			
			const response = await apiClient.post('/auth/login', {
				username,
				password
			});
			
			const token = response.data.key;
			await this.saveTokenLocally(token);
		} catch (error) {
			console.error("Erreur de connexion :", error);
			throw new Error("L'authentification a échoué. Vérifiez vos identifiants ou l'état du serveur.");
		}
	}

	public async register(
		username: string, 
		email: string,
		firstName: string, 
		lastName: string, 
		password: string
	): Promise<void> {
		try {
			await this.ensureCsrfToken();

			await apiClient.post('/auth/register', {
				username,
				email,
				first_name: firstName,
				last_name: lastName,
				password1: password,
				password2: password
			});
			
			await this.login(username, password);
		} catch (error: any) {
			const serverData = error.response?.data;
			let errorMessage = "La création du compte a échoué.";
			
			if (serverData) {
				if (serverData.username) errorMessage = `Nom d'utilisateur : ${serverData.username[0]}`;
				else if (serverData.email) errorMessage = `Email : ${serverData.email[0]}`;
				else if (serverData.password1) errorMessage = `Mot de passe : ${serverData.password1[0]}`;
				else if (serverData.non_field_errors) errorMessage = serverData.non_field_errors[0];
				else if (typeof serverData === 'string') errorMessage = serverData;
			}
			
			throw new Error(errorMessage);
		}
	}

	public async logout(): Promise<void> {
		try {
			await apiClient.post('/auth/logout');
		} finally {
			if (Platform.OS === 'web') {
				localStorage.removeItem(this.TOKEN_KEY);
			} else {
				await SecureStore.deleteItemAsync(this.TOKEN_KEY);
			}
		}
	}
}