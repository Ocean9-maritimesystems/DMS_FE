/**
 * Build-time settings from .env files (REACT_APP_* variables; see .env.example). Vite puts them in import.meta.env.
 *   REACT_APP_API_URL     API base URL, e.g. https://dms.yourcompany.com/api   (default /api)
 *   REACT_APP_ENV_LABEL   optional label shown in the header, e.g. "QA" (leave empty in production)
 *   REACT_APP_COMPANY     company name shown in the header and on the login page
 */
export const API_URL: string = (import.meta.env.REACT_APP_API_URL || '/api').replace(/\/$/, '');

export const ENV_LABEL: string = import.meta.env.REACT_APP_ENV_LABEL || '';

export const COMPANY_NAME: string = import.meta.env.REACT_APP_COMPANY || ' ';
