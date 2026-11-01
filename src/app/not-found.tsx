import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 text-slate-800">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-slate-200 text-center">
        <h2 className="text-4xl font-extrabold text-indigo-600 mb-2">404</h2>
        <h3 className="text-xl font-bold text-slate-800 mb-4">Page Not Found</h3>
        <p className="text-sm text-slate-600 mb-6">
          The page or trip you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-colors shadow-sm"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
