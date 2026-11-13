import React from 'react';

/**
 * Keeps an error inside one part of a page (e.g. one dashboard tab) from blanking the whole app: that part shows a
 * short message and a "Try again" button instead, and the rest of the app keeps working. The error goes to the console.
 */
interface Props { name: string; children: React.ReactNode }
interface State { failed: boolean }

class PanelErrorBoundary extends React.Component<Props, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(error: unknown, info: React.ErrorInfo) {
        console.error(`${this.props.name} could not be shown`, error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div role="alert" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <i className="pi pi-exclamation-triangle" style={{ fontSize: '1.5rem', color: 'var(--warning-color)' }} aria-hidden="true" />
                <p style={{ margin: '0.75rem 0' }}>{this.props.name} could not be shown.</p>
                <button type="button" className="p-button p-button-sm p-button-outlined" onClick={() => this.setState({ failed: false })}>
                    Try again
                </button>
            </div>
        );
    }
}

export default PanelErrorBoundary;
