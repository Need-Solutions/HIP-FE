import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Minus, ShieldCheck, UserCog, UserPlus } from 'lucide-react';
import { adminPeopleApi, type StaffMember } from '@/api/endpoints';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Select, Skeleton, Table, TBody, Td, Th, THead, Tr, type BadgeTone } from '@/components/ui';
import { AuthenticatorDialog, InviteStaffDialog } from '@/components/admin/StaffDialogs';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useCan } from '@/features/auth/useCan';
import { formatDate, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import { PERMISSION_ROWS, ROLE_ACCESS, ROLE_LABEL, STAFF_ROLES, roleHas, type StaffRole } from '@/lib/permissions';

// Figma: "Admin / Staff & roles" (ADM-001..ADM-008). Only super admins manage staff. Nobody can change their own role
// or deactivate themselves (ADM-005), and the last super admin can't be demoted. Every change is audit-logged.
// Two-step login uses an authenticator app; each person sets up their own, and a super admin can reset someone's.

const statusBadge: Record<StaffMember['status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'green' },
  invited: { label: 'Invited', tone: 'blue' },
  deactivated: { label: 'Deactivated', tone: 'gray' },
};

function lastActive(iso?: string) {
  if (!iso) return '—';
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (mins < 5) return 'Now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hrs ago`;
  if (mins < 48 * 60) return 'Yesterday';
  return formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function Staff() {
  const manage = useCan('manage_staff');
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [totp, setTotp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['admin', 'staff'], queryFn: adminPeopleApi.staff });
  useAdminTitle('Staff & roles', data ? `${data.filter((m) => m.status !== 'invited').length} staff accounts${data.some((m) => m.status === 'invited') ? ` · ${data.filter((m) => m.status === 'invited').length} invited` : ''}` : undefined);

  const act = async (id: string, run: () => Promise<unknown>, message: string) => {
    setBusy(id);
    setNotice(null);
    try {
      await run();
      setNotice(message);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t save that. Please try again.'), { id: 'staff' });
    } finally {
      setBusy(null);
    }
  };

  const me = data?.find((m) => m.isYou);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate">{manage ? 'Invite staff, set their role and look after two-step login.' : 'Only a super admin can change staff and roles.'}</p>
        {manage && <Button onClick={() => setInviting(true)}><UserPlus size={16} aria-hidden /> Invite staff</Button>}
      </div>
      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}

      {me && !me.twoFactor.setUp && (
        <Alert tone="warning" title="Two-step login isn’t set up for your account" className="mt-4">
          Staff sign in with a code from an authenticator app.{' '}
          <button type="button" className="font-bold text-forest underline" onClick={() => setTotp(true)}>Set it up now</button>
        </Alert>
      )}

      <Card className="mt-5 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !data ? (
          <EmptyState className="border-0" icon={UserCog} title="We couldn’t load staff" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : (
          <Table caption="Staff accounts" minWidth={1040}>
            <THead>
              <Th>Staff member</Th>
              <Th>Role</Th>
              <Th>Access</Th>
              <Th>Two-step</Th>
              <Th>Last active</Th>
              <Th>Status</Th>
              <Th><span className="sr-only">Actions</span></Th>
            </THead>
            <TBody>
              {data.map((m) => {
                const editable = manage && !m.isYou && m.status !== 'deactivated';
                return (
                  <Tr key={m.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} tone={m.role === 'super_admin' ? 'sun' : 'forest'} />
                        <div className="min-w-0">
                          <p className="whitespace-nowrap font-semibold text-ink">{m.name} {m.isYou && <Badge tone="dark" className="ml-1 align-middle">You</Badge>}</p>
                          <p className="truncate text-xs text-slate">{m.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {editable ? (
                        <Select
                          label={`Role for ${m.name}`}
                          hideLabel
                          value={m.role}
                          disabled={busy === m.id}
                          className="w-[160px]"
                          onChange={(e) => {
                            const role = e.target.value as StaffRole;
                            void act(m.id, () => adminPeopleApi.changeRole(m.id, role), `${m.name} is now ${ROLE_LABEL[role]}. Saved to the audit log.`);
                          }}
                        >
                          {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </Select>
                      ) : (
                        <span className="font-semibold" title={m.isYou ? 'You can’t change your own role (ADM-005).' : undefined}>{ROLE_LABEL[m.role]}</span>
                      )}
                    </Td>
                    <Td className="min-w-[200px] text-slate">{ROLE_ACCESS[m.role]}</Td>
                    <Td>
                      {m.status === 'invited' ? (
                        <span className="text-xs text-slate">At first sign-in</span>
                      ) : m.twoFactor.setUp ? (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-forest"><ShieldCheck size={15} aria-hidden /> Set up</span>
                      ) : (
                        <Badge tone="amber">Not set up</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{m.status === 'invited' ? '—' : lastActive(m.lastActiveAt)}</Td>
                    <Td><Badge tone={statusBadge[m.status].tone}>{statusBadge[m.status].label}</Badge></Td>
                    <Td className="whitespace-nowrap text-right text-sm font-bold">
                      <div className="flex justify-end gap-4">
                        {m.isYou && (
                          <button type="button" className="text-forest hover:underline" onClick={() => setTotp(true)}>{m.twoFactor.setUp ? 'Reset my authenticator' : 'Set up authenticator'}</button>
                        )}
                        {manage && !m.isYou && m.status === 'invited' && (
                          <>
                            <button type="button" disabled={busy === m.id} className="text-forest hover:underline" onClick={() => act(m.id, () => adminPeopleApi.resendInvite(m.id), `Invite sent again to ${m.email}.`)}>Resend</button>
                            <button type="button" disabled={busy === m.id} className="text-danger hover:underline" onClick={() => act(m.id, () => adminPeopleApi.setStaffActive(m.id, false), `Invite for ${m.email} cancelled.`)}>Cancel invite</button>
                          </>
                        )}
                        {manage && !m.isYou && m.status === 'active' && (
                          <>
                            {m.twoFactor.setUp && (
                              <button type="button" disabled={busy === m.id} className="text-forest hover:underline" onClick={() => act(m.id, () => adminPeopleApi.resetTwoFactor(m.id), `${m.name} will set up two-step login again at their next sign-in.`)}>Reset two-step</button>
                            )}
                            <button type="button" disabled={busy === m.id} className="text-danger hover:underline" onClick={() => act(m.id, () => adminPeopleApi.setStaffActive(m.id, false), `${m.name} is deactivated and can’t sign in.`)}>Deactivate</button>
                          </>
                        )}
                        {manage && !m.isYou && m.status === 'deactivated' && (
                          <button type="button" disabled={busy === m.id} className="text-forest hover:underline" onClick={() => act(m.id, () => adminPeopleApi.setStaffActive(m.id, true), `${m.name} can sign in again.`)}>Activate</button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="mt-5 overflow-hidden">
        <div className="px-6 py-5">
          <h2 className="text-lg">Role permissions</h2>
          <p className="mt-1 text-sm text-slate">You can’t change your own role. Changes are recorded in the audit log.</p>
        </div>
        <Table caption="What each role can do" minWidth={720}>
          <THead>
            <Th>Permission</Th>
            {STAFF_ROLES.map((r) => <Th key={r} className="text-center">{ROLE_LABEL[r]}</Th>)}
          </THead>
          <TBody>
            {PERMISSION_ROWS.map((row) => (
              <Tr key={row.permission}>
                <Td>
                  <p className="font-semibold">{row.label}</p>
                  {row.note && <p className="text-xs text-slate">{row.note}</p>}
                </Td>
                {STAFF_ROLES.map((r) => (
                  <Td key={r} className="text-center">
                    {roleHas(r, row.permission) ? (
                      <Check size={18} strokeWidth={2.75} className="inline text-forest" aria-label="Allowed" />
                    ) : (
                      <Minus size={18} className="inline text-slate-mute" aria-label="Not allowed" />
                    )}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <InviteStaffDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onInvited={(m) => {
          setInviting(false);
          setNotice(`Invite sent to ${m.email} as ${ROLE_LABEL[m.role]}.`);
          void queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
        }}
      />
      <AuthenticatorDialog
        open={totp}
        onClose={() => setTotp(false)}
        onDone={(m) => {
          setTotp(false);
          setNotice(`Two-step login is on for your account (${formatDate(m.twoFactor.setUpAt ?? new Date().toISOString())}, ${formatTime(m.twoFactor.setUpAt ?? new Date().toISOString())}). Use the app’s code when you sign in.`);
          void queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
        }}
      />
    </div>
  );
}
