export function CardSkeleton() {
  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md border border-gray-200 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-200 rounded w-2/3" />
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
        <div className="flex justify-between">
          <div className="h-3 bg-gray-200 rounded w-16" />
          <div className="h-3 bg-gray-200 rounded w-20" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 bg-gray-200 rounded w-12" />
          <div className="h-3 bg-gray-200 rounded w-20" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 bg-gray-200 rounded w-14" />
          <div className="h-3 bg-gray-200 rounded w-20" />
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="h-6 bg-gray-200 rounded-full w-24" />
      </div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="mt-6 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-48 mb-4" />
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3">
          <div className="flex gap-8">
            <div className="h-3 bg-gray-200 rounded w-8" />
            <div className="h-3 bg-gray-200 rounded w-24" />
            <div className="h-3 bg-gray-200 rounded w-20" />
            <div className="h-3 bg-gray-200 rounded w-16 ml-auto" />
            <div className="h-3 bg-gray-200 rounded w-16" />
            <div className="h-3 bg-gray-200 rounded w-20" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 py-3 border-t border-gray-100">
            <div className="flex gap-8">
              <div className="h-3 bg-gray-100 rounded w-8" />
              <div className="h-3 bg-gray-100 rounded w-24" />
              <div className="h-3 bg-gray-100 rounded w-20" />
              <div className="h-3 bg-gray-100 rounded w-16 ml-auto" />
              <div className="h-3 bg-gray-100 rounded w-16" />
              <div className="h-3 bg-gray-100 rounded w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
