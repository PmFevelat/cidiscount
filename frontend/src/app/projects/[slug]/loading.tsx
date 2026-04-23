export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-8 py-10 shadow-lg">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#3a2ff2]" />
        </div>
        <div className="text-[14px] font-medium text-gray-700">
          Chargement du projet…
        </div>
        <div className="text-[12px] text-gray-500">
          Première ouverture : quelques secondes de compilation.
        </div>
      </div>
    </div>
  );
}
