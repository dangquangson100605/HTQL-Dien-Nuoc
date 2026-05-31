"""Xuất Excel báo cáo sự cố."""

from datetime import datetime

from django.utils import timezone
from openpyxl import Workbook

from core.excel_reports import (
    apply_table_column_widths,
    write_admin_header,
    write_footer_signature,
    write_section_title,
    write_summary_block,
    write_table_header,
    write_table_row,
    workbook_to_response,
)

TYPE_LABELS = {'ELECTRIC': 'Điện', 'WATER': 'Nước', 'OTHER': 'Khác'}
SEV_LABELS = {'LOW': 'Thấp', 'MEDIUM': 'Trung bình', 'HIGH': 'Cao', 'CRITICAL': 'Khẩn cấp'}
STATUS_LABELS = {
    'PENDING_VERIFY': 'Chờ xác minh',
    'CONFIRMED': 'Đã xác nhận',
    'ASSIGNED': 'Đã phân công',
    'IN_PROGRESS': 'Đang xử lý',
    'RESOLVED': 'Đã xử lý',
    'CLOSED': 'Đã đóng',
    'REJECTED': 'Từ chối',
    'OPEN': 'Mới',
}


def _assigned_technician_names(inc) -> str:
    names = list(inc.assigned_technicians.values_list('username', flat=True))
    if not names and inc.assigned_to_id:
        return inc.assigned_to.username
    return ', '.join(names) if names else '—'


def export_incidents_excel(incidents, user, *, summary: dict, filters: dict | None = None) -> 'HttpResponse':
    headers = [
        'STT', 'Mã SC', 'Tiêu đề sự cố', 'Loại', 'Mức độ', 'Trạng thái',
        'Phường/Xã', 'Quận/Huyện', 'Địa chỉ', 'Người báo cáo', 'KTV phụ trách',
        'Ngày phát sinh', 'Ngày xử lý xong', 'Kết quả / Ghi chú',
    ]
    num_cols = len(headers)
    wb = Workbook()
    ws = wb.active
    ws.title = 'Su co'

    filter_lines = []
    if filters:
        if filters.get('date_from'):
            filter_lines.append(f"Từ ngày {filters['date_from']}")
        if filters.get('date_to'):
            filter_lines.append(f"đến ngày {filters['date_to']}")
        if filters.get('incident_type'):
            filter_lines.append(f"Loại: {TYPE_LABELS.get(filters['incident_type'], filters['incident_type'])}")
        if filters.get('severity'):
            filter_lines.append(f"Mức độ: {SEV_LABELS.get(filters['severity'], filters['severity'])}")
        if filters.get('status'):
            filter_lines.append(f"Trạng thái: {STATUS_LABELS.get(filters['status'], filters['status'])}")

    subtitle = ' — '.join(filter_lines) if filter_lines else '(Toàn bộ phạm vi được phân quyền)'

    row = write_admin_header(
        ws,
        report_title='Báo cáo tình hình sự cố hạ tầng điện — nước',
        report_subtitle=subtitle,
        report_number=f'HTĐN/SC/{datetime.now():%m/%Y}',
        num_cols=num_cols,
    )

    write_section_title(ws, row, 1, num_cols, 'I. TỔNG HỢP TÌNH HÌNH')
    row += 1
    by_status = summary.get('by_status', {})
    by_severity = summary.get('by_severity', {})
    row = write_summary_block(ws, row, 1, num_cols, [
        ('Tổng số sự cố', str(summary.get('total', 0))),
        ('Đã xử lý / đóng', str(summary.get('resolved_count', 0))),
        ('Tỷ lệ xử lý', f"{summary.get('resolution_rate', 0)}%"),
        ('Chờ xác minh / xác nhận', str(by_status.get('PENDING_VERIFY', 0) + by_status.get('CONFIRMED', 0))),
        ('Đang xử lý', str(by_status.get('IN_PROGRESS', 0) + by_status.get('ASSIGNED', 0))),
        ('Mức độ cao / khẩn cấp', str(by_severity.get('HIGH', 0) + by_severity.get('CRITICAL', 0))),
        ('Thời điểm xuất báo cáo', timezone.localtime().strftime('%d/%m/%Y %H:%M')),
        ('Người lập báo cáo', getattr(user, 'username', '') or '—'),
    ])
    row += 1

    write_section_title(ws, row, 1, num_cols, 'II. DANH SÁCH CHI TIẾT SỰ CỐ')
    row += 1
    table_header_row = row
    row = write_table_header(ws, row, headers)

    incident_list = list(incidents)
    for idx, inc in enumerate(incident_list, start=1):
        created = timezone.localtime(inc.created_at).strftime('%d/%m/%Y %H:%M') if inc.created_at else '—'
        resolved = timezone.localtime(inc.resolved_at).strftime('%d/%m/%Y %H:%M') if inc.resolved_at else '—'
        row = write_table_row(ws, row, [
            idx,
            inc.id,
            inc.title,
            TYPE_LABELS.get(inc.incident_type, inc.incident_type),
            SEV_LABELS.get(inc.severity, inc.severity),
            STATUS_LABELS.get(inc.status, inc.status),
            inc.ward.name if inc.ward_id else (inc.area or '—'),
            inc.ward.district if inc.ward_id else '—',
            inc.address or '—',
            inc.reported_by.username if inc.reported_by_id else '—',
            _assigned_technician_names(inc),
            created,
            resolved,
            inc.result_note or inc.rejection_reason or '—',
        ], center_cols={0, 1})

    table_last_row = row - 1
    write_footer_signature(ws, row + 2, num_cols, prepared_by=getattr(user, 'username', ''))
    apply_table_column_widths(
        ws, headers=headers, table_header_row=table_header_row, table_last_row=table_last_row,
    )
    filename = f'bao_cao_su_co_{datetime.now():%Y%m%d_%H%M}.xlsx'
    return workbook_to_response(wb, filename)
