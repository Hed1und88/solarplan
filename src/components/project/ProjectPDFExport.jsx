import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import { useCompanySession } from '@/lib/CompanySessionContext';
import { resolveCompanyForRecord } from '@/lib/companyContext';

const STATUS_LABELS = { planering: 'Planering', projektering: 'Projektering', offert: 'Offert', installation: 'Installation', klart: 'Klart' };
const DARK = [30, 41, 59];
const ORANGE = [249, 115, 22];
const GRAY = [100, 116, 139];
const LIGHT = [241, 245, 249];
const WHITE = [255, 255, 255];
const GREEN = [22, 163, 74];
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

function safeJson(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || 'null') ?? fallback; } catch { return fallback; }
}

function text(value, fallback = '—') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('sv-SE')} kr`;
}

function checkPage(doc, y, needed = 18) {
  if (y + needed <= 278) return y;
  doc.addPage();
  return MARGIN;
}

function sectionTitle(doc, y, title) {
  y = checkPage(doc, y, 14);
  doc.setFillColor(...DARK);
  doc.roundedRect(MARGIN, y, CONTENT_W, 9, 1.5, 1.5, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(MARGIN, y, 4, 9, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(title, MARGIN + 7, y + 6);
  return y + 13;
}

function infoGrid(doc, y, rows) {
  const validRows = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  const height = Math.max(14, Math.ceil(validRows.length / 2) * 9 + 6);
  y = checkPage(doc, y, height + 4);
  doc.setFillColor(...LIGHT);
  doc.roundedRect(MARGIN, y, CONTENT_W, height, 2, 2, 'F');
  validRows.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + 4 + column * (CONTENT_W / 2);
    const lineY = y + 7 + row * 9;
    doc.setTextColor(...GRAY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`${label}:`, x, lineY);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    const available = CONTENT_W / 2 - 35;
    const valueText = doc.splitTextToSize(text(value), available)[0];
    doc.text(valueText, x + 31, lineY);
  });
  return y + height + 5;
}

function paragraph(doc, y, value) {
  const lines = doc.splitTextToSize(text(value), CONTENT_W);
  y = checkPage(doc, y, lines.length * 4.5 + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 4.5 + 3;
}

function tableHeader(doc, y, columns) {
  y = checkPage(doc, y, 13);
  doc.setFillColor(...DARK);
  doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  columns.forEach(column => doc.text(column.label, column.x, y + 4.8, column.align ? { align: column.align } : undefined));
  return y + 7;
}

function tableRow(doc, y, cells, index) {
  y = checkPage(doc, y, 8);
  doc.setFillColor(index % 2 === 0 ? 255 : 247, index % 2 === 0 ? 255 : 249, index % 2 === 0 ? 255 : 252);
  doc.rect(MARGIN, y, CONTENT_W, 7.5, 'F');
  doc.setFontSize(7.5);
  cells.forEach(cell => {
    doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    doc.setTextColor(...(cell.color || DARK));
    const options = cell.align ? { align: cell.align } : undefined;
    doc.text(String(cell.value ?? '—').slice(0, cell.max || 55), cell.x, y + 5, options);
  });
  return y + 7.5;
}

async function imageData(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!['image/png', 'image/jpeg'].includes(blob.type)) return null;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format: blob.type === 'image/png' ? 'PNG' : 'JPEG' };
  } catch {
    return null;
  }
}

function addLogo(doc, logo) {
  if (!logo?.dataUrl) return false;
  try {
    const properties = doc.getImageProperties(logo.dataUrl);
    const maxW = 34;
    const maxH = 20;
    const ratio = Math.min(maxW / properties.width, maxH / properties.height);
    const width = properties.width * ratio;
    const height = properties.height * ratio;
    doc.setFillColor(...WHITE);
    doc.roundedRect(PAGE_W - MARGIN - maxW - 2, 5, maxW + 4, 24, 2, 2, 'F');
    doc.addImage(logo.dataUrl, logo.format, PAGE_W - MARGIN - width, 7 + (maxH - height) / 2, width, height);
    return true;
  } catch {
    return false;
  }
}

function panelSummary(project) {
  const planner = safeJson(project.solar_roof_planner_data || project.panel_layout_data, {});
  if (Array.isArray(planner?.panels)) {
    const watts = planner.panels.reduce((sum, panel) => sum + Number(panel.power_watts || 0), 0);
    return { roofs: 1, panels: planner.panels.length, watts, model: planner.panels[0]?.product_name || '' };
  }
  let panels = 0;
  let watts = 0;
  let model = '';
  (planner?.roofs || []).forEach(roof => {
    (roof.panelGroups || []).forEach(group => {
      const count = Math.max(0, Math.round(Number(group.rows || 0) * Number(group.cols || 0)));
      panels += count;
      const power = Number(group.panelProductSnapshot?.power_watts || group.power_watts || 0);
      watts += count * power;
      model ||= group.panelProductSnapshot?.name || group.panelProductName || '';
    });
  });
  return { roofs: planner?.roofs?.length || 0, panels, watts, model };
}

function stringRows(project) {
  const parsed = safeJson(project.string_layout_data, []);
  return Array.isArray(parsed) ? parsed : (parsed?.strings || []);
}

function batteryRows(project) {
  const parsed = safeJson(project.battery_layout_data, []);
  return Array.isArray(parsed) ? parsed : (parsed?.batteries || parsed?.placements || []);
}

export default function ProjectPDFExport({ project, products = [] }) {
  const [loading, setLoading] = useState(false);
  const { user } = useCompanySession();

  const generate = async () => {
    setLoading(true);
    try {
      const company = await resolveCompanyForRecord(base44, project, user || {});
      const logo = await imageData(company?.logo_url);
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      doc.setFillColor(...DARK);
      doc.rect(0, 0, PAGE_W, 38, 'F');
      doc.setFillColor(...ORANGE);
      doc.rect(0, 38, PAGE_W, 2.5, 'F');
      const hasLogo = addLogo(doc, logo);

      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(project.status === 'offert' ? 'OFFERT' : 'PROJEKTDOKUMENT', MARGIN, 15);
      doc.setFontSize(10);
      doc.setTextColor(190, 205, 220);
      doc.text(text(company?.name, 'SolarPlan'), MARGIN, 23);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Genererad ${new Date().toLocaleDateString('sv-SE')} · ${STATUS_LABELS[project.status] || 'Projekt'}`, MARGIN, 30);
      if (!hasLogo && company?.organization_number) doc.text(`Org.nr ${company.organization_number}`, PAGE_W - MARGIN, 30, { align: 'right' });

      let y = 47;
      doc.setTextColor(...DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(text(project.name, 'Projekt'), MARGIN, y);
      y += 8;

      y = sectionTitle(doc, y, 'PROJEKT- OCH KUNDUPPGIFTER');
      y = infoGrid(doc, y, [
        ['Kund', project.customer_name || project.name],
        ['Status', STATUS_LABELS[project.status] || project.status],
        ['E-post', project.customer_email],
        ['Telefon', project.customer_phone],
        ['Adress', project.address],
        ['Snölast', project.snow_load_kn_m2 ? `${project.snow_load_kn_m2} kN/m²` : ''],
        ['Vindlast', project.wind_load_ms ? `${project.wind_load_ms} m/s` : ''],
        ['Projekt-id', project.id],
      ]);

      if (company) {
        y = sectionTitle(doc, y, 'AVSÄNDARE');
        y = infoGrid(doc, y, [
          ['Företag', company.name],
          ['Org.nr', company.organization_number],
          ['E-post', company.email],
          ['Telefon', company.phone],
          ['Adress', [company.address, company.postal_code, company.city].filter(Boolean).join(', ')],
          ['Webbplats', company.website],
        ]);
      }

      const panel = panelSummary(project);
      if (panel.panels || panel.roofs) {
        y = sectionTitle(doc, y, 'PANELER OCH TAK');
        y = infoGrid(doc, y, [
          ['Antal tak', panel.roofs],
          ['Antal paneler', panel.panels],
          ['Installerad effekt', panel.watts ? `${(panel.watts / 1000).toFixed(2)} kWp` : ''],
          ['Panelmodell', panel.model],
          ['Takbredd', project.roof_width_m ? `${project.roof_width_m} m` : ''],
          ['Takdjup', project.roof_height_m ? `${project.roof_height_m} m` : ''],
        ]);
      }

      const strings = stringRows(project);
      if (strings.length) {
        y = sectionTitle(doc, y, 'SLINGKONFIGURATION');
        y = tableHeader(doc, y, [
          { label: 'Slinga', x: MARGIN + 2 },
          { label: 'Paneler', x: MARGIN + 88 },
          { label: 'MPPT / ingång', x: MARGIN + 125 },
          { label: 'Uppmätt Voc', x: PAGE_W - MARGIN, align: 'right' },
        ]);
        strings.forEach((item, index) => {
          const count = item.panel_count || (Array.isArray(item.nodes) ? new Set(item.nodes.map(node => node.panelId)).size : 0);
          y = tableRow(doc, y, [
            { value: item.name || `Slinga ${index + 1}`, x: MARGIN + 2, max: 45, bold: true },
            { value: count || '—', x: MARGIN + 90 },
            { value: item.pvInput || item.mppt || '—', x: MARGIN + 127 },
            { value: item.meas_voc ? `${item.meas_voc} V` : '—', x: PAGE_W - MARGIN, align: 'right' },
          ], index);
        });
        y += 5;
      }

      const batteries = batteryRows(project);
      if (batteries.length) {
        y = sectionTitle(doc, y, 'BATTERIPLANERING');
        const grouped = Object.values(batteries.reduce((result, item) => {
          const key = item.product_name || item.name || 'Batteri';
          if (!result[key]) result[key] = { name: key, count: 0, capacity: 0 };
          result[key].count += 1;
          const product = products.find(productItem => String(productItem.id) === String(item.product_id));
          result[key].capacity += Number(item.capacity_kwh || product?.capacity_kwh || 0);
          return result;
        }, {}));
        y = tableHeader(doc, y, [
          { label: 'Batteri', x: MARGIN + 2 },
          { label: 'Antal', x: MARGIN + 120 },
          { label: 'Kapacitet', x: PAGE_W - MARGIN, align: 'right' },
        ]);
        grouped.forEach((item, index) => {
          y = tableRow(doc, y, [
            { value: item.name, x: MARGIN + 2, max: 58, bold: true },
            { value: item.count, x: MARGIN + 122 },
            { value: item.capacity ? `${item.capacity.toFixed(1)} kWh` : '—', x: PAGE_W - MARGIN, align: 'right' },
          ], index);
        });
        y += 5;
      }

      const mounting = safeJson(project.mounting_data, null);
      if (mounting) {
        y = sectionTitle(doc, y, 'MONTAGE OCH LASTBERÄKNING');
        y = infoGrid(doc, y, [
          ['Montagesystem', [mounting.brandLabel, mounting.modelName].filter(Boolean).join(' – ')],
          ['Takvinkel', mounting.roofAngle ? `${mounting.roofAngle}°` : ''],
          ['Snözon', mounting.snowZoneLabel],
          ['Vindzon', mounting.windZoneLabel],
          ['Dimensionerande snölast', mounting.designSnow ? `${mounting.designSnow} kN/m²` : ''],
          ['Dimensionerande vindlast', mounting.designWind ? `${mounting.designWind} kN/m²` : ''],
          ['Total last', mounting.totalLoad ? `${mounting.totalLoad} kN/m²` : ''],
          ['Krokavstånd', mounting.hookSpacing ? `${mounting.hookSpacing} mm` : ''],
        ]);
      }

      const solar = safeJson(project.solar_data, null);
      const yearlyProduction = solar?.pvgis?.outputs?.totals?.fixed?.E_y;
      if (solar && yearlyProduction) {
        y = sectionTitle(doc, y, 'SOLENERGIANALYS');
        y = infoGrid(doc, y, [
          ['Beräknad årsproduktion', `${Math.round(yearlyProduction).toLocaleString('sv-SE')} kWh/år`],
          ['Toppeffekt', solar.peakPower ? `${solar.peakPower} kWp` : ''],
          ['Specifik produktion', solar.peakPower ? `${Math.round(yearlyProduction / solar.peakPower)} kWh/kWp/år` : ''],
          ['Datakälla', 'PVGIS'],
        ]);
      }

      const selectedProducts = Array.isArray(project.selected_products) ? project.selected_products : [];
      if (selectedProducts.length) {
        y = sectionTitle(doc, y, project.status === 'offert' ? 'OFFERT OCH PRODUKTER' : 'PRODUKTER OCH KOSTNAD');
        y = tableHeader(doc, y, [
          { label: 'Produkt', x: MARGIN + 2 },
          { label: 'Antal', x: MARGIN + 105 },
          { label: 'À-pris', x: MARGIN + 130 },
          { label: 'Summa', x: PAGE_W - MARGIN, align: 'right' },
        ]);
        let total = 0;
        selectedProducts.forEach((item, index) => {
          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price || 0);
          const sum = quantity * unitPrice;
          total += sum;
          y = tableRow(doc, y, [
            { value: item.product_name || 'Produkt', x: MARGIN + 2, max: 52, bold: true },
            { value: quantity, x: MARGIN + 108 },
            { value: money(unitPrice), x: MARGIN + 130 },
            { value: money(sum), x: PAGE_W - MARGIN, align: 'right', bold: true },
          ], index);
        });
        y = checkPage(doc, y, 19);
        doc.setFillColor(...LIGHT);
        doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text('Totalt exkl. moms', MARGIN + 3, y + 5.5);
        doc.text(money(total), PAGE_W - MARGIN - 3, y + 5.5, { align: 'right' });
        y += 8;
        doc.setFillColor(...ORANGE);
        doc.rect(MARGIN, y, CONTENT_W, 9, 'F');
        doc.setTextColor(...WHITE);
        doc.text('Totalt inkl. moms (25 %)', MARGIN + 3, y + 6);
        doc.text(money(total * 1.25), PAGE_W - MARGIN - 3, y + 6, { align: 'right' });
        y += 13;
      }

      if (project.notes) {
        y = sectionTitle(doc, y, 'ANTECKNINGAR');
        y = paragraph(doc, y, project.notes);
      }

      const companyFooter = [company?.name, company?.organization_number ? `Org.nr ${company.organization_number}` : '', company?.email, company?.phone].filter(Boolean).join(' · ');
      const pages = doc.internal.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setFillColor(...DARK);
        doc.rect(0, 285, PAGE_W, 12, 'F');
        doc.setFillColor(...ORANGE);
        doc.rect(0, 285, 3, 12, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(185, 200, 215);
        doc.text(companyFooter || 'SolarPlan', MARGIN, 290.5);
        doc.text(`${text(project.name, 'Projekt')} · Sida ${page} / ${pages}`, PAGE_W - MARGIN, 290.5, { align: 'right' });
      }

      const prefix = project.status === 'offert' ? 'offert' : 'projektdokument';
      doc.save(`${prefix}_${text(project.name, 'projekt').replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, '_')}.pdf`);
    } finally {
      setLoading(false);
    }
  };

  return <Button onClick={generate} disabled={loading} variant="outline" className="gap-2">
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
    {loading ? 'Genererar PDF...' : project.status === 'offert' ? 'Ladda ner offert' : 'Ladda ner PDF'}
  </Button>;
}
