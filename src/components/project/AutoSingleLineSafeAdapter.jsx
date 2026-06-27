import React, { useMemo } from 'react';
import AutoSingleLineSchemaView from './AutoSingleLineSchemaView.jsx';
import { normalizeStringProductContext } from '@/lib/stringProductContext';

const asArray = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
const asRecord = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, fallback = '') => typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function parseObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return asRecord(JSON.parse(raw || '{}'));
  } catch {
    return {};
  }
}

function product(value) {
  const source = asRecord(value);
  return {
    ...source,
    id: source.id ?? source.product_id ?? '',
    product_id: source.product_id ?? source.id ?? '',
    name: text(source.name, 'Produkt'),
    brand: text(source.brand),
    model: text(source.model),
  };
}

function sanitize(projectValue, productValues) {
  const products = asArray(productValues).map(product).filter(item => item.id || item.product_id || item.name);
  const data = parseObject(projectValue?.string_layout_data);
  const inverterConfigs = asArray(data.inverterConfigs).map((value, index) => {
    const source = asRecord(value);
    return {
      ...source,
      id: text(source.id, `inverter-${index + 1}`),
      name: text(source.name, `Växelriktare ${index + 1}`),
      productId: text(source.productId ?? source.product_id ?? source.productSnapshot?.id ?? source.productSnapshot?.product_id),
      productSnapshot: source.productSnapshot ? product(source.productSnapshot) : null,
    };
  });
  const strings = asArray(data.strings).map((value, index) => {
    const source = asRecord(value);
    return {
      ...source,
      id: text(source.id, `string-${index + 1}`),
      name: text(source.name, `Slinga ${index + 1}`),
      inverterConfigId: text(source.inverterConfigId ?? source.inverter_config_id),
      panelProductId: text(source.panelProductId ?? source.panel_product_id),
      panelProductSnapshot: source.panelProductSnapshot ? product(source.panelProductSnapshot) : null,
      panel_count: Math.max(0, number(source.panel_count ?? source.panelCount, 0)),
      mppt: Math.max(1, number(source.mppt, 1)),
      pvInput: text(source.pvInput ?? source.pv_input),
      nodes: asArray(source.nodes).map(nodeValue => {
        const node = asRecord(nodeValue);
        return { ...node, panelId: text(node.panelId ?? node.panel_id ?? node.id) };
      }),
    };
  });

  return {
    products,
    project: {
      ...(projectValue || {}),
      string_layout_data: JSON.stringify({
        ...data,
        inverterConfigs,
        strings,
        inverterProductId: text(data.inverterProductId ?? data.inverter_product_id),
        inverterProductSnapshot: data.inverterProductSnapshot ? product(data.inverterProductSnapshot) : null,
        panelProductId: text(data.panelProductId ?? data.panel_product_id),
        panelProductSnapshot: data.panelProductSnapshot ? product(data.panelProductSnapshot) : null,
        savedAt: text(data.savedAt ?? data.updatedAt),
      }),
    },
  };
}

class SingleLineBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
          <div className="font-semibold">Enlinjeschemat kunde inte visas</div>
          <p className="mt-1 text-sm">Sparad slingdata kunde inte tolkas. Övriga delar av projektet påverkas inte.</p>
          <button type="button" onClick={() => this.setState({ failed: false })} className="mt-3 rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium hover:bg-red-100">Försök igen</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AutoSingleLineSafeAdapter(props) {
  const context = useMemo(() => {
    let normalized = { project: props.project || {}, products: asArray(props.products) };
    try {
      normalized = normalizeStringProductContext(props.project || {}, asArray(props.products));
    } catch {
      normalized = { project: props.project || {}, products: asArray(props.products) };
    }
    return sanitize(normalized.project || props.project || {}, normalized.products || props.products || []);
  }, [props.project?.id, props.project?.string_layout_data, props.project?.solar_roof_planner_data, props.project?.panel_layout_data, props.products]);

  return (
    <SingleLineBoundary key={`${props.project?.id || 'project'}:${context.project.string_layout_data.length}`}>
      <AutoSingleLineSchemaView {...props} project={context.project} products={context.products} />
    </SingleLineBoundary>
  );
}
