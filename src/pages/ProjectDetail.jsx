import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { listVisibleProducts } from '@/lib/tenantQueries';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  Battery,
  Cable,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  Menu,
  Save,
  ShoppingCart,
  Sun,
  Wrench,
} from 'lucide-react';
import SolarDataPanelV2 from '@/components/project/SolarDataPanelV2';
import ProjectPDFExport from '@/components/project/ProjectPDFExportV2.jsx';
import ProjectInfoEditor from '@/components/project/ProjectInfoEditor';
import EmergencyRestorePanel from '@/components/project/EmergencyRestorePanel';
import StringMarkingTabV7 from '@/components/project/StringMarkingTabV7';
import InverterFullSummary from '@/components/project/InverterFullSummary';
import AutoSingleLineSchemaTab from '@/components/project/AutoSingleLineSchemaTab';
import BatteryTab from '@/components/project/BatteryTab';
import ProductSelectionTab from '@/components/project/ProductSelectionTab.jsx';
import ProjectDocumentsTab from '@/components/project/ProjectDocumentsTab.jsx';
import MountingSystemCalculator from '@/components/project/MountingSystemCalculator';
import PanelMountingSystemSelector from '@/components/project/PanelMountingSystemSelector';
import SolarRoofPlannerV2 from '@/components/project/SolarRoofPlannerV2';
import { fetchProjectById, mergeProjectWithBackup, saveProjectPatch, writeProjectBackup } from '@/lib/projectPersistence';
import { productQualityIssues, productQualityStatus, selectedProductQualityInput } from '@/lib/productQuality';
import { mergeProjectAutoProducts } from '@/lib/projectAutoProducts';

const statusLabels = { planering: 'Planering', projektering: 'Projektering', offert: 'Offert', installation: 'Installation', klart: 'Klart' };
const statusColors = { planering: 'bg-blue-100 text-blue-700', projektering: 'bg-amber-100 text-amber-700', offert: 'bg-purple-100 text-purple-700', installation: 'bg-orange-100 text-orange-700', klart: 'bg-green-100 text-green-700' };

const PROJECT_SAVE_FIELDS = [
  'name',
  'customer_name',
  'address',
  'status',
  'roof_width_m',
  'roof_height_m',
  'roof_image_url',
  'panel_layout_data',
  'solar_roof_planner_data',
  'existing_installation_image_url',
  'string_layout_data',
  'battery_image_url',
  'battery_layout_data',
  'mounting_data',
  'solar_data',
  'selected_products',
  'total_cost',
  'notes',
];

function buildFullProjectSavePatch(project) {
  if (!project) return {};
  return PROJECT_SAVE_FIELDS.reduce((patch, field) => {
    if (project[field] !== undefined) patch[field] = project[field];
    return patch;
  }, {});
}

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function productById(products, id) {
  return products.find(product => String(product.id) === String(id)) || null;
}

function productIsActive(product = {}) {
  const status = String(product.status || product.state || '').toLowerCase();
  return !product.deleted && !product.archived && !product.is_deleted && !product.removed && !['deleted', 'archived', 'inactive', 'removed'].includes(status);
}

function issueText(issues = []) {
  if (!issues.length) return '';
  if (issues.length <= 2) return issues.join(' • ');
  return `${issues.slice(0, 2).join(' • ')} • +${issues.length - 2} till`;
}

function pushProjectProductEntry(list, entry) {
  const key = entry.product_id || entry.product_snapshot?.product_id || entry.product_snapshot?.id;
  if (!key || !entry.sourceProduct) return;
  const exists = list.some(item => String(item.key) === String(key));
  if (!exists) list.push({ ...entry, key });
}

