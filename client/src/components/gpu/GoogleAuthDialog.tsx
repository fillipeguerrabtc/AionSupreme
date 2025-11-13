/**
 * GOOGLE AUTH DIALOG - ENTERPRISE 2025
 * ====================================
 * 
 * Complete OAuth flow for Kaggle + Colab authentication
 * 
 * FLOW:
 * 1. User clicks "Connect Google Account"
 * 2. Dialog opens with instructions
 * 3. Opens Google login popup (accounts.google.com)
 * 4. User logs in manually
 * 5. User navigates to Kaggle/Colab and copies cookies from DevTools
 * 6. Pastes cookies into dialog
 * 7. Backend saves encrypted cookies (AES-256-GCM)
 * 8. Auto-scraping enabled (10min intervals)
 * 
 * SECURITY:
 * - Cookies encrypted with SESSION_SECRET (AES-256-GCM)
 * - No plaintext storage
 * - Auto-validation on save
 * - 30-day expiration with warnings
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Chrome, 
  Copy, 
  Check, 
  AlertTriangle, 
  Info,
  ExternalLink,
  Loader2,
} from 'lucide-react';

interface GoogleAuthDialogProps {
  trigger?: React.ReactNode;
}

interface CookieData {
  name: string;
  value: string;
  domain: string;
}

export function GoogleAuthDialog({ trigger }: GoogleAuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'instructions' | 'kaggle' | 'colab'>('instructions');
  const [accountEmail, setAccountEmail] = useState('');
  const [cookiesRaw, setCookiesRaw] = useState('');
  const [provider, setProvider] = useState<'kaggle' | 'colab'>('kaggle');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async (data: { accountEmail: string; provider: 'kaggle' | 'colab'; cookies: CookieData[] }) => {
      return apiRequest('/api/gpu/auth-google/save-cookies', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "✅ Autenticação salva",
        description: `Cookies do ${provider === 'kaggle' ? 'Kaggle' : 'Colab'} salvos com sucesso para ${accountEmail}`,
      });
      
      // Invalidate auth status and quota queries
      queryClient.invalidateQueries({ queryKey: ['/api/gpu/auth-google/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gpu/quota-status'] });
      
      // Reset form
      setAccountEmail('');
      setCookiesRaw('');
      setStep('instructions');
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Erro ao salvar autenticação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveCookies = () => {
    if (!accountEmail.trim()) {
      toast({
        title: "Email obrigatório",
        description: "Por favor, informe o email da sua conta Google",
        variant: "destructive",
      });
      return;
    }

    if (!cookiesRaw.trim()) {
      toast({
        title: "Cookies obrigatórios",
        description: "Por favor, cole os cookies copiados do navegador",
        variant: "destructive",
      });
      return;
    }

    try {
      // Parse cookies from raw text (format: document.cookie output)
      // Expected format: "name1=value1; name2=value2; name3=value3"
      const cookies: CookieData[] = cookiesRaw
        .split(';')
        .map(cookie => cookie.trim())
        .filter(cookie => cookie.length > 0)
        .map(cookie => {
          const [name, ...valueParts] = cookie.split('=');
          const value = valueParts.join('='); // Handle values with '=' in them
          return {
            name: name.trim(),
            value: value.trim(),
            domain: provider === 'kaggle' ? '.kaggle.com' : '.google.com',
          };
        })
        .filter(c => c.name && c.value);

      if (cookies.length === 0) {
        toast({
          title: "Cookies inválidos",
          description: "Não foi possível extrair cookies válidos do texto colado",
          variant: "destructive",
        });
        return;
      }

      saveMutation.mutate({
        accountEmail: accountEmail.trim(),
        provider,
        cookies,
      });
    } catch (error) {
      toast({
        title: "Erro ao processar cookies",
        description: error instanceof Error ? error.message : "Formato inválido",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "✅ Copiado!",
      description: "Comando copiado para área de transferência",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild data-testid="button-open-google-auth-dialog">
        {trigger || (
          <Button variant="default">
            <Shield className="w-4 h-4 mr-2" />
            Conectar Conta Google
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Autenticação Google - Kaggle & Colab
          </DialogTitle>
          <DialogDescription>
            Configure acesso seguro às plataformas de GPU com criptografia AES-256-GCM
          </DialogDescription>
        </DialogHeader>

        <Tabs value={step} onValueChange={(v) => setStep(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="instructions" data-testid="tab-instructions">
              1. Instruções
            </TabsTrigger>
            <TabsTrigger value="kaggle" data-testid="tab-kaggle">
              2. Kaggle
            </TabsTrigger>
            <TabsTrigger value="colab" data-testid="tab-colab">
              3. Colab
            </TabsTrigger>
          </TabsList>

          {/* INSTRUCTIONS TAB */}
          <TabsContent value="instructions" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Como funciona</AlertTitle>
              <AlertDescription>
                Você fará login manualmente UMA VEZ no Google. Depois, copiaremos os cookies de autenticação
                e os salvaremos de forma criptografada. O sistema fará scraping automático das quotas a cada
                10 minutos, sem precisar de login novamente por ~30 dias.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Chrome className="w-4 h-4" />
                Pré-requisitos
              </h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>Navegador Google Chrome (recomendado para compatibilidade)</li>
                <li>Conta Google com acesso ao Kaggle e/ou Google Colab</li>
                <li>DevTools aberto (F12) para copiar cookies</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Segurança
              </h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>Cookies criptografados com AES-256-GCM usando SESSION_SECRET</li>
                <li>Nenhum cookie armazenado em texto plano</li>
                <li>Validação automática a cada sync (10min)</li>
                <li>Expiração após 30 dias (com avisos antecipados)</li>
              </ul>
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>⚠️ IMPORTANTE - Risco de BAN</AlertTitle>
              <AlertDescription>
                <strong>Kaggle:</strong> Max 8.4h/sessão, 21h/semana. Violação = BAN PERMANENTE.<br />
                <strong>Colab:</strong> Max 8.4h/sessão, 36h cooldown. Violação = BAN PERMANENTE.<br />
                O sistema respeita automaticamente esses limites via quota scraping.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-2">
              <Button onClick={() => {
                setStep('kaggle');
                setProvider('kaggle');
              }} data-testid="button-next-to-kaggle">
                Conectar Kaggle
              </Button>
              <Button variant="outline" onClick={() => {
                setStep('colab');
                setProvider('colab');
              }} data-testid="button-next-to-colab">
                Conectar Colab
              </Button>
            </div>
          </TabsContent>

          {/* KAGGLE TAB */}
          <TabsContent value="kaggle" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Passo a passo - Kaggle</AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">1</Badge>
                  <span>Abra <a href="https://www.kaggle.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    www.kaggle.com <ExternalLink className="w-3 h-3" />
                  </a> em nova aba</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">2</Badge>
                  <span>Faça login com sua conta Google</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">3</Badge>
                  <span>Abra DevTools (F12) → Console → Cole o comando abaixo</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">4</Badge>
                  <span>Copie o resultado e cole no campo "Cookies" abaixo</span>
                </div>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Comando para copiar cookies (Cole no Console do DevTools):</Label>
              <div className="relative">
                <Textarea
                  readOnly
                  value="document.cookie"
                  className="font-mono text-xs pr-10"
                  rows={2}
                  data-testid="textarea-cookie-command"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard('document.cookie')}
                  data-testid="button-copy-cookie-command"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kaggle-email">Email da conta Google</Label>
              <Input
                id="kaggle-email"
                type="email"
                placeholder="seu-email@gmail.com"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                data-testid="input-account-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kaggle-cookies">Cookies (Cole o resultado do Console)</Label>
              <Textarea
                id="kaggle-cookies"
                placeholder="KAGGLE_KEY=value; KAGGLE_USER_ID=123; ..."
                value={cookiesRaw}
                onChange={(e) => setCookiesRaw(e.target.value)}
                rows={6}
                className="font-mono text-xs"
                data-testid="textarea-cookies-raw"
              />
              <p className="text-xs text-muted-foreground">
                Formato esperado: <code className="text-xs">name1=value1; name2=value2; ...</code>
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('instructions')} data-testid="button-back">
                Voltar
              </Button>
              <Button 
                onClick={handleSaveCookies} 
                disabled={saveMutation.isPending}
                data-testid="button-save-kaggle-cookies"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Salvar Kaggle
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* COLAB TAB */}
          <TabsContent value="colab" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Passo a passo - Google Colab</AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">1</Badge>
                  <span>Abra <a href="https://colab.research.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    colab.research.google.com <ExternalLink className="w-3 h-3" />
                  </a> em nova aba</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">2</Badge>
                  <span>Faça login com sua conta Google</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">3</Badge>
                  <span>Abra DevTools (F12) → Console → Cole o comando abaixo</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">4</Badge>
                  <span>Copie o resultado e cole no campo "Cookies" abaixo</span>
                </div>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Comando para copiar cookies (Cole no Console do DevTools):</Label>
              <div className="relative">
                <Textarea
                  readOnly
                  value="document.cookie"
                  className="font-mono text-xs pr-10"
                  rows={2}
                  data-testid="textarea-cookie-command-colab"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard('document.cookie')}
                  data-testid="button-copy-cookie-command-colab"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="colab-email">Email da conta Google</Label>
              <Input
                id="colab-email"
                type="email"
                placeholder="seu-email@gmail.com"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                data-testid="input-account-email-colab"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="colab-cookies">Cookies (Cole o resultado do Console)</Label>
              <Textarea
                id="colab-cookies"
                placeholder="GOOGLE_SESSION=value; GOOGLE_USER=123; ..."
                value={cookiesRaw}
                onChange={(e) => setCookiesRaw(e.target.value)}
                rows={6}
                className="font-mono text-xs"
                data-testid="textarea-cookies-raw-colab"
              />
              <p className="text-xs text-muted-foreground">
                Formato esperado: <code className="text-xs">name1=value1; name2=value2; ...</code>
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('instructions')} data-testid="button-back-colab">
                Voltar
              </Button>
              <Button 
                onClick={handleSaveCookies} 
                disabled={saveMutation.isPending}
                data-testid="button-save-colab-cookies"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Salvar Colab
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
