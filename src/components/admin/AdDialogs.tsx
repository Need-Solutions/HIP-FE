import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { adsAdminApi } from '@/api/endpoints';
import { Button, Dialog, RadioCard, Textarea } from '@/components/ui';
import { PLACEMENT_LABEL, scheduleRange } from '@/lib/ads';
import { errorMessage, notifyError } from '@/lib/notify';
import type { AdCampaign } from '@/types/domain';
import { AdCreative } from '@/components/ads/AdCreative';

// Admin / Ads dialogs. Approving needs no reason (an optional note); rejecting needs one, which the advertiser sees.
// Ending a campaign early needs a reason too. Every decision goes to the audit log.

const reviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject'], { errorMap: () => ({ message: 'Choose approve or reject' }) }),
    reason: z.string().trim().max(500, 'Keep it under 500 characters'),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'reject' && v.reason.length < 10) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason of at least 10 characters. The advertiser sees it.' });
  });
type ReviewValues = z.input<typeof reviewSchema>;

export function ReviewAdDialog({ ad, onClose, onDone }: { ad: AdCampaign | null; onClose: () => void; onDone: (ad: AdCampaign) => void }) {
  return (
    <Dialog open={!!ad} onClose={onClose} title="Review campaign" className="max-w-xl">
      {ad && <ReviewForm key={ad.id} ad={ad} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function ReviewForm({ ad, onClose, onDone }: { ad: AdCampaign; onClose: () => void; onDone: (ad: AdCampaign) => void }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ReviewValues>({ resolver: zodResolver(reviewSchema), defaultValues: { decision: undefined as unknown as ReviewValues['decision'], reason: '' } });
  const decision = watch('decision');
  return (
    <form
      noValidate
      className="p-6"
      onSubmit={handleSubmit(async (v) => {
        try {
          onDone(await adsAdminApi.review(ad.id, v.decision, v.reason || undefined));
        } catch (err) {
          notifyError(errorMessage(err, 'We couldn’t save the decision. Please try again.'), { id: 'ad-review' });
        }
      })}
    >
      <h2 className="text-xl">Review “{ad.name}”</h2>
      <p className="mt-1 text-sm text-slate">
        {ad.advertiserName} · {PLACEMENT_LABEL[ad.placement]} · {scheduleRange(ad.startsAt, ad.endsAt, true)}
      </p>
      <div className="mt-4 rounded-xl bg-canvas p-3">
        <AdCreative ad={ad} variant="card" layout="desktop" className="mx-auto max-w-[320px] bg-white" />
        <p className="mt-2 break-all text-center text-xs text-slate">Links to {ad.destinationUrl}</p>
      </div>
      <fieldset className="mt-5">
        <legend className="label">Decision</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <RadioCard name="decision" value="approve" checked={decision === 'approve'} onChange={() => setValue('decision', 'approve', { shouldValidate: true })} title="Approve" description="Goes live on its start date" />
          <RadioCard name="decision" value="reject" checked={decision === 'reject'} onChange={() => setValue('decision', 'reject', { shouldValidate: true })} title="Reject" description="The advertiser can edit and resubmit" />
        </div>
        {errors.decision && <p className="mt-1.5 text-xs text-danger">{errors.decision.message}</p>}
      </fieldset>
      <Textarea label={decision === 'reject' ? 'Reason (required, shown to the advertiser)' : 'Note (optional)'} className="mt-4" rows={3} {...register('reason')} error={errors.reason?.message} />
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant={decision === 'reject' ? 'danger' : 'primary'} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : decision === 'reject' ? 'Reject campaign' : decision === 'approve' ? 'Approve campaign' : 'Save decision'}
        </Button>
      </div>
    </form>
  );
}

const endSchema = z.object({ reason: z.string().trim().min(10, 'Give a reason of at least 10 characters. It goes in the audit log.').max(500, 'Keep it under 500 characters') });

export function EndAdDialog({ ad, onClose, onDone }: { ad: AdCampaign | null; onClose: () => void; onDone: (ad: AdCampaign) => void }) {
  return (
    <Dialog open={!!ad} onClose={onClose} title="End campaign" className="max-w-lg">
      {ad && <EndForm key={ad.id} ad={ad} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function EndForm({ ad, onClose, onDone }: { ad: AdCampaign; onClose: () => void; onDone: (ad: AdCampaign) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({ resolver: zodResolver(endSchema), defaultValues: { reason: '' } });
  return (
    <form
      noValidate
      className="p-6"
      onSubmit={handleSubmit(async ({ reason }) => {
        try {
          onDone(await adsAdminApi.terminate(ad.id, reason));
        } catch (err) {
          notifyError(errorMessage(err, 'We couldn’t end the campaign. Please try again.'), { id: 'ad-end' });
        }
      })}
    >
      <h2 className="text-xl">End “{ad.name}” now?</h2>
      <p className="mt-2 text-sm text-slate">It stops showing straight away and can’t be restarted. Its numbers stay on the performance page. To stop it for a while instead, pause it.</p>
      <Textarea label="Reason (required)" className="mt-4" rows={3} {...register('reason')} error={errors.reason?.message} />
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="danger" disabled={isSubmitting}>{isSubmitting ? 'Ending…' : 'End campaign'}</Button>
      </div>
    </form>
  );
}
