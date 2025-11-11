import { Card, CardHeader, CardContent } from "@/components/ui/card";

interface SkeletonLoaderProps {
  type?: 'card' | 'metric' | 'table' | 'chart';
  count?: number;
}

export function SkeletonLoader({ type = 'card', count = 1 }: SkeletonLoaderProps) {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  if (type === 'metric') {
    return (
      <>
        {skeletons.map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="h-4 w-24 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 bg-muted rounded mb-2" />
              <div className="h-3 w-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </>
    );
  }

  if (type === 'table') {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {skeletons.map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="h-10 w-10 bg-muted rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === 'chart') {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="h-3 w-48 bg-muted rounded mt-2" />
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {skeletons.map((i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-3 w-48 bg-muted rounded mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded" />
              <div className="h-4 bg-muted rounded w-5/6" />
              <div className="h-4 bg-muted rounded w-4/6" />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
