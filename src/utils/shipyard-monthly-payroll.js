// All sums are supplied by the backend; clients only filter and format the report.
const fields = ['normalHours', 'overtimeHours', 'totalHours', 'normalWages', 'overtimeWages', 'contractWages', 'totalWages', 'paidWages', 'unpaidWages'];
export function monthlyReport(reports, month, projectId) {
    return (reports || []).find(r => r.month === month && Number(r.projectId) === Number(projectId)) || {
        month, projectId, rows: [], totals: {workerCount: 0, ...Object.fromEntries(fields.map(k => [k, 0]))},
    };
}
export function reportMonths(serverDate) {
    if (!serverDate) return [];
    const [year, month] = serverDate.split('-').map(Number);
    return Array.from({length: 36}, (_, index) => new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7));
}
export function findReportWorkers(rows, search) {
    const query = search.trim().toLowerCase();
    return rows.filter(row => [row.name, row.code, row.team].join(' ').toLowerCase().includes(query));
}
export function monthlyCsv(rows, month, project) {
    return [['月份', '工程范围', '姓名', '工号', '班组', '正常工时', '加班工时', '总工时', '点工工资', '加班工资', '包工工资', '工资合计', '已结算', '待结算', '状态'],
        ...rows.map(row => [month, project, row.name, row.code, row.team, ...fields.map(k => Number(row[k]).toFixed(2)), row.status])];
}
