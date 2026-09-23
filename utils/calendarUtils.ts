import { Task } from '../types';

// Helper to format date for iCalendar (YYYYMMDDTHHmmssZ)
const formatDateICS = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

// Helper to escape special characters in ICS
const escapeICS = (str: string): string => {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
};

export const generateICS = (task: Task) => {
  const now = formatDateICS(new Date().toISOString());
  
  // Use due date as start time.
  const startDateStr = formatDateICS(task.dueDate);
  if (!startDateStr) return ''; // Safety check

  // Default event duration: 1 hour
  const endDate = new Date(new Date(task.dueDate).getTime() + 60 * 60 * 1000).toISOString(); 
  const endDateFormatted = formatDateICS(endDate);

  const description = `Nội dung: ${task.description || 'Không có chi tiết'}\n\nChỉ đạo: ${task.proposal || 'Không'}\n\nTrạng thái: ${task.status}`;

  // Unique ID ensures updates overwrite previous events if re-imported (Critical for Sync)
  const uid = `${task.id}@capnamdongha.app`;
  
  // Sequence number tells the calendar this is a newer version of the same event
  const sequence = task.calendarSequence || 0;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CAP Nam Dong Ha//Task Manager//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', // PUBLISH is standard for single event distribution
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`, 
    `DTSTAMP:${now}`,
    `DTSTART:${startDateStr}`,
    `DTEND:${endDateFormatted}`,
    `SUMMARY:${escapeICS(task.title)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `LOCATION:Công An Phường Nam Đông Hà`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H', // Nhắc trước 1 tiếng
    'DESCRIPTION:Nhắc nhở hạn chót công việc',
    'ACTION:DISPLAY',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
};

export const generateMultiICS = (tasks: Task[]) => {
  const now = formatDateICS(new Date().toISOString());
  
  let events = '';

  tasks.forEach(task => {
    const startDate = formatDateICS(task.dueDate);
    const endDate = new Date(new Date(task.dueDate).getTime() + 60 * 60 * 1000).toISOString();
    const endDateFormatted = formatDateICS(endDate);
    const description = `Nội dung: ${task.description}\nTrạng thái: ${task.status}`;
    
    const uid = `${task.id}@capnamdongha.app`;
    const sequence = task.calendarSequence || 0;

    events += [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SEQUENCE:${sequence}`,
      `DTSTAMP:${now}`,
      `DTSTART:${startDate}`,
      `DTEND:${endDateFormatted}`,
      `SUMMARY:Nhiệm vụ: ${escapeICS(task.title)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H', 
      'DESCRIPTION:Nhắc nhở hạn chót',
      'ACTION:DISPLAY',
      'END:VALARM',
      'END:VEVENT',
      ''
    ].join('\r\n');
  });

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CAP Nam Dong Ha//Task Manager//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
};

export const downloadICS = (content: string, filename: string) => {
  if (!content) return;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};