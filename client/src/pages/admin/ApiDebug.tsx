import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function ApiDebug() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<Record<string, any> | null>(null);

  const testApis = async () => {
    setTesting(true);
    try {
      const data: any = await apiRequest("/api/admin/debug/test-free-apis", {
        method: "POST"
      });
      setResults(data.results);
    } catch (error: any) {
      setResults({ error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (result: any) => {
    if (!result) return null;
    if (result.success) return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (result.error) return <XCircle className="w-5 h-5 text-red-500" />;
    return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Debug de APIs Gratuitas</h2>
        <p className="text-muted-foreground">
          Testa conexão e autenticação com cada API
        </p>
      </div>

      <Button
        onClick={testApis}
        disabled={testing}
        data-testid="button-test-apis"
      >
        {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Testar Todas as APIs
      </Button>

      {results && (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(results).map(([provider, result]: [string, any]) => (
            <Card key={provider}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="capitalize">{provider}</span>
                  {getStatusIcon(result)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.success ? (
                  <Alert>
                    <CheckCircle2 className="w-4 h-4" />
                    <AlertDescription>
                      ✅ API funcionando!
                      {result.tokensUsed && ` (${result.tokensUsed} tokens usados)`}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    {result.status && (
                      <Badge variant="destructive">
                        HTTP {result.status}
                      </Badge>
                    )}
                    {result.error && (
                      <Alert variant="destructive">
                        <XCircle className="w-4 h-4" />
                        <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
                          {typeof result.error === 'string' 
                            ? result.error.substring(0, 500)
                            : JSON.stringify(result.error, null, 2).substring(0, 500)}
                        </AlertDescription>
                      </Alert>
                    )}
                    {result.headers && (
                      <details className="text-xs">
                        <summary className="cursor-pointer font-semibold">
                          Ver Headers
                        </summary>
                        <pre className="mt-2 bg-muted p-2 rounded overflow-auto max-h-40">
                          {JSON.stringify(result.headers, null, 2)}
                        </pre>
                      </details>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
