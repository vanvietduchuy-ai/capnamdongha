import * as XLSX from 'xlsx';
import { Task, User, TaskStatus, TaskPriority } from '../types';

export const ExcelService = {
  // New: Read Excel file and convert to CSV text for AI analysis
  readExcelFile: async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get first sheet
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          
          // Convert to CSV string (easy for AI to parse)
          const csv = XLSX.utils.sheet_to_csv(sheet);
          resolve(csv);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  },

  exportTasks: (tasks: Task[], users: User[]) => {
    try {
      const data = tasks.map((task, index) => {
        // Resolve Assignee Names
        const assignees = task.assigneeIds
          .map(id => users.find(u => u.id === id)?.fullName)
          .filter(Boolean)
          .join(', ');

        // Resolve Creator Name
        const creator = users.find(u => u.id === task.creatorId)?.fullName || 'N/A';

        // Translate Status
        const statusMap: Record<string, string> = {
          [TaskStatus.PENDING]: 'Chờ xử lý',
          [TaskStatus.IN_PROGRESS]: 'Đang thực hiện',
          [TaskStatus.COMPLETED]: 'Hoàn thành',
          [TaskStatus.CANCELLED]: 'Đã hủy',
          [TaskStatus.OVERDUE]: 'Quá hạn'
        };

        // Translate Priority
        const priorityMap: Record<string, string> = {
          [TaskPriority.LOW]: 'Thấp',
          [TaskPriority.MEDIUM]: 'Trung bình',
          [TaskPriority.HIGH]: 'Cao',
          [TaskPriority.URGENT]: 'Hỏa tốc'
        };

        return {
          'STT': index + 1,
          'Tiêu đề': task.title,
          'Số hiệu VB': task.dispatchNumber || '',
          'Cơ quan ban hành': task.issuingAuthority || '',
          'Nội dung chỉ đạo': task.description,
          'Đề xuất của CB': task.proposal || '',
          'Trạng thái': statusMap[task.status] || task.status,
          'Độ ưu tiên': priorityMap[task.priority] || task.priority,
          'Người thực hiện': assignees,
          'Người giao': creator,
          'Ngày giao': new Date(task.createdAt).toLocaleDateString('vi-VN'),
          'Hạn xử lý': task.isRegularDuty ? 'Thường xuyên' : new Date(task.dueDate).toLocaleDateString('vi-VN'),
          'Đã nhận việc': task.acceptedAt ? 'Rồi' : 'Chưa'
        };
      });

      // Create Worksheet
      const worksheet = XLSX.utils.json_to_sheet(data);

      // Auto-width columns (Simple estimation)
      const wscols = [
        { wch: 5 },  // STT
        { wch: 30 }, // Tieu de
        { wch: 15 }, // So hieu
        { wch: 15 }, // Co quan
        { wch: 40 }, // Noi dung
        { wch: 20 }, // De xuat
        { wch: 15 }, // Trang thai
        { wch: 10 }, // Do uu tien
        { wch: 25 }, // Nguoi thuc hien
        { wch: 20 }, // Nguoi giao
        { wch: 12 }, // Ngay giao
        { wch: 12 }, // Han xu ly
        { wch: 10 }, // Da nhan
      ];
      worksheet['!cols'] = wscols;

      // Create Workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sổ Giao Việc");

      // Generate File Name
      const date = new Date().toISOString().split('T')[0];
      const fileName = `SoGiaoViec_CAP_NamDongHa_${date}.xlsx`;

      // Download
      XLSX.writeFile(workbook, fileName);
      
    } catch (error) {
      console.error("Export Error:", error);
      alert("Có lỗi xảy ra khi xuất file Excel.");
    }
  }
};