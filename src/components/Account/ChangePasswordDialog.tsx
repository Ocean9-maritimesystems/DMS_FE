import React, { useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import authService, { MIN_PASSWORD_LENGTH } from '../../services/authService';
import notify from '../../services/notify';
import './ChangePasswordDialog.scss';

interface ChangePasswordDialogProps {
    visible: boolean;
    onClose: () => void;
}

/** Lets the logged-in user change their own password (opened from the user menu in the header). */
const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ visible, onClose }) => {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
    const mismatch = confirm.length > 0 && next !== confirm;
    const sameAsCurrent = next.length > 0 && next === current;

    const reset = () => {
        setCurrent('');
        setNext('');
        setConfirm('');
        setSubmitted(false);
        setError(null);
    };

    const close = () => {
        if (busy) return;
        reset();
        onClose();
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
        setError(null);
        if (!current || next.length < MIN_PASSWORD_LENGTH || next !== confirm || sameAsCurrent) return;

        setBusy(true);
        const problem = await authService.changePassword(current, next);
        setBusy(false);
        if (problem) {
            setError(problem);
            return;
        }
        notify.success('Your password has been changed.', 'Password changed');
        reset();
        onClose();
    };

    return (
        <Dialog
            header="Change password"
            visible={visible}
            onHide={close}
            className="change-password-dialog"
            style={{ width: 'min(420px, 94vw)' }}
            modal
            draggable={false}
        >
            <form onSubmit={submit} noValidate className="change-password-form">
                {error && (
                    <div className="cp-alert" role="alert">
                        <i className="pi pi-exclamation-circle" aria-hidden="true" /> {error}
                    </div>
                )}

                <label htmlFor="cp-current">Current password</label>
                <input
                    id="cp-current"
                    type="password"
                    autoComplete="current-password"
                    className={'form-control' + (submitted && !current ? ' is-invalid' : '')}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    autoFocus
                />
                {submitted && !current && <div className="invalid-feedback">Enter your current password</div>}

                <label htmlFor="cp-new">New password</label>
                <input
                    id="cp-new"
                    type="password"
                    autoComplete="new-password"
                    className={'form-control' + ((submitted || tooShort) && (next.length < MIN_PASSWORD_LENGTH || sameAsCurrent) ? ' is-invalid' : '')}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    aria-describedby="cp-new-help"
                />
                <small id="cp-new-help" className={'cp-help' + (tooShort || sameAsCurrent ? ' cp-help-error' : '')}>
                    {sameAsCurrent ? 'Choose a password different from your current one.' : `At least ${MIN_PASSWORD_LENGTH} characters.`}
                </small>

                <label htmlFor="cp-confirm">Confirm new password</label>
                <input
                    id="cp-confirm"
                    type="password"
                    autoComplete="new-password"
                    className={'form-control' + ((submitted || mismatch) && next !== confirm ? ' is-invalid' : '')}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                />
                {(submitted || mismatch) && next !== confirm && <div className="invalid-feedback">The passwords do not match</div>}

                <div className="cp-actions">
                    <Button type="button" label="Cancel" className="p-button-text" onClick={close} disabled={busy} />
                    <Button type="submit" label={busy ? 'Changing…' : 'Change password'} icon="pi pi-check" disabled={busy} />
                </div>
            </form>
        </Dialog>
    );
};

export default ChangePasswordDialog;
