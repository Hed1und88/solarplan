import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';

const MONTHS_SV = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
const STATUS_LABELS = { planering: 'Planering', projektering: 'Projektering', offert: 'Offert', installation: 'Installation', klart: 'Klart' };

const C_ORANGE = [249, 115, 22];
const C_DARK   = [30, 41, 59];
const C_GRAY   = [100, 116, 139];
const C_LIGHT  = [241, 245, 249];
const C_WHITE  = [255, 255, 255];
const MARGIN   = 18;
const PAGE_W   = 210;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

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

function parseSingleLine(raw) {
  try { const d = JSON.parse(raw || '{}'); return d.singleLine || null; } catch { return null; }
}

function parseMounting(raw) {
  try { return JSON.parse(raw || 'null'); } catch { return null; }
}

// ─── PDF helpers ──────────────────────────────────────────────────────────────
function sectionHeader(doc, y, title) {
  doc.setFillColor(...C_ORANGE);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 8, 'F');
  doc.setTextColor(...C_WHITE);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN + 3, y + 5.5);
  return y + 12;
}

function checkPage(doc, y, needed = 20) {
  if (y + needed > 280) { doc.addPage(); return MARGIN; }
  return y;
}

export default function ProjectPDFExport({ project, products = [] }) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = MARGIN;

    // ── Cover header ─────────────────────────────────────────────────────────
    doc.setFillColor(...C_DARK);
    doc.rect(0, 0, PAGE_W, 35, 'F');
    doc.setFillColor(...C_ORANGE);
    doc.rect(0, 35, PAGE_W, 3, 'F');

    doc.setTextColor(...C_WHITE);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('SOLENERGI-PROJEKT', MARGIN, 16);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 190, 200);
    doc.text(`Genererad ${new Date().toLocaleDateString('sv-SE')}`, MARGIN, 24);
    const statusLabel = STATUS_LABELS[project.status] || project.status || '';
    doc.setTextColor(...C_ORANGE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(statusLabel, PAGE_W - MARGIN, 16, { align: 'right' });

    y = 44;

    // ── Project info ──────────────────────────────────────────────────────────
    doc.setTextColor(...C_DARK);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(project.name || 'Projekt', MARGIN, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C_GRAY);
    if (project.customer_name) { doc.text(`Kund: ${project.customer_name}`, MARGIN, y); y += 5; }
    if (project.address) { doc.text(`Adress: ${project.address}`, MARGIN, y); y += 5; }
    y += 5;

    // ── 1. Panel layout ───────────────────────────────────────────────────────
    const { panels, roofWidth, roofHeight } = parseLayout(project.panel_layout_data);
    const totalW = panels.reduce((s, p) => s + (p.power_watts || 400), 0);
    const kwp = totalW / 1000;

    y = checkPage(doc, y, 40);
    y = sectionHeader(doc, y, '1. PANELKONFIGURATION');
    doc.setFillColor(...C_LIGHT);
    doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 32, 2, 2, 'F');
    doc.setTextColor(...C_DARK);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');

    const panelInfoCols = [
      ['Antal paneler', String(panels.length)],
      ['Total effekt', `${kwp.toFixed(2)} kWp (${totalW} W)`],
      ['Takyta', roofWidth && roofHeight ? `${roofWidth} × ${roofHeight} m = ${(roofWidth * roofHeight).toFixed(1)} m²` : '—'],
      ['Panel modell', panels[0]?.product_name || '—'],
    ];
    panelInfoCols.forEach(([label, value], i) => {
      const cx = MARGIN + 4 + (i % 2) * 87;
      const cy = y + 8 + Math.floor(i / 2) * 10;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C_GRAY);
      doc.setFontSize(8);
      doc.text(label + ':', cx, cy);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C_DARK);
      doc.setFontSize(9);
      doc.text(value, cx + 36, cy);
    });

    // mini panel grid illustration
    if (panels.length > 0 && roofWidth && roofHeight) {
      const gridRight = PAGE_W - MARGIN - 4;
      const panelW_m = (panels[0]?.width_mm || 1000) / 1000;
      const panelH_m = (panels[0]?.height_mm || 1700) / 1000;
      const cols = Math.floor(roofWidth / panelW_m);
      const rows = Math.floor(roofHeight / panelH_m);
      const cellSize = Math.min(3.5, 35 / Math.max(cols, rows, 1));
      const gridX = gridRight - cols * cellSize;
      const gridY = y + 3;
      const placedKeys = new Set(panels.map(p => `${p.row}-${p.col}`));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const placed = placedKeys.has(`${r}-${c}`);
          doc.setFillColor(placed ? 30 : 200, placed ? 53 : 210, placed ? 96 : 220);
          doc.rect(gridX + c * cellSize, gridY + r * cellSize, cellSize - 0.5, cellSize * 1.4 - 0.5, 'F');
        }
      }
    }
    y += 38;

    // ── 2. String configuration ───────────────────────────────────────────────
    const strings = parseStrings(project.string_layout_data);
    if (strings.length > 0) {
      y = checkPage(doc, y, 30);
      y = sectionHeader(doc, y, '2. SLINGKONFIGURATION');

      // Table header
      doc.setFillColor(...C_DARK);
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 6, 'F');
      doc.setTextColor(...C_WHITE);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Slinga', MARGIN + 2, y + 4.2);
      doc.text('Paneler', MARGIN + 55, y + 4.2);
      doc.text('Förväntat Voc', MARGIN + 85, y + 4.2);
      doc.text('Uppmätt Voc', MARGIN + 125, y + 4.2);
      doc.text('Status', MARGIN + 155, y + 4.2);
      y += 6;

      strings.forEach((str, i) => {
        y = checkPage(doc, y, 8);
        const bg = i % 2 === 0 ? C_WHITE : C_LIGHT;
        doc.setFillColor(...bg);
        doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7, 'F');

        const [r, g, b] = hexToRgb(str.color || '#3b82f6');
        doc.setFillColor(r, g, b);
        doc.circle(MARGIN + 4, y + 3.5, 2, 'F');

        doc.setTextColor(...C_DARK);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(str.name || `Slinga ${i + 1}`, MARGIN + 8, y + 4.5);
        doc.text(str.panel_count ? String(str.panel_count) : '—', MARGIN + 55, y + 4.5);

        // Expected Voc
        const product = products.find(p => p.id === str.product_id);
        const expVoc = str.panel_count && product?.voc_v ? (product.voc_v * str.panel_count).toFixed(1) : '—';
        doc.text(expVoc !== '—' ? `${expVoc} V` : '—', MARGIN + 85, y + 4.5);
        doc.text(str.meas_voc ? `${str.meas_voc} V` : '—', MARGIN + 125, y + 4.5);

        // Status
        if (str.meas_voc && expVoc !== '—') {
          const diff = Math.abs(parseFloat(str.meas_voc) - parseFloat(expVoc)) / parseFloat(expVoc);
          if (diff <= 0.05) { doc.setTextColor(34, 197, 94); doc.text('✓ OK', MARGIN + 155, y + 4.5); }
          else if (diff <= 0.15) { doc.setTextColor(234, 179, 8); doc.text('⚠ Gränsfall', MARGIN + 155, y + 4.5); }
          else { doc.setTextColor(239, 68, 68); doc.text('✗ Avvikelse', MARGIN + 155, y + 4.5); }
        } else {
          doc.setTextColor(...C_GRAY);
          doc.text('—', MARGIN + 155, y + 4.5);
        }
        doc.setTextColor(...C_DARK);
        y += 7;
      });
      y += 4;
    }

    // ── 3. Single-line schema ─────────────────────────────────────────────────
    const singleLine = parseSingleLine(project.string_layout_data);
    if (singleLine?.components?.length > 0) {
      y = checkPage(doc, y, 40);
      y = sectionHeader(doc, y, '3. ENLINJESCHEMA – KOMPONENTLISTA');

      // Draw simplified schematic as text table
      doc.setFillColor(...C_DARK);
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 6, 'F');
      doc.setTextColor(...C_WHITE);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Komponent', MARGIN + 2, y + 4.2);
      doc.text('Beteckning / Värden', MARGIN + 70, y + 4.2);
      doc.text('Typ', MARGIN + 145, y + 4.2);
      y += 6;

      singleLine.components.forEach((comp, i) => {
        y = checkPage(doc, y, 7);
        doc.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
        doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7, 'F');
        doc.setTextColor(...C_DARK);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const label = comp.label?.replace(/\n/g, ' ') || '';
        doc.text(label.length > 35 ? label.slice(0, 33) + '…' : label, MARGIN + 2, y + 4.5);
        doc.text(comp.type?.replace(/_/g, ' ') || '', MARGIN + 145, y + 4.5);
        y += 7;
      });

      // Wires summary
      if (singleLine.wires?.length > 0) {
        y = checkPage(doc, y, 10);
        y += 3;
        doc.setTextColor(...C_GRAY);
        doc.setFontSize(8);
        const compMap = Object.fromEntries(singleLine.components.map(c => [c.id, c]));
        const wireDesc = singleLine.wires.map(w => {
          const from = compMap[w.from]?.label?.split('\n')[0] || w.from;
          const to = compMap[w.to]?.label?.split('\n')[0] || w.to;
          return `${from} → ${to}`;
        }).join('    ');
        const lines = doc.splitTextToSize(`Kopplingar: ${wireDesc}`, PAGE_W - MARGIN * 2);
        doc.text(lines, MARGIN, y);
        y += lines.length * 4.5 + 2;
      }
      y += 4;
    }

    // ── 4. Mounting system ────────────────────────────────────────────────────
    const mounting = parseMounting(project.mounting_data);
    if (mounting) {
      y = checkPage(doc, y, 60);
      y = sectionHeader(doc, y, '4. MONTAGESYSTEM & LASTBERÄKNING (Eurokod SS-EN 1991)');

      doc.setFillColor(...C_LIGHT);
      doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 55, 2, 2, 'F');

      const mt = mounting;
      const rows = [
        ['Montagesystem', `${mt.brandLabel || ''} – ${mt.modelName || ''}`],
        ['Takvinkel', `${mt.roofAngle || '—'}°`],
        ['Snözon', mt.snowZoneLabel || '—'],
        ['Vindzon', mt.windZoneLabel || '—'],
        ['Formfaktor μ (snö)', mt.muFactor != null ? String(mt.muFactor) : '—'],
        ['Vindtryckskoefficient cpe', mt.cpe != null ? String(mt.cpe) : '—'],
        ['Dimensionerande snölast', mt.designSnow != null ? `${mt.designSnow} kN/m²` : '—'],
        ['Dimensionerande vindlast', mt.designWind != null ? `${mt.designWind} kN/m²` : '—'],
        ['Total dimensionerande last', mt.totalLoad != null ? `${mt.totalLoad} kN/m²` : '—'],
        ['Rekommenderat krok c/c', mt.hookSpacing != null ? `${mt.hookSpacing} mm` : '—'],
      ];

      rows.forEach(([label, value], i) => {
        const row_y = y + 5 + Math.floor(i / 2) * 10;
        const row_x = MARGIN + 4 + (i % 2) * 87;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C_GRAY);
        doc.setFontSize(8);
        doc.text(label + ':', row_x, row_y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C_DARK);
        doc.setFontSize(9);
        doc.text(String(value), row_x + 48, row_y);
      });

      // Approval badges
      const snOk = mt.snowOk, wiOk = mt.windOk;
      const approvalY = y + 47;
      doc.setFillColor(snOk ? 34 : 239, snOk ? 197 : 68, snOk ? 94 : 68);
      doc.roundedRect(MARGIN + 4, approvalY, 78, 6, 1, 1, 'F');
      doc.setTextColor(...C_WHITE);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(`Snölast: ${snOk ? '✓ Godkänd' : '✗ Underdimensionerat'}`, MARGIN + 8, approvalY + 4.2);

      doc.setFillColor(wiOk ? 34 : 239, wiOk ? 197 : 68, wiOk ? 94 : 68);
      doc.roundedRect(MARGIN + 91, approvalY, 78, 6, 1, 1, 'F');
      doc.text(`Vindlast: ${wiOk ? '✓ Godkänd' : '✗ Underdimensionerat'}`, MARGIN + 95, approvalY + 4.2);

      y += 62;

      // Eurokod note
      y = checkPage(doc, y, 8);
      doc.setTextColor(...C_GRAY);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.text(`Beräkning enligt Eurokod SS-EN 1991-1-3 (snölast) och SS-EN 1991-1-4 (vindlast). μ=${mt.muFactor ?? '—'}, cpe=${mt.cpe ?? '—'}.`, MARGIN, y);
      y += 7;
    }

    // ── 5. Products & cost ────────────────────────────────────────────────────
    const selectedProducts = project.selected_products || [];
    if (selectedProducts.length > 0) {
      y = checkPage(doc, y, 30);
      y = sectionHeader(doc, y, '5. PRODUKTLISTA & KOSTNADSSAMMANSTÄLLNING');

      doc.setFillColor(...C_DARK);
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 6, 'F');
      doc.setTextColor(...C_WHITE);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Produkt', MARGIN + 2, y + 4.2);
      doc.text('Antal', MARGIN + 112, y + 4.2);
      doc.text('À-pris', MARGIN + 130, y + 4.2);
      doc.text('Summa', MARGIN + 154, y + 4.2);
      y += 6;

      let total = 0;
      selectedProducts.forEach((sp, i) => {
        y = checkPage(doc, y, 7);
        doc.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
        doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7, 'F');
        doc.setTextColor(...C_DARK);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const name = sp.product_name || '—';
        doc.text(name.length > 48 ? name.slice(0, 46) + '…' : name, MARGIN + 2, y + 4.5);
        doc.text(String(sp.quantity || 0), MARGIN + 114, y + 4.5);
        doc.text(`${(sp.unit_price || 0).toLocaleString('sv-SE')} kr`, MARGIN + 130, y + 4.5);
        const sum = (sp.quantity || 0) * (sp.unit_price || 0);
        total += sum;
        doc.text(`${sum.toLocaleString('sv-SE')} kr`, MARGIN + 154, y + 4.5);
        y += 7;
      });

      // Totals
      y = checkPage(doc, y, 18);
      doc.setFillColor(...C_LIGHT);
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7, 'F');
      doc.setTextColor(...C_DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Totalt exkl. moms', MARGIN + 2, y + 5);
      doc.text(`${total.toLocaleString('sv-SE')} kr`, MARGIN + 154, y + 5);
      y += 7;

      doc.setFillColor(...C_ORANGE);
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7, 'F');
      doc.setTextColor(...C_WHITE);
      doc.text('Totalt inkl. moms (25%)', MARGIN + 2, y + 5);
      doc.text(`${Math.round(total * 1.25).toLocaleString('sv-SE')} kr`, MARGIN + 154, y + 5);
      y += 12;
    }

    // ── 6. Notes ──────────────────────────────────────────────────────────────
    if (project.notes) {
      y = checkPage(doc, y, 20);
      y = sectionHeader(doc, y, '6. ANTECKNINGAR');
      doc.setTextColor(...C_DARK);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(project.notes, PAGE_W - MARGIN * 2);
      y = checkPage(doc, y, noteLines.length * 5);
      doc.text(noteLines, MARGIN, y);
      y += noteLines.length * 5 + 5;
    }

    // ── Footer on every page ──────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(...C_DARK);
      doc.rect(0, 287, PAGE_W, 10, 'F');
      doc.setFillColor(...C_ORANGE);
      doc.rect(0, 287, 3, 10, 'F');
      doc.setTextColor(180, 190, 200);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`${project.name}${project.customer_name ? ' · ' + project.customer_name : ''}`, MARGIN, 293);
      doc.text(`Sida ${i} av ${pageCount}`, PAGE_W - MARGIN, 293, { align: 'right' });
    }

    doc.save(`${project.name || 'projekt'}_solprojekt.pdf`);
    setLoading(false);
  };

  return (
    <Button onClick={generate} disabled={loading} variant="outline" className="gap-2">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {loading ? 'Genererar PDF...' : 'Ladda ner PDF'}
    </Button>
  );
}