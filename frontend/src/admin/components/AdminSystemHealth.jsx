import { DataState } from './AdminData.jsx';
import { useAdminData } from '../hooks/useAdminData.js';
import { adminDate } from '../domain/display.js';

export function SystemHealthDetails({ data }) {
    return <section className="admin-panel panel"><h2>Tình trạng hệ thống</h2>
        <p>Database: {data.database_ok === true ? 'Truy vấn hiện tại thành công' : 'Chưa xác nhận'}</p>
        <p>Auth: {data.auth_ok === true ? 'Phiên hiện tại đã xác minh' : 'Chưa xác nhận'}</p>
        <p>Edge Function: {data.edge_ok === true ? 'Yêu cầu hiện tại phản hồi thành công' : 'Chưa xác nhận'}</p>
        <small>Kiểm tra lúc {adminDate(data.checked_at)}. Phản ánh yêu cầu vừa chạy, không phải chỉ số uptime.</small>
    </section>;
}

export function AdminSystemHealth() {
    const state = useAdminData('system');
    return <DataState state={state}>{data => <SystemHealthDetails data={data}/>}</DataState>;
}
