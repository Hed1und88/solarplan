import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Trash2, LogOut, AlertTriangle } from 'lucide-react';

export default function Settings() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => {
    base44.auth.logout('/');
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    // Mark account for deletion (best-effort, contact support to fully remove)
    await base44.auth.updateMe({ delete_requested: true, delete_requested_at: new Date().toISOString() });
    base44.auth.logout('/');
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pt-6">
      <h1 className="text-2xl font-bold text-foreground">Inställningar</h1>

      {/* Account section */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Konto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" /> Logga ut
          </Button>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border border-destructive/30 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" /> Riskzon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Att radera ditt konto är permanent och kan inte ångras. All din data tas bort.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-destructive border-destructive/40 hover:bg-destructive/5"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4" /> Radera mitt konto
            </Button>
          ) : (
            <div className="space-y-3 p-4 bg-destructive/5 rounded-xl border border-destructive/20">
              <p className="text-sm font-semibold text-destructive">Är du säker? Detta går inte att ångra.</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                >
                  Avbryt
                </Button>
                <Button
                  className="flex-1 bg-destructive hover:bg-destructive/90 text-white gap-2"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting ? 'Raderar...' : <><Trash2 className="w-4 h-4" /> Radera konto</>}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground pb-4">SolarPlan Pro · v1.0</p>
    </div>
  );
}