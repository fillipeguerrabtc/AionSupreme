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
import { useLanguage, formatTemplate } from '@/lib/i18n';
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
  const { t } = useLanguage();
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
      const providerName = t.admin.gpuManagement.googleAuthDialog.providers[provider];
      const description = formatTemplate(
        t.admin.gpuManagement.googleAuthDialog.toasts.saveSuccess.descriptionTemplate,
        { provider: providerName, email: accountEmail }
      );
      
      toast({
        title: t.admin.gpuManagement.googleAuthDialog.toasts.saveSuccess.title,
        description,
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
        title: t.admin.gpuManagement.googleAuthDialog.toasts.saveError.title,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveCookies = () => {
    if (!accountEmail.trim()) {
      toast({
        title: t.admin.gpuManagement.googleAuthDialog.errors.emailRequired.title,
        description: t.admin.gpuManagement.googleAuthDialog.errors.emailRequired.description,
        variant: "destructive",
      });
      return;
    }

    if (!cookiesRaw.trim()) {
      toast({
        title: t.admin.gpuManagement.googleAuthDialog.errors.cookiesRequired.title,
        description: t.admin.gpuManagement.googleAuthDialog.errors.cookiesRequired.description,
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
          title: t.admin.gpuManagement.googleAuthDialog.errors.cookiesInvalid.title,
          description: t.admin.gpuManagement.googleAuthDialog.errors.cookiesInvalid.description,
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
        title: t.admin.gpuManagement.googleAuthDialog.errors.processingError.title,
        description: error instanceof Error ? error.message : t.admin.gpuManagement.googleAuthDialog.errors.processingError.fallback,
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: t.admin.gpuManagement.googleAuthDialog.toasts.copied.title,
      description: t.admin.gpuManagement.googleAuthDialog.toasts.copied.description,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild data-testid="button-open-google-auth-dialog">
        {trigger || (
          <Button variant="default">
            <Shield className="w-4 h-4 mr-2" />
            {t.admin.gpuManagement.googleAuthDialog.dialog.trigger}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t.admin.gpuManagement.googleAuthDialog.dialog.title}
          </DialogTitle>
          <DialogDescription>
            {t.admin.gpuManagement.googleAuthDialog.dialog.description}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={step} onValueChange={(v) => setStep(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="instructions" data-testid="tab-instructions">
              {t.admin.gpuManagement.googleAuthDialog.tabs.instructions}
            </TabsTrigger>
            <TabsTrigger value="kaggle" data-testid="tab-kaggle">
              {t.admin.gpuManagement.googleAuthDialog.tabs.kaggle}
            </TabsTrigger>
            <TabsTrigger value="colab" data-testid="tab-colab">
              {t.admin.gpuManagement.googleAuthDialog.tabs.colab}
            </TabsTrigger>
          </TabsList>

          {/* INSTRUCTIONS TAB */}
          <TabsContent value="instructions" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{t.admin.gpuManagement.googleAuthDialog.instructions.howItWorks.title}</AlertTitle>
              <AlertDescription>
                {t.admin.gpuManagement.googleAuthDialog.instructions.howItWorks.description}
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Chrome className="w-4 h-4" />
                {t.admin.gpuManagement.googleAuthDialog.instructions.prerequisites.title}
              </h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>{t.admin.gpuManagement.googleAuthDialog.instructions.prerequisites.chrome}</li>
                <li>{t.admin.gpuManagement.googleAuthDialog.instructions.prerequisites.account}</li>
                <li>{t.admin.gpuManagement.googleAuthDialog.instructions.prerequisites.devtools}</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4" />
                {t.admin.gpuManagement.googleAuthDialog.instructions.security.title}
              </h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>{t.admin.gpuManagement.googleAuthDialog.instructions.security.encryption}</li>
                <li>{t.admin.gpuManagement.googleAuthDialog.instructions.security.noPlaintext}</li>
                <li>{t.admin.gpuManagement.googleAuthDialog.instructions.security.autoValidation}</li>
                <li>{t.admin.gpuManagement.googleAuthDialog.instructions.security.expiration}</li>
              </ul>
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t.admin.gpuManagement.googleAuthDialog.instructions.warning.title}</AlertTitle>
              <AlertDescription>
                <span dangerouslySetInnerHTML={{ __html: t.admin.gpuManagement.googleAuthDialog.instructions.warning.kaggle }} />
                <br />
                <span dangerouslySetInnerHTML={{ __html: t.admin.gpuManagement.googleAuthDialog.instructions.warning.colab }} />
                <br />
                {t.admin.gpuManagement.googleAuthDialog.instructions.warning.auto}
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-2">
              <Button onClick={() => {
                setStep('kaggle');
                setProvider('kaggle');
              }} data-testid="button-next-to-kaggle">
                {t.admin.gpuManagement.googleAuthDialog.instructions.buttons.kaggle}
              </Button>
              <Button variant="outline" onClick={() => {
                setStep('colab');
                setProvider('colab');
              }} data-testid="button-next-to-colab">
                {t.admin.gpuManagement.googleAuthDialog.instructions.buttons.colab}
              </Button>
            </div>
          </TabsContent>

          {/* KAGGLE TAB */}
          <TabsContent value="kaggle" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{t.admin.gpuManagement.googleAuthDialog.kaggle.title}</AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">1</Badge>
                  <span>{t.admin.gpuManagement.googleAuthDialog.kaggle.step1}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">2</Badge>
                  <span>{t.admin.gpuManagement.googleAuthDialog.kaggle.step2}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">3</Badge>
                  <span>{t.admin.gpuManagement.googleAuthDialog.kaggle.step3}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">4</Badge>
                  <span>{t.admin.gpuManagement.googleAuthDialog.kaggle.step4}</span>
                </div>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>{t.admin.gpuManagement.googleAuthDialog.kaggle.cookieCommand.label}</Label>
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
              <Label htmlFor="kaggle-email">{t.admin.gpuManagement.googleAuthDialog.kaggle.email.label}</Label>
              <Input
                id="kaggle-email"
                type="email"
                placeholder={t.admin.gpuManagement.googleAuthDialog.kaggle.email.placeholder}
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                data-testid="input-account-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kaggle-cookies">{t.admin.gpuManagement.googleAuthDialog.kaggle.cookies.label}</Label>
              <Textarea
                id="kaggle-cookies"
                placeholder={t.admin.gpuManagement.googleAuthDialog.kaggle.cookies.placeholder}
                value={cookiesRaw}
                onChange={(e) => setCookiesRaw(e.target.value)}
                rows={6}
                className="font-mono text-xs"
                data-testid="textarea-cookies-raw"
              />
              <p className="text-xs text-muted-foreground">
                {t.admin.gpuManagement.googleAuthDialog.kaggle.cookies.hint}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('instructions')} data-testid="button-back">
                {t.admin.gpuManagement.googleAuthDialog.kaggle.buttons.back}
              </Button>
              <Button 
                onClick={handleSaveCookies} 
                disabled={saveMutation.isPending}
                data-testid="button-save-kaggle-cookies"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.admin.gpuManagement.googleAuthDialog.kaggle.buttons.saving}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {t.admin.gpuManagement.googleAuthDialog.kaggle.buttons.save}
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* COLAB TAB */}
          <TabsContent value="colab" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{t.admin.gpuManagement.googleAuthDialog.colab.title}</AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">1</Badge>
                  <span>{t.admin.gpuManagement.googleAuthDialog.colab.step1}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">2</Badge>
                  <span>{t.admin.gpuManagement.googleAuthDialog.colab.step2}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">3</Badge>
                  <span>{t.admin.gpuManagement.googleAuthDialog.colab.step3}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">4</Badge>
                  <span>{t.admin.gpuManagement.googleAuthDialog.colab.step4}</span>
                </div>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>{t.admin.gpuManagement.googleAuthDialog.colab.cookieCommand.label}</Label>
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
              <Label htmlFor="colab-email">{t.admin.gpuManagement.googleAuthDialog.colab.email.label}</Label>
              <Input
                id="colab-email"
                type="email"
                placeholder={t.admin.gpuManagement.googleAuthDialog.colab.email.placeholder}
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                data-testid="input-account-email-colab"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="colab-cookies">{t.admin.gpuManagement.googleAuthDialog.colab.cookies.label}</Label>
              <Textarea
                id="colab-cookies"
                placeholder={t.admin.gpuManagement.googleAuthDialog.colab.cookies.placeholder}
                value={cookiesRaw}
                onChange={(e) => setCookiesRaw(e.target.value)}
                rows={6}
                className="font-mono text-xs"
                data-testid="textarea-cookies-raw-colab"
              />
              <p className="text-xs text-muted-foreground">
                {t.admin.gpuManagement.googleAuthDialog.colab.cookies.hint}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('instructions')} data-testid="button-back-colab">
                {t.admin.gpuManagement.googleAuthDialog.colab.buttons.back}
              </Button>
              <Button 
                onClick={handleSaveCookies} 
                disabled={saveMutation.isPending}
                data-testid="button-save-colab-cookies"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.admin.gpuManagement.googleAuthDialog.colab.buttons.saving}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {t.admin.gpuManagement.googleAuthDialog.colab.buttons.save}
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
