import { apiClient } from './axiosClient';
import { appApiClient } from './AppApiService';
import { saveUserProfile, clearUserProfile, markSessionAlive, clearSessionAlive } from './authStorage';

const CVAT_ERROR_FR: Record<string, string> = {
	'Unable to log in with provided credentials.': 'Identifiants incorrects.',
	'A user with that username already exists.': 'Ce nom d\'utilisateur est déjà pris.',
	'Enter a valid email address.': 'Adresse e-mail invalide.',
	'This field may not be blank.': 'Ce champ est obligatoire.',
	'This field is required.': 'Ce champ est obligatoire.',
	'This password is too common.': 'Ce mot de passe est trop courant.',
	'This password is too short. It must contain at least 8 characters.': 'Mot de passe trop court (8 caractères minimum).',
	'This password is entirely numeric.': 'Le mot de passe ne peut pas être uniquement numérique.',
	'The two password fields didn\'t match.': 'Les mots de passe ne correspondent pas.',
	'The password is too similar to the username.': 'Le mot de passe est trop similaire au nom d\'utilisateur.',
};

const tr = (msg: string) => CVAT_ERROR_FR[msg] ?? msg;

export class CvatAuthService {
	private extractLoginError(error: any): never {
		if (!error?.response) {
			throw new Error('Serveur inaccessible. Vérifiez que le service est démarré (port 8888).');
		}
		const { status, data } = error.response;
		const detail = data?.error ?? data?.non_field_errors?.[0] ?? data?.detail;
		if (status === 400 || status === 401) {
			throw new Error(tr(detail ?? 'Unable to log in with provided credentials.'));
		}
		throw new Error(`Erreur serveur (${status})${detail ? ' : ' + tr(detail) : ''}.`);
	}

	private extractRegisterError(error: any): never {
		if (!error?.response) {
			throw new Error('Serveur inaccessible. Vérifiez que le service est démarré (port 8888).');
		}
		const { status, data } = error.response;
		if (data?.username) throw new Error(`Identifiant : ${tr(data.username[0])}`);
		if (data?.email) throw new Error(`Email : ${tr(data.email[0])}`);
		if (data?.password1) throw new Error(`Mot de passe : ${tr(data.password1[0])}`);
		if (data?.non_field_errors) throw new Error(tr(data.non_field_errors[0]));
		if (typeof data === 'string') throw new Error(tr(data));
		throw new Error(`Erreur ${status} lors de la création du compte.`);
	}

	public async login(username: string, password: string, rememberMe: boolean = false): Promise<void> {
		try {
			const resp = await appApiClient.post('/auth/login', {
				username,
				password,
				remember_me: rememberMe,
			});
			saveUserProfile({
				id: resp.data.id,
				username: resp.data.username,
				is_superuser: resp.data.is_superuser ?? false,
				is_staff: resp.data.is_staff ?? false,
				appRole: resp.data.role ?? 'annotator',
				hasSeenWelcome: resp.data.has_seen_welcome ?? false,
			});
			markSessionAlive();
		} catch (error: any) {
			this.extractLoginError(error);
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
			await apiClient.post('/auth/register', {
				username,
				email,
				first_name: firstName,
				last_name: lastName,
				password1: password,
				password2: password,
			});
		} catch (error: any) {
			this.extractRegisterError(error);
		}

		try {
			await this.login(username, password, false);
		} catch {
			throw new Error('Compte créé, mais connexion automatique échouée. Connectez-vous manuellement.');
		}
	}

	public async logout(): Promise<void> {
		try {
			await appApiClient.post('/auth/logout');
		} finally {
			clearUserProfile();
			clearSessionAlive();
		}
	}
}
