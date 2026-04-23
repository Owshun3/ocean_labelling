export class AppConfigService {
	public async getWelcomeMessage(): Promise<string> {
		return "Bienvenue sur la plateforme. Votre environnement est prêt pour vos premières annotations.";
	}
}