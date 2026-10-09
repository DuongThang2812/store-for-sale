/** Shared public contract. Provider message/details/hint are never UI text. */
export const ERROR_MESSAGES = Object.freeze({
  REQUEST_FAILED: 'Chưa thực hiện được. Vui lòng thử lại hoặc kiểm tra trạng thái hiện tại.',
  CONNECTION_FAILED: 'Chưa kết nối được hệ thống. Vui lòng kiểm tra mạng và thử lại.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  INVALID_REQUEST: 'Thông tin yêu cầu chưa hợp lệ. Vui lòng kiểm tra lại.',
  NOT_FOUND: 'Không tìm thấy dữ liệu. Vui lòng tải lại danh sách.',
  INSUFFICIENT_STOCK: 'Không đủ hàng trong kho. Vui lòng tải lại giỏ hàng.',
  DEBT_OVERPAYMENT: 'Số tiền trả vượt quá số nợ hiện tại.',
  DATA_CHANGED: 'Dữ liệu đã thay đổi. Vui lòng tải lại và xác nhận thông tin mới.',
  REQUEST_ID_CONFLICT: 'Mã yêu cầu đã dùng cho nội dung khác. Vui lòng kiểm tra giao dịch trước khi tạo yêu cầu mới.',
  HISTORY_MISMATCH: 'Số dư chưa khớp lịch sử. Vui lòng đối chiếu dữ liệu trước khi tiếp tục.',
  UNIT_LOCKED: 'Mặt hàng đã có tồn kho hoặc lịch sử. Hãy tạo mặt hàng mới nếu cần đổi quy cách.',
  UNIT_INVALID: 'Đơn vị hoặc quy cách mặt hàng chưa hợp lệ. Vui lòng kiểm tra lại.',
  RETAIL_PRICE_REQUIRED: 'Hãy nhập giá bán lẻ trước khi bật bán mặt hàng nháp.',
  ALREADY_CANCELLED: 'Đơn này đã hủy. Vui lòng tải lại lịch sử.',
  LAST_ADMIN: 'Không thể vô hiệu quản trị viên cuối cùng.',
  ADMIN_DISABLE_FIRST: 'Vô hiệu quản trị viên trước khi vô hiệu tài khoản.',
  ACTIVE_ACCOUNT_REQUIRED: 'Chỉ cấp quyền cho tài khoản đang hoạt động.',
  STATUS_UNCHANGED: 'Tài khoản hoặc cửa hàng đã ở trạng thái này.',
  STATUS_TRANSITION_INVALID: 'Không thể chuyển trạng thái cửa hàng theo cách này.',
  EMAIL_PENDING: 'Email đang gửi. Vui lòng chờ trước khi thử lại.',
  EMAIL_UNAVAILABLE: 'Không tìm thấy email của tài khoản.',
  RESET_ORIGIN_MISSING: 'Chưa cấu hình địa chỉ ứng dụng để đặt lại mật khẩu.',
  REQUEST_TOO_LARGE: 'Yêu cầu quá lớn.',
  MFA_REQUIRED: 'Cần xác thực hai bước trước khi quản trị.',
  MFA_UNAVAILABLE: 'Chưa kiểm tra được xác thực hai bước.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.',
});

export class ApplicationError extends Error {
  constructor(applicationCode, { cause, code, status = 0, retryAfter = null } = {}) {
    const known = typeof applicationCode === 'string' && Object.hasOwn(ERROR_MESSAGES, applicationCode);
    const boundedWait = Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60 ? retryAfter : null;
    super(applicationCode === 'RATE_LIMITED' && boundedWait !== null
      ? `Bạn thao tác quá nhanh. Vui lòng chờ ${boundedWait} giây rồi thử lại.`
      : known ? ERROR_MESSAGES[applicationCode] : ERROR_MESSAGES.REQUEST_FAILED, { cause });
    this.name = 'ApplicationError';
    this.applicationCode = known ? applicationCode : 'REQUEST_FAILED';
    // Keep provider codes for control flow, diagnostics only in cause.
    this.code = typeof code === 'string' ? code : this.applicationCode;
    this.status = status;
    this.retryAfter = boundedWait;
  }
}

