import axios from 'axios';
import { API_URL } from '../config/appConfig';

export interface AuthUser {
    userId: string;
    userName: string;
    role: string;
    token: string;
    expiresUtc: string;
}

/** Why a login failed, so the login page can say something useful. */
export type LoginFailure = 'invalid' | 'unreachable' | 'server';

export class LoginError extends Error {
    constructor(public readonly reason: LoginFailure, message: string) {
        super(message);
        this.name = 'LoginError';
    }
}

/** Minimum length the API accepts for a new password (LoginController.ChangePassword). */
export const MIN_PASSWORD_LENGTH = 10;

// sessionStorage: the login ends when the browser tab closes (shared office PCs).
const STORAGE_KEY = 'dms.auth';
const listeners = new Set<(user: AuthUser | null) => void>();

const read = (): AuthUser | null => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const user = JSON.parse(raw) as AuthUser;
        if (!user.token || new Date(user.expiresUtc).getTime() <= Date.now()) {
            sessionStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return user;
    } catch {
        return null;
    }
};

const authService = {
    login: async (userId: string, password: string): Promise<AuthUser> => {
        let data: AuthUser;
        try {
            ({ data } = await axios.post<AuthUser>(`${API_URL}/Login`, { userId, password }, { timeout: 30_000 }));
        } catch (error) {
            if (!axios.isAxiosError(error) || !error.response)
                throw new LoginError('unreachable', 'Cannot reach the server. Please try again.');
            if (error.response.status === 400 || error.response.status === 401)
                throw new LoginError('invalid', 'Invalid user ID or password.');
            throw new LoginError('server', 'The server could not log you in right now. Please try again later.');
        }

        const user: AuthUser = {
            userId: data.userId,
            userName: data.userName,
            role: data.role,
            token: data.token,
            expiresUtc: data.expiresUtc,
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        } catch {
            /* storage blocked: logged in for this page only */
        }
        listeners.forEach((l) => l(user));
        return user;
    },

    logout: () => {
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
        listeners.forEach((l) => l(null));
    },

    currentUser: (): AuthUser | null => read(),

    token: (): string | null => read()?.token ?? null,

    /** Administrators see everyone's pending items and can change settings. The API checks this too. */
    isAdmin: (): boolean => (read()?.role ?? '').toLowerCase() === 'admin',

    /**
     * Changes the logged-in user's password (POST api/Login/ChangePassword).
     * Resolves with null when changed, or with the reason it was refused.
     */
    changePassword: async (currentPassword: string, newPassword: string): Promise<string | null> => {
        const token = read()?.token;
        if (!token) return 'Your session has expired. Please log in again.';
        try {
            await axios.post(`${API_URL}/Login/ChangePassword`, { currentPassword, newPassword },
                { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 });
            return null;
        } catch (error) {
            if (!axios.isAxiosError(error) || !error.response) return 'Cannot reach the server. Please try again.';
            if (error.response.status === 401) {
                authService.logout();
                return 'Your session has expired. Please log in again.';
            }
            const data = error.response.data;
            if (typeof data === 'string' && data.trim()) return data;
            return (data && (data.message || data.title)) || 'The password could not be changed.';
        }
    },

    onChange: (listener: (user: AuthUser | null) => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

export default authService;
