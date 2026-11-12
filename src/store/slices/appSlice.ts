import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { TreeNode } from 'primereact/treenode';

/** App-wide state. Only what screens actually share lives here (the manual selected in the Manuals tree). */
interface AppState {
    loading: boolean;
    error: string | null;
    /** The manual selected in the Manuals tree (node data from api/Manuals/GetTreeViewManualList). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectedManualNodeObj: (TreeNode & { data?: any }) | null;
}

const initialState: AppState = {
    loading: false,
    error: null,
    selectedManualNodeObj: null,
};

const appSlice = createSlice({
    name: 'appInfo',
    initialState,
    reducers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSelectedManualNodeObj(state, action: PayloadAction<any | null>) {
            state.selectedManualNodeObj = action.payload;
        },
        setLoading(state, action: PayloadAction<boolean>) {
            state.loading = action.payload;
        },
        setError(state, action: PayloadAction<string | null>) {
            state.error = action.payload;
        },
        clearError(state) {
            state.error = null;
        },
    },
});

export const { setLoading, setError, clearError, setSelectedManualNodeObj } = appSlice.actions;
export default appSlice.reducer;