function collectProjectProductEntries(project = {}, products = []) {
  const activeProducts = products.filter(productIsActive);
  const entries = [];

  (Array.isArray(project?.selected_products) ? project.selected_products : []).forEach(item => {
    const sourceProduct = productById(activeProducts, item.product_id);
    if (!sourceProduct && item.auto_generated) return;
    if (!sourceProduct) return;
    pushProjectProductEntry(entries, {
      source: 'Produktfliken',
      sourceProduct,
      name: item.product_name || item.product_snapshot?.name || sourceProduct.name || 'Produkt',
      product_id: item.product_id,
      qualityInput: selectedProductQualityInput(item, sourceProduct),
    });
  });

  const planner = safeJson(project?.solar_roof_planner_data || project?.panel_layout_data, null);
  (planner?.roofs || []).forEach(roof => {
    const productId = roof.panelProductId || roof.panelProductSnapshot?.product_id || roof.panelProductSnapshot?.id;
    const sourceProduct = productById(activeProducts, productId);
    if (!sourceProduct) return;
    const snapshot = roof.panelProductSnapshot || {};
    pushProjectProductEntry(entries, {
      source: `Paneler / ${roof.name || 'Tak'}`,
      sourceProduct,
      name: snapshot.name || sourceProduct.name || 'Panelprodukt',
      product_id: productId,
      product_snapshot: snapshot,
      qualityInput: selectedProductQualityInput({
        product_id: productId,
        product_name: snapshot.name || sourceProduct.name,
        product_snapshot: snapshot,
        documents_snapshot: snapshot.documents_snapshot,
        technical_snapshot: snapshot.technical_data_snapshot,
      }, sourceProduct),
    });
  });

  (planner?.roofs || []).forEach(roof => {
    const productId = roof.mountingSystemProductId || roof.mountingSystemProductSnapshot?.product_id || roof.mountingSystemProductSnapshot?.id;
    const sourceProduct = productById(activeProducts, productId);
    if (!sourceProduct) return;
    const snapshot = roof.mountingSystemProductSnapshot || {};
    pushProjectProductEntry(entries, {
      source: `Paneler / Montage / ${roof.name || 'Tak'}`,
      sourceProduct,
      name: snapshot.name || sourceProduct.name || 'Montagesystem',
      product_id: productId,
      product_snapshot: snapshot,
      qualityInput: selectedProductQualityInput({
        product_id: productId,
        product_name: snapshot.name || sourceProduct.name,
        product_snapshot: snapshot,
        documents_snapshot: snapshot.documents_snapshot,
        technical_snapshot: snapshot.technical_data_snapshot,
      }, sourceProduct),
    });
  });

  const stringData = safeJson(project?.string_layout_data, null);
  (stringData?.inverterConfigs || []).forEach((item, index) => {
    const productId = item.productId || item.productSnapshot?.product_id || item.productSnapshot?.id;
    const sourceProduct = productById(activeProducts, productId);
    if (!sourceProduct) return;
    const snapshot = item.productSnapshot || {};
    pushProjectProductEntry(entries, {
      source: `Slingor / ${item.name || `Växelriktare ${index + 1}`}`,
      sourceProduct,
      name: snapshot.name || sourceProduct.name || item.name || `Växelriktare ${index + 1}`,
      product_id: productId,
      product_snapshot: snapshot,
      qualityInput: selectedProductQualityInput({
        product_id: productId,
        product_name: snapshot.name || sourceProduct.name,
        product_snapshot: snapshot,
        documents_snapshot: snapshot.documents_snapshot,
        technical_snapshot: snapshot.technical_data_snapshot,
      }, sourceProduct),
    });
  });

  const mounting = safeJson(project?.mounting_data, null);
  if (mounting?.selectedPanelId) {
    const sourceProduct = productById(activeProducts, mounting.selectedPanelId);
    if (sourceProduct) {
      const snapshot = mounting.selectedPanelSnapshot || {};
      pushProjectProductEntry(entries, {
        source: 'Montage',
        sourceProduct,
        name: snapshot.name || sourceProduct.name || mounting.selectedPanelName || 'Panelprodukt',
        product_id: mounting.selectedPanelId || snapshot.product_id || snapshot.id,
        product_snapshot: snapshot,
        qualityInput: selectedProductQualityInput({
          product_id: mounting.selectedPanelId || snapshot.product_id || snapshot.id,
          product_name: snapshot.name || sourceProduct.name || mounting.selectedPanelName,
          product_snapshot: snapshot,
          documents_snapshot: snapshot.documents_snapshot,
          technical_snapshot: snapshot.technical_data_snapshot,
        }, sourceProduct),
      });
    }
  }

  return entries.map(entry => {
    const status = productQualityStatus(entry.qualityInput || {});
    return { ...entry, status, issues: productQualityIssues(entry.qualityInput || {}) };
  });
}

