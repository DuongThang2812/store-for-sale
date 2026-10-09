export function ListMore({ shown, total, onMore, hasMore }) {
    if (!hasMore) return null;
    return <div className="list-more"><span>Đang hiển thị {shown} / {total}</span><button type="button" className="button secondary" onClick={onMore}>Xem thêm</button></div>;
}
