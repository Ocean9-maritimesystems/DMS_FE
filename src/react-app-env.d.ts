/// <reference types="vite/client" />

/** Build-time settings from .env files (see .env.example). */
interface ImportMetaEnv {
    readonly REACT_APP_API_URL?: string;
    readonly REACT_APP_ENV_LABEL?: string;
    readonly REACT_APP_COMPANY?: string;
    readonly REACT_APP_MANUAL_LINK_VIEW?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
