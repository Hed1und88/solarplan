import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2, Zap } from 'lucide-react';
import { filterVisibleProducts } from '@/lib/tenantQueries';
import { productMeta } from '@/lib/productDocuments';
import { Button } from '@/components/ui/button';
import StringMarkingCanvasWorkspace from './StringMarkingCanvasWorkspace.jsx';

const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#db2777', '#0891b2', '#65a30d'];
const localKey = projectId => `solarplan:project:${projectId}:string_layout_data`;
const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positiveInt = (value, fallback = 0) => {
  const parsed = Math.round(number(value, fallback));
  return parsed > 0 ? parsed : fallback;
};

function safeJson(raw, fallback = {}) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function label(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Ej vald växelriktare';
}

function readNumber(product, meta, keys, fallback = 0) {
  for (const key of keys) {
    const direct = positiveInt(product?.[key], 0);
    if (direct) return direct;
    const stored = positiveInt(meta?.[key], 0);
    if (stored) return stored;
  }
  return fallback;
}

function normalizeCounts(raw, mpptCount) {
  if (Array.isArray(raw)) {
    const values = raw.map(value => positiveInt(value, 0)).filter(Boolean);
    if (values.length) return Array.from({ length: mpptCount }, (_, index) => values[index] || values[values.length - 1] || 1);
  }
  if (raw && typeof raw === 'object') {
    const values = Array.from({ length: mpptCount }, (_, index) => {
      const mppt = index + 1;
      return positiveInt(raw[mppt] ?? raw[`mppt${mppt}`] ?? raw[`MPPT${mppt}`], 0);
    });
    if (values.some(Boolean)) return values.map(value => value || 1);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const values = raw.split(/[,;/|]+/).map(value => positiveInt(value, 0)).filter(Boolean);
    if (values.length) return Array.from({ length: mpptCount }, (_, index) => values[index] || values[values.length - 1] || 1);
  }
  return null;
}

function inverterSpec(product) {
  if (!product) return { mpptCount: 0, inputCounts: [], totalInputs: 0, complete: false };
  const meta = productMeta(product);
  const storedMppt = readNumber(product, meta, ['mppt_count', 'mpptCount', 'number_of_mppt'], 0);
  const mpptCount = storedMppt || 1;
  const rawCounts = product.pv_inputs_per_mppt ?? product.mppt_input_counts ?? meta.pv_inputs_per_mppt ?? meta.mppt_input_counts;
  let inputCounts = normalizeCounts(rawCounts, mpptCount);
  const uniform = readNumber(product, meta, ['strings_per_mppt', 'pv_inputs_each_mppt', 'inputs_per_mppt'], 0);
  if (!inputCounts && uniform) inputCounts = Array.from({ length: mpptCount }, () => uniform);
  const total = readNumber(product, meta, ['pv_input_count', 'total_pv_inputs', 'string_input_count'], 0);
  if (!inputCounts && total) {
    const base = Math.floor(total / mpptCount);
    const remainder = total % mpptCount;
    inputCounts = Array.from({ length: mpptCount }, (_, index) => Math.max(1, base + (index < remainder ? 1 : 0)));
  }
  if (!inputCounts) inputCounts = Array.from({ length: mpptCount }, () => 1);
  return {
    mpptCount,
    inputCounts,
    totalInputs: inputCounts.reduce((sum, value) => sum + value, 0),
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

function slotsForConfigs(configs, products) {
  const many = configs.length > 1;
  const slots = [];
  configs.forEach((config, configIndex) => {
    const product = products.find(item => String(item.id) === String(config.productId)) || config.productSnapshot || null;
    if (!product) return;
    const spec = inverterSpec(product);
    let globalPv = 1;
    spec.inputCounts.forEach((inputCount, mpptIndex) => {
      for (let inputIndex = 0; inputIndex < inputCount; inputIndex += 1) {
        const mppt = mpptIndex + 1;
        const pvInput = globalPv;
        slots.push({
          key: `${config.id}:${mppt}:${pvInput}`,
          inverterConfigId: config.id,
          mppt,
          pvInput,
          inputWithinMppt: inputIndex + 1,
          name: `${many ? `${config.name} · ` : ''}MPPT ${mppt} · PV ${pvInput}`,
          color: COLORS[slots.length % COLORS.length],
          configIndex,
        });
        globalPv += 1;
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

function initialData(project) {
  const server = safeJson(project?.string_layout_data, {});
  let local = {};
  if (typeof window !== 'undefined' && project?.id) local = safeJson(window.localStorage.getItem(localKey(project.id)), {});
  const serverTime = new Date(server.savedAt || 0).getTime() || 0;
  const localTime = new Date(local.savedAt || 0).getTime() || 0;
  return localTime > serverTime ? local : server;
}

function buildPayload(base, configs, strings) {
  return {
    ...base,
    version: 64,
    source: 'inverter-selector-inside-settings',
    inverterConfigs: configs,
    inverterProductId: configs[0]?.productId || '',
    inverterProductSnapshot: configs[0]?.productSnapshot || null,
    stringCount: strings.length,
    strings,
    savedAt: new Date().toISOString(),
  };
}

function SettingsPortal({ rootRef, children }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const sync = () => {
      const inspector = root.querySelector('aside[class*="w-[310px]"]');
      const list = inspector?.querySelector(':scope > div.space-y-3');
      if (!list) {
        setTarget(current => current?.isConnected ? current : null);
        return;
      }

      let host = list.querySelector(':scope > [data-inverter-settings-host="true"]');
      if (!host) {
        host = document.createElement('div');
        host.dataset.inverterSettingsHost = 'true';
        list.prepend(host);
      }
      setTarget(current => current === host ? current : host);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      root.querySelector('[data-inverter-settings-host="true"]')?.remove();
    };
  }, [rootRef]);

  return target ? createPortal(children, target) : null;
}

export default function StringMarkingEntryIntegrated({ project, onUpdate, ...rest }) {
  const rootRef = useRef(null);
  const original = useMemo(() => initialData(project), [project?.id, project?.string_layout_data]);
  const initialConfigs = useMemo(() => {
    const source = Array.isArray(original.inverterConfigs) && original.inverterConfigs.length
      ? original.inverterConfigs
      : [{ id: 'default-inverter', name: 'Växelriktare 1', productId: original.inverterProductId || '', productSnapshot: original.inverterProductSnapshot || null }];
    return source.map((config, index) => createConfig(index, config));
  }, [project?.id]);
  const [configs, setConfigs] = useState(initialConfigs);
  const [activeConfigId, setActiveConfigId] = useState(initialConfigs[0]?.id || '');
  const [data, setData] = useState(original);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['products-inverters-string-entry'],
    queryFn: () => filterVisibleProducts({ category: 'vaxelriktare' }),
  });
  const inverters = products.filter(product => product.is_active !== false);
  const activeConfig = configs.find(config => config.id === activeConfigId) || configs[0];
  const activeProduct = inverters.find(product => String(product.id) === String(activeConfig?.productId)) || activeConfig?.productSnapshot || null;
  const spec = inverterSpec(activeProduct);
  const anyProductSelected = configs.some(config => config.productId || config.productSnapshot);

  const savePrepared = async (nextConfigs, sourceData, forceRemount = true) => {
    const slots = slotsForConfigs(nextConfigs, inverters);
    const strings = mergeStrings(sourceData.strings || [], slots);
    const payload = buildPayload(sourceData, nextConfigs, strings);
    setConfigs(nextConfigs);
    setData(payload);
    if (forceRemount) setRevision(value => value + 1);
    if (typeof window !== 'undefined' && project?.id) window.localStorage.setItem(localKey(project.id), JSON.stringify(payload));
    setStatus('Sparar...');
    try {
      await onUpdate?.({ string_layout_data: JSON.stringify(payload) });
      setStatus(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
    } catch {
      setStatus('Lokal backup sparad');
    }
  };

  useEffect(() => {
    if (!inverters.length || !configs.some(config => config.productId || config.productSnapshot)) return;
    const slots = slotsForConfigs(configs, inverters);
    const expected = JSON.stringify(slots.map(slot => [slot.inverterConfigId, slot.mppt, slot.pvInput]));
    const current = JSON.stringify((data.strings || []).map(item => [item.inverterConfigId, Number(item.mppt), Number(item.pvInput)]));
    if (expected !== current) savePrepared(configs, data, true);
  }, [inverters.length]);

  const chooseProduct = productId => {
    const product = inverters.find(item => String(item.id) === String(productId)) || null;
    const next = configs.map(config => config.id === activeConfig.id
      ? { ...config, productId, name: product ? label(product) : config.name, productSnapshot: product || null }
      : config);
    savePrepared(next, data, true);
  };

  const addInverter = () => {
    const config = createConfig(configs.length);
    const next = [...configs, config];
    setConfigs(next);
    setActiveConfigId(config.id);
    savePrepared(next, data, true);
  };

  const removeInverter = () => {
    if (configs.length <= 1) return;
    const next = configs.filter(config => config.id !== activeConfig.id);
    setActiveConfigId(next[0]?.id || '');
    savePrepared(next, data, true);
  };

  const childUpdate = async patch => {
    if (patch?.string_layout_data !== undefined) {
      const incoming = safeJson(patch.string_layout_data, {});
      const slots = slotsForConfigs(configs, inverters);
      const strings = mergeStrings(incoming.strings || data.strings || [], slots);
      const payload = buildPayload({ ...data, ...incoming }, configs, strings);
      setData(payload);
      if (typeof window !== 'undefined' && project?.id) window.localStorage.setItem(localKey(project.id), JSON.stringify(payload));
      return onUpdate?.({ ...patch, string_layout_data: JSON.stringify(payload) });
    }
    return onUpdate?.(patch);
  };

  const preparedProject = { ...project, string_layout_data: JSON.stringify(data) };
  const inverterSettings = (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Zap className="h-4 w-4 text-orange-500" />Växelriktare</div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={addInverter} title="Lägg till växelriktare"><Plus className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={removeInverter} disabled={configs.length <= 1} title="Ta bort växelriktare"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {configs.length > 1 && <div className="mb-2 flex gap-1 overflow-x-auto">{configs.map((config, index) => <button type="button" key={config.id} onClick={() => setActiveConfigId(config.id)} className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold ${config.id === activeConfig?.id ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500'}`}>{index + 1}</button>)}</div>}
      <select value={activeConfig?.productId || ''} onChange={event => chooseProduct(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
        <option value="">Välj växelriktare</option>
        {inverters.map(product => <option key={product.id} value={product.id}>{label(product)}</option>)}
      </select>
      {activeProduct && <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${spec.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <div className="font-semibold">{spec.mpptCount} MPPT · {spec.totalInputs} PV-ingångar</div>
        <div className="mt-1">{spec.inputCounts.map((count, index) => `MPPT ${index + 1}: ${count} PV`).join(' · ')}</div>
        {!spec.complete && <div className="mt-1 flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Produktens MPPT/PV-data är ofullständig. Kontrollera produkten i Produktsortimentet.</div>}
      </div>}
      {!activeProduct && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">Välj en växelriktare. Därefter skapas MPPT och PV-ingångar automatiskt.</div>}
      {status && <div className="mt-1 text-[10px] text-slate-500">{status}</div>}
    </section>
  );

  return (
    <div ref={rootRef} className={`string-inverter-entry relative left-1/2 w-[calc(100vw-2rem)] max-w-[1800px] -translate-x-1/2 ${anyProductSelected ? 'has-inverter-selected' : 'no-inverter-selected'}`}>
      <style>{`
        .string-inverter-entry aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(2)>div:first-child>div:first-child{font-size:0}
        .string-inverter-entry aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(2)>div:first-child>div:first-child:after{content:'MPPT och PV-ingångar';font-size:.875rem}
        .string-inverter-entry aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(2)>div:nth-child(2)>div:first-child{display:none}
        .string-inverter-entry aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(3)>div:first-child>div:first-child{font-size:0}
        .string-inverter-entry aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(3)>div:first-child>div:first-child:after{content:'Vald PV-ingång';font-size:.875rem}
        .string-inverter-entry aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(3)>div:nth-child(2)>div.space-y-2>:nth-child(1),
        .string-inverter-entry aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(3)>div:nth-child(2)>div.space-y-2>:nth-child(2){display:none}
        .string-inverter-entry.no-inverter-selected aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(2),
        .string-inverter-entry.no-inverter-selected aside[class*="w-[310px]"]>div.space-y-3>section:nth-of-type(3){display:none}
      `}</style>

      <StringMarkingCanvasWorkspace key={`${project?.id}-${revision}`} project={preparedProject} onUpdate={childUpdate} {...rest} />
      <SettingsPortal rootRef={rootRef}>{inverterSettings}</SettingsPortal>
    </div>
  );
}
