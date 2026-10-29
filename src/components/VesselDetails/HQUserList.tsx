import React, { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
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

const HQUserList: React.FC<HQUserListProps> = ({ hqUser, selectedHQUserList, onSelectionChange, isViewMode }) => {
    const [selectedHqUsers, setSelectedHqUsers] = useState<HQUser[]>([]);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [selectedDept, setSelectedDept] = useState<string | null>(null);
    const [hqDeptOptions, setHqDeptOptions] = useState<{ label: string; value: string }[]>([]);
    const [hqRoleOptions, setHqRoleOptions] = useState<{ label: string; value: string }[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const [allData, setAllData] = useState<HQUser[]>([]);

    useEffect(() => {
        dmsLifecycleService.getApiCall<string[] | null>('HQUser/GetHQDept')
            .then(data => {
                const options = (data || []).map((cat) => ({
                    label: cat,
                    value: cat
                }));
                setHqDeptOptions(options);
            })
            .catch(() => setHqDeptOptions([]));

        dmsLifecycleService.getApiCall<string[] | null>('HQUser/GetHQRoles')
            .then(data => {
                const options = (data || []).map((cat) => ({
                    label: cat,
                    value: cat
                }));
                setHqRoleOptions(options);
            })
            .catch(() => setHqRoleOptions([]));

    }, []);

    useEffect(() => {
        setAllData(hqUser);
        const selectHQUserIds = hqUser.filter(user =>
            selectedHQUserList?.includes(user.hQ_UsersID)
        );

        setSelectedHqUsers(selectHQUserIds);
    }, [hqUser, selectedHQUserList]);

    const filteredUsers = allData.filter(user => {
        const dept = user.hqDept || '';
        const role = user.userRole || '';
        
        const deptMatch = selectedDept
            ? (dept && dept.toUpperCase() === selectedDept.toUpperCase())
            : true;
        const roleMatch = selectedRole
            ? (role && role.toUpperCase() === selectedRole.toUpperCase())
            : true;
        
        return deptMatch && roleMatch;
   });

    const handleSelectionChange = (e: { value: HQUser[] }) => {
        if (isViewMode) return;
        setSelectedHqUsers(e.value);
        onSelectionChange?.(e.value);
    };

    const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchValue(value);
        
        if (value.trim() === '') {
            setAllData(hqUser);
        } else {
            const filtered = hqUser.filter(user => 
                user.userName.toLowerCase().includes(value.toLowerCase()) ||
                user.userRole.toLowerCase().includes(value.toLowerCase()) ||
                user.hqDept.toLowerCase().includes(value.toLowerCase()) ||
                user.hQ_UsersID.toString().includes(value)
            );
            setAllData(filtered);
        }
    }

    return (
        <div className='vessel-details-container'>
            <div>
                <label className="headerLabel">HQ User List</label>
            </div>
            <div className="p-inputgroup">
                  <InputText
                    placeholder="Search..."
                    value={searchValue}
                    onChange={onSearchChange}
                    style={{ 
                        height: '38px', 
                        paddingLeft: '10px' 
                    }}
                />
            </div>
            <div className="p-inputgroup" style={{ alignItems: 'center' }}>
                <label style={{ fontWeight: 'bold', width: '50px' }}>Dept: </label>
                <Dropdown
                    value={selectedDept}
                    options={hqDeptOptions}
                    onChange={e => setSelectedDept(e.value)}
                    placeholder="Select Dept"
                    style={{ width: '10px', height: '40px', verticalAlign: 'middle' }}
                    showClear
                />

                <label style={{ fontWeight: 'bold', width: '60px', textAlign:'right' }}>Role: </label>
                <Dropdown
                    value={selectedRole}
                    options={hqRoleOptions}
                    onChange={e => setSelectedRole(e.value)}
                    placeholder="Select Role"
                    style={{ width: '80px', height: '40px', verticalAlign: 'middle' }}
                    showClear
                />
            </div>
            <div>
                <DataTable
                    value={filteredUsers}
                    selection={selectedHqUsers}
                    onSelectionChange={isViewMode ? undefined : handleSelectionChange}
                    selectionMode="checkbox"
                    dataKey="hQ_UsersID"
                    scrollable 
                    emptyMessage={<span style={{ display: 'block', width: '100%', textAlign: 'center', color: '#888', padding: '1rem 0' }}>
                                       'No HQ user found.'
                                  </span>
                                }
                    className="vessel-rank-list p-datatable-gridlines"
                >
                    <Column
                        selectionMode="multiple"
                        headerStyle={{width: '50px'}}
                        bodyStyle={{ width: '50px', verticalAlign: 'center', textAlign: 'center' }}
                        body={isViewMode ? (rowData => <input type="checkbox" checked={selectedHqUsers.some(v => v.hQ_UsersID === rowData.hQ_UsersID)} disabled />) : undefined}
                    />
                    <Column field="userName" header="User Name" sortable headerStyle={{width: '250px'}} bodyStyle={{ width: '250px' }} />
                    <Column field="userRole" header="Role" sortable headerStyle={{width: '100px'}} bodyStyle={{ width: '100px' }} />
                    <Column field="hqDept" header="Dept" sortable headerStyle={{width: '100px'}} bodyStyle={{ width: '100px' }} />
                    <Column field="hQ_UsersID" header="ID" sortable hidden={true} />
                </DataTable>
            </div>
        </div>
    );
};

export default HQUserList;