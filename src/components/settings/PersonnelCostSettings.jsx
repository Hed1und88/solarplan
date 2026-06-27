import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Loader2, Plus, Trash2, UsersRound } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveAccessContext } from '@/lib/accessControl';
import { useCompanySession } from '@/lib/CompanySessionContext';

const INPUT = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60';
const DEFAULT_HOURLY_COSTS = [
  { id: 'solar-installer', name: 'Solcellsmontör', price: '' },
  { id: 'electrician', name: 'Elektriker', price: '' },
  { id: 'subcontractor', name: 'UE', price: '' },
];
const DEFAULT_MOUNTING_COSTS = [
  { id: 'solar-mounting', name: 'Solcellsmontage', price: '' },
  { id: 'battery-mounting', name: 'Batterimontage', price: '' },
];

const cloneRows = rows => rows.map(row => ({ ...row }));
const createRowId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const exampleHourlyPrice = name => ({ Solcellsmontör: '600', Elektriker: '900', UE: '650' }[name] || '0');

function normalizeRows(rows, prefix) {
  if (!Array.isArray(rows)) return null;
  return rows.map((row, index) => ({
    id: String(row?.id || `${prefix}-${index}`),
    name: String(row?.name || ''),
    price: row?.price ?? '',
  }));
}

function readCosts(company) {
  if (!company?.personnel_costs_json) {
    return {
      hourly: cloneRows(DEFAULT_HOURLY_COSTS),
      mounting: cloneRows(DEFAULT_MOUNTING_COSTS),
    };
  }

  try {
    const parsed = JSON.parse(company.personnel_costs_json);
    return {
      hourly: normalizeRows(parsed?.hourly, 'hourly') ?? cloneRows(DEFAULT_HOURLY_COSTS),
      mounting: normalizeRows(parsed?.mounting, 'mounting') ?? cloneRows(DEFAULT_MOUNTING_COSTS),
    };
  } catch {
    return {
      hourly: cloneRows(DEFAULT_HOURLY_COSTS),
      mounting: cloneRows(DEFAULT_MOUNTING_COSTS),
    };
  }
}

function prepareRows(rows, rowType) {
  const prepared = [];

  for (const row of rows) {
    const name = String(row.name || '').trim();
    const rawPrice = String(row.price ?? '').trim().replace(',', '.');
    if (!rawPrice) continue;
    if (!name) throw new Error(`Ange namn på ${rowType}.`);

    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Ange ett giltigt pris för ${name}.`);
    }

    prepared.push({
      id: String(row.id || createRowId(rowType)),
      name,
      price,
    });
  }

  return prepared;
}

function findSettingsRoot() {
  const heading = Array.from(document.querySelectorAll('h1')).find(element => (element.textContent || '').trim() === 'Inställningar');
  return heading?.closest('.mx-auto') || null;
}

function createPersonnelCostHost(root) {
  let host = root.querySelector(':scope > [data-settings-personnel-cost-host]');
  if (host) return host;

  host = document.createElement('div');
  host.dataset.settingsPersonnelCostHost = 'true';

  const restoreHost = root.querySelector(':scope > [data-settings-restore-host]');
  const accountCard = Array.from(root.children).find(element => {
    const text = element.textContent || '';
    return text.includes('Konto') && text.includes('Logga ut');
  });

  root.insertBefore(host, restoreHost || accountCard || null);
  return host;
}

function CostRows({ rows, unit, canEdit, onChange, onAdd, onRemove, addLabel }) {
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Inga priser har lagts till.
        </div>
      ) : rows.map(row => (
        <div key={row.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_40px] sm:items-center">
          <input
            className={INPUT}
            value={row.name}
            disabled={!canEdit}
            onChange={event => onChange(row.id, 'name', event.target.value)}
            placeholder={unit === 'kr/timme' ? 'Yrkesroll eller UE' : 'Typ av montage'}
            aria-label="Namn"
          />
          <div className="relative">
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              className={`${INPUT} pr-24`}
              value={row.price}
              disabled={!canEdit}
              onChange={event => onChange(row.id, 'price', event.target.value)}
              placeholder={unit === 'kr/timme' ? exampleHourlyPrice(row.name) : '0'}
              aria-label={`Pris i ${unit}`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{unit}</span>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-red-600 hover:bg-red-50"
              title="Ta bort raden"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : <span />}
        </div>
      ))}

      {canEdit && (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onAdd}>
          <Plus className="h-4 w-4" />{addLabel}
        </Button>
      )}
    </div>
  );
}

function PersonnelCostSettingsSection() {
  const { user } = useCompanySession();
  const access = resolveAccessContext(user || {});
  const canEdit = access.isSuperadmin || access.isCompanyAdmin;
  const ownCompanyId = user?.company_id || '';

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [hourlyCosts, setHourlyCosts] = useState(cloneRows(DEFAULT_HOURLY_COSTS));
  const [mountingCosts, setMountingCosts] = useState(cloneRows(DEFAULT_MOUNTING_COSTS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadCompanies = async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await base44.entities.Company.list('name');
        const visibleCompanies = access.isSuperadmin
          ? (rows || [])
          : (rows || []).filter(company => String(company.id) === String(ownCompanyId));
        if (cancelled) return;
        setCompanies(visibleCompanies);
        setSelectedCompanyId(current => visibleCompanies.some(company => String(company.id) === String(current))
          ? current
          : visibleCompanies[0]?.id || '');
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Personalkostnaderna kunde inte laddas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCompanies();
    return () => { cancelled = true; };
  }, [ownCompanyId, access.role]);

  const selectedCompany = useMemo(
    () => companies.find(company => String(company.id) === String(selectedCompanyId)) || null,
    [companies, selectedCompanyId],
  );

  useEffect(() => {
    const costs = readCosts(selectedCompany);
    setHourlyCosts(costs.hourly);
    setMountingCosts(costs.mounting);
    setMessage('');
    setError('');
  }, [selectedCompany?.id, selectedCompany?.personnel_costs_json]);

  const updateRow = (setter, id, field, value) => setter(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));
  const removeRow = (setter, id) => setter(current => current.filter(row => row.id !== id));

  const saveCosts = async () => {
    if (!selectedCompany || !canEdit) return;

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = {
        version: 1,
        hourly: prepareRows(hourlyCosts, 'personalkostnaden'),
        mounting: prepareRows(mountingCosts, 'montagepriset'),
      };
      const personnelCostsJson = JSON.stringify(payload);
      const saved = await base44.entities.Company.update(selectedCompany.id, { personnel_costs_json: personnelCostsJson });
      setCompanies(current => current.map(company => String(company.id) === String(selectedCompany.id)
        ? { ...company, ...(saved || {}), personnel_costs_json: personnelCostsJson }
        : company));
      setMessage(`Personal- och montagekostnaderna för ${selectedCompany.name} har sparats.`);
    } catch (saveError) {
      setError(saveError?.message || 'Kostnaderna kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4 text-primary" />Personal Kostnad</CardTitle>
        <p className="text-sm text-muted-foreground">Ange företagets timpriser för personal och UE samt fasta priser för solcells- och batterimontage.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : companies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-medium">Inget företag är kopplat</p>
            <p className="mt-1 text-sm text-muted-foreground">Kostnaderna sparas på företaget och kan därför inte anges innan ett företag finns.</p>
          </div>
        ) : (
          <>
            {companies.length > 1 && (
              <label className="block max-w-md space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Företag</span>
                <select className={INPUT} value={selectedCompanyId} onChange={event => setSelectedCompanyId(event.target.value)}>
                  {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
            )}

            {!canEdit && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Endast företagsadministratör eller superadministratör kan ändra priserna.
              </div>
            )}

            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">Timpris personal och UE</h3>
                <p className="mt-1 text-xs text-muted-foreground">Priset anges i kronor per timme. Exempel: solcellsmontör, elektriker eller underentreprenör.</p>
              </div>
              <CostRows
                rows={hourlyCosts}
                unit="kr/timme"
                canEdit={canEdit}
                onChange={(id, field, value) => updateRow(setHourlyCosts, id, field, value)}
                onRemove={id => removeRow(setHourlyCosts, id)}
                onAdd={() => setHourlyCosts(current => [...current, { id: createRowId('hourly'), name: '', price: '' }])}
                addLabel="Lägg till timpris"
              />
            </section>

            <section className="space-y-3 border-t border-border pt-5">
              <div>
                <h3 className="font-semibold">Fasta montagepriser</h3>
                <p className="mt-1 text-xs text-muted-foreground">Används när företaget tar ett fast pris för exempelvis solcellsmontage eller batterimontage.</p>
              </div>
              <CostRows
                rows={mountingCosts}
                unit="kr fast pris"
                canEdit={canEdit}
                onChange={(id, field, value) => updateRow(setMountingCosts, id, field, value)}
                onRemove={id => removeRow(setMountingCosts, id)}
                onAdd={() => setMountingCosts(current => [...current, { id: createRowId('mounting'), name: '', price: '' }])}
                addLabel="Lägg till montagepris"
              />
            </section>

            {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

            {canEdit && (
              <div className="flex justify-end border-t border-border pt-5">
                <Button onClick={saveCosts} disabled={saving || !selectedCompany}>
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sparar...</> : 'Spara kostnader'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PersonnelCostSettings() {
  const [host, setHost] = useState(null);

  useEffect(() => {
    const attach = () => {
      const root = findSettingsRoot();
      if (!root) return;
      const nextHost = createPersonnelCostHost(root);
      setHost(current => current === nextHost ? current : nextHost);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelectorAll('[data-settings-personnel-cost-host]').forEach(element => element.remove());
    };
  }, []);

  return host ? createPortal(<PersonnelCostSettingsSection />, host) : null;
}