function ProjectTab({ value, label, icon: Icon, activeTab, compact }) {
  const showLabel = !compact || activeTab === value;
  return (
    <TabsTrigger
      value={value}
      title={label}
      aria-label={label}
      className="h-9 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
    >
      <Icon className="h-4 w-4 shrink-0" />
      {showLabel && <span>{label}</span>}
    </TabsTrigger>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [workingProject, setWorkingProject] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [activeTab, setActiveTab] = useState('panels');
  const [compactTabs, setCompactTabs] = useState(false);

  const { data: products = [] } = useQuery({ queryKey: ['products-all'], queryFn: () => listVisibleProducts() });
  const { data: serverProject, isLoading } = useQuery({ queryKey: ['project', id], queryFn: () => fetchProjectById(base44, id), enabled: !!id });

  useEffect(() => {
    if (!serverProject) return;
    const merged = mergeProjectWithBackup(serverProject);
    setWorkingProject(merged);
    writeProjectBackup(merged);
  }, [serverProject?.id, serverProject?.updated_date, serverProject?.updated_at, serverProject?.panel_layout_data, serverProject?.string_layout_data, serverProject?.battery_layout_data, serverProject?.mounting_data, serverProject?.solar_data, serverProject?.selected_products, serverProject?.total_cost, serverProject?.notes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCompactTabs(window.localStorage.getItem('solarplan:compact-project-tabs') === '1');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('solarplan:compact-project-tabs', compactTabs ? '1' : '0');
  }, [compactTabs]);

  const updateMutation = useMutation({
    mutationFn: data => saveProjectPatch(base44, workingProject || serverProject, data),
    onMutate: async data => {
      setSaveMessage('Sparar...');
      await queryClient.cancelQueries({ queryKey: ['project', id] });
      const previousProject = queryClient.getQueryData(['project', id]);
      const optimistic = { ...(workingProject || previousProject || {}), ...data, id, updated_date: new Date().toISOString() };
      setWorkingProject(optimistic);
      writeProjectBackup(optimistic);
      queryClient.setQueryData(['project', id], optimistic);
      return { previousProject };
    },
    onError: error => setSaveMessage(error?.message || 'Kunde inte spara till servern. Lokal backup är kvar.'),
    onSuccess: updatedProject => {
      const merged = mergeProjectWithBackup(updatedProject);
      setWorkingProject(merged);
      writeProjectBackup(merged);
      queryClient.setQueryData(['project', id], merged);
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setSaveMessage(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
    },
  });

  const project = workingProject || mergeProjectWithBackup(serverProject);
  const saveProject = data => {
    const baseProject = project || workingProject || mergeProjectWithBackup(serverProject) || {};
    const projectWithPatch = { ...baseProject, ...(data || {}) };
    const syncedProject = mergeProjectAutoProducts(projectWithPatch, products);
    return updateMutation.mutateAsync({ ...(data || {}), selected_products: syncedProject.selected_products, total_cost: syncedProject.total_cost });
  };
  const saveEntireProject = () => saveProject(buildFullProjectSavePatch(project));
  const projectProductQuality = collectProjectProductEntries(project, products);
  const incompleteProjectProducts = projectProductQuality.filter(item => !item.status.complete);
  const hasIncompleteProjectProducts = incompleteProjectProducts.length > 0;

  const selectedPanelProduct = (() => {
    try {
      const planner = JSON.parse(project?.solar_roof_planner_data || project?.panel_layout_data || '{}');
      const pid = planner?.roofs?.find(roof => roof.panelProductId)?.panelProductId;
      if (pid) return products.find(product => product.id === pid) || null;
    } catch {}
    return products.find(product => project?.selected_products?.some(selectedProduct => selectedProduct.product_id === product.id) && product.category === 'solpanel') || null;
  })();

  if (isLoading && !project) return <div className="p-6 lg:p-10 flex items-center justify-center min-h-[50vh]"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  if (!project) return <div className="p-6 lg:p-10 text-center"><p className="text-muted-foreground">Projektet hittades inte</p><Link to="/projects"><Button variant="outline" className="mt-4">Tillbaka</Button></Link></div>;

  return (
    <div className={`mx-auto space-y-4 p-3 lg:p-5 ${activeTab === 'panels' ? 'max-w-[1800px]' : 'max-w-7xl'}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/projects" className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Tillbaka</Link>
          <div className="flex items-center gap-3"><h1 className="text-2xl font-bold">{project.name}</h1><Badge className={statusColors[project.status]}>{statusLabels[project.status]}</Badge></div>
          {project.customer_name && <p className="mt-1 text-muted-foreground">{project.customer_name} {project.address ? `• ${project.address}` : ''}</p>}
          {saveMessage && <p className="mt-2 text-xs text-muted-foreground">{saveMessage}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={saveEntireProject} disabled={updateMutation.isPending} className="gap-2"><Save className="h-4 w-4" />{updateMutation.isPending ? 'Sparar...' : 'Spara allt'}</Button>
          {project.status === 'projektering' && <Button onClick={() => updateMutation.mutate({ status: 'offert' })} disabled={hasIncompleteProjectProducts} title={hasIncompleteProjectProducts ? 'Projektet har ofullständiga produkter och kan inte skickas som offert ännu.' : ''} className="gap-2 bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">Skicka som offert</Button>}
          <ProjectPDFExport project={project} products={products} activeTab={activeTab} onSelectTab={setActiveTab} onBeforeExport={saveEntireProject} />
        </div>
      </div>

      {hasIncompleteProjectProducts && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Projektet innehåller {incompleteProjectProducts.length} ofullständig(a) produkt(er)</p>
              <p className="mt-1 text-sm">Gå till Produkter eller Dokument och uppdatera/fixa produkterna innan projektet skickas som offert.</p>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                {incompleteProjectProducts.slice(0, 6).map(item => (
                  <div key={`${item.key}-${item.source}`} className="rounded-xl bg-white/70 px-3 py-2">
                    <div className="font-medium text-amber-950">{item.name}</div>
                    <div className="text-amber-800">{issueText(item.issues)}</div>
                    <div className="text-amber-700">Källa: {item.source}</div>
                  </div>
                ))}
              </div>
              {incompleteProjectProducts.length > 6 && <p className="mt-2 text-xs">+{incompleteProjectProducts.length - 6} ytterligare produkter behöver kontrolleras.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ProjectInfoEditor project={project} onUpdate={saveProject} isSaving={updateMutation.isPending} />
        <EmergencyRestorePanel project={project} onRestore={saveProject} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <TabsList className="inline-flex h-11 min-w-max justify-start gap-0.5 rounded-xl bg-slate-100 p-1">
              <ProjectTab value="panels" label="Paneler" icon={Sun} activeTab={activeTab} compact={compactTabs} />
              <ProjectTab value="strings" label="Slingor" icon={Cable} activeTab={activeTab} compact={compactTabs} />
              <ProjectTab value="battery" label="Batteri" icon={Battery} activeTab={activeTab} compact={compactTabs} />
              <ProjectTab value="products" label="Produkter" icon={ShoppingCart} activeTab={activeTab} compact={compactTabs} />
              <ProjectTab value="solar" label="Soldata" icon={BarChart2} activeTab={activeTab} compact={compactTabs} />
              <ProjectTab value="singleline" label="Enlinje" icon={GitBranch} activeTab={activeTab} compact={compactTabs} />
              <ProjectTab value="mounting" label="Montage" icon={Wrench} activeTab={activeTab} compact={compactTabs} />
              <ProjectTab value="documents" label="Dokument" icon={FileText} activeTab={activeTab} compact={compactTabs} />
            </TabsList>
          </div>
          <button
            type="button"
            title={compactTabs ? 'Visa namn i projektmenyn' : 'Visa endast ikoner i projektmenyn'}
            aria-label={compactTabs ? 'Visa namn i projektmenyn' : 'Visa endast ikoner i projektmenyn'}
            onClick={() => setCompactTabs(current => !current)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
          >
            {compactTabs ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <Menu className="hidden h-4 w-4 text-slate-300 sm:block" />
        </div>

        <TabsContent value="panels" className="mt-0" data-project-pdf-section="panels"><SolarRoofPlannerV2 project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="strings" className="mt-0 space-y-4" data-project-pdf-section="strings"><StringMarkingTabV7 project={project} onUpdate={saveProject} selectedProduct={selectedPanelProduct} /><InverterFullSummary project={project} products={products} /></TabsContent>
        <TabsContent value="battery" className="mt-0" data-project-pdf-section="battery"><BatteryTab project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="products" className="mt-0" data-project-pdf-section="products"><ProductSelectionTab project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="solar" className="mt-0" data-project-pdf-section="solar"><SolarDataPanelV2 project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="singleline" className="mt-0" data-project-pdf-section="singleline"><AutoSingleLineSchemaTab project={project} onUpdate={saveProject} products={products} /></TabsContent>
        <TabsContent value="mounting" className="mt-0 space-y-4" data-project-pdf-section="mounting"><PanelMountingSystemSelector project={project} onUpdate={saveProject} /><SolarRoofPlannerV2 project={project} onUpdate={saveProject} /><MountingSystemCalculator project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="documents" className="mt-0" data-project-pdf-section="documents"><ProjectDocumentsTab project={project} products={products} onUpdate={saveProject} /></TabsContent>
      </Tabs>
    </div>
  );
}
