import React, { useEffect, useMemo, useState } from 'react';
import RightsPicker from './RightsPicker';
import dmsLifecycleService from '../../services/DMSLifecycleService';

export interface HQUser {
    hQ_UsersID: number;
    userName: string;
    hqDept: string;
    userRole: string;
}

interface HQUserListProps {
    hqUser: HQUser[];
    selectedHQUserList?: number[];
    /** The selected users (rows, not IDs). */
    onSelectionChange?: (selected: HQUser[]) => void;
    isViewMode?: boolean;
}

const keyOf = (u: HQUser) => u.hQ_UsersID;
const textOf = (u: HQUser) => `${u.userName ?? ''} ${u.userRole ?? ''} ${u.hqDept ?? ''}`;
const toOptions = (data: string[] | null) => (data || []).map((v) => ({ label: v, value: v }));

const HQUserList: React.FC<HQUserListProps> = ({ hqUser, selectedHQUserList, onSelectionChange, isViewMode }) => {
    const [deptOptions, setDeptOptions] = useState<{ label: string; value: string }[]>([]);
    const [roleOptions, setRoleOptions] = useState<{ label: string; value: string }[]>([]);

    useEffect(() => {
        dmsLifecycleService.getApiCall<string[] | null>('HQUser/GetHQDept').then((d) => setDeptOptions(toOptions(d))).catch(() => setDeptOptions([]));
        dmsLifecycleService.getApiCall<string[] | null>('HQUser/GetHQRoles').then((d) => setRoleOptions(toOptions(d))).catch(() => setRoleOptions([]));
    }, []);

    const selected = useMemo(() => hqUser.filter((u) => selectedHQUserList?.includes(u.hQ_UsersID)), [hqUser, selectedHQUserList]);
    const filters = useMemo(() => [
        { id: 'dept', label: 'Department', placeholder: 'All departments', options: deptOptions,
            match: (u: HQUser, value: string) => (u.hqDept || '').toUpperCase() === value.toUpperCase() },
        { id: 'role', label: 'Role', placeholder: 'All roles', options: roleOptions,
            match: (u: HQUser, value: string) => (u.userRole || '').toUpperCase() === value.toUpperCase() },
    ], [deptOptions, roleOptions]);

    return (
        <RightsPicker<HQUser>
            title="Office users" icon="pi pi-building" noun="user"
            rows={hqUser} dataKey="hQ_UsersID" rowKey={keyOf} searchText={textOf}
            columns={[{ field: 'userName', header: 'Name' }, { field: 'userRole', header: 'Role' }, { field: 'hqDept', header: 'Dept', className: 'rp-col-narrow' }]}
            filters={filters} selected={selected} onChange={onSelectionChange} isViewMode={isViewMode}
        />
    );
};

export default HQUserList;
