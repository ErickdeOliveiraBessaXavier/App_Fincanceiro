import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileText, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

// ===================== Parsing de planilha (CSV ou XLSX) =====================
// O importador entende tanto um CSV simples quanto a planilha do cliente (GRAN.xlsx),
// onde cada LINHA é uma parcela e várias linhas com o mesmo Nº TITULO formam um
// título. Detecta a linha de cabeçalho sozinho e mapeia os nomes em português.

// Normaliza um cabeçalho: sem acento, minúsculo, só letras/números e espaço.
const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Sinônimos aceitos para cada campo do sistema (já normalizados).
const ALIASES: Record<string, string[]> = {
  cliente: ['cliente', 'nome', 'razao social'],
  cpf_cnpj: ['cpf cnpj', 'cpf', 'cnpj', 'documento'],
  valor: ['valor', 'vlr', 'valor parcela'],
  vencimento: ['vencimento', 'data do vencimento', 'data vencimento', 'data'],
  vendedor: ['vendedor'],
  cobrador: ['cobrador'],
  numero_documento: ['n titulo', 'no titulo', 'numero titulo', 'numero do titulo', 'titulo'],
  numero_parcela: ['parcela', 'n parcela', 'numero parcela'],
  cidade: ['municipio', 'cidade'],
  estado: ['uf', 'estado'],
  descricao: ['descricao', 'safra', 'observacao', 'observacoes', 'obs'],
  contato: ['contato', 'telefone', 'fone', 'celular', 'email'],
};

type ColMap = Partial<Record<keyof typeof ALIASES, number>>;

function buildColMap(headerRow: any[]): ColMap {
  const map: ColMap = {};
  headerRow.forEach((cell, i) => {
    const h = norm(cell);
    if (!h) return;
    for (const field of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) {
      if (map[field] === undefined && ALIASES[field].includes(h)) map[field] = i;
    }
  });
  return map;
}

// Acha a primeira linha que parece cabeçalho (tem cliente + valor + vencimento).
function findHeader(matrix: any[][]): { rowIdx: number; colMap: ColMap } | null {
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const cm = buildColMap(matrix[i] ?? []);
    if (cm.cliente !== undefined && cm.valor !== undefined && cm.vencimento !== undefined) {
      return { rowIdx: i, colMap: cm };
    }
  }
  return null;
}

// Excel serial / Date / string -> 'YYYY-MM-DD' (ou null se inválido).
function toISODate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/AAAA
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Aceita número ou texto "1.250,50" / "1250,50" / "1250.50".
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

interface Parcela {
  numero: number;
  valor: number | null;
  vencimento: string | null;
  linha: number;
}
interface Grupo {
  numero_documento: string | null;
  cliente: string;
  cpf_cnpj: string;
  vendedor: string;
  cobrador: string;
  cidade: string;
  estado: string;
  descricao: string;
  contato: string;
  parcelas: Parcela[];
}
interface ParsedFile {
  grupos: Grupo[];
  errors: string[];
  totalParcelas: number;
  previewHeaders: string[];
  previewRows: string[][];
}

async function readMatrix(file: File): Promise<any[][]> {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: '' });
}

function parseMatrix(matrix: any[][]): ParsedFile {
  const found = findHeader(matrix);
  if (!found) {
    return {
      grupos: [], totalParcelas: 0, previewHeaders: [], previewRows: [],
      errors: ['Não encontrei as colunas obrigatórias (cliente, valor, vencimento). Verifique o cabeçalho.'],
    };
  }
  const { rowIdx, colMap } = found;
  const get = (row: any[], f: keyof typeof ALIASES) =>
    colMap[f] !== undefined ? row[colMap[f] as number] : '';

  const dataRows = matrix.slice(rowIdx + 1);
  const gruposMap = new Map<string, Grupo>();
  const errors: string[] = [];
  let totalParcelas = 0;

  dataRows.forEach((row, idx) => {
    const linha = rowIdx + 2 + idx; // nº da linha na planilha (1-based)
    const cliente = String(get(row, 'cliente') ?? '').trim();
    const cpf = onlyDigits(get(row, 'cpf_cnpj'));
    if (!cliente && !cpf) return; // linha vazia

    const doc = String(get(row, 'numero_documento') ?? '').trim();
    const key = doc ? `doc:${doc.toLowerCase()}` : `row:${linha}`;

    let g = gruposMap.get(key);
    if (!g) {
      g = {
        numero_documento: doc || null,
        cliente,
        cpf_cnpj: cpf,
        vendedor: String(get(row, 'vendedor') ?? '').trim(),
        cobrador: String(get(row, 'cobrador') ?? '').trim(),
        cidade: String(get(row, 'cidade') ?? '').trim(),
        estado: String(get(row, 'estado') ?? '').trim(),
        descricao: String(get(row, 'descricao') ?? '').trim(),
        contato: String(get(row, 'contato') ?? '').trim(),
        parcelas: [],
      };
      gruposMap.set(key, g);
    }

    const numRaw = toNumber(get(row, 'numero_parcela'));
    g.parcelas.push({
      numero: numRaw && numRaw > 0 ? Math.round(numRaw) : g.parcelas.length + 1,
      valor: toNumber(get(row, 'valor')),
      vencimento: toISODate(get(row, 'vencimento')),
      linha,
    });
    totalParcelas++;
  });

  const grupos = Array.from(gruposMap.values());

  // Validação
  for (const g of grupos) {
    const ref = g.numero_documento ? `Título ${g.numero_documento}` : `Linha ${g.parcelas[0]?.linha}`;
    if (g.cpf_cnpj.length !== 11 && g.cpf_cnpj.length !== 14) {
      errors.push(`${ref}: CPF/CNPJ inválido (${g.cpf_cnpj || 'vazio'})`);
    }
    if (!g.cliente) errors.push(`${ref}: nome do cliente vazio`);
    for (const p of g.parcelas) {
      if (p.valor === null || p.valor <= 0) errors.push(`Linha ${p.linha}: valor inválido`);
      if (!p.vencimento) errors.push(`Linha ${p.linha}: vencimento inválido`);
    }
  }

  // Preview: cabeçalho mapeado + 5 primeiras linhas de dados
  const previewHeaders = (Object.keys(ALIASES) as (keyof typeof ALIASES)[]).filter(
    (f) => colMap[f] !== undefined,
  );
  const previewRows = dataRows
    .filter((r) => String(get(r, 'cliente') ?? '').trim() || onlyDigits(get(r, 'cpf_cnpj')))
    .slice(0, 5)
    .map((r) => previewHeaders.map((f) => {
      if (f === 'vencimento') return toISODate(get(r, f)) ?? String(get(r, f) ?? '');
      return String(get(r, f) ?? '');
    }));

  return { grupos, errors, totalParcelas, previewHeaders, previewRows };
}

// ===================== Componente =====================
interface ImportResult {
  titulos: number;
  parcelas: number;
  clientes: number;
  errors: string[];
}

export default function ImportarCSV() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, isSuperAdmin } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useUserRole();

  const [companies, setCompanies] = useState<{ id: string; nome: string; status: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');

  // super_admin escolhe para qual empresa está importando.
  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase
      .from('companies')
      .select('id, nome, status')
      .neq('status', 'cancelada')
      .order('nome')
      .then(({ data }) => setCompanies(data ?? []));
  }, [isSuperAdmin]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const lower = selectedFile.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      toast({ title: 'Formato inválido', description: 'Selecione um arquivo .xlsx ou .csv', variant: 'destructive' });
      return;
    }

    setFile(selectedFile);
    setImportResult(null);
    try {
      const matrix = await readMatrix(selectedFile);
      setParsed(parseMatrix(matrix));
    } catch (e: any) {
      setParsed({ grupos: [], errors: [`Não foi possível ler o arquivo: ${e?.message ?? e}`], totalParcelas: 0, previewHeaders: [], previewRows: [] });
    }
  };

  const handleImport = async () => {
    if (!file || !parsed || !user) return;
    if (parsed.errors.length > 0) {
      toast({ title: 'Corrija os erros', description: 'Há linhas inválidas no arquivo.', variant: 'destructive' });
      return;
    }
    if (parsed.grupos.length === 0) {
      toast({ title: 'Nada a importar', description: 'Nenhuma linha de dados encontrada.', variant: 'destructive' });
      return;
    }
    if (isSuperAdmin && !selectedCompany) {
      toast({ title: 'Selecione a empresa', description: 'Escolha para qual empresa este arquivo será importado.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setImportResult(null);

    const result: ImportResult = { titulos: 0, parcelas: 0, clientes: 0, errors: [] };
    const clientesVistos = new Set<string>();

    for (let i = 0; i < parsed.grupos.length; i++) {
      const g = parsed.grupos[i];
      setUploadProgress(Math.round(((i + 1) / parsed.grupos.length) * 100));
      try {
        const { data: res, error } = await supabase.rpc('importar_titulo_completo', {
          p_company_id: isSuperAdmin ? selectedCompany : null,
          p_cliente_nome: g.cliente,
          p_cpf_cnpj: g.cpf_cnpj,
          p_numero_documento: g.numero_documento,
          p_parcelas: g.parcelas.map((p) => ({ numero: p.numero, valor: p.valor, vencimento: p.vencimento })),
          p_contato: g.contato || null,
          p_descricao: g.descricao || null,
          p_cobrador: g.cobrador || null,
          p_vendedor: g.vendedor || null,
          p_cidade: g.cidade || null,
          p_estado: g.estado || null,
        });
        if (error || (res as any)?.error) {
          const ref = g.numero_documento ? `Título ${g.numero_documento}` : `Linha ${g.parcelas[0]?.linha}`;
          result.errors.push(`${ref}: ${error?.message ?? (res as any)?.error}`);
          continue;
        }
        result.titulos++;
        result.parcelas += (res as any)?.parcelas_inseridas ?? g.parcelas.length;
        if (!clientesVistos.has(g.cpf_cnpj)) {
          clientesVistos.add(g.cpf_cnpj);
          result.clientes++;
        }
      } catch (e: any) {
        result.errors.push(`Título ${g.numero_documento ?? '?'}: ${e?.message ?? 'erro inesperado'}`);
      }
    }

    await supabase.rpc('refresh_mv_parcelas');
    setImportResult(result);
    setUploading(false);
    setUploadProgress(0);

    if (result.titulos > 0) {
      toast({ title: 'Importação concluída', description: `${result.titulos} títulos e ${result.parcelas} parcelas importados.` });
    }
    if (result.errors.length > 0) {
      toast({ title: 'Avisos na importação', description: `${result.errors.length} título(s) com erro.`, variant: 'destructive' });
    } else {
      setFile(null);
      setParsed(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const csvContent = [
      'cliente,cpf_cnpj,valor,vencimento,numero_documento,parcela,vendedor,cobrador,cidade,estado,descricao,contato',
      'INVICTA RACOES LTDA,00000000000191,8562.61,2025-12-21,12461,1,AIRTON,,OEIRAS,PI,Safra 2025,',
      'F PEREIRA DE LIMA CIA LTDA,00000000000272,1250.00,2026-03-07,12711,2,HELDER,,IGUATU,CE,Safra 2025,',
      'F PEREIRA DE LIMA CIA LTDA,00000000000272,1250.00,2026-04-07,12711,3,HELDER,,IGUATU,CE,Safra 2025,',
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_titulos.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Apenas administradores podem importar dados.</p>
      </div>
    );
  }

  const errors = parsed?.errors ?? [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Importar planilha</h1>
          <p className="text-muted-foreground">Importe títulos e parcelas em lote (.xlsx ou .csv)</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Baixar Template
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload do Arquivo
            </CardTitle>
            <CardDescription>Selecione a planilha (.xlsx) ou um CSV</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSuperAdmin && (
              <div className="grid gap-2">
                <Label htmlFor="imp-company">Empresa de destino</Label>
                <select
                  id="imp-company"
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">Selecione a empresa...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}{c.status !== 'ativa' ? ` (${c.status})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Como admin mestre, escolha para qual empresa este arquivo será importado.
                </p>
              </div>
            )}
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                {file ? file.name : 'Clique para selecionar um arquivo .xlsx ou .csv'}
              </p>
              <p className="text-sm text-muted-foreground">Ou arraste e solte o arquivo aqui</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />

            {parsed && parsed.grupos.length > 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Detectados <strong>{parsed.grupos.length}</strong> títulos e{' '}
                  <strong>{parsed.totalParcelas}</strong> parcelas.
                </AlertDescription>
              </Alert>
            )}

            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="max-h-40 overflow-y-auto">
                    <ul className="list-disc list-inside">
                      {errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                      {errors.length > 10 && <li>... e mais {errors.length - 10} erros</li>}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importando...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={!file || !parsed || parsed.grupos.length === 0 || errors.length > 0 || uploading}
              className="w-full"
            >
              {uploading ? 'Importando...' : 'Importar Dados'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instruções</CardTitle>
            <CardDescription>Como preparar seu arquivo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Colunas obrigatórias
              </h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><code>cliente</code> — nome do cliente</li>
                <li><code>cpf_cnpj</code> — CPF ou CNPJ</li>
                <li><code>valor</code> — valor da parcela</li>
                <li><code>vencimento</code> — data (aceita serial do Excel, AAAA-MM-DD ou DD/MM/AAAA)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Colunas opcionais</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><code>numero_documento</code> / <code>Nº TITULO</code> — agrupa parcelas num mesmo título</li>
                <li><code>parcela</code> — número da parcela dentro do título</li>
                <li><code>vendedor</code> — carteira de vendas (criada se não existir)</li>
                <li><code>cobrador</code> — carteira de cobrança (criada se não existir)</li>
                <li><code>municipio</code>/<code>cidade</code> e <code>uf</code>/<code>estado</code>, <code>descricao</code>, <code>contato</code></li>
              </ul>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Linhas com o mesmo <strong>Nº TITULO</strong> viram um único título com várias parcelas.
                Vendedor/cobrador são identificados <strong>pelo nome</strong> — padronize-os antes de importar.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {parsed && parsed.previewRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Prévia dos Dados</CardTitle>
            <CardDescription>Primeiras linhas reconhecidas do arquivo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {parsed.previewHeaders.map((h) => (
                      <TableHead key={h} className="capitalize">{h.replace('_', ' ')}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.previewRows.map((row, ri) => (
                    <TableRow key={ri}>
                      {row.map((cell, ci) => <TableCell key={ci}>{cell}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado da Importação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{importResult.titulos}</div>
                <div className="text-sm text-green-700">Títulos</div>
              </div>
              <div className="text-center p-4 bg-emerald-50 rounded-lg">
                <div className="text-2xl font-bold text-emerald-600">{importResult.parcelas}</div>
                <div className="text-sm text-emerald-700">Parcelas</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{importResult.clientes}</div>
                <div className="text-sm text-blue-700">Clientes</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{importResult.errors.length}</div>
                <div className="text-sm text-red-700">Erros</div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="max-h-40 overflow-y-auto">
                    <ul className="list-disc list-inside">
                      {importResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                      {importResult.errors.length > 10 && <li>... e mais {importResult.errors.length - 10} erros</li>}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
