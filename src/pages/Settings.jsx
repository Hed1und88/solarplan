import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ImagePlus,
  Loader2,
  LogOut,
  MailPlus,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserCog,
  UsersRound,
  X,
} from 'lucide-react';
import { resolveAccessContext, getUserEmail } from '@/lib/accessControl';
import { uploadCompanyLogo } from '@/lib/companyContext';
import { useCompanySession } from '@/lib/CompanySessionContext';

const INPUT = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';
const EMPTY_COMPANY = {
  name: '',
  organization_number: '',
  email: '',
  phone: '',
  address: '',
  postal_code: '',
  city: '',
  website: '',
  logo_url: '',
  active: true,
};
const EMPTY_MEMBER = { company_id: '', user_email: '', user_name: '', access_role: 'employee' };

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const roleLabel = role => role === 'company_admin' ? 'Företagsadministratör' : 'Användare';

function CompanyModal({ company, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState(company ? { ...EMPTY_COMPANY, ...company } : EMPTY_COMPANY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const chooseLogo = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const logoUrl = await uploadCompanyLogo(base44, file);
      set('logo_url', logoUrl);
    } catch (uploadError) {
      setError(uploadError?.message || 'Logotypen kunde inte laddas upp.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const save = async () => {
    if (!form.name.trim()) return setError('Ange företagsnamn.');
    if (!form.logo_url) return setError('Lägg in företagets logotyp innan företaget sparas.');
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      name: form.name.trim(),
      organization_number: form.organization_number.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      postal_code: form.postal_code.trim(),
      city: form.city.trim(),
      website: form.website.trim(),
      company_id: company?.id || form.company_id || '',
      created_by_email: company?.created_by_email || getUserEmail(currentUser),
    };
    try {
      const saved = company?.id
        ? await base44.entities.Company.update(company.id, payload)
        : await base44.entities.Company.create(payload);
      if (!company?.id && saved?.id && !saved.company_id) {
        try {
          await base44.entities.Company.update(saved.id, { company_id: saved.id });
          saved.company_id = saved.id;
        } catch {}
      }
      onSaved(saved || { ...company, ...payload });
    } catch (saveError) {
      setError(saveError?.message || 'Företaget kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div><h2 className="font-semibold">{company ? 'Ändra företag' : 'Skapa företag'}</h2><p className="text-xs text-muted-foreground">Företagsuppgifterna och logotypen används i appen, dokument och offerter.</p></div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Stäng"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2">
              {form.logo_url ? <img src={form.logo_url} alt="Företagslogotyp" className="h-full w-full object-contain" /> : <Building2 className="h-10 w-10 text-muted-foreground/40" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Företagets logotyp *</p>
              <p className="mt-1 text-xs text-muted-foreground">PNG eller JPG, högst 5 MB. Logotypen visas för företagets användare och på genererade dokument.</p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? 'Laddar upp...' : form.logo_url ? 'Byt logotyp' : 'Ladda upp logotyp'}
                <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={uploading} onChange={chooseLogo} />
              </label>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Företagsnamn *</span><input className={INPUT} value={form.name} onChange={event => set('name', event.target.value)} autoFocus /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Organisationsnummer</span><input className={INPUT} value={form.organization_number} onChange={event => set('organization_number', event.target.value)} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">E-post</span><input type="email" className={INPUT} value={form.email} onChange={event => set('email', event.target.value)} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Telefon</span><input className={INPUT} value={form.phone} onChange={event => set('phone', event.target.value)} /></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Adress</span><input className={INPUT} value={form.address} onChange={event => set('address', event.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Postnummer</span><input className={INPUT} value={form.postal_code} onChange={event => set('postal_code', event.target.value)} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Postort</span><input className={INPUT} value={form.city} onChange={event => set('city', event.target.value)} /></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Webbplats</span><input className={INPUT} value={form.website} onChange={event => set('website', event.target.value)} placeholder="https://" /></label>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      </div>
      <div className="flex justify-end gap-3 border-t border-border p-5">
        <button onClick={onClose} disabled={saving || uploading} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">Avbryt</button>
        <button onClick={save} disabled={saving || uploading} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Sparar...' : 'Spara företag'}</button>
      </div>
    </div>
  </div>;
}

function MemberModal({ companies, fixedCompanyId, memberships, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY_MEMBER, company_id: fixedCompanyId || companies[0]?.id || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const save = async () => {
    const email = normalizeEmail(form.user_email);
    const company = companies.find(item => String(item.id) === String(form.company_id));
    if (!company) return setError('Välj ett företag.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Ange en giltig e-postadress.');
    const otherCompany = memberships.find(item => item.active !== false && normalizeEmail(item.user_email) === email && String(item.company_id) !== String(company.id));
    if (otherCompany) return setError(`Användaren är redan kopplad till ${otherCompany.company_name || 'ett annat företag'}.`);

    setSaving(true);
    setError('');
    setWarning('');
    const existing = memberships.find(item => item.active !== false && normalizeEmail(item.user_email) === email && String(item.company_id) === String(company.id));
    const payload = {
      company_id: company.id,
      company_name: company.name,
      user_email: email,
      user_name: form.user_name.trim(),
      access_role: form.access_role,
      active: true,
      invited_at: new Date().toISOString(),
      assigned_by_email: getUserEmail(currentUser),
    };
    try {
      const saved = existing?.id
        ? await base44.entities.CompanyMembership.update(existing.id, payload)
        : await base44.entities.CompanyMembership.create(payload);
      try {
        await base44.users.inviteUser(email, form.access_role === 'company_admin' ? 'admin' : 'user');
      } catch (inviteError) {
        setWarning(`Företagskopplingen sparades, men inbjudan kunde inte skickas: ${inviteError?.message || 'okänt fel'}`);
        window.setTimeout(() => onSaved(saved || { ...existing, ...payload }), 2200);
        return;
      }
      onSaved(saved || { ...existing, ...payload });
    } catch (saveError) {
      setError(saveError?.message || 'Användaren kunde inte kopplas till företaget.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-semibold">Koppla användare</h2><p className="text-xs text-muted-foreground">Användaren bjuds in till SolarPlan och kopplas till valt företag.</p></div><button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button></div>
      <div className="space-y-4 p-5">
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Företag *</span><select className={INPUT} value={form.company_id} disabled={Boolean(fixedCompanyId)} onChange={event => set('company_id', event.target.value)}>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Användarens namn</span><input className={INPUT} value={form.user_name} onChange={event => set('user_name', event.target.value)} /></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">E-post *</span><input type="email" className={INPUT} value={form.user_email} onChange={event => set('user_email', event.target.value)} placeholder="namn@företag.se" /></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Roll</span><select className={INPUT} value={form.access_role} onChange={event => set('access_role', event.target.value)}><option value="employee">Användare</option><option value="company_admin">Företagsadministratör</option></select></label>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Företagsadministratörer kan hantera företagets uppgifter, logotyp och användare. Vanliga användare arbetar i företagets projekt men kan inte administrera företaget.</div>
        {warning && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      </div>
      <div className="flex justify-end gap-3 border-t border-border p-5"><button onClick={onClose} disabled={saving} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">Avbryt</button><button onClick={save} disabled={saving || !form.company_id} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Kopplar...' : 'Koppla och bjud in'}</button></div>
    </div>
  </div>;
}

export default function Settings() {
  const { user, refreshCompany } = useCompanySession();
  const access = resolveAccessContext(user || {});
  const [companies, setCompanies] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [companyModal, setCompanyModal] = useState(null);
  const [memberModal, setMemberModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canCreateCompanies = access.isSuperadmin;
  const canManageCompanies = access.isSuperadmin || access.isCompanyAdmin;
  const ownCompanyId = user?.company_id || '';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [companyRows, membershipRows] = await Promise.all([
        base44.entities.Company.list('name'),
        base44.entities.CompanyMembership.list('-created_date'),
      ]);
      const visibleCompanies = access.isSuperadmin
        ? (companyRows || [])
        : (companyRows || []).filter(company => String(company.id) === String(ownCompanyId));
      const companyIds = new Set(visibleCompanies.map(company => String(company.id)));
      setCompanies(visibleCompanies);
      setMemberships((membershipRows || []).filter(item => companyIds.has(String(item.company_id))));
    } catch (loadError) {
      setError(loadError?.message || 'Företagsinställningarna kunde inte laddas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [ownCompanyId, access.role]);

  const membersByCompany = useMemo(() => Object.fromEntries(companies.map(company => [company.id, memberships.filter(item => String(item.company_id) === String(company.id) && item.active !== false)])), [companies, memberships]);

  const savedCompany = async saved => {
    setCompanyModal(null);
    setMessage(`${saved.name} har sparats.`);
    await load();
    if (String(saved.id) === String(ownCompanyId)) await refreshCompany?.();
  };

  const savedMember = async saved => {
    setMemberModal(false);
    setMessage(`${saved.user_email} är kopplad till ${saved.company_name}.`);
    await load();
  };

  const changeMemberRole = async (membership, role) => {
    setError('');
    try {
      await base44.entities.CompanyMembership.update(membership.id, { access_role: role });
      setMemberships(current => current.map(item => item.id === membership.id ? { ...item, access_role: role } : item));
      setMessage(`Rollen för ${membership.user_email} har ändrats.`);
    } catch (roleError) {
      setError(roleError?.message || 'Rollen kunde inte ändras.');
    }
  };

  const removeMembership = async membership => {
    if (normalizeEmail(membership.user_email) === normalizeEmail(getUserEmail(user)) && !access.isSuperadmin) {
      return setError('Du kan inte ta bort din egen företagskoppling. En superadministratör måste göra detta.');
    }
    if (!confirm(`Ta bort ${membership.user_email} från ${membership.company_name}?`)) return;
    try {
      await base44.entities.CompanyMembership.delete(membership.id);
      setMemberships(current => current.filter(item => item.id !== membership.id));
      setMessage(`${membership.user_email} har tagits bort från företaget.`);
    } catch (removeError) {
      setError(removeError?.message || 'Användaren kunde inte tas bort.');
    }
  };

  const toggleCompany = async company => {
    if (!access.isSuperadmin) return;
    try {
      await base44.entities.Company.update(company.id, { active: company.active === false });
      setCompanies(current => current.map(item => item.id === company.id ? { ...item, active: company.active === false } : item));
    } catch (toggleError) {
      setError(toggleError?.message || 'Företagets status kunde inte ändras.');
    }
  };

  const handleLogout = () => base44.auth.logout('/');
  const handleDeleteAccount = async () => {
    setDeleting(true);
    await base44.auth.updateMe({ delete_requested: true, delete_requested_at: new Date().toISOString() });
    base44.auth.logout('/');
  };

  return <div className="mx-auto max-w-6xl space-y-5 p-4 pt-6 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-foreground">Inställningar</h1><p className="mt-1 text-sm text-muted-foreground">Konto, företag, logotyp och användarbehörigheter.</p></div>{canCreateCompanies && <Button onClick={() => setCompanyModal({ company: null })} className="gap-2"><Plus className="h-4 w-4" />Skapa företag</Button>}</div>

    {message && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-primary" />Företag och varumärke</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {loading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : companies.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center"><Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" /><p className="mt-3 font-medium">Inget företag är kopplat</p><p className="mt-1 text-sm text-muted-foreground">En superadministratör behöver skapa företaget och koppla din e-postadress.</p></div> : companies.map(company => <div key={company.id} className={`rounded-2xl border p-4 ${company.active === false ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-border bg-background'}`}>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2">{company.logo_url ? <img src={company.logo_url} alt={`${company.name} logotyp`} className="h-full w-full object-contain" /> : <Building2 className="h-8 w-8 text-muted-foreground/30" />}</div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{company.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${company.active === false ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>{company.active === false ? 'Inaktivt' : 'Aktivt'}</span></div><div className="mt-2 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2"><span>Org.nr: {company.organization_number || '—'}</span><span>E-post: {company.email || '—'}</span><span>Telefon: {company.phone || '—'}</span><span>{[company.address, company.postal_code, company.city].filter(Boolean).join(', ') || 'Adress saknas'}</span></div></div>
            {canManageCompanies && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setCompanyModal({ company })} className="gap-2"><Pencil className="h-4 w-4" />Ändra</Button>{access.isSuperadmin && <Button variant="outline" size="sm" onClick={() => toggleCompany(company)}>{company.active === false ? 'Aktivera' : 'Inaktivera'}</Button>}</div>}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h4 className="flex items-center gap-2 font-semibold"><UsersRound className="h-4 w-4 text-primary" />Användare</h4><p className="mt-0.5 text-xs text-muted-foreground">Alla användare under företaget ser företagets logotyp och arbetar i företagets data.</p></div>{canManageCompanies && <Button variant="outline" size="sm" className="gap-2" onClick={() => setMemberModal(company.id)}><MailPlus className="h-4 w-4" />Koppla användare</Button>}</div>
            {(membersByCompany[company.id] || []).length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">Inga användare är kopplade till företaget ännu.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-2 py-2 font-medium">Användare</th><th className="px-2 py-2 font-medium">E-post</th><th className="px-2 py-2 font-medium">Roll</th><th className="px-2 py-2 text-right font-medium">Åtgärd</th></tr></thead><tbody>{(membersByCompany[company.id] || []).map(membership => <tr key={membership.id} className="border-b border-border/70 last:border-0"><td className="px-2 py-3 font-medium">{membership.user_name || '—'}</td><td className="px-2 py-3 text-muted-foreground">{membership.user_email}</td><td className="px-2 py-3">{canManageCompanies ? <select className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs" value={membership.access_role || 'employee'} onChange={event => changeMemberRole(membership, event.target.value)}><option value="employee">Användare</option><option value="company_admin">Företagsadministratör</option></select> : roleLabel(membership.access_role)}</td><td className="px-2 py-3 text-right">{canManageCompanies && <button onClick={() => removeMembership(membership)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Ta bort från företag"><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table></div>}
          </div>
        </div>)}
      </CardContent>
    </Card>

    <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-primary" />Konto</CardTitle></CardHeader><CardContent><Button variant="outline" className="w-full justify-start gap-2" onClick={handleLogout}><LogOut className="w-4 h-4" />Logga ut</Button></CardContent></Card>

    <Card className="border border-destructive/30 shadow-sm"><CardHeader><CardTitle className="text-base flex items-center gap-2 text-destructive"><AlertTriangle className="w-4 h-4" />Riskzon</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Att radera ditt konto är permanent och kan inte ångras.</p>{!showDeleteConfirm ? <Button variant="outline" className="w-full justify-start gap-2 text-destructive border-destructive/40 hover:bg-destructive/5" onClick={() => setShowDeleteConfirm(true)}><Trash2 className="w-4 h-4" />Radera mitt konto</Button> : <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"><p className="text-sm font-semibold text-destructive">Är du säker? Detta går inte att ångra.</p><div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Avbryt</Button><Button className="flex-1 gap-2 bg-destructive text-white hover:bg-destructive/90" onClick={handleDeleteAccount} disabled={deleting}>{deleting ? 'Raderar...' : <><Trash2 className="w-4 h-4" />Radera konto</>}</Button></div></div>}</CardContent></Card>

    <p className="pb-4 text-center text-xs text-muted-foreground">SolarPlan Pro · v1.0</p>
    {companyModal && <CompanyModal company={companyModal.company} currentUser={user} onClose={() => setCompanyModal(null)} onSaved={savedCompany} />}
    {memberModal && <MemberModal companies={companies} fixedCompanyId={memberModal} memberships={memberships} currentUser={user} onClose={() => setMemberModal(false)} onSaved={savedMember} />}
  </div>;
}
