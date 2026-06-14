import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Sun, Cable, Battery, ShoppingCart, BarChart2, Wrench, GitBranch, Save, FileText, AlertTriangle } from 'lucide-react';
import SolarDataPanelV2 from '@/components/project/SolarDataPanelV2';
import ProjectPDFExport from '@/components/project/ProjectPDFExport';
import ProjectInfoEditor from '@/components/project/ProjectInfoEditor';
import EmergencyRestorePanel from '@/components/project/EmergencyRestorePanel';
import StringMarkingTabV7 from '@/components/project/StringMarkingTabV7';
import InverterFullSummary from '@/components/project/InverterFullSummary';
import AutoSingleLineSchemaTab from '@/components/project/AutoSingleLineSchemaTab';
import BatteryTab from '@/components/project/BatteryTab';
import ProductSelectionTab from '@/components/project/ProductSelectionTab.jsx';
import ProjectDocumentsTab from '@/components/project/ProjectDocumentsTab.jsx';
import MountingSystemCalculator from '@/components/project/MountingSystemCalculator';
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

export default function ProjectDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [workingProject, setWorkingProject] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

  const { data: products = [] } = useQuery({ queryKey: ['products-all'], queryFn: () => base44.entities.Product.list() });
  const { data: serverProject, isLoading } = useQuery({ queryKey: ['project', id], queryFn: () => fetchProjectById(base44, id), enabled: !!id });

  useEffect(() => {
    if (!serverProject) return;
    const merged = mergeProjectWithBackup(serverProject);
    setWorkingProject(merged);
    writeProjectBackup(merged);
  }, [serverProject?.id, serverProject?.updated_date, serverProject?.updated_at, serverProject?.panel_layout_data, serverProject?.string_layout_data, serverProject?.battery_layout_data, serverProject?.mounting_data, serverProject?.solar_data, serverProject?.selected_products, serverProject?.total_cost, serverProject?.notes]);

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
      if (pid) return products.find(p => p.id === pid) || null;
    } catch {}
    return products.find(p => project?.selected_products?.some(sp => sp.product_id === p.id) && p.category === 'solpanel') || null;
  })();

  if (isLoading && !project) return <div className="p-6 lg:p-10 flex items-center justify-center min-h-[50vh]"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  if (!project) return <div className="p-6 lg:p-10 text-center"><p className="text-muted-foreground">Projektet hittades inte</p><Link to="/projects"><Button variant="outline" className="mt-4">Tillbaka</Button></Link></div>;

  return <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"><ArrowLeft className="w-4 h-4" /> Tillbaka</Link>
        <div className="flex items-center gap-3"><h1 className="text-2xl font-bold">{project.name}</h1><Badge className={statusColors[project.status]}>{statusLabels[project.status]}</Badge></div>
        {project.customer_name && <p className="text-muted-foreground mt-1">{project.customer_name} {project.address ? `• ${project.address}` : ''}</p>}
        {saveMessage && <p className="mt-2 text-xs text-muted-foreground">{saveMessage}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={saveEntireProject} disabled={updateMutation.isPending} className="gap-2"><Save className="w-4 h-4" />{updateMutation.isPending ? 'Sparar...' : 'Spara allt'}</Button>
        {project.status === 'projektering' && <Button onClick={() => updateMutation.mutate({ status: 'offert' })} disabled={hasIncompleteProjectProducts} title={hasIncompleteProjectProducts ? 'Projektet har ofullständiga produkter och kan inte skickas som offert ännu.' : ''} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50">Skicka som offert</Button>}
        <ProjectPDFExport project={project} products={products} />
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

    <ProjectInfoEditor project={project} onUpdate={saveProject} isSaving={updateMutation.isPending} />
    <EmergencyRestorePanel project={project} onRestore={saveProject} />

    <Tabs defaultValue="panels" className="space-y-4">
      <TabsList className="grid grid-cols-8 w-full max-w-4xl">
        <TabsTrigger value="panels" className="gap-1.5 text-xs sm:text-sm"><Sun className="w-4 h-4" /> <span className="hidden sm:inline">Paneler</span></TabsTrigger>
        <TabsTrigger value="strings" className="gap-1.5 text-xs sm:text-sm"><Cable className="w-4 h-4" /> <span className="hidden sm:inline">Slingor</span></TabsTrigger>
        <TabsTrigger value="battery" className="gap-1.5 text-xs sm:text-sm"><Battery className="w-4 h-4" /> <span className="hidden sm:inline">Batteri</span></TabsTrigger>
        <TabsTrigger value="products" className="gap-1.5 text-xs sm:text-sm"><ShoppingCart className="w-4 h-4" /> <span className="hidden sm:inline">Produkter</span></TabsTrigger>
        <TabsTrigger value="solar" className="gap-1.5 text-xs sm:text-sm"><BarChart2 className="w-4 h-4" /> <span className="hidden sm:inline">Soldata</span></TabsTrigger>
        <TabsTrigger value="singleline" className="gap-1.5 text-xs sm:text-sm"><GitBranch className="w-4 h-4" /> <span className="hidden sm:inline">Enlinje</span></TabsTrigger>
        <TabsTrigger value="mounting" className="gap-1.5 text-xs sm:text-sm"><Wrench className="w-4 h-4" /> <span className="hidden sm:inline">Montage</span></TabsTrigger>
        <TabsTrigger value="documents" className="gap-1.5 text-xs sm:text-sm"><FileText className="w-4 h-4" /> <span className="hidden sm:inline">Dokument</span></TabsTrigger>
      </TabsList>
      <TabsContent value="panels"><SolarRoofPlannerV2 project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="strings" className="space-y-4"><StringMarkingTabV7 project={project} onUpdate={saveProject} selectedProduct={selectedPanelProduct} /><InverterFullSummary project={project} products={products} /></TabsContent>
      <TabsContent value="battery"><BatteryTab project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="products"><ProductSelectionTab project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="solar"><SolarDataPanelV2 project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="singleline"><AutoSingleLineSchemaTab project={project} onUpdate={saveProject} products={products} /></TabsContent>
      <TabsContent value="mounting" className="space-y-4"><SolarRoofPlannerV2 project={project} onUpdate={saveProject} /><MountingSystemCalculator project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="documents"><ProjectDocumentsTab project={project} products={products} onUpdate={saveProject} /></TabsContent>
    </Tabs>
  </div>;
}
