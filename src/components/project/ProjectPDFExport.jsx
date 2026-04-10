import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';

const MONTHS_SV = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
const STATUS_LABELS = { planering: 'Planering', projektering: 'Projektering', offert: 'Offert', installation: 'Installation', klart: 'Klart' };

function parseLayout(raw) {
  try {
    const d = JSON.parse(raw || '{}');
    const panels = Array.isArray(d) ? d : (d.panels || []);
    return { panels, roofWidth: d.roofWidth || 0, roofHeight: d.roofHeight || 0 };
  } catch { return { panels: [], roofWidth: 0, roofHeight: 0 }; }
}

function parseStrings(raw) {
  try { const d = JSON.parse(raw || '[]'); return Array.isArray(d) ? d : []; } catch { return []; }
}

export default function ProjectPDFExport({ project, products = [] }) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, margin = 18;
    let y = margin;

    const primaryColor = [249, 115, 22]; // orange
    const darkColor = [30, 41, 59];
    const grayColor = [100, 116, 139];
    const lightGray = [241, 245, 249];

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, W, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('SOLPROJEKT', margin, 13);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Genererad ${new Date().toLocaleDateString('sv-SE')}`, margin, 21);
    doc.text(STATUS_LABELS[project.status] || project.status, W - margin, 13, { align: 'right' });
    y = 38;

    // ── Project info ────────────────────────────────────────────────────────
    doc.setTextColor(...darkColor);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(project.name || 'Projekt', margin, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    if (project.customer_name) { doc.text(`Kund: ${project.customer_name}`, margin, y); y += 5; }
    if (project.address) { doc.text(`Adress: ${project.address}`, margin, y); y += 5; }
    y += 4;

    // ── Panel summary ────────────────────────────────────────────────────────
    const { panels, roofWidth, roofHeight } = parseLayout(project.panel_layout_data);
    const totalW = panels.reduce((s, p) => s + (p.power_watts || 400), 0);
    const kwp = totalW / 1000;

    doc.setFillColor(...lightGray);
    doc.roundedRect(margin, y, W - margin * 2, 28, 3, 3, 'F');
    doc.setTextColor(...darkColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Panelkonfiguration', margin + 4, y + 7);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text(`Antal paneler: ${panels.length}`, margin + 4, y + 14);
    doc.text(`Totalt: ${kwp.toFixed(2)} kWp  (${totalW} W)`, margin + 4, y + 20);
    if (roofWidth && roofHeight) doc.text(`Takyta: ${roofWidth} × ${roofHeight} m`, margin + 80, y + 14);
    if (panels[0]?.product_name) doc.text(`Panel: ${panels[0].product_name}`, margin + 80, y + 20);
    y += 34;

    // ── Strings ──────────────────────────────────────────────────────────────
    const strings = parseStrings(project.string_layout_data);
    if (strings.length > 0) {
      doc.setTextColor(...darkColor);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Slingkonfiguration', margin, y);
      y += 6;

      strings.forEach((str, i) => {
        if (y > 260) { doc.addPage(); y = margin; }
        const [r, g, b] = hexToRgb(str.color || '#3b82f6');
        doc.setFillColor(r, g, b);
        doc.circle(margin + 2, y + 2, 2, 'F');
        doc.setTextColor(...darkColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(str.name || `Slinga ${i + 1}`, margin + 7, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        const info = [];
        if (str.panel_count) info.push(`${str.panel_count} paneler`);
        if (str.meas_voc) info.push(`Voc: ${str.meas_voc} V`);
        if (info.length) doc.text(info.join('  ·  '), margin + 50, y + 4);
        y += 7;
      });
      y += 4;
    }

    // ── Products / cost ──────────────────────────────────────────────────────
    const selectedProducts = project.selected_products || [];
    if (selectedProducts.length > 0) {
      if (y > 220) { doc.addPage(); y = margin; }
      doc.setTextColor(...darkColor);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Produkter', margin, y);
      y += 6;

      // Table header
      doc.setFillColor(...primaryColor);
      doc.rect(margin, y, W - margin * 2, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Produkt', margin + 2, y + 5);
      doc.text('Antal', margin + 110, y + 5);
      doc.text('À-pris', margin + 130, y + 5);
      doc.text('Summa', margin + 152, y + 5);
      y += 7;

      let total = 0;
      selectedProducts.forEach((sp, i) => {
        if (y > 270) { doc.addPage(); y = margin; }
        const rowH = 6;
        doc.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
        doc.rect(margin, y, W - margin * 2, rowH, 'F');
        doc.setTextColor(...darkColor);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const name = sp.product_name || 'Produkt';
        doc.text(name.length > 45 ? name.slice(0, 42) + '…' : name, margin + 2, y + 4);
        doc.text(String(sp.quantity || 0), margin + 113, y + 4);
        doc.text(`${(sp.unit_price || 0).toLocaleString('sv-SE')} kr`, margin + 130, y + 4);
        const sum = (sp.quantity || 0) * (sp.unit_price || 0);
        total += sum;
        doc.text(`${sum.toLocaleString('sv-SE')} kr`, margin + 152, y + 4);
        y += rowH;
      });

      // Total row
      doc.setFillColor(...lightGray);
      doc.rect(margin, y, W - margin * 2, 7, 'F');
      doc.setTextColor(...darkColor);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Totalt exkl. moms', margin + 2, y + 5);
      doc.text(`${total.toLocaleString('sv-SE')} kr`, margin + 152, y + 5);
      y += 13;
    }

    // ── Notes ────────────────────────────────────────────────────────────────
    if (project.notes) {
      if (y > 240) { doc.addPage(); y = margin; }
      doc.setTextColor(...darkColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Anteckningar', margin, y);
      y += 5;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grayColor);
      const lines = doc.splitTextToSize(project.notes, W - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(...lightGray);
      doc.rect(0, 287, W, 10, 'F');
      doc.setTextColor(...grayColor);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`${project.name} — ${new Date().toLocaleDateString('sv-SE')}`, margin, 293);
      doc.text(`Sida ${i} av ${pageCount}`, W - margin, 293, { align: 'right' });
    }

    doc.save(`${project.name || 'projekt'}_offert.pdf`);
    setLoading(false);
  };

  return (
    <Button onClick={generate} disabled={loading} variant="outline" className="gap-2">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {loading ? 'Genererar PDF...' : 'Ladda ner PDF'}
    </Button>
  );
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}