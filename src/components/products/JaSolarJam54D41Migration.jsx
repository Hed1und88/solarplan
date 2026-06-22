import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompanySession } from '@/lib/CompanySessionContext';
import { resolveAccessContext } from '@/lib/accessControl';
import { buildProductDescription, productDescription, productDocuments, productMeta } from '@/lib/productDocuments';
import {
  JA_SOLAR_JAM54D41_440_LB_META,
  JA_SOLAR_JAM54D41_440_LB_PRODUCT_DATA,
  JA_SOLAR_JAM54D41_440_LB_REVISION,
  isJaSolarJam54D41_440Lb,
  jaSolarJam54D41MigrationNeeded,
} from '@/lib/jaSolarJam54D41Product';

const SESSION_KEY = `solarplan:migration:${JA_SOLAR_JAM54D41_440_LB_REVISION}`;

export default function JaSolarJam54D41Migration() {
  const location = useLocation();
  const { user } = useCompanySession();
  const started = useRef(false);

  useEffect(() => {
    if (location.pathname !== '/products') return;
    if (!resolveAccessContext(user || {}).isSuperadmin) return;
    if (started.current) return;
    started.current = true;

    const migrate = async () => {
      try {
        const products = await base44.entities.Product.list('-created_date');
        const target = (products || []).find(isJaSolarJam54D41_440Lb);
        if (!target) return;

        const existingMeta = productMeta(target);
        if (!jaSolarJam54D41MigrationNeeded(target, existingMeta)) return;

        const meta = {
          ...existingMeta,
          ...JA_SOLAR_JAM54D41_440_LB_META,
          documents: productDocuments(target),
        };
        const patch = {
          ...JA_SOLAR_JAM54D41_440_LB_PRODUCT_DATA,
          description: buildProductDescription(productDescription(target), meta),
        };

        await base44.entities.Product.update(target.id, patch);

        if (window.sessionStorage.getItem(SESSION_KEY) !== 'done') {
          window.sessionStorage.setItem(SESSION_KEY, 'done');
          window.location.reload();
        }
      } catch (error) {
        console.warn('JA Solar JAM54D41-440/LB kunde inte migreras automatiskt:', error);
      }
    };

    migrate();
  }, [location.pathname, user]);

  return null;
}
