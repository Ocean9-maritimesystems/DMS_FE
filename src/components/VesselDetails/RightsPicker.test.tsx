import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RightsPicker from './RightsPicker';

interface Row { id: number; name: string }
const rows: Row[] = [{ id: 1, name: 'Test Vessel 1' }, { id: 2, name: 'Test Vessel 2' }, { id: 3, name: 'Ocean Star' }];
const props = { title: 'Vessels', icon: 'pi pi-compass', noun: 'vessel', rows, dataKey: 'id', rowKey: (r: Row) => r.id,
    columns: [{ field: 'name', header: 'Name' }], searchText: (r: Row) => r.name };

describe('RightsPicker', () => {
    it('keeps the ticks of rows hidden by the search when another row is ticked', () => {
        const onChange = vi.fn();
        const { container } = render(<RightsPicker<Row> {...props} selected={[rows[2]]} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText('Search vessels'), { target: { value: 'Vessel 2' } });
        expect(screen.queryByText('Ocean Star')).toBeNull();
        const boxes = container.querySelectorAll('tbody input[type="checkbox"]');
        expect(boxes.length).toBe(1);
        fireEvent.click(boxes[0]);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].map((r: Row) => r.id).sort()).toEqual([2, 3]);
    });

    it('shows the count and can show only the selected rows', () => {
        render(<RightsPicker<Row> {...props} selected={[rows[0]]} onChange={() => undefined} />);
        expect(screen.getByText('1 of 3')).toBeTruthy();
        fireEvent.click(screen.getByText('Selected only'));
        expect(screen.queryByText('Test Vessel 2')).toBeNull();
        expect(screen.getByText('Test Vessel 1')).toBeTruthy();
    });
});
