import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { base44 } from '@/api/base44Client';
import { useCompanySession } from '@/lib/CompanySessionContext';
import { resolveCompanyForRecord } from '@/lib/companyContext';

const STATUS_LABELS = {
  planering: 'Planering',
  projektering: 'Projektering',
  offert: 'Offert',
  installation: 'Installation',
  klart: 'Klart',
};

const REPORT_SECTIONS = [
  { value: 'panels', title: 'PANELER – EXAKT PANELLAYOUT OCH TAK' },
  { value: 'strings', title: 'SLINGOR – EXAKT SLING- OCH STRÄNGLAYOUT' },
  { value: 'battery', title: 'BATTERI – PLACERING AV BATTERI OCH VÄXELRIKTARE' },
  { value: 'products', title: 'PRODUKTER' },
  { value: 'solar', title: 'SOLDATA' },
  { value: 'singleline', title: 'ENLINJESCHEMA' },
  { value: 'mounting', title: 'MONTAGE' },
  { value: 'documents', title: 'DOKUMENT' },
];

const DARK = [30, 41, 59];
const ORANGE = [249, 115, 22];
const GRAY = [100, 116, 139];
const LIGHT = [241, 245, 249];
const WHITE = [255, 255, 255];
const PAGE_W = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const IMAGE_TOP = 24;
const IMAGE_BOTTOM = 279;
const IMAGE_H = IMAGE_BOTTOM - IMAGE_TOP;

function safeJson(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function text(value, fallback = '—') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('sv-SE')} kr`;
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function nextPaint() {
  await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
}

async function waitForElement(selector, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const element = document.querySelector(selector);
    if (element) return element;
    await wait(80);
  }
  return null;
}

async function waitForImages(root, timeout = 3500) {
  const images = Array.from(root?.querySelectorAll('img') || []);
  if (!images.length) return;
  await Promise.race([
    Promise.all(images.map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    })),
    wait(timeout),
  ]);
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
  const shade = index % 2 === 0 ? [255, 255, 255] : [247, 249, 252];
  doc.setFillColor(...shade);
  doc.rect(MARGIN, y, CONTENT_W, 7.5, 'F');
  doc.setFontSize(7.5);
  cells.forEach(cell => {
    doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    doc.setTextColor(...(cell.color || DARK));
    doc.text(String(cell.value ?? '—').slice(0, cell.max || 55), cell.x, y + 5, cell.align ? { align: cell.align } : undefined);
  });
  return y + 7.5;
}

async function imageData(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) return null;
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
      const product = group.panelProductSnapshot || roof.panelProductSnapshot || {};
      const power = Number(product.power_watts || group.power_watts || 0);
      watts += count * power;
      model ||= product.name || group.panelProductName || roof.panelProductName || '';
    });
  });
  return { roofs: planner?.roofs?.length || 0, panels, watts, model };
}

function stringRows(project) {
  const parsed = safeJson(project.string_layout_data, []);
  return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.strings) ? parsed.strings : []);
}

function batteryRows(project) {
  const parsed = safeJson(project.battery_layout_data, []);
  if (Array.isArray(parsed)) return parsed;
  return parsed?.devices || parsed?.batteries || parsed?.placements || [];
}

function addVisualPageHeader(doc, title, part, parts) {
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, 18, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(0, 18, PAGE_W, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(parts > 1 ? `${title} – DEL ${part} AV ${parts}` : title, MARGIN, 11.5);
}

function cropCanvas(source, top, height) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, top, source.width, height, 0, 0, source.width, height);
  return canvas;
}

function addCanvasPages(doc, canvas, title) {
  if (!canvas?.width || !canvas?.height) return 0;
  const mmPerPixel = CONTENT_W / canvas.width;
  const sliceHeightPx = Math.max(1, Math.floor(IMAGE_H / mmPerPixel));
  const parts = Math.ceil(canvas.height / sliceHeightPx);

  for (let part = 0; part < parts; part += 1) {
    const sourceY = part * sliceHeightPx;
    const sourceHeight = Math.min(sliceHeightPx, canvas.height - sourceY);
    const slice = cropCanvas(canvas, sourceY, sourceHeight);
    const imageHeightMm = sourceHeight * mmPerPixel;
    doc.addPage();
    addVisualPageHeader(doc, title, part + 1, parts);
    doc.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, IMAGE_TOP, CONTENT_W, imageHeightMm, undefined, 'FAST');
  }

  return parts;
}

function addMissingSectionPage(doc, title, reason) {
  doc.addPage();
  addVisualPageHeader(doc, title, 1, 1);
  doc.setFillColor(...LIGHT);
  doc.roundedRect(MARGIN, 35, CONTENT_W, 42, 3, 3, 'F');
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Visuellt underlag kunde inte återges', MARGIN + 6, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(reason || 'Sektionen saknar sparad eller renderbar information.', CONTENT_W - 12);
  doc.text(lines, MARGIN + 6, 58);
}

async function captureSection(sectionValue) {
  const selector = `[data-project-pdf-section="${sectionValue}"]`;
  const element = await waitForElement(selector);
  if (!element) throw new Error('Sektionen kunde inte hittas efter flikbytet.');
  await waitForImages(element);
  await nextPaint();
  await wait(220);

  return html2canvas(element, {
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: false,
    logging: false,
    scale: Math.min(1.6, Math.max(1, window.devicePixelRatio || 1)),
    width: Math.max(element.scrollWidth, element.clientWidth),
    height: Math.max(element.scrollHeight, element.clientHeight),
    windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
    windowHeight: Math.max(document.documentElement.clientHeight, element.scrollHeight),
    scrollX: 0,
    scrollY: -window.scrollY,
    onclone: clonedDocument => {
      const cloned = clonedDocument.querySelector(selector);
      if (!cloned) return;
      cloned.style.background = '#ffffff';
      cloned.style.overflow = 'visible';
      cloned.style.maxHeight = 'none';
      cloned.querySelectorAll('[class*="overflow-"]').forEach(node => {
        node.style.overflow = 'visible';
        node.style.maxHeight = 'none';
      });
      cloned.querySelectorAll('[data-radix-scroll-area-viewport]').forEach(node => {
        node.style.overflow = 'visible';
        node.style.maxHeight = 'none';
        node.style.height = 'auto';
      });
      cloned.querySelectorAll('[data-html2canvas-ignore="true"]').forEach(node => node.remove());
    },
  });
}

function addFooter(doc, company, project) {
  const companyFooter = [
    company?.name,
    company?.organization_number ? `Org.nr ${company.organization_number}` : '',
    company?.email,
    company?.phone,
  ].filter(Boolean).join(' · ');
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
}

export default function ProjectPDFExportV2({
  project,
  products = [],
  activeTab = 'panels',
  onSelectTab,
  onBeforeExport,
}) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const { user } = useCompanySession();

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    const originalTab = activeTab;
    const captureErrors = [];

    try {
      setProgress('Sparar projektet...');
      await wait(250);
      const savedProject = await onBeforeExport?.();
      const reportProject = savedProject && typeof savedProject === 'object' ? savedProject : project;
      const company = await resolveCompanyForRecord(base44, reportProject, user || {});
      const logo = await imageData(company?.logo_url);
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

      doc.setFillColor(...DARK);
      doc.rect(0, 0, PAGE_W, 38, 'F');
      doc.setFillColor(...ORANGE);
      doc.rect(0, 38, PAGE_W, 2.5, 'F');
      const hasLogo = addLogo(doc, logo);

      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(reportProject.status === 'offert' ? 'OFFERT OCH PROJEKTRAPPORT' : 'FULLSTÄNDIG PROJEKTRAPPORT', MARGIN, 15);
      doc.setFontSize(10);
      doc.setTextColor(190, 205, 220);
      doc.text(text(company?.name, 'SolarPlan'), MARGIN, 23);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Genererad ${new Date().toLocaleString('sv-SE')} · ${STATUS_LABELS[reportProject.status] || 'Projekt'}`, MARGIN, 30);
      if (!hasLogo && company?.organization_number) doc.text(`Org.nr ${company.organization_number}`, PAGE_W - MARGIN, 30, { align: 'right' });

      let y = 47;
      doc.setTextColor(...DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(text(reportProject.name, 'Projekt'), MARGIN, y);
      y += 8;

      y = sectionTitle(doc, y, 'PROJEKT- OCH KUNDUPPGIFTER');
      y = infoGrid(doc, y, [
        ['Kund', reportProject.customer_name || reportProject.name],
        ['Status', STATUS_LABELS[reportProject.status] || reportProject.status],
        ['E-post', reportProject.customer_email],
        ['Telefon', reportProject.customer_phone],
        ['Adress', reportProject.address],
        ['Snölast', reportProject.snow_load_kn_m2 ? `${reportProject.snow_load_kn_m2} kN/m²` : ''],
        ['Vindlast', reportProject.wind_load_ms ? `${reportProject.wind_load_ms} m/s` : ''],
        ['Projekt-id', reportProject.id],
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

      const panel = panelSummary(reportProject);
      y = sectionTitle(doc, y, 'PANELER OCH TAK');
      y = infoGrid(doc, y, [
        ['Antal tak', panel.roofs],
        ['Antal paneler', panel.panels],
        ['Installerad effekt', panel.watts ? `${(panel.watts / 1000).toFixed(2)} kWp` : ''],
        ['Panelmodell', panel.model],
        ['Takbredd', reportProject.roof_width_m ? `${reportProject.roof_width_m} m` : ''],
        ['Takdjup', reportProject.roof_height_m ? `${reportProject.roof_height_m} m` : ''],
      ]);

      const strings = stringRows(reportProject);
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

      const batteries = batteryRows(reportProject);
      if (batteries.length) {
        y = sectionTitle(doc, y, 'BATTERIPLANERING');
        const grouped = Object.values(batteries.reduce((result, item) => {
          const key = item.product_name || item.name || item.productSnapshot?.name || 'Batteri / växelriktare';
          if (!result[key]) result[key] = { name: key, count: 0, capacity: 0 };
          result[key].count += 1;
          const product = products.find(productItem => String(productItem.id) === String(item.product_id || item.productId));
          result[key].capacity += Number(item.capacity_kwh || item.productSnapshot?.capacity_kwh || product?.capacity_kwh || 0);
          return result;
        }, {}));
        y = tableHeader(doc, y, [
          { label: 'Utrustning', x: MARGIN + 2 },
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

      const solar = safeJson(reportProject.solar_data, null);
      const yearlyProduction = solar?.pvgis?.outputs?.totals?.fixed?.E_y || solar?.yearlyProduction || solar?.yearly_production_kwh;
      y = sectionTitle(doc, y, 'SOLENERGIANALYS');
      y = infoGrid(doc, y, [
        ['Beräknad årsproduktion', yearlyProduction ? `${Math.round(yearlyProduction).toLocaleString('sv-SE')} kWh/år` : ''],
        ['Toppeffekt', solar?.peakPower ? `${solar.peakPower} kWp` : panel.watts ? `${(panel.watts / 1000).toFixed(2)} kWp` : ''],
        ['Specifik produktion', yearlyProduction && (solar?.peakPower || panel.watts) ? `${Math.round(yearlyProduction / (Number(solar?.peakPower) || panel.watts / 1000))} kWh/kWp/år` : ''],
        ['Datakälla', solar?.pvgis ? 'PVGIS' : solar ? 'Projektets soldata' : ''],
      ]);

      const selectedProducts = Array.isArray(reportProject.selected_products) ? reportProject.selected_products : [];
      if (selectedProducts.length) {
        y = sectionTitle(doc, y, reportProject.status === 'offert' ? 'OFFERT OCH PRODUKTER' : 'PRODUKTER OCH KOSTNAD');
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
            { value: item.product_name || item.product_snapshot?.name || 'Produkt', x: MARGIN + 2, max: 52, bold: true },
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

      if (reportProject.notes) {
        y = sectionTitle(doc, y, 'ANTECKNINGAR');
        paragraph(doc, y, reportProject.notes);
      }

      for (const section of REPORT_SECTIONS) {
        setProgress(`Fångar ${section.title.toLowerCase()}...`);
        try {
          onSelectTab?.(section.value);
          await nextPaint();
          await wait(450);
          const canvas = await captureSection(section.value);
          addCanvasPages(doc, canvas, section.title);
        } catch (error) {
          const reason = error?.message || 'Okänt renderingsfel.';
          captureErrors.push(`${section.title}: ${reason}`);
          addMissingSectionPage(doc, section.title, reason);
        }
      }

      addFooter(doc, company, reportProject);
      const prefix = reportProject.status === 'offert' ? 'offert_och_projektrapport' : 'projektrapport';
      doc.save(`${prefix}_${text(reportProject.name, 'projekt').replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, '_')}.pdf`);

      if (captureErrors.length) {
        console.warn('PDF-exporten hade sektioner som inte kunde återges:', captureErrors);
      }
    } finally {
      onSelectTab?.(originalTab);
      await nextPaint().catch(() => {});
      setProgress('');
      setLoading(false);
    }
  };

  return (
    <Button onClick={generate} disabled={loading} variant="outline" className="gap-2" data-html2canvas-ignore="true">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {loading ? progress || 'Genererar PDF...' : project.status === 'offert' ? 'Ladda ner offert/PDF' : 'Ladda ner PDF'}
    </Button>
  );
}
