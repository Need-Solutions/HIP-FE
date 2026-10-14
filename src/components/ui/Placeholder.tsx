import { Card } from './Card';

/**
 * Temporary stand-in for a screen that hasn't been built yet.
 * `figma` is the exact frame name in the HIP Figma file; `srs` lists the requirement IDs it covers.
 */
export function Placeholder({ figma, srs, notes }: { figma: string; srs?: string[]; notes?: string[] }) {
  return (
    <Card className="border-dashed p-8">
      <p className="text-xs font-bold uppercase tracking-wider text-sun-dark">To build</p>
      <p className="mt-2 text-lg font-bold">Figma frame: “{figma}”</p>
      {srs && <p className="mt-1 text-sm text-slate">Requirements: {srs.join(', ')}</p>}
      {notes && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </Card>
  );
}
