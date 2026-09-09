import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-white p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex mb-4 gap-2 items-center">
          <AlertCircle className="h-8 w-8 text-rose-500" />
          <h1 className="text-2xl font-bold text-white">
            404 Page Not Found
          </h1>
        </div>

        <p className="mt-4 text-sm text-slate-400">
          ไม่พบหน้าที่คุณต้องการ
        </p>
      </div>
    </div>
  );
}
