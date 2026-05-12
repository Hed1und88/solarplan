import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Sun, Cable, Battery, ShoppingCart, BarChart2, Wrench, GitBranch, Save } from 'lucide-react';
import SolarDataPanel from '@/components/project/SolarDataPanel';
import ProjectPDFExport from '@/components/project/ProjectPDFExport';
import StringMarkingTabV6 from '@/components/project/StringMarkingTabV6';
import InverterFullSummary from '@/components/project/InverterFullSummary';
import BatteryTab from '@/components/project/BatteryTab';
import ProductSelectionTab from '@/components/project/ProductSelectionTab.jsx';
import MountingSystemCalculator from '@/components/project/MountingSystemCalculator';
import SolarRoofPlannerV2 from '@/components/project/SolarRoofPlannerV2';
import SingleLineSchemaTab from '@/components/project/SingleLineSchemaTab';
import { fetchProjectById, mergeProjectWithBackup, saveProjectPatch, writeProjectBackup } from '@/lib/projectPersistence';

const statusLabels = { planering: 'Planering', projektering: 'Projektering', offert: 'Offert', installation: 'Installation', klart: 'Klart' };
const statusColors = { planering: 'bg-blue-100 text-blue-700', projektering: 'bg-amber-100 text-amber-700', offert: 'bg-purple-100 text-purple-700', installation: 'bg-orange-100 text-orange-700', klart: 'bg-green-100 text-green-700' };

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
  }, [serverProject?.id, serverProject?.updated_date, serverProject?.updated_at, serverProject?.solar_roof_planner_data, serverProject?.string_layout_data, serverProject?.battery_layout_data]);

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

  const saveProject = data => updateMutation.mutateAsync(data || {});
  const project = workingProject || mergeProjectWithBackup(serverProject);

  const selectedPanelProduct = (() => {
    try {
      const planner = JSON.parse(project?.solar_roof_planner_data || '{}');
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
        <Button onClick={() => saveProject({ notes: project.notes || '' })} disabled={updateMutation.isPending} className="gap-2"><Save className="w-4 h-4" />{updateMutation.isPending ? 'Sparar...' : 'Spara projekt'}</Button>
        {project.status === 'projektering' && <Button onClick={() => updateMutation.mutate({ status: 'offert' })} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">Skicka som offert</Button>}
        <ProjectPDFExport project={project} products={products} />
      </div>
    </div>

    <Tabs defaultValue="panels" className="space-y-4">
      <TabsList className="grid grid-cols-7 w-full max-w-3xl">
        <TabsTrigger value="panels" className="gap-1.5 text-xs sm:text-sm"><Sun className="w-4 h-4" /> <span className="hidden sm:inline">Paneler</span></TabsTrigger>
        <TabsTrigger value="strings" className="gap-1.5 text-xs sm:text-sm"><Cable className="w-4 h-4" /> <span className="hidden sm:inline">Slingor</span></TabsTrigger>
        <TabsTrigger value="battery" className="gap-1.5 text-xs sm:text-sm"><Battery className="w-4 h-4" /> <span className="hidden sm:inline">Batteri</span></TabsTrigger>
        <TabsTrigger value="products" className="gap-1.5 text-xs sm:text-sm"><ShoppingCart className="w-4 h-4" /> <span className="hidden sm:inline">Produkter</span></TabsTrigger>
        <TabsTrigger value="solar" className="gap-1.5 text-xs sm:text-sm"><BarChart2 className="w-4 h-4" /> <span className="hidden sm:inline">Soldata</span></TabsTrigger>
        <TabsTrigger value="singleline" className="gap-1.5 text-xs sm:text-sm"><GitBranch className="w-4 h-4" /> <span className="hidden sm:inline">Enlinje</span></TabsTrigger>
        <TabsTrigger value="mounting" className="gap-1.5 text-xs sm:text-sm"><Wrench className="w-4 h-4" /> <span className="hidden sm:inline">Montage</span></TabsTrigger>
      </TabsList>
      <TabsContent value="panels"><SolarRoofPlannerV2 project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="strings" className="space-y-4"><StringMarkingTabV6 project={project} onUpdate={saveProject} selectedProduct={selectedPanelProduct} /><InverterFullSummary project={project} products={products} /></TabsContent>
      <TabsContent value="battery"><BatteryTab project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="products"><ProductSelectionTab project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="solar"><SolarDataPanel project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="singleline"><SingleLineSchemaTab project={project} onUpdate={saveProject} /></TabsContent>
      <TabsContent value="mounting" className="space-y-4"><SolarRoofPlannerV2 project={project} onUpdate={saveProject} /><MountingSystemCalculator project={project} onUpdate={saveProject} /></TabsContent>
    </Tabs>
  </div>;
}
