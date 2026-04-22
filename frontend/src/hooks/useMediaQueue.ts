import { MediaEntity } from "@/core/types/media";
import { useState } from "react";
import { useEffect } from "react";

export interface MediaQueueState {
    readonly data: MediaEntity[] | null;
    readonly isLoading: boolean;
    readonly error: string | null;
}

export interface UseMediaQueueReturn {
    readonly state: MediaQueueState;
    readonly refreshMedia: ()=> void;
}

export const useMediaQueue = (): UseMediaQueueReturn => {
    const [state, setState] = useState<MediaQueueState>({
        data: null,
        isLoading: true,
        error: null,
    });

    const refreshMedia = () => {
        setState({ data: null, isLoading: true, error: null });
    };

    useEffect(() => {
        const loadQueue = async () => {
            try {
                // 1. Attends la réponse de mockMediaService.fetchQueue()
                
                // 2. Utilise setState pour écraser l'état actuel :
                // Injecte les données reçues, passe isLoading à false, error à null
                
            } catch (err) {
                // 3. En cas d'échec :
                // Utilise setState : data à null, capture le message d'erreur, isLoading à false
                
            } finally {
                // 4. Ce bloc s'exécute quoi qu'il arrive. 
                // Assure-toi que isLoading est forcé à false ici pour éviter le chargement infini.
            }
        };

        loadQueue();
    }, []);
    // --- FIN DU BLOC À COMPLÉTER ---

    return {
        state,
        refreshMedia
    };
}