import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { API_URL } from '../config/appConfig';
import authService from './authService';

/**
 * Every API call goes through this service.
 *  - base URL comes from REACT_APP_API_URL (no more hard-coded https://localhost:7151)
 *  - sends the logged-in user's token
 *  - a 401 logs the user out (the app then shows the login page)
 */
const axiosInstance = axios.create({ timeout: 60_000 });

axiosInstance.interceptors.request.use((config) => {
    const token = authService.token();
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    return config;
});

axiosInstance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        // error.response is undefined for network errors and timeouts: never read .status directly.
        if (error.response?.status === 401) authService.logout();
        return Promise.reject(error);
    }
);

/**
 * The result type defaults to `any` for the older screens; new code passes the response type,
 * e.g. getApiCall<SearchHit[]>('Search?q=...').
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const dmsLifecycleService = {
    getApiCall: async <T = Json>(endpoint: string): Promise<T> => dmsLifecycleService.apiCall<T>(endpoint, 'get'),

    deleteApiCall: async <T = Json>(endpoint: string, data?: unknown): Promise<T> =>
        dmsLifecycleService.apiCall<T>(endpoint, 'delete', data),

    postApiCall: async <T = Json>(endpoint: string, data?: unknown): Promise<T> =>
        dmsLifecycleService.apiCall<T>(endpoint, 'post', data, { headers: { 'Content-Type': 'application/json' } }),

    putApiCall: async <T = Json>(endpoint: string, data?: unknown): Promise<T> =>
        dmsLifecycleService.apiCall<T>(endpoint, 'put', data, { headers: { 'Content-Type': 'application/json' } }),

    apiCall: async <T = Json>(
        endpoint: string,
        method: 'get' | 'post' | 'put' | 'delete' = 'get',
        data?: unknown,
        config?: AxiosRequestConfig
    ): Promise<T> => {
        const url = `${API_URL}/${endpoint}`;
        if (method === 'get' && data) config = { ...config, params: data as Record<string, unknown> };

        try {
            let response;
            if (method === 'get') response = await axiosInstance.get(url, config);
            else if (method === 'delete') response = await axiosInstance.delete(url, { ...config, data });
            else if (method === 'put') response = await axiosInstance.put(url, data, config);
            else response = await axiosInstance.post(url, data, config);
            return response.data as T;
        } catch (error) {
            console.error(`Error in API call to ${endpoint}:`, error);
            throw error;
        }
    },
};

/** A file from the API (GET), with the name the server gives it in Content-Disposition. */
export const getFile = async (endpoint: string): Promise<{ blob: Blob; fileName: string | null }> => {
    const response = await axiosInstance.get<Blob>(`${API_URL}/${endpoint}`, { responseType: 'blob' });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    const fileName = star ? decodeURIComponent(star[1]) : plain ? plain[1] : null;
    return { blob: response.data, fileName };
};

/** A readable message from an API error (ProblemDetails, the API's error JSON, or plain text). */
export const errorMessage = (error: unknown, fallback = 'Something went wrong.'): string => {
    const e = error as AxiosError<Json>;
    const data = e?.response?.data;
    if (!e?.response) return 'Cannot reach the server. Check your connection.';
    if (typeof data === 'string' && data.trim()) return data;
    // ASP.NET validation errors: { title: "One or more validation errors occurred.", errors: { Field: ["..."] } }
    if (data?.errors && typeof data.errors === 'object') {
        const details = Object.entries(data.errors as Record<string, unknown>)
            .flatMap(([field, msgs]) => (Array.isArray(msgs) ? msgs : [msgs]).map((m) => `${field.replace(/^\$\./, '')}: ${m}`))
            .slice(0, 5);
        if (details.length) return details.join('\n');
    }
    // The API's error handler sends { MetaData: { error_message: "..." } }.
    return data?.MetaData?.error_message || data?.metaData?.error_message
        || data?.MetaData?.ErrorMessage || data?.metaData?.errorMessage || data?.detail || data?.title || data?.message || data?.error || fallback;
};

export default dmsLifecycleService;
