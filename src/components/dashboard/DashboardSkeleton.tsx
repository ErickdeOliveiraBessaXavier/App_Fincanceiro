import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const DashboardSkeleton = () => {
  return (
    <div className="space-y-10 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-14 w-48 rounded-2xl" />
      </div>

      {/* 3 Pillars Skeleton */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="border-none shadow-card">
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-4 w-56" />
              </div>
              <div className="pt-4 space-y-2">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-10 grid-cols-1 xl:grid-cols-12">
        {/* Main Area Skeleton */}
        <div className="xl:col-span-8 space-y-10">
          <Card className="h-[400px] border-none shadow-card">
            <CardHeader>
              <Skeleton className="h-8 w-48" />
            </CardHeader>
            <CardContent className="h-64 flex items-end gap-2 px-6">
              {[...Array(12)].map((_, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${Math.random() * 100}%` }} />
              ))}
            </CardContent>
          </Card>
          <Card className="h-[300px] border-none shadow-card">
            <CardContent className="p-6 space-y-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Action Center Skeleton */}
        <div className="xl:col-span-4">
          <Card className="h-[750px] border-none shadow-card rounded-3xl">
            <CardContent className="p-8 space-y-10">
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
              <div className="space-y-6">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardSkeleton;
