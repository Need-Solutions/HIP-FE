import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Dialog, Input } from '@/components/ui';
import type { TicketTypeInput } from '@/api/endpoints';

// Add or edit one ticket type (Figma "Admin / Create event" → Ticket types). Prices are typed in naira and stored
// in kobo.

const schema = z
  .object({
    name: z.string().trim().min(2, 'Give the ticket type a name').max(40, 'Keep it under 40 characters'),
    description: z.string().trim().max(120, 'Keep it under 120 characters'),
    price: z
      .string()
      .trim()
      .refine((v) => /^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, '')), 'Enter a price in naira, e.g. 15000 (0 for free)'),
    quantityLimit: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole tickets only').min(1, 'At least 1').max(10_000, 'Up to 10,000'),
    salesStart: z.string().min(1, 'Choose when sales start'),
    salesEnd: z.string().min(1, 'Choose when sales end'),
  })
  .refine((v) => !v.salesStart || !v.salesEnd || v.salesEnd >= v.salesStart, { path: ['salesEnd'], message: 'Sales can’t end before they start' });
type Values = z.input<typeof schema>;

const toValues = (t?: TicketTypeInput, defaults?: { salesEnd: string }): Values => ({
  name: t?.name ?? '',
  description: t?.description ?? '',
  price: t ? String(t.priceKobo / 100) : '',
  quantityLimit: t ? t.quantityLimit : ('' as unknown as number),
  salesStart: t?.salesStart ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date()),
  salesEnd: t?.salesEnd ?? defaults?.salesEnd ?? '',
});

export function TicketTypeDialog({
  open,
  initial,
  defaultSalesEnd,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: TicketTypeInput;
  /** The registration deadline's date, so new types stop selling when registration closes. */
  defaultSalesEnd: string;
  onClose: () => void;
  onSave: (t: TicketTypeInput) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Edit ticket type' : 'Add ticket type'}>
      {open && <TicketTypeForm initial={initial} defaultSalesEnd={defaultSalesEnd} onClose={onClose} onSave={onSave} />}
    </Dialog>
  );
}

function TicketTypeForm({ initial, defaultSalesEnd, onClose, onSave }: { initial?: TicketTypeInput; defaultSalesEnd: string; onClose: () => void; onSave: (t: TicketTypeInput) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(initial, { salesEnd: defaultSalesEnd }) });

  const submit = handleSubmit((v) => {
    const parsed = schema.parse(v);
    onSave({
      id: initial?.id,
      name: parsed.name,
      description: parsed.description || undefined,
      priceKobo: Math.round(Number(parsed.price.replace(/,/g, '')) * 100),
      quantityLimit: parsed.quantityLimit,
      salesStart: parsed.salesStart,
      salesEnd: parsed.salesEnd,
    });
  });

  return (
    <form
      noValidate
      className="p-6"
      onSubmit={(e) => {
        e.stopPropagation(); // keep the event form behind the dialog from submitting
        void submit(e);
      }}
    >
      <h2 className="text-xl">{initial ? 'Edit ticket type' : 'Add ticket type'}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input label="Name" placeholder="Standard" className="sm:col-span-2" {...register('name')} error={errors.name?.message} />
        <Input label="What’s included (optional)" placeholder="Trail access, guide and first aid" className="sm:col-span-2" {...register('description')} error={errors.description?.message} />
        <Input label="Price (₦)" inputMode="decimal" placeholder="15000" hint="0 makes it free" {...register('price')} error={errors.price?.message} />
        <Input label="Quantity" type="number" min={1} {...register('quantityLimit')} error={errors.quantityLimit?.message} />
        <Input label="Sales start" type="date" {...register('salesStart')} error={errors.salesStart?.message} />
        <Input label="Sales end" type="date" {...register('salesEnd')} error={errors.salesEnd?.message} />
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial ? 'Save' : 'Add ticket type'}</Button>
      </div>
    </form>
  );
}
