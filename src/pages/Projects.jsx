import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import PullToRefresh from '@/components/PullToRefresh';
import { base44 } from '@/api/base44Client';
import { ArrowRight, MapPin, Pencil, Plus, Shield, Sun, User } from 'lucide-react';
import NewProjectModal from '@/components/projects/NewProjectModal';
import { attachCompanyOwnership, canEditProject, filterProjectsForUser, resolveAccessContext } from '@/lib/accessControl';
import { saveProjectPatch } from '@/lib/projectPersistence';

const statusConfig = {
  planering: { label: 'Planering', color: 'bg-blue-100 text-blue-700' },
  projektering: { label: 'Projektering', color: 'bg-yellow-100 text-yellow-700' },
  offert: { label: 'Offert', color: 'bg-purple-100 text-purple-700' },
  installation: { label: 'Installation', color: 'bg-orange-100 text-orange-700' },
  klart: { label: 'Klart', color: 'bg-green-100 text-green-700' },
};

async function currentUserSafe() {
  try {
    if (base44?.auth?.me) return await base44.auth.me();
    if (base44?.auth?.currentUser) return await base44.auth.currentUser();
  } catch {}
  return null;
}

export default function Projects() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const user = await currentUserSafe();
      const rows = await base44.entities.Project.list('-created_date');
      return { user, projects: filterProjectsForUser(rows || [], user || {}) };
    },
  });

  const currentUser = data?.user || null;
  const projects = data?.projects || [];
  const access = resolveAccessContext(currentUser || {});

  const canCreateProject = access.isSuperadmin || access.isCompanyAdmin || access.isEmployee;
  const closeModal = () => {
    setShowCreateModal(false);
    setEditingProject(null);
  };
  const handleSaved = () => {
    closeModal();
    refetch();
  };

  return (
    <PullToRefresh onRefresh={refetch}>
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projekt</h1>
          <p className="text-muted-foreground text-sm mt-1">{projects.length} projekt synliga för din roll</p>
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground"><Shield className="h-3 w-3" /> Roll: {access.role}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={!canCreateProject}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Nytt projekt
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
          <Sun className="w-14 h-14 text-primary/30 mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-1">Inga projekt att visa</h3>
          <p className="text-muted-foreground text-sm mb-4">Din roll har inga synliga projekt just nu.</p>
          {canCreateProject && <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Skapa projekt
          </button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => {
            const status = statusConfig[project.status] || statusConfig.planering;
            const canEdit = canEditProject(currentUser || {}, project);
            return (
              <div key={project.id} className="relative bg-card rounded-2xl border border-border hover:shadow-lg transition-all group">
                <Link to={`/projects/${project.id}`} className="block p-5">
                  {project.roof_image_url ? (
                    <div className="w-full h-32 rounded-xl overflow-hidden mb-4 bg-muted"><img src={project.roof_image_url} alt="Tak" className="w-full h-full object-cover" /></div>
                  ) : (
                    <div className="w-full h-32 rounded-xl bg-gradient-to-br from-primary/10 to-orange-100 flex items-center justify-center mb-4"><Sun className="w-8 h-8 text-primary/40" /></div>
                  )}
                  <div className="flex items-start justify-between mb-2"><h3 className="font-semibold text-foreground leading-snug flex-1 pr-2">{project.name}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${status.color}`}>{status.label}</span></div>
                  {project.customer_name && <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><User className="w-3 h-3" />{project.customer_name}</div>}
                  {project.address && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{project.address}</div>}
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">{project.total_cost ? <span className="text-sm font-semibold text-primary">{project.total_cost?.toLocaleString('sv-SE')} kr</span> : <span className="text-xs text-muted-foreground">Ingen offert</span>}<ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" /></div>
                </Link>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditingProject(project)}
                    className="absolute right-7 top-7 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm backdrop-blur hover:bg-muted hover:text-foreground"
                    aria-label={`Ändra projektuppgifter för ${project.name}`}
                    title="Ändra projektuppgifter"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <NewProjectModal
          initialValues={attachCompanyOwnership({}, currentUser || {})}
          onSave={handleSaved}
          onClose={closeModal}
        />
      )}
      {editingProject && (
        <NewProjectModal
          project={editingProject}
          onSubmit={payload => saveProjectPatch(base44, editingProject, payload)}
          onSave={handleSaved}
          onClose={closeModal}
        />
      )}
    </div>
    </PullToRefresh>
  );
}
