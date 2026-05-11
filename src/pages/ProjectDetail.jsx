import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Sun, Cable, Battery, ShoppingCart, BarChart2, Wrench, GitBranch, Save } from 'lucide-react';
import SolarDataPanel from '@/components/project/SolarDataPanel';
import ProjectPDFExport from '@/components/project/ProjectPDFExport';
import StringMarkingTab from '@/components/project/StringMarkingTab';
import BatteryTab from '@/components/project/BatteryTab';
import ProductSelectionTab from '@/components/project/ProductSelectionTab.jsx';
import MountingSystemCalculator from '@/components/project/MountingSystemCalculator';
import SolarRoofPlanner from '@/components/project/SolarRoofPlanner';
import SingleLineSchemaTab from '@/components/project/SingleLineSchemaTab';

const statusLabels = { planering: 'Planering', projektering: 'Projektering', offert: 'Offert', installation: 'Installation', klart: 'Klart' };
const statusColors = { planering: 'bg-blue-100 text-blue-700', projektering: 'bg-amber-100 text-amber-700', offert: 'bg-purple-100 text-purple-700', installation: 'bg-orange-100 text-orange-700', klart: 'bg-green-100 text-green-700' };

export default function ProjectDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => base44.entities.Product.list(),
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => base44.entities.Project.list().then(ps => ps.find(p => p.id === id)),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.update(id, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['project', id] });
      const previousProject = queryClient.getQueryData(['project', id]);
      queryClient.setQueryData(['project', id], (current) => current ? { ...current, ...data } : current);
      return { previousProject };
    },
    onError: (_error, _data, context) => {
      if (context?.previousProject) queryClient.setQueryData(['project', id], context.previousProject);
    },
    onSuccess: (updatedProject, data) => {
      queryClient.setQueryData(['project', id], (current) => ({
        ...(updatedProject || {}),
        ...(current || {}),
        ...data,
      }));
    },
  });

  const saveProject = async (data = {}) => {
    await updateMutation.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-10 text-center">
        <p className="text-muted-foreground">Projektet hittades inte</p>
        <Link to="/projects"><Button variant="outline" className="mt-4">Tillbaka</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ArrowLeft className="w-4 h-4" /> Tillbaka
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge className={statusColors[project.status]}>{statusLabels[project.status]}</Badge>
          </div>
          {project.customer_name && <p className="text-muted-foreground mt-1">{project.customer_name} {project.address ? `• ${project.address}` : ''}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => saveProject({ notes: project.notes || '' })} disabled={updateMutation.isPending} className="gap-2">
            <Save className="w-4 h-4" />
            {updateMutation.isPending ? 'Sparar...' : 'Spara'}
          </Button>
          {project.status === 'projektering' && (
            <Button onClick={() => updateMutation.mutate({ status: 'offert' })} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              Skicka som offert
            </Button>
          )}
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

        <TabsContent value="panels" className="space-y-4">
          <SolarRoofPlanner project={project} onUpdate={saveProject} />
        </TabsContent>
        <TabsContent value="strings">
          <StringMarkingTab
            project={project}
            onUpdate={saveProject}
            selectedProduct={(() => {
              try {
                const d = JSON.parse(project.panel_layout_data || '{}');
                const panels = Array.isArray(d) ? d : (d.panels || []);
                const pid = panels[0]?.product_id;
                if (pid) return products.find(p => p.id === pid) || null;
              } catch {}
              return products.find(p => project.selected_products?.some(sp => sp.product_id === p.id) && p.category === 'solpanel') || null;
            })()}
          />
        </TabsContent>
        <TabsContent value="battery"><BatteryTab project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="products"><ProductSelectionTab project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="solar"><SolarDataPanel project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="singleline"><SingleLineSchemaTab project={project} onUpdate={saveProject} /></TabsContent>
        <TabsContent value="mounting" className="space-y-4">
          <SolarRoofPlanner project={project} onUpdate={saveProject} />
          <MountingSystemCalculator project={project} onUpdate={saveProject} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
