import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, Sun, MapPin, User, Calendar, ArrowRight } from 'lucide-react';
import NewProjectModal from '@/components/projects/NewProjectModal';

const statusConfig = {
  planering: { label: 'Planering', color: 'bg-blue-100 text-blue-700' },
  projektering: { label: 'Projektering', color: 'bg-yellow-100 text-yellow-700' },
  offert: { label: 'Offert', color: 'bg-purple-100 text-purple-700' },
  installation: { label: 'Installation', color: 'bg-orange-100 text-orange-700' },
  klart: { label: 'Klart', color: 'bg-green-100 text-green-700' },
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    const data = await base44.entities.Project.list('-created_date');
    setProjects(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projekt</h1>
          <p className="text-muted-foreground text-sm mt-1">{projects.length} projekt totalt</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
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
          <h3 className="font-semibold text-foreground mb-1">Inga projekt ännu</h3>
          <p className="text-muted-foreground text-sm mb-4">Skapa ditt första solenergi-projekt</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Skapa projekt
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => {
            const status = statusConfig[project.status] || statusConfig.planering;
            return (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="bg-card rounded-2xl border border-border p-5 hover:shadow-lg transition-all group block"
              >
                {/* Roof image preview */}
                {project.roof_image_url ? (
                  <div className="w-full h-32 rounded-xl overflow-hidden mb-4 bg-muted">
                    <img src={project.roof_image_url} alt="Tak" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-full h-32 rounded-xl bg-gradient-to-br from-primary/10 to-orange-100 flex items-center justify-center mb-4">
                    <Sun className="w-8 h-8 text-primary/40" />
                  </div>
                )}

                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-foreground leading-snug flex-1 pr-2">{project.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${status.color}`}>
                    {status.label}
                  </span>
                </div>

                {project.customer_name && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <User className="w-3 h-3" />
                    {project.customer_name}
                  </div>
                )}
                {project.address && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {project.address}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  {project.total_cost ? (
                    <span className="text-sm font-semibold text-primary">{project.total_cost?.toLocaleString('sv-SE')} kr</span>
                  ) : <span className="text-xs text-muted-foreground">Ingen offert</span>}
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showModal && (
        <NewProjectModal
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}