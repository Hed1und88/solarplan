import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { productDocuments, productHasRequiredDocuments, selectedProjectProductIds } from '@/lib/productDocuments';

const typeLabel = { datasheet: 'Datablad', manual: 'Manual' };

export default function ProjectDocumentsTab({ project, products = [] }) {
  const projectProducts = useMemo(() => {
    const ids = new Set(selectedProjectProductIds(project));
    return products.filter(product => ids.has(product.id));
  }, [project, products]);

  const missing = projectProducts.filter(product => !productHasRequiredDocuments(product));

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" /> Dokument för projektets produkter
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Här visas endast uppladdade dokument som finns sparade på produkterna i SolarPlan. Inga externa manual-länkar används.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {projectProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Inga produkter är kopplade till projektet ännu. Välj panel i Paneler/Montage eller lägg till produkter i Produktfliken.
            </div>
          ) : (
            <>
              {missing.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  {missing.length} produkt(er) saknar manual eller datablad. Lägg in dokumenten i Produktsortimentet.
                </div>
              )}

              <div className="space-y-3">
                {projectProducts.map(product => {
                  const docs = productDocuments(product);
                  const hasRequired = productHasRequiredDocuments(product);
                  return (
                    <div key={product.id} className="rounded-2xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{[product.brand, product.model].filter(Boolean).join(' ') || product.category}</p>
                        </div>
                        <Badge className={hasRequired ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                          {hasRequired ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                          {hasRequired ? 'Manual + datablad' : 'Dokument saknas'}
                        </Badge>
                      </div>

                      {docs.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {docs.map(doc => (
                            <a
                              key={doc.id}
                              href={doc.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2 text-sm hover:bg-muted"
                            >
                              <span className="min-w-0">
                                <span className="block font-medium truncate">{doc.name}</span>
                                <span className="text-xs text-muted-foreground">{typeLabel[doc.type] || 'Dokument'}</span>
                              </span>
                              <FileText className="h-4 w-4 shrink-0 text-primary" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Inga uppladdade dokument på denna produkt.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
