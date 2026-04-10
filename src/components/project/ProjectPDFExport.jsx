import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';

const STATUS_LABELS = { planering: 'Planering', projektering: 'Projektering', offert: 'Offert', installation: 'Installation', klart: 'Klart' };
const MONTHS_SV = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

const C_ORANGE = [249, 115, 22];
const C_DARK   = [30, 41, 59];
const C_GRAY   = [100, 116, 139];
const C_LIGHT  = [241, 245, 249];
const C_WHITE  = [255, 255, 255];
const C_GREEN  = [34, 197, 94];
const C_RED    = [239, 68, 68];
const MARGIN   = 16;
const PAGE_W   = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

function hexToRgb(hex) {
  const h = (hex || '#3b82f6').replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function safeParse(raw, fallback) {
  try { return JSON.parse(raw || 'null') ?? fallback; } catch { return fallback; }
}
function checkPage(doc, y, needed = 20) {
  if (y + needed > 278) { doc.addPage(); return MARGIN + 2; }
  return y;
}
function sectionTitle(doc, y, num, title) {
  y = checkPage(doc, y, 14);
  doc.setFillColor(...C_DARK);
  doc.rect(MARGIN, y, CONTENT_W, 9, 'F');
  doc.setFillColor(...C_ORANGE);
  doc.rect(MARGIN, y, 4, 9, 'F');
  doc.setTextColor(...C_WHITE);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${num}. ${title}`, MARGIN + 7, y + 6);
  return y + 13;
}
function kv(doc, y, label, value, x = MARGIN, w = CONTENT_W / 2 - 2) {
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(8);
  doc.text(label, x, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C_DARK);
  doc.text(String(value ?? '—'), x + w * 0.55, y);
}
function tableHeader(doc, y, cols) {
  doc.setFillColor(...C_DARK);
  doc.rect(MARGIN, y, CONTENT_W, 6.5, 'F');
  doc.setTextColor(...C_WHITE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  cols.forEach(({ text, x }) => doc.text(text, x, y + 4.5));
  return y + 6.5;
}
function tableRow(doc, y, cells, i) {
  doc.setFillColor(i % 2 === 0 ? 255 : 246, i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 252);
  doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
  doc.setTextColor(...C_DARK);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  cells.forEach(({ text, x, bold, color }) => {
    if (bold) doc.setFont('helvetica', 'bold');
    if (color) doc.setTextColor(...color); else doc.setTextColor(...C_DARK);
    const t = String(text ?? '—');
    doc.text(t.length > 52 ? t.slice(0, 50) + '…' : t, x, y + 4.8);
    doc.setFont('helvetica', 'normal');
  });
  return y + 7;
}

export default function ProjectPDFExport({ project, products = [] }) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // ═══════════════════════════════════════════════════════════════
    // COVER HEADER
    // ═══════════════════════════════════════════════════════════════
    doc.setFillColor(...C_DARK);
    doc.rect(0, 0, PAGE_W, 38, 'F');
    doc.setFillColor(...C_ORANGE);
    doc.rect(0, 38, PAGE_W, 2.5, 'F');
    doc.setTextColor(...C_WHITE);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('SOLENERGI-PROJEKT', MARGIN, 17);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(170, 185, 200);
    doc.text(`Genererad: ${new Date().toLocaleDateString('sv-SE')}`, MARGIN, 25);
    doc.setTextColor(...C_ORANGE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABELS[project.status] || '', PAGE_W - MARGIN, 17, { align: 'right' });

    let y = 46;

    // Project name + info
    doc.setTextColor(...C_DARK);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(project.name || 'Projekt', MARGIN, y); y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C_GRAY);
    if (project.customer_name) { doc.text(`Kund: ${project.customer_name}`, MARGIN, y); y += 5; }
    if (project.address)       { doc.text(`Adress: ${project.address}`, MARGIN, y); y += 5; }
    y += 5;

    // ═══════════════════════════════════════════════════════════════
    // 1. PANEL LAYOUT
    // ═══════════════════════════════════════════════════════════════
    const panelData = safeParse(project.panel_layout_data, {});
    const panels = Array.isArray(panelData) ? panelData : (panelData.panels || []);
    const roofW = panelData.roofWidth || 0;
    const roofH = panelData.roofHeight || 0;
    const totalW = panels.reduce((s, p) => s + (p.power_watts || 400), 0);
    const kwp = totalW / 1000;

    y = sectionTitle(doc, y, 1, 'PANELKONFIGURATION');

    // Info grid
    doc.setFillColor(...C_LIGHT);
    doc.roundedRect(MARGIN, y, CONTENT_W, 26, 2, 2, 'F');
    const pi = [
      ['Antal paneler', panels.length],
      ['Total effekt', `${kwp.toFixed(2)} kWp (${totalW} W)`],
      ['Takyta', roofW && roofH ? `${roofW} × ${roofH} m = ${(roofW * roofH).toFixed(1)} m²` : '—'],
      ['Panel modell', panels[0]?.product_name || '—'],
    ];
    pi.forEach(([l, v], i) => {
      const rx = MARGIN + 4 + (i % 2) * (CONTENT_W / 2);
      const ry = y + 8 + Math.floor(i / 2) * 10;
      kv(doc, ry, l + ':', v, rx, CONTENT_W / 2 - 6);
    });

    // Mini panel-grid illustration (top-right of box)
    if (panels.length > 0 && roofW && roofH) {
      const panelW_m = (panels[0]?.width_mm || 1000) / 1000;
      const panelH_m = (panels[0]?.height_mm || 1700) / 1000;
      const cols = Math.round(roofW / panelW_m);
      const rows = Math.round(roofH / panelH_m);
      const cs = Math.min(3.2, 28 / Math.max(cols, rows, 1));
      const gx = MARGIN + CONTENT_W - cols * cs - 4;
      const gy = y + 3;
      const placed = new Set(panels.map(p => `${p.row}-${p.col}`));
      for (let r = 0; r < rows && r < 12; r++) {
        for (let c = 0; c < cols && c < 12; c++) {
          doc.setFillColor(placed.has(`${r}-${c}`) ? 30 : 200, placed.has(`${r}-${c}`) ? 60 : 215, placed.has(`${r}-${c}`) ? 110 : 230);
          doc.rect(gx + c * cs, gy + r * cs * 1.5, cs - 0.4, cs * 1.5 - 0.4, 'F');
        }
      }
    }
    y += 30;

    // Obstacles
    const obstacles = panelData.obstacles || [];
    if (obstacles.length > 0) {
      y = checkPage(doc, y, obstacles.length * 7 + 10);
      doc.setTextColor(...C_GRAY);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Hinder på taket:', MARGIN, y); y += 5;
      obstacles.forEach((obs, i) => {
        y = tableRow(doc, y, [
          { text: obs.type, x: MARGIN + 2 },
          { text: `Position: ${obs.x}×${obs.y} m`, x: MARGIN + 40 },
          { text: `Storlek: ${obs.width}×${obs.height} m`, x: MARGIN + 100 },
        ], i);
      });
      y += 3;
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. STRING CONFIGURATION
    // ═══════════════════════════════════════════════════════════════
    const rawStrings = safeParse(project.string_layout_data, []);
    const strings = Array.isArray(rawStrings) ? rawStrings : [];

    if (strings.length > 0) {
      y = sectionTitle(doc, y, 2, 'SLINGKONFIGURATION');
      y = tableHeader(doc, y, [
        { text: 'Slinga', x: MARGIN + 7 },
        { text: 'Paneler', x: MARGIN + 55 },
        { text: 'Förväntat Voc', x: MARGIN + 85 },
        { text: 'Uppmätt Voc', x: MARGIN + 125 },
        { text: 'Status', x: MARGIN + 157 },
      ]);
      strings.forEach((str, i) => {
        y = checkPage(doc, y, 8);
        const [r, g, b] = hexToRgb(str.color);
        doc.setFillColor(i % 2 === 0 ? 255 : 246, i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 252);
        doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
        doc.setFillColor(r, g, b);
        doc.circle(MARGIN + 4, y + 3.5, 2, 'F');

        const prod = products.find(p => p.id === str.product_id);
        const expVoc = str.panel_count && prod?.voc_v ? (prod.voc_v * str.panel_count).toFixed(1) : null;
        let statusText = '—', statusColor = C_GRAY;
        if (str.meas_voc && expVoc) {
          const diff = Math.abs(parseFloat(str.meas_voc) - parseFloat(expVoc)) / parseFloat(expVoc);
          if (diff <= 0.05) { statusText = '✓ OK'; statusColor = C_GREEN; }
          else if (diff <= 0.15) { statusText = '⚠ Gränsfall'; statusColor = [234, 179, 8]; }
          else { statusText = '✗ Avvikelse'; statusColor = C_RED; }
        }
        doc.setTextColor(...C_DARK); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(str.name || `Slinga ${i+1}`, MARGIN + 8, y + 4.8);
        doc.text(str.panel_count ? String(str.panel_count) : '—', MARGIN + 58, y + 4.8);
        doc.text(expVoc ? `${expVoc} V` : '—', MARGIN + 88, y + 4.8);
        doc.text(str.meas_voc ? `${str.meas_voc} V` : '—', MARGIN + 128, y + 4.8);
        doc.setTextColor(...statusColor); doc.setFont('helvetica', 'bold');
        doc.text(statusText, MARGIN + 159, y + 4.8);
        y += 7;
      });
      y += 4;
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. BATTERY PLANNING
    // ═══════════════════════════════════════════════════════════════
    const batteries = safeParse(project.battery_layout_data, []);
    if (batteries.length > 0) {
      y = sectionTitle(doc, y, 3, 'BATTERIPLANERING');
      y = tableHeader(doc, y, [
        { text: 'Batteri', x: MARGIN + 2 },
        { text: 'Kapacitet', x: MARGIN + 100 },
      ]);
      // Group by product
      const battMap = {};
      batteries.forEach(b => {
        if (!battMap[b.product_name]) battMap[b.product_name] = { name: b.product_name, count: 0 };
        battMap[b.product_name].count++;
      });
      Object.values(battMap).forEach((b, i) => {
        y = checkPage(doc, y, 8);
        const prod = products.find(p => p.name === b.name);
        y = tableRow(doc, y, [
          { text: `${b.count}× ${b.name}`, x: MARGIN + 2, bold: true },
          { text: prod?.capacity_kwh ? `${(prod.capacity_kwh * b.count).toFixed(1)} kWh total` : '—', x: MARGIN + 100 },
        ], i);
      });
      const totalKwh = batteries.reduce((s, b) => {
        const p = products.find(pr => pr.id === b.product_id);
        return s + (p?.capacity_kwh || 0);
      }, 0);
      // Total row
      y = checkPage(doc, y, 8);
      doc.setFillColor(...C_LIGHT);
      doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_DARK); doc.setFontSize(9);
      doc.text(`Totalt: ${batteries.length} batteri${batteries.length > 1 ? 'er' : ''} — ${totalKwh.toFixed(1)} kWh`, MARGIN + 2, y + 5);
      y += 11;
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. SOLAR ENERGY ANALYSIS
    // ═══════════════════════════════════════════════════════════════
    const solarSaved = safeParse(project.solar_data, null);
    if (solarSaved) {
      y = sectionTitle(doc, y, 4, 'SOLENERGIANALYS');
      const pvgis = solarSaved.pvgis;
      const forecast = solarSaved.forecast;
      const loc = solarSaved.location;
      const pvgisYearly = pvgis?.outputs?.totals?.fixed?.E_y;
      const pvgisMonthly = pvgis?.outputs?.monthly?.fixed?.map(m => m.E_m);
      const forecastMonthly = forecast?.result ? Object.values(forecast.result).map(v => Math.round(v / 1000)) : null;
      const forecastYearly = forecastMonthly?.reduce((a, b) => a + b, 0);

      // KPIs
      doc.setFillColor(...C_LIGHT);
      doc.roundedRect(MARGIN, y, CONTENT_W, 20, 2, 2, 'F');
      const solarKpis = [
        ['PVGIS årsproduktion', pvgisYearly ? `${Math.round(pvgisYearly).toLocaleString('sv-SE')} kWh/år` : '—'],
        ['Forecast.solar årsproduktion', forecastYearly ? `${forecastYearly.toLocaleString('sv-SE')} kWh/år` : '—'],
        ['Specifik produktion', pvgisYearly && solarSaved.peakPower ? `${Math.round(pvgisYearly / solarSaved.peakPower)} kWh/kWp/år` : '—'],
        ['Plats (lat/lon)', loc ? `${loc.lat?.toFixed(4)}°N, ${loc.lon?.toFixed(4)}°E` : '—'],
      ];
      solarKpis.forEach(([l, v], i) => {
        const rx = MARGIN + 4 + (i % 2) * (CONTENT_W / 2);
        const ry = y + 7 + Math.floor(i / 2) * 9;
        kv(doc, ry, l + ':', v, rx, CONTENT_W / 2 - 6);
      });
      y += 24;

      // Monthly production bar chart (text-based)
      const monthly = pvgisMonthly || forecastMonthly;
      if (monthly) {
        y = checkPage(doc, y, 36);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_DARK); doc.setFontSize(8);
        doc.text('Månadsproduktion (kWh):', MARGIN, y); y += 4;
        const maxVal = Math.max(...monthly);
        const barAreaW = CONTENT_W - 20;
        const barH = 2.2;
        const spacing = barAreaW / 12;
        monthly.forEach((val, i) => {
          const bx = MARGIN + i * spacing;
          const barW = (val / maxVal) * (spacing - 1);
          // bar
          doc.setFillColor(...C_ORANGE);
          doc.rect(bx, y + 14 - (barW / (spacing - 1)) * 12, spacing - 1, (barW / (spacing - 1)) * 12, 'F');
          // month label
          doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_GRAY); doc.setFontSize(6.5);
          doc.text(MONTHS_SV[i], bx + (spacing - 1) / 2, y + 17, { align: 'center' });
          // value
          doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_DARK); doc.setFontSize(6);
          doc.text(String(Math.round(val)), bx + (spacing - 1) / 2, y + 12 - (val / maxVal) * 12, { align: 'center' });
        });
        y += 21;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. SINGLE-LINE SCHEMA
    // ═══════════════════════════════════════════════════════════════
    const rawSL = safeParse(project.string_layout_data, {});
    const singleLine = rawSL?.singleLine;
    if (singleLine?.components?.length > 0) {
      y = sectionTitle(doc, y, 5, 'ENLINJESCHEMA – KOMPONENTLISTA');
      y = tableHeader(doc, y, [
        { text: 'Beteckning / Label', x: MARGIN + 2 },
        { text: 'Komponenttyp', x: MARGIN + 110 },
      ]);
      singleLine.components.forEach((comp, i) => {
        y = checkPage(doc, y, 8);
        const label = (comp.label || '').replace(/\n/g, ' ');
        y = tableRow(doc, y, [
          { text: label, x: MARGIN + 2 },
          { text: (comp.type || '').replace(/_/g, ' '), x: MARGIN + 110 },
        ], i);
      });
      if (singleLine.wires?.length > 0) {
        y = checkPage(doc, y, 10); y += 2;
        const compMap = Object.fromEntries(singleLine.components.map(c => [c.id, c]));
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_GRAY); doc.setFontSize(7.5);
        const wires = singleLine.wires.map(w =>
          `${compMap[w.from]?.label?.split('\n')[0] || w.from} → ${compMap[w.to]?.label?.split('\n')[0] || w.to}`
        ).join('   ');
        const wLines = doc.splitTextToSize('Kopplingar: ' + wires, CONTENT_W);
        doc.text(wLines, MARGIN, y);
        y += wLines.length * 4.5 + 2;
      }
      y += 4;
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. MOUNTING SYSTEM & LOAD CALCULATION
    // ═══════════════════════════════════════════════════════════════
    const mounting = safeParse(project.mounting_data, null);
    if (mounting) {
      y = sectionTitle(doc, y, 6, 'MONTAGESYSTEM & LASTBERÄKNING (Eurokod SS-EN 1991)');

      doc.setFillColor(...C_LIGHT);
      doc.roundedRect(MARGIN, y, CONTENT_W, 44, 2, 2, 'F');
      const mtRows = [
        ['Montagesystem', `${mounting.brandLabel || '—'} – ${mounting.modelName || '—'}`],
        ['Takvinkel', `${mounting.roofAngle || '—'}°`],
        ['Snözon', mounting.snowZoneLabel || '—'],
        ['Vindzon', mounting.windZoneLabel || '—'],
        ['Formfaktor μ (snö)', mounting.muFactor ?? '—'],
        ['Vindtryckskoeff. cpe', mounting.cpe ?? '—'],
        ['Dim. snölast', mounting.designSnow ? `${mounting.designSnow} kN/m²` : '—'],
        ['Dim. vindlast', mounting.designWind ? `${mounting.designWind} kN/m²` : '—'],
        ['Total dim. last', mounting.totalLoad ? `${mounting.totalLoad} kN/m²` : '—'],
        ['Rekommenderat krok c/c', mounting.hookSpacing ? `${mounting.hookSpacing} mm` : '—'],
      ];
      mtRows.forEach(([l, v], i) => {
        const rx = MARGIN + 4 + (i % 2) * (CONTENT_W / 2);
        const ry = y + 6 + Math.floor(i / 2) * 8;
        kv(doc, ry, l + ':', v, rx, CONTENT_W / 2 - 6);
      });
      y += 48;

      // Approval badges
      y = checkPage(doc, y, 12);
      const snOk = mounting.snowOk, wiOk = mounting.windOk;
      [[snOk, 'Snölast'], [wiOk, 'Vindlast']].forEach(([ok, label], i) => {
        doc.setFillColor(ok ? 34 : 239, ok ? 197 : 68, ok ? 94 : 68);
        doc.roundedRect(MARGIN + i * (CONTENT_W / 2 + 2), y, CONTENT_W / 2, 7, 1.5, 1.5, 'F');
        doc.setTextColor(...C_WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.text(`${label}: ${ok === true ? '✓ Godkänd' : ok === false ? '✗ Underdimensionerat' : 'Ej beräknat'}`, MARGIN + 4 + i * (CONTENT_W / 2 + 2), y + 4.8);
      });
      y += 12;

      doc.setFont('helvetica', 'italic'); doc.setTextColor(...C_GRAY); doc.setFontSize(7);
      doc.text(`Beräkning: Eurokod SS-EN 1991-1-3 (snö) och SS-EN 1991-1-4 (vind). μ=${mounting.muFactor ?? '—'}, cpe=${mounting.cpe ?? '—'}.`, MARGIN, y);
      y += 7;
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. PRODUCTS & COST
    // ═══════════════════════════════════════════════════════════════
    const selectedProducts = project.selected_products || [];
    if (selectedProducts.length > 0) {
      y = sectionTitle(doc, y, 7, 'PRODUKTLISTA & KOSTNADSSAMMANSTÄLLNING');
      y = tableHeader(doc, y, [
        { text: 'Produkt', x: MARGIN + 2 },
        { text: 'Antal', x: MARGIN + 112 },
        { text: 'À-pris', x: MARGIN + 132 },
        { text: 'Summa', x: MARGIN + 156 },
      ]);
      let total = 0;
      selectedProducts.forEach((sp, i) => {
        y = checkPage(doc, y, 8);
        const sum = (sp.quantity || 0) * (sp.unit_price || 0);
        total += sum;
        y = tableRow(doc, y, [
          { text: sp.product_name || '—', x: MARGIN + 2 },
          { text: String(sp.quantity || 0), x: MARGIN + 114 },
          { text: `${(sp.unit_price || 0).toLocaleString('sv-SE')} kr`, x: MARGIN + 132 },
          { text: `${sum.toLocaleString('sv-SE')} kr`, x: MARGIN + 156, bold: true },
        ], i);
      });
      // Subtotal
      y = checkPage(doc, y, 16);
      doc.setFillColor(...C_LIGHT);
      doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_DARK); doc.setFontSize(9);
      doc.text('Totalt exkl. moms', MARGIN + 2, y + 5);
      doc.text(`${total.toLocaleString('sv-SE')} kr`, MARGIN + 156, y + 5);
      y += 7;
      doc.setFillColor(...C_ORANGE);
      doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
      doc.setTextColor(...C_WHITE);
      doc.text('Totalt inkl. moms (25%)', MARGIN + 2, y + 5);
      doc.text(`${Math.round(total * 1.25).toLocaleString('sv-SE')} kr`, MARGIN + 156, y + 5);
      y += 11;
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. NOTES
    // ═══════════════════════════════════════════════════════════════
    if (project.notes) {
      y = sectionTitle(doc, y, 8, 'ANTECKNINGAR');
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_DARK); doc.setFontSize(9);
      const lines = doc.splitTextToSize(project.notes, CONTENT_W);
      y = checkPage(doc, y, lines.length * 5 + 4);
      doc.text(lines, MARGIN, y);
    }

    // ═══════════════════════════════════════════════════════════════
    // FOOTER on every page
    // ═══════════════════════════════════════════════════════════════
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(...C_DARK);
      doc.rect(0, 286, PAGE_W, 11, 'F');
      doc.setFillColor(...C_ORANGE);
      doc.rect(0, 286, 3, 11, 'F');
      doc.setTextColor(170, 185, 200);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`${project.name}${project.customer_name ? ' · ' + project.customer_name : ''}  ·  ${project.address || ''}`, MARGIN, 292.5);
      doc.text(`Sida ${i} / ${pageCount}`, PAGE_W - MARGIN, 292.5, { align: 'right' });
    }

    doc.save(`${(project.name || 'projekt').replace(/\s/g, '_')}_solprojekt.pdf`);
    setLoading(false);
  };

  return (
    <Button onClick={generate} disabled={loading} variant="outline" className="gap-2">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {loading ? 'Genererar PDF...' : 'Ladda ner PDF'}
    </Button>
  );
}