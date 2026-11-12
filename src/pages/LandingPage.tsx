import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login as loginAction, setShowAlert } from '../store/slices/userSlice';
import Login from './Login';
import authService, { LoginError } from '../services/authService';

/** Login page. A successful login stores the token; App.tsx then shows the dashboard. */
const LandingPage: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [message, setMessage] = useState<string | null>(null);

    const handleLogin = async (userId: string, password: string) => {
        setMessage(null);
        dispatch(setShowAlert(false));
        try {
            const user = await authService.login(userId, password);
            dispatch(loginAction({ id: user.userId, name: user.userName, email: '' }));
            navigate('/dashboard', { replace: true });
        } catch (error) {
            // Wrong password, server down and "cannot reach" each get their own message.
            setMessage(error instanceof LoginError ? error.message : 'Something went wrong. Please try again.');
            dispatch(setShowAlert(true));
        }
    };

    return <Login onLogin={handleLogin} isToShowAlert={!!message} alertText={message ?? undefined} />;
};

export default LandingPage;
