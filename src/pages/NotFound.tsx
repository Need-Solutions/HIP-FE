import { ButtonLink } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-bold text-sun-dark">404</p>
        <h1 className="mt-2 text-3xl">This trail doesn’t exist</h1>
        <ButtonLink to="/" className="mt-6">Back to home</ButtonLink>
      </div>
    </div>
  );
}
