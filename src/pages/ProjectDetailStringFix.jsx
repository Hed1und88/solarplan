import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { productMeta } from '@/lib/productDocuments';
import { Button } from '@/components/ui/button';
import ProjectDetail from './ProjectDetail.jsx';

const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#db2777', '#0891b2', '#65a30d'];
const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const localKey = id => `solarplan:project:${id}:string_layout_data`;

function safeJson(raw, fallback = {}) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function positiveInt(value, fallback = 0) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Växelriktare';
}

function firstNumber(product, meta, keys, fallback = 0) {
  for (const key of keys) {
    const direct = positiveInt(product?.[key]);
    if (direct) return direct;
    const stored = positiveInt(meta?.[key]);
    if (stored) return stored;
  }
  return fallback;
}

function parseCounts(value, mpptCount) {
  let values = [];
  if (Array.isArray(value)) values = value.map(item => positiveInt(item)).filter(Boolean);
  else if (value && typeof value === 'object') values = Array.from({ length: mpptCount }, (_, index) => positiveInt(value[index + 1] ?? value[`mppt${index + 1}`] ?? value[`MPPT${index + 1}`])).filter(Boolean);
  else if (typeof value === 'string') values = value.split(/[,;/|]+/).map(item => positiveInt(item)).filter(Boolean);
  if (!values.length) return null;
  return Array.from({ length: mpptCount }, (_, index) => values[index] || values[values.length - 1] || 1);
}

function inverterTopology(product) {
  if (!product) return { mpptCount: 0, counts: [], totalPv: 0, complete: false };
  const meta = productMeta(product);
  const storedMppt = firstNumber(product, meta, ['mppt_count', 'mpptCount', 'number_of_mppt', 'number_of_mppts', 'mppts'], 0);
  const mpptCount = storedMppt || 1;
  const rawCounts = product.pv_inputs_per_mppt ?? product.mppt_input_counts ?? meta.pv_inputs_per_mppt ?? meta.mppt_input_counts;
  let counts = parseCounts(rawCounts, mpptCount);
  const uniform = firstNumber(product, meta, ['strings_per_mppt', 'pv_inputs_each_mppt', 'inputs_per_mppt'], 0);
  if (!counts && uniform) counts = Array.from({ length: mpptCount }, () => uniform);
  const total = firstNumber(product, meta, ['pv_input_count', 'total_pv_inputs', 'string_input_count', 'total_dc_inputs'], 0);
  if (!counts && total) {
    const base = Math.floor(total / mpptCount);
    const remainder = total % mpptCount;
    counts = Array.from({ length: mpptCount }, (_, index) => Math.max(1, base + (index < remainder ? 1 : 0)));
  }
  if (!counts) counts = Array.from({ length: mpptCount }, () => 1);
  return {
    mpptCount,
    counts,
    totalPv: counts.reduce((sum, value) => sum + value, 0),
    complete: storedMppt > 0 && Boolean(rawCounts || uniform || total),
  };
}

function createConfig(index, old = {}) {
  return {
    id: old.id || uid('inverter'),
    name: old.name || `Växelriktare ${index + 1}`,
    productId: old.productId || old.product_id || '',
    productSnapshot: old.productSnapshot || old.product_snapshot || null,
  };
}

function buildSlots(configs, products) {
  const multiple = configs.length > 1;
  const slots = [];
  configs.forEach((config, configIndex) => {
    const product = products.find(item => String(item.id) === String(config.productId)) || config.productSnapshot;
    if (!product) return;
    const topology = inverterTopology(product);
    let pvInput = 1;
    topology.counts.forEach((count, mpptIndex) => {
      for (let index = 0; index < count; index += 1) {
        slots.push({
          inverterConfigId: config.id,
          mppt: mpptIndex + 1,
          pvInput,
          inputWithinMppt: index + 1,
          name: `${multiple ? `${config.name} · ` : ''}MPPT ${mpptIndex + 1} · PV ${pvInput}`,
          color: COLORS[slots.length % COLORS.length],
          configIndex,
        });
        pvInput += 1;
      }
    });
  });
  return slots;
}

function mergeStrings(existing = [], slots = []) {
  const used = new Set();
  return slots.map((slot, index) => {
    let current = existing.find(item => item.inverterConfigId === slot.inverterConfigId && Number(item.mppt) === slot.mppt && Number(item.pvInput) === slot.pvInput);
    if (!current && slot.configIndex === 0) current = existing.find(item => !used.has(item.id) && !item.inverterConfigId && Number(item.mppt || 1) === slot.mppt && Number(item.pvInput || slot.pvInput) === slot.pvInput);
    if (!current && slot.configIndex === 0) current = existing.find(item => !used.has(item.id) && !item.inverterConfigId);
    if (current?.id) used.add(current.id);
    return {
      ...current,
      id: current?.id || uid('pv'),
      name: slot.name,
      color: current?.color || slot.color || COLORS[index % COLORS.length],
      nodes: Array.isArray(current?.nodes) ? current.nodes : [],
      panel_count: Number(current?.panel_count) || 0,
      inverterConfigId: slot.inverterConfigId,
      mppt: slot.mppt,
      pvInput: slot.pvInput,
      inputWithinMppt: slot.inputWithinMppt,
      startPolarity: current?.startPolarity === 'minus' ? 'minus' : 'plus',
    };
  });
}

async function readProject(projectId) {
  try {
    if (base44.entities.Project.get) return await base44.entities.Project.get(projectId);
  } catch {}
  const rows = await base44.entities.Project.list('-updated_date');
  return (rows || []).find(item => String(item.id) === String(projectId)) || null;
}

function SettingsHost({ children }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    const sync = () => {
      const aside = Array.from(document.querySelectorAll('aside')).find(element => element.textContent?.includes('INSTÄLLNINGAR') && element.textContent?.includes('Slingor'));
      if (!aside) {
        setTarget(null);
        return;
      }
      const list = Array.from(aside.querySelectorAll('div')).find(element => element.classList.contains('space-y-3'));
      if (!list) return;
      let host = list.querySelector(':scope > [data-string-inverter-selector="true"]');
      if (!host) {
        host = document.createElement('div');
        host.dataset.stringInverterSelector = 'true';
        list.prepend(host);
      }
      setTarget(host);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector('[data-string-inverter-selector="true"]')?.remove();
    };
  }, []);

  return target ? createPortal(children, target) : null;
}

function InverterSelector({ projectId, onSaved }) {
  const [projectData, setProjectData] = useState({});
  const [configs, setConfigs] = useState([createConfig(0)]);
  const [activeId, setActiveId] = useState('');
  const [status, setStatus] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['products-inverters-string-settings'],
    queryFn: () => base44.entities.Product.filter({ category: 'vaxelriktare' }),
  });
  const inverters = products.filter(product => product.is_active !== false);

  useEffect(() => {
    let cancelled = false;
    readProject(projectId).then(project => {
      if (cancelled || !project) return;
      const server = safeJson(project.string_layout_data, {});
      const local = typeof window !== 'undefined' ? safeJson(window.localStorage.getItem(localKey(projectId)), {}) : {};
      const data = new Date(local.savedAt || 0).getTime() > new Date(server.savedAt || 0).getTime() ? local : server;
      const source = Array.isArray(data.inverterConfigs) && data.inverterConfigs.length
        ? data.inverterConfigs
        : [{ id: 'default-inverter', name: 'Växelriktare 1', productId: data.inverterProductId || '', productSnapshot: data.inverterProductSnapshot || null }];
      const nextConfigs = source.map((config, index) => createConfig(index, config));
      setProjectData(data);
      setConfigs(nextConfigs);
      setActiveId(nextConfigs[0]?.id || '');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const active = configs.find(config => config.id === activeId) || configs[0];
  const activeProduct = inverters.find(product => String(product.id) === String(active?.productId)) || active?.productSnapshot || null;
  const topology = useMemo(() => inverterTopology(activeProduct), [activeProduct]);

  const persist = async nextConfigs => {
    const slots = buildSlots(nextConfigs, inverters);
    const strings = mergeStrings(projectData.strings || [], slots);
    const payload = {
      ...projectData,
      version: 62,
      source: 'inverter-selector-inside-settings',
      inverterConfigs: nextConfigs,
      inverterProductId: nextConfigs[0]?.productId || '',
      inverterProductSnapshot: nextConfigs[0]?.productSnapshot || null,
      stringCount: strings.length,
      strings,
      savedAt: new Date().toISOString(),
    };
    setConfigs(nextConfigs);
    setProjectData(payload);
    window.localStorage.setItem(localKey(projectId), JSON.stringify(payload));
    setStatus('Sparar...');
    try {
      await base44.entities.Project.update(projectId, { string_layout_data: JSON.stringify(payload) });
      setStatus(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
      onSaved();
    } catch {
      setStatus('Lokal backup sparad');
    }
  };

  const choose = productId => {
    const product = inverters.find(item => String(item.id) === String(productId)) || null;
    const next = configs.map(config => config.id === active.id ? { ...config, productId, productSnapshot: product, name: product ? productLabel(product) : config.name } : config);
    persist(next);
  };

  const add = () => {
    const config = createConfig(configs.length);
    const next = [...configs, config];
    setActiveId(config.id);
    persist(next);
  };

  const remove = () => {
    if (configs.length <= 1) return;
    const next = configs.filter(config => config.id !== active.id);
    setActiveId(next[0]?.id || '');
    persist(next);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Zap className="h-4 w-4 text-orange-500" />Växelriktare</div>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={add} title="Lägg till växelriktare"><Plus className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={remove} disabled={configs.length <= 1} title="Ta bort växelriktare"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {configs.length > 1 && <div className="mb-2 flex gap-1 overflow-x-auto">{configs.map((config, index) => <button key={config.id} type="button" onClick={() => setActiveId(config.id)} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${config.id === active?.id ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500'}`}>{index + 1}</button>)}</div>}
      <select value={active?.productId || ''} onChange={event => choose(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
        <option value="">Välj växelriktare</option>
        {inverters.map(product => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}
      </select>
      {activeProduct ? <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${topology.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <div className="font-semibold">{topology.mpptCount} MPPT · {topology.totalPv} PV-ingångar</div>
        <div className="mt-1">{topology.counts.map((count, index) => `MPPT ${index + 1}: ${count} PV`).join(' · ')}</div>
        {!topology.complete && <div className="mt-1 flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />MPPT/PV-data saknas delvis i produkten.</div>}
      </div> : <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">Välj växelriktare. MPPT och PV-ingångar skapas automatiskt.</div>}
      {status && <div className="mt-1 text-[10px] text-slate-500">{status}</div>}
    </section>
  );
}

export default function ProjectDetailStringFix() {
  const { id } = useParams();
  const [revision, setRevision] = useState(0);
  return (
    <>
      <ProjectDetail key={revision} />
      <SettingsHost><InverterSelector projectId={id} onSaved={() => setRevision(value => value + 1)} /></SettingsHost>
    </>
  );
}
