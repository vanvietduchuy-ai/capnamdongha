import { GoogleGenAI, Type } from "@google/genai";
import { UserDepartment } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to ensure value is a string
const ensureString = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.title || val.content || val.text || JSON.stringify(val);
  }
  return String(val);
};

// Helper to normalize date strings (handle missing year)
const normalizeDate = (dateStr: string, referenceDate?: Date): string => {
  if (!dateStr) return "";
  const currentYear = referenceDate ? referenceDate.getFullYear() : new Date().getFullYear();
  
  // Clean string
  let cleanStr = dateStr.trim().replace(/\s+/g, '');

  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr;

  // Handle DD/MM or DD-MM (Missing Year) -> Use Current Year
  const shortDateMatch = cleanStr.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (shortDateMatch) {
    const day = shortDateMatch[1].padStart(2, '0');
    const month = shortDateMatch[2].padStart(2, '0');
    return `${currentYear}-${month}-${day}`;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY -> Convert to ISO YYYY-MM-DD
  const fullDateMatch = cleanStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (fullDateMatch) {
     const day = fullDateMatch[1].padStart(2, '0');
     const month = fullDateMatch[2].padStart(2, '0');
     let year = fullDateMatch[3];
     if (year.length === 2) year = '20' + year;
     return `${year}-${month}-${day}`;
  }

  return dateStr;
};

export const GeminiService = {
  /**
   * Generates description and steps.
   */
  suggestTaskDetails: async (taskTitle: string): Promise<{ description: string; steps: string[]; dueDate?: string }> => {
    if (!apiKey) {
      return { description: "Vui lòng cấu hình API Key.", steps: [] };
    }

    try {
      const currentYear = new Date().getFullYear();
      const prompt = `
        Nhiệm vụ: "${taskTitle}".
        1. Viết chỉ đạo (2 câu).
        2. 3 bước thực hiện.
        3. Trích xuất hạn chót (YYYY-MM-DD) nếu có. Nếu không có năm, mặc định là ${currentYear}.
        JSON output.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              steps: { type: Type.ARRAY, items: { type: Type.STRING } },
              dueDate: { type: Type.STRING, description: "YYYY-MM-DD or null" }
            },
            required: ["description", "steps"]
          }
        }
      });

      const text = response.text;
      if (!text) return { description: "", steps: [] };
      
      const result = JSON.parse(text);
      return {
        description: ensureString(result.description),
        steps: Array.isArray(result.steps) ? result.steps.map(ensureString) : [],
        dueDate: result.dueDate ? normalizeDate(ensureString(result.dueDate)) : undefined
      };
    } catch (error) {
      return { description: "Lỗi AI.", steps: [] };
    }
  },

  /**
   * Extracts structured metadata from image.
   */
  extractDocumentDetails: async (base64Image: string, mimeType: string): Promise<{
    dispatchNumber: string;
    issuingAuthority: string;
    issueDate: string;
    abstract: string;
    summary: string;
    deadline: string;
  }> => {
    if (!apiKey) throw new Error("Missing API Key");

    try {
      const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
      const currentYear = new Date().getFullYear();

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image', // Fast multimodal model
        contents: {
          parts: [
            { inlineData: { data: cleanBase64, mimeType: mimeType } },
            { text: `Trích xuất JSON: dispatchNumber, issuingAuthority, issueDate(YYYY-MM-DD), abstract, summary, deadline(YYYY-MM-DD). Nếu thông tin ngày tháng thiếu năm, hãy sử dụng năm hiện tại (${currentYear}).` },
          ],
        },
      });

      const text = response.text;
      if (!text) return { dispatchNumber: "", issuingAuthority: "", issueDate: "", abstract: "", summary: "", deadline: "" };

      let result = { dispatchNumber: "", issuingAuthority: "", issueDate: "", abstract: text.substring(0, 100), summary: text, deadline: "" };
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         try {
            result = { ...result, ...JSON.parse(jsonMatch[1] || jsonMatch[0]) };
         } catch (e) {}
      }

      return {
        dispatchNumber: ensureString(result.dispatchNumber),
        issuingAuthority: ensureString(result.issuingAuthority),
        issueDate: normalizeDate(ensureString(result.issueDate)),
        abstract: ensureString(result.abstract),
        summary: ensureString(result.summary),
        deadline: normalizeDate(ensureString(result.deadline))
      };
    } catch (error) {
      return {
        dispatchNumber: "", issuingAuthority: "", issueDate: "", 
        abstract: "Lỗi xử lý ảnh", summary: "", deadline: ""
      };
    }
  },

  generateBriefing: async (tasks: any[]): Promise<string> => {
     if (!apiKey) return "Cần có API Key.";
     try {
       const tasksStr = tasks.map(t => `- ${ensureString(t.title)}`).join('\n');
       const prompt = `Tóm tắt ngắn gọn báo cáo (50 từ): \n${tasksStr}`;
       const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
       return ensureString(response.text);
     } catch (error) { return ""; }
  },

  generateOfficerSuggestions: async (): Promise<{ title: string; description: string }[]> => {
    if (!apiKey) return [];
    try {
      const prompt = "4 công việc công an phường thực tế. JSON array: title, description.";
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { title: { type: Type.STRING }, description: { type: Type.STRING } },
              required: ["title", "description"]
            }
          }
        }
      });
      const text = response.text;
      return text ? JSON.parse(text) : [];
    } catch (error) { return []; }
  },

  /**
   * Scan schedule - Support Multiple Files (Images/PDFs) + Text
   */
  scanScheduleDocument: async (
    mediaInputs: { data: string; mimeType: string }[],
    textContent: string = "",
    referenceDate?: Date
  ): Promise<{ 
    date: string; 
    time: string; 
    content: string; 
    location: string; 
    chairperson: string; 
    participants: string 
  }[]> => {
    if (!apiKey) throw new Error("Missing API Key");

    try {
      const now = new Date();
      const currentYear = referenceDate ? referenceDate.getFullYear() : now.getFullYear();
      
      let contextStr = "";
      if (referenceDate) {
        const days = [
          { short: 'Thứ 2', full: 'Thứ Hai', index: 0 },
          { short: 'Thứ 3', full: 'Thứ Ba', index: 1 },
          { short: 'Thứ 4', full: 'Thứ Tư', index: 2 },
          { short: 'Thứ 5', full: 'Thứ Năm', index: 3 },
          { short: 'Thứ 6', full: 'Thứ Sáu', index: 4 },
          { short: 'Thứ 7', full: 'Thứ Bảy', index: 5 },
          { short: 'Chủ nhật', full: 'Chủ Nhật', index: 6 }
        ];
        const dateList = days.map((day) => {
          const d = new Date(referenceDate);
          d.setDate(referenceDate.getDate() + day.index);
          const isoDate = d.toISOString().split('T')[0];
          return `${day.short}/${day.full}: ${isoDate}`;
        }).join(', ');
        contextStr = `\nContext: Tuần làm việc hiện tại (Bắt đầu từ Thứ 2 ngày ${referenceDate.toLocaleDateString('vi-VN')}) có các ngày: ${dateList}. 
        Nếu tài liệu ghi "Thứ 2" hoặc "Thứ Hai", hãy gán ngày tương ứng. Tương tự cho các thứ khác.`;
      } else {
         contextStr = `\nContext: Hôm nay là ${now.toLocaleDateString('vi-VN')}. Nếu tài liệu chỉ ghi thứ mà không có ngày, hãy ưu tiên các ngày trong tuần hiện tại hoặc tuần tới.`;
      }

      let prompt = `
        Role: Chuyên gia trích xuất dữ liệu lịch công tác hành chính Việt Nam.
        Input: Văn bản, hình ảnh hoặc file PDF chứa lịch công tác tuần.${contextStr}
        Task: Trích xuất danh sách các sự kiện vào JSON Array.
        
        Yêu cầu về Date:
        - Phải trả về định dạng YYYY-MM-DD.
        - Dựa vào bảng Context ở trên để ánh xạ Thứ -> Ngày chính xác.
        - Nếu văn bản có ghi ngày cụ thể (ví dụ: 15/03), hãy ưu tiên ngày đó nhưng phải đảm bảo đúng năm ${currentYear}.
        
        Yêu cầu về Time:
        - Định dạng HH:MM (24h).
        - Nếu chỉ ghi "Sáng", mặc định "07:30". Nếu "Chiều", mặc định "13:30".
        
        Các trường thông tin:
        - date: YYYY-MM-DD
        - time: HH:MM
        - content: Nội dung công việc (ngắn gọn, súc tích).
        - location: Địa điểm.
        - chairperson: Người chủ trì.
        - participants: Thành phần tham dự.
        
        Lưu ý:
        - Chỉ trích xuất các sự kiện chính thức.
        - Trả về JSON Array thuần túy, không giải thích.
      `;

      let payload: any = {};
      let model = 'gemini-3-flash-preview'; 
      let config: any = {};

      const hasMedia = mediaInputs && mediaInputs.length > 0;

      if (!hasMedia) {
        // --- TEXT ONLY MODE ---
        payload = { contents: `${prompt}\nDATA:\n${textContent}` };
        config = {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                time: { type: Type.STRING },
                content: { type: Type.STRING },
                location: { type: Type.STRING },
                chairperson: { type: Type.STRING },
                participants: { type: Type.STRING },
                department: { type: Type.STRING, description: "Đơn vị/Tổ phụ trách (ví dụ: Tổ CSKV, Tổ CSTT, Tổ PCTP, Tổ Tổng hợp, Tổ An ninh, Ban Chỉ Huy, Phụ trách chung)" }
              },
              required: ["date", "content"]
            }
          }
        };
      } else {
        // --- MULTIMODAL MODE (Images/PDFs + Text) ---
        prompt += "\nIMPORTANT: Trả về một JSON Array hợp lệ. Mỗi đối tượng có các trường: date, time, content, location, chairperson, participants, department. Không bao gồm markdown (```json).";
        
        // Construct parts
        const parts: any[] = [];
        
        // Add all media files
        mediaInputs.forEach(input => {
             // Remove base64 header if present
             const cleanBase64 = input.data.includes('base64,') ? input.data.split('base64,')[1] : input.data;
             parts.push({ inlineData: { data: cleanBase64, mimeType: input.mimeType } });
        });

        // Add text prompt
        parts.push({ text: prompt + (textContent ? `\n\nAdditional Text Context:\n${textContent}` : "") });

        payload = {
          contents: {
            parts: parts
          }
        };
        // Empty config for multimodal to avoid schema issues if not supported
        config = {
            responseMimeType: "application/json"
        };
      }

      const response = await ai.models.generateContent({
        model: model,
        ...payload,
        config: config
      });

      const text = response.text || "";
      let events = [];
      
      try {
        if (!hasMedia) {
             events = JSON.parse(text);
        } else {
             const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
             if (jsonMatch) {
                events = JSON.parse(jsonMatch[1] || jsonMatch[0]);
             } else {
                events = JSON.parse(text);
             }
        }
      } catch (parseError) {
        console.warn("JSON Parse Failed, raw text:", text);
        return [];
      }

      return events.map((ev: any) => {
          let dept = undefined;
          if (ev.department) {
            const d = ev.department.toLowerCase();
            if (d.includes('tổng hợp')) dept = UserDepartment.TONG_HOP;
            else if (d.includes('cskv')) dept = UserDepartment.CSKV;
            else if (d.includes('cstt')) dept = UserDepartment.CSTT;
            else if (d.includes('pctp')) dept = UserDepartment.PCTP;
            else if (d.includes('an ninh')) dept = UserDepartment.AN_NINH;
            else if (d.includes('chung') || d.includes('ban chỉ huy') || d.includes('bch')) dept = UserDepartment.PHU_TRACH_CHUNG;
          }
          return {
              ...ev,
              date: normalizeDate(ev.date, referenceDate),
              department: dept
          };
      });

    } catch (error) {
      console.error("Schedule Scan Error", error);
      alert("Lỗi AI: " + (error as any).message);
      return [];
    }
  }
};