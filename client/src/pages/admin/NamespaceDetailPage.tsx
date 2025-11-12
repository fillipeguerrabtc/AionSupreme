import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Sliders, FileCode, Zap, Trash2, Plus, TrendingUp } from "lucide-react";
import type { Namespace } from "@shared/schema";

export default function NamespaceDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const t = useTranslation();

  // Fetch namespace data
  const { data: namespace, isLoading } = useQuery<Namespace>({
    queryKey: ["/api/admin/namespaces", id],
    enabled: !!id,
  });

  // Local state for editing
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [systemPromptOverride, setSystemPromptOverride] = useState("");
  const [mergeStrategy, setMergeStrategy] = useState<"override" | "merge" | "fallback">("merge");
  const [triggers, setTriggers] = useState<string[]>([]);
  const [priority, setPriority] = useState(2);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  
  // Slider overrides (0-1 scale)
  const [sliders, setSliders] = useState({
    verbosity: 0.5,
    formality: 0.5,
    creativity: 0.5,
    precision: 0.5,
    persuasiveness: 0.5,
    empathy: 0.5,
    enthusiasm: 0.5,
  });
  const [useCustomSliders, setUseCustomSliders] = useState(false);
  
  // Trigger management
  const [newTrigger, setNewTrigger] = useState("");

  // Populate form when namespace loads
  useEffect(() => {
    if (namespace) {
      setName(namespace.name || "");
      setDescription(namespace.description || "");
      setIcon(namespace.icon || "");
      setSystemPromptOverride(namespace.systemPromptOverride || "");
      setMergeStrategy((namespace.mergeStrategy as "override" | "merge" | "fallback") || "merge");
      setTriggers(namespace.triggers || []);
      setPriority(namespace.priority ?? 2);
      setConfidenceThreshold(namespace.confidenceThreshold ?? 0.7);
      
      if (namespace.sliderOverrides) {
        setUseCustomSliders(true);
        setSliders({
          verbosity: namespace.sliderOverrides.verbosity ?? 0.5,
          formality: namespace.sliderOverrides.formality ?? 0.5,
          creativity: namespace.sliderOverrides.creativity ?? 0.5,
          precision: namespace.sliderOverrides.precision ?? 0.5,
          persuasiveness: namespace.sliderOverrides.persuasiveness ?? 0.5,
          empathy: namespace.sliderOverrides.empathy ?? 0.5,
          enthusiasm: namespace.sliderOverrides.enthusiasm ?? 0.5,
        });
      }
    }
  }, [namespace]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Namespace>) => {
      const response = await apiRequest(`/api/admin/namespaces/${id}`, {
        method: "PATCH",
        data,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/namespaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/namespaces", id] });
      toast({
        title: t.namespace.toast.updated,
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: t.namespace.toast.unknownError,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      name,
      description,
      icon,
      systemPromptOverride: systemPromptOverride || null,
      mergeStrategy,
      triggers: triggers.length > 0 ? triggers : null,
      priority,
      confidenceThreshold,
      sliderOverrides: useCustomSliders ? sliders : null,
    });
  };

  const addTrigger = () => {
    if (newTrigger.trim()) {
      setTriggers([...triggers, newTrigger.trim()]);
      setNewTrigger("");
    }
  };

  const removeTrigger = (index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!namespace) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Namespace Not Found</CardTitle>
            <CardDescription>The namespace you're looking for doesn't exist.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/admin/namespaces")} data-testid="button-back">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Namespaces
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/namespaces")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{namespace.name}</h1>
            <p className="text-muted-foreground">{namespace.description || "No description"}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save">
          <Save className="mr-2 h-4 w-4" />
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic" data-testid="tab-basic">Basic Info</TabsTrigger>
          <TabsTrigger value="sliders" data-testid="tab-sliders">
            <Sliders className="mr-2 h-4 w-4" />
            Personality Sliders
          </TabsTrigger>
          <TabsTrigger value="prompt" data-testid="tab-prompt">
            <FileCode className="mr-2 h-4 w-4" />
            System Prompt
          </TabsTrigger>
          <TabsTrigger value="triggers" data-testid="tab-triggers">
            <Zap className="mr-2 h-4 w-4" />
            Triggers & Priority
          </TabsTrigger>
        </TabsList>

        {/* Basic Info Tab */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Configure namespace identity and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="financas/investimentos"
                  data-testid="input-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this namespace..."
                  rows={3}
                  data-testid="input-description"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="icon">Icon (Lucide name)</Label>
                <Input
                  id="icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="Briefcase"
                  data-testid="input-icon"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personality Sliders Tab */}
        <TabsContent value="sliders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personality Sliders Override</CardTitle>
              <CardDescription>
                Customize AI personality traits specific to this namespace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <Label>Enable Custom Sliders</Label>
                <Button
                  variant={useCustomSliders ? "default" : "outline"}
                  onClick={() => setUseCustomSliders(!useCustomSliders)}
                  data-testid="button-toggle-sliders"
                >
                  {useCustomSliders ? "Enabled" : "Disabled"}
                </Button>
              </div>

              {useCustomSliders && (
                <div className="space-y-6">
                  {Object.entries(sliders).map(([trait, value]) => (
                    <div key={trait} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="capitalize">{trait}</Label>
                        <span className="text-sm text-muted-foreground">{Math.round(value * 100)}%</span>
                      </div>
                      <Slider
                        value={[value * 100]}
                        onValueChange={([newValue]) => setSliders({ ...sliders, [trait]: newValue / 100 })}
                        max={100}
                        step={1}
                        data-testid={`slider-${trait}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Prompt Tab */}
        <TabsContent value="prompt" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt Override</CardTitle>
              <CardDescription>
                Add namespace-specific instructions to the AI's system prompt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="merge-strategy">Merge Strategy</Label>
                <Select
                  value={mergeStrategy}
                  onValueChange={(value: "override" | "merge" | "fallback") => setMergeStrategy(value)}
                >
                  <SelectTrigger data-testid="select-merge-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="override">Override (Replace global prompt)</SelectItem>
                    <SelectItem value="merge">Merge (Combine with global prompt)</SelectItem>
                    <SelectItem value="fallback">Fallback (Use if no global prompt)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prompt">Custom System Prompt</Label>
                <Textarea
                  id="prompt"
                  value={systemPromptOverride}
                  onChange={(e) => setSystemPromptOverride(e.target.value)}
                  placeholder="You are a specialized AI assistant for..."
                  rows={8}
                  data-testid="input-prompt"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Triggers & Priority Tab */}
        <TabsContent value="triggers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detection Triggers</CardTitle>
              <CardDescription>
                Configure keywords and patterns to automatically activate this namespace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  placeholder="Add trigger keyword..."
                  onKeyPress={(e) => e.key === "Enter" && addTrigger()}
                  data-testid="input-new-trigger"
                />
                <Button onClick={addTrigger} data-testid="button-add-trigger">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {triggers.map((trigger, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-2">
                    {trigger}
                    <button
                      onClick={() => removeTrigger(index)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-remove-trigger-${index}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Priority (1=High, 2=Medium, 3=Low)</Label>
                  <Select
                    value={priority.toString()}
                    onValueChange={(value) => setPriority(parseInt(value))}
                  >
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - High Priority</SelectItem>
                      <SelectItem value="2">2 - Medium Priority</SelectItem>
                      <SelectItem value="3">3 - Low Priority</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Confidence Threshold</Label>
                    <span className="text-sm text-muted-foreground">{Math.round(confidenceThreshold * 100)}%</span>
                  </div>
                  <Slider
                    value={[confidenceThreshold * 100]}
                    onValueChange={([newValue]) => setConfidenceThreshold(newValue / 100)}
                    max={100}
                    step={1}
                    data-testid="slider-confidence"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