const businessMessages = new Map([
  ['Số tiền trả vượt quá số nợ hiện tại.', 'DEBT_OVERPAYMENT'],
  ['Giá hoặc tồn kho đã thay đổi. Hãy tải lại giỏ hàng và xác nhận số tiền mới.', 'DATA_CHANGED'],
  ['Kho đã có giao dịch mới. Hãy tải lại và đếm lại mặt hàng trước khi kiểm kê.', 'DATA_CHANGED'],
  ['Mặt hàng đã thay đổi. Hãy tải lại thông tin trước khi lưu.', 'DATA_CHANGED'],
  ['Số tiền hoàn hoặc công nợ đã thay đổi. Hãy mở lại xác nhận hủy đơn.', 'DATA_CHANGED'],
  ['Quyền nhân viên đã thay đổi. Hãy tải lại trước khi lưu.', 'DATA_CHANGED'],
  ['Cài đặt đã thay đổi. Hãy tải lại trước khi lưu.', 'DATA_CHANGED'],
  ['Lịch sử nợ chưa khớp số dư khách.', 'HISTORY_MISMATCH'],
  ['Số dư nợ của khách không khớp lịch sử.', 'HISTORY_MISMATCH'],
  ['Mặt hàng còn tồn kho nên chưa thể đổi đơn vị nhỏ nhất.', 'UNIT_LOCKED'],
  ['Mặt hàng còn tồn kho nên chưa thể đổi quy cách.', 'UNIT_LOCKED'],
  ['Mặt hàng còn tồn kho nên chưa thể bỏ quy cách.', 'UNIT_LOCKED'],
  ['Mặt hàng đã có lịch sử kho; không thể đổi đơn vị nhỏ nhất. Hãy tạo mặt hàng mới.', 'UNIT_LOCKED'],
  ['Hãy nhập giá bán lẻ trước khi bật bán mặt hàng nháp.', 'RETAIL_PRICE_REQUIRED'],
  ['Đơn này đã hủy.', 'ALREADY_CANCELLED'],
  ['Không thể vô hiệu quản trị viên cuối cùng.', 'LAST_ADMIN'],
  ['Vô hiệu quản trị viên trước khi vô hiệu tài khoản.', 'ADMIN_DISABLE_FIRST'],
  ['Chỉ cấp quyền cho tài khoản đang hoạt động.', 'ACTIVE_ACCOUNT_REQUIRED'],
  ['Cửa hàng đã ở trạng thái này.', 'STATUS_UNCHANGED'],
  ['Tài khoản đã ở trạng thái này.', 'STATUS_UNCHANGED'],
  ['Quản trị viên đã ở trạng thái này.', 'STATUS_UNCHANGED'],
  ['Không thể chuyển trạng thái cửa hàng theo cách này.', 'STATUS_TRANSITION_INVALID'],
  ['Bạn không có quyền với cửa hàng này.', 'FORBIDDEN'],
]);

export function toApplicationError(error) {
  if (error instanceof ApplicationError) return error;
  const code = typeof error?.code === 'string' ? error.code : '';
  const status = Number.isInteger(error?.status) ? error.status : 0;
  let applicationCode = 'REQUEST_FAILED';
  if (code === '42501' || status === 403) applicationCode = 'FORBIDDEN';
  else if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code) || status === 401) applicationCode = 'SESSION_EXPIRED';
  else if (['40001', '40P01', '23505'].includes(code)) applicationCode = 'DATA_CHANGED';
  else if (['22023', '22P02', '23502', '23503', '23514', '22003'].includes(code)) applicationCode = 'INVALID_REQUEST';
  else if (code === 'PGRST116' || status === 404) applicationCode = 'NOT_FOUND';
  else if (status === 429) applicationCode = 'RATE_LIMITED';
  else if (error instanceof TypeError || code === 'network_error' || code.startsWith('08')) applicationCode = 'CONNECTION_FAILED';
  else if (code === 'P0001') {
    const message = typeof error?.message === 'string' ? error.message : '';
    applicationCode = businessMessages.get(message) || 'REQUEST_FAILED';
    // Dynamic names are discarded, even when they contain SQL or personal data.
    if (/^Không đủ hàng [\s\S]* trong kho\.$/.test(message)) applicationCode = 'INSUFFICIENT_STOCK';
    else if (/^Mã yêu cầu (?:đã|cũ) /.test(message)) applicationCode = 'REQUEST_ID_CONFLICT';
    else if (/^Không tìm thấy /.test(message)) applicationCode = 'NOT_FOUND';
    else if (/^Đơn vị (?:bán|nhập) của /.test(message) || /^Số lượng [\s\S]* chưa quy đổi thành đơn vị kho nguyên\.$/.test(message)) applicationCode = 'UNIT_INVALID';
  }
  return new ApplicationError(applicationCode, { cause: error, code: code || undefined, status });
}

/** Local validation instances cannot be forged by a Supabase response. */
export class AdminValidationError extends Error {}

const publicStatuses = Object.freeze({
  FORBIDDEN: 403, SESSION_EXPIRED: 401, NOT_FOUND: 404, RATE_LIMITED: 429,
  REQUEST_TOO_LARGE: 413, DATA_CHANGED: 409, REQUEST_ID_CONFLICT: 409,
  STATUS_UNCHANGED: 409, EMAIL_PENDING: 409, REQUEST_FAILED: 500, CONNECTION_FAILED: 500,
});

export function publicErrorBody(error) {
  const failure = error instanceof AdminValidationError || error instanceof SyntaxError
    ? new ApplicationError('INVALID_REQUEST', { status: 400 }) : toApplicationError(error);
  // Provider HTTP status is diagnostic; our public category decides HTTP semantics.
  const status = publicStatuses[failure.applicationCode] || 400;
  return { status, body: { code: failure.applicationCode, error: failure.message } };
}

/** Remote payload is untrusted: use only locally defined text for known codes. */
export function fromAdminResponse(payload, status, cause) {
  let applicationCode = payload?.code;
  if (typeof applicationCode !== 'string' || !Object.hasOwn(ERROR_MESSAGES, applicationCode)) {
    applicationCode = status === 401 ? 'SESSION_EXPIRED' : status === 403 ? 'FORBIDDEN'
      : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED'
        : status === 400 ? 'INVALID_REQUEST' : 'REQUEST_FAILED';
  }
  const retryAfter = status === 429 && Number.isInteger(payload?.retryAfter)
    && payload.retryAfter >= 1 && payload.retryAfter <= 60 ? payload.retryAfter : null;
  return new ApplicationError(applicationCode, { status, retryAfter, cause });
}
