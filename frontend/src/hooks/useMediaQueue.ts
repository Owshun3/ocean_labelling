import { MediaEntity } from "@/core/types/media";
import { useState } from "react";

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
        setState({ data: null, isLoading:true, error: null });
    };

    return {
        state,
        refreshMedia
    };
}