import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { joinTripByInviteCode, PermissionError } from '@/lib/permissions';

export default async function JoinTripPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    redirect(`/login?redirect=/join/${encodeURIComponent(inviteCode)}`);
  }

  let redirectTripId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const result = await joinTripByInviteCode(inviteCode, sessionUser.id);
    redirectTripId = result.trip.id;
  } catch (error) {
    if (error instanceof PermissionError) {
      errorMessage = error.message;
    } else {
      errorMessage = 'Failed to join trip. The invite link may be invalid or expired.';
    }
  }

  if (redirectTripId) {
    redirect(`/trips/${redirectTripId}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-6 text-center shadow-xl">
        <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 mx-auto flex items-center justify-center mb-4">
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Invalid Invite Link</h2>
        <p className="text-slate-400 text-sm mb-6">{errorMessage}</p>
        <Link
          href="/"
          className="inline-block w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
