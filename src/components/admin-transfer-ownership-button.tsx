'use client'

// Kolasys AI — Placeholder Transfer Ownership button on the admin members
// panel. Real flow not built yet; clicking just confirms intent.

export function TransferOwnershipButton({ orgName }: { orgName: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        alert(
          `Transferring ownership of "${orgName}" is not yet implemented.\n\n` +
            `For now, please contact the org owner directly or remove + re-add ` +
            `the new owner via Clerk.`,
        )
      }
      className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
    >
      Transfer ownership
    </button>
  )
}
