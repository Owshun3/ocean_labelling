import projectsMock from '../mocks/projects.json';

const IS_MOCK_MODE = false;
const BASE_URL = 'http://localhost:8080/api';

export const fetchProjects = async () => {
  if (IS_MOCK_MODE) {
    console.log("[API] Mode Mock activé - Retourne les données locales");
    return projectsMock;
  }

  try {
    const response = await fetch(`${BASE_URL}/projects`);
    if (!response.ok) throw new Error('Erreur réseau');
    return await response.json();
  } catch (error) {
    console.error("[API] Erreur lors de la récupération des projets:", error);
    throw error;
  }
};