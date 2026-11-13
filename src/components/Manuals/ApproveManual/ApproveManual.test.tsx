import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ApproveManual from './ApproveManual';

describe('ApproveManual', () => {
    it('asks for a reason before sending back, and confirms before approving', () => {
        const onReject = vi.fn(); const onApprove = vi.fn();
        render(<ApproveManual manualName="1.0 - SMS" version="2.0" status="Supt Approval" onApprove={onApprove} onReject={onReject} onClose={() => undefined} />);
        fireEvent.click(screen.getByText('Send back'));
        expect(screen.getByText('Enter the reason for sending it back. The author sees it.')).toBeTruthy();
        expect(screen.queryByText(/back to the author with your comment/)).toBeNull();
        fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'Fix section 2' } });
        fireEvent.click(screen.getByText('Send back'));
        expect(screen.getByText(/back to the author with your comment/)).toBeTruthy();
        fireEvent.click(screen.getAllByText('Send back').pop()!);
        expect(onReject).toHaveBeenCalledWith('Fix section 2');
        expect(onApprove).not.toHaveBeenCalled();
    });
});
