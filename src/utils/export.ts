import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportOptions {
  filename: string;
  title?: string;
  subtitle?: string;
  columns: ExportColumn[];
  data: Record<string, any>[];
  totals?: Record<string, string | number>;
}

export const exportToCSV = (options: ExportOptions): void => {
  const { filename, columns, data } = options;
  
  const headers = columns.map(col => col.header);
  const rows = data.map(item => 
    columns.map(col => {
      const value = item[col.key];
      if (typeof value === 'number') {
        return value.toString().replace('.', ',');
      }
      return value ?? '';
    })
  );
  
  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.join(';'))
  ].join('\n');
  
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
};

export const exportToExcel = (options: ExportOptions): void => {
  const { filename, columns, data, title } = options;
  
  const headers = columns.map(col => col.header);
  const rows = data.map(item => 
    columns.map(col => item[col.key] ?? '')
  );
  
  const wsData = title ? [[title], [], headers, ...rows] : [headers, ...rows];
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportToPDF = (options: ExportOptions): void => {
  const { filename, title, subtitle, columns, data, totals } = options;
  
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.setTextColor(40, 40, 40);
  doc.text(title || 'Relatório', 14, 22);
  
  if (subtitle) {
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, 14, 30);
  }
  
  // Data generation info
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, subtitle ? 38 : 30);
  
  // Table
  const tableData = data.map(item => 
    columns.map(col => {
      const value = item[col.key];
      if (typeof value === 'number') {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(value);
      }
      return value ?? '';
    })
  );
  
  autoTable(doc, {
    head: [columns.map(col => col.header)],
    body: tableData,
    startY: subtitle ? 45 : 37,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
  });
  
  // Totals
  if (totals) {
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    
    let yPos = finalY + 10;
    Object.entries(totals).forEach(([label, value]) => {
      doc.text(`${label}: ${value}`, 14, yPos);
      yPos += 6;
    });
  }
  
  doc.save(`${filename}.pdf`);
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('pt-BR');
};
