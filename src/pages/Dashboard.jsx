import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, FolderOpen, Package, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { listTenantProjects, listVisibleProducts } from '@/lib/tenantQueries';

const statusColors = {
  planering: 'bg-blue-100 text-blue-700',
  projektering: 'bg-yellow-100 text-yellow-700',
  offert: 'bg-purple-100 text-purple-700',
  installation: 'bg-orange-100 text-orange-700',
  klart: 'bg-green-100 text-green-700',
};

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listTenantProjects('-created_date', 5),
      listVisibleProducts('-created_date', 50),
    ]).then(([p, pr]) => {
      setProjects(p);
      setProducts(pr);
      setLoading(false);
    });
  }, []);

  const totalValue = projects.reduce((s, p) => s + (p.total_cost || 0), 0);
  const activeProjects = projects.filter(p => p.status !== 'klart').length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Välkommen tillbaka 👋</h1>
        <p className="text-muted-foreground mt-1">Här är en översikt av dina solenergi-projekt</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={FolderOpen} label="Aktiva projekt" value={activeProjects} color="bg-orange-500" loading={loading} />
        <StatCard icon={Package} label="Produkter i sortiment" value={products.length} color="bg-blue-500" loading={loading} />
        <StatCard
          icon={TrendingUp}
          label="Total projektvärde"
          value={`${totalValue.toLocaleString('sv-SE')} kr`}
          color="bg-green-500"
          loading={loading}
        />
      </div>

      {/* Recent projects */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Senaste projekt</h2>
          <Link to="/projects" className="text-primary text-sm font-medium flex items-center gap-1 hover:underline">
            Visa alla <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-10">
            <Sun className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Inga projekt ännu</p>
            <Link to="/projects" className="mt-3 inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> Skapa projekt
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(project => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Sun className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.customer_name || project.address || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {project.status && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[project.status]}`}>
                      {project.status}
                    </span>
                  )}
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, loading }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
      </div>
      {loading ? (
        <div className="h-7 w-20 bg-muted rounded-lg animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-foreground">{value}</p>
      )}
    </div>
  );
}
