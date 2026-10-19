import { formatCents, parseCents, paymentAppLinks } from '@spendly/ledger';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  claimPayment,
  flagProblem,
  getShare,
  setTextOptIn,
  type ShareExpense,
  type SharePage,
} from './api';
import {
  amountDue,
  firstName,
  formatDay,
  formatZelle,
  explainYours,
  itemTitle,
  whoFor,
  paymentNote,
  tokenFromHash,
} from './view';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: SharePage };

const GET_APP_URL = import.meta.env.VITE_GET_APP_URL as string | undefined;

export function App() {
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [load, setLoad] = useState<Load>(
    token ? { status: 'loading' } : { status: 'error', message: NOT_A_LINK },
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setLoad({ status: 'ready', page: await getShare(token) });
    } catch (e) {
      setLoad({ status: 'error', message: e instanceof ApiError ? e.message : NOT_A_LINK });
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="page">
      <p className="brand">Spendly</p>
      {load.status === 'loading' ? (
        <p className="small" role="status">
          Loading your share…
        </p>
      ) : load.status === 'error' ? (
        <section className="stack">
          <h1 className="title">This link doesn’t work</h1>
          <p className="body">{load.message}</p>
        </section>
      ) : token ? (
        <Share page={load.page} token={token} onChanged={refresh} />
      ) : null}
      {GET_APP_URL ? (
        <footer className="footer">
          <a href={GET_APP_URL}>Get the Spendly app</a> to split receipts and track what you owe.
        </footer>
      ) : null}
    </main>
  );
}

const NOT_A_LINK = 'Ask the person who sent it for a new one.';

function Share({
  page,
  token,
  onChanged,
}: {
  page: SharePage;
  token: string;
  onChanged: () => Promise<void>;
}) {
  const payer = firstName(page.payer_name);
  const due = amountDue(page);
  const links = due > 0 ? paymentAppLinks(page.handles, due, paymentNote(page.expenses)) : [];
  const [open, setOpen] = useState<'none' | 'paid' | 'problem'>('none');
  const [thanks, setThanks] = useState<string | null>(null);

  return (
    <>
      <h1 className="title">Private link for {firstName(page.person_name)}</h1>

      <section className="key" aria-live="polite">
        {page.owed_cents > 0 ? (
          <>
            <p className="heading">{payer} says you owe</p>
            <p className="big">{formatCents(page.owed_cents)}</p>
          </>
        ) : page.owed_cents < 0 ? (
          <>
            <p className="heading">{payer} owes you</p>
            <p className="big">{formatCents(-page.owed_cents)}</p>
          </>
        ) : (
          <>
            <p className="heading">You’re settled up with {payer}</p>
            <p className="big">{formatCents(0)}</p>
          </>
        )}
        <p className="small">{page.group_name}</p>
        {page.pending_cents > 0 ? (
          <p className="small">
            You said you paid {formatCents(page.pending_cents)} · waiting for {payer} to confirm
          </p>
        ) : null}
      </section>

      {thanks ? (
        <p className="notice" role="status">
          {thanks}
        </p>
      ) : null}

      {due > 0 ? (
        <section className="stack">
          {links.length > 0 || page.handles.zelle ? (
            <p className="small">Pay {formatCents(due)} with any of these:</p>
          ) : (
            <p className="small">
              {payer} hasn’t added Venmo, PayPal, Cash App or Zelle. Pay them the way you usually
              do, then tell them below.
            </p>
          )}
          {links.map((link) => (
            <a key={link.app} className="button secondary" href={link.url} rel="noreferrer">
              Pay with {link.label}
            </a>
          ))}
          {page.handles.zelle ? <ZelleRow contact={page.handles.zelle} /> : null}
          {open === 'paid' ? (
            <PaidForm
              payer={payer}
              dueCents={due}
              onCancel={() => setOpen('none')}
              onSubmit={async (cents, method) => {
                await claimPayment(token, cents, method);
                setOpen('none');
                setThanks(`Thanks! ${payer} will confirm they got ${formatCents(cents)}.`);
                await onChanged();
              }}
            />
          ) : (
            <>
              <p className="small">Then tell {payer}, so it counts once they confirm.</p>
              <button type="button" className="button primary" onClick={() => setOpen('paid')}>
                I paid {payer}
              </button>
            </>
          )}
        </section>
      ) : null}

      <section className="stack">
        <h2 className="heading">What it’s for</h2>
        {page.expenses.length === 0 ? (
          <p className="small">
            {page.owed_cents > 0 ? 'Nothing yet.' : `Nothing you owe ${payer} for right now.`}
          </p>
        ) : (
          <ul className="list">
            {page.expenses.map((expense, index) => (
              <Expense key={index} expense={expense} />
            ))}
          </ul>
        )}
        {page.earlier_count > 0 && page.expenses.length > 0 ? (
          <p className="small">
            {page.earlier_count === 1
              ? 'One earlier expense is paid off and not shown.'
              : `${page.earlier_count} earlier expenses are paid off and not shown.`}
          </p>
        ) : null}
        <p className="small">
          Everyone in {page.group_name} sees the same receipts. Shared items show their full price.
        </p>
      </section>

      {open === 'problem' ? (
        <ProblemForm
          payer={payer}
          onCancel={() => setOpen('none')}
          onSubmit={async (message) => {
            await flagProblem(token, message);
            setOpen('none');
            setThanks(`Sent. ${payer} will see your note in the app.`);
          }}
        />
      ) : (
        <button type="button" className="text-button" onClick={() => setOpen('problem')}>
          Something looks wrong
        </button>
      )}

      <TextOptIn token={token} payer={payer} initial={page.texts_opted_in} />
    </>
  );
}

/** Zelle has no payment links: where to send it, with a copy button. */
function ZelleRow({ contact }: { contact: string }) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  return (
    <div className="zelle">
      <p className="small-ink">
        <span className="body-medium">Zelle:</span> send it to{' '}
        <span className="selectable">{formatZelle(contact)}</span> in your bank’s app
      </p>
      <button
        type="button"
        className="chip"
        onClick={() => {
          // The clipboard only exists on https (and localhost), not the dev server over Wi-Fi.
          if (!navigator.clipboard) return setCopied('failed');
          navigator.clipboard.writeText(contact).then(
            () => setCopied('yes'),
            () => setCopied('failed'),
          );
        }}
      >
        {copied === 'yes' ? 'Copied' : 'Copy'}
      </button>
      {copied === 'failed' ? (
        <p className="small" role="status">
          Couldn’t copy. Press and hold the address to copy it.
        </p>
      ) : null}
    </div>
  );
}

/** One expense: how your share was worked out, then the whole receipt. */
function Expense({ expense }: { expense: ShareExpense }) {
  const yours = explainYours(expense);
  const lines = expense.items.filter((item) => item.kind === 'item');
  const extras = expense.items.filter((item) => item.kind !== 'item');
  return (
    <li className="expense">
      <div className="row">
        <span className="body-medium">{expense.merchant}</span>
        <span className="body-medium money">{formatCents(expense.amount_cents)}</span>
      </div>
      <p className="small">
        {formatDay(expense.expense_date)} · your share of {formatCents(expense.total_cents)}
      </p>

      {yours ? (
        <div className="breakdown">
          <p className="label">How your {formatCents(yours.totalCents)} was worked out</p>
          <ul className="items">
            {yours.items.map((row, i) => (
              <Line key={i} title={row.title} detail={row.detail} cents={row.cents} />
            ))}
            {yours.adjustments.length > 0 ? (
              <>
                <Line
                  title="Your items"
                  detail={`${yours.percent} of all items, so ${yours.percent} of the rest`}
                  cents={yours.itemsCents}
                />
                {yours.adjustments.map((row, i) => (
                  <Line key={`a${i}`} title={row.title} detail={row.detail} cents={row.cents} />
                ))}
              </>
            ) : null}
            <Line title="Your share" detail={null} cents={yours.totalCents} strong />
          </ul>
        </div>
      ) : null}

      <details className="receipt">
        <summary>The whole receipt · {formatCents(expense.total_cents)}</summary>
        <ul className="items">
          {lines.map((item, i) => (
            <Line
              key={i}
              title={itemTitle(item)}
              detail={whoFor(item, expense)}
              cents={item.amount_cents}
            />
          ))}
          {extras.map((item, i) => (
            <Line
              key={`x${i}`}
              title={item.name}
              detail="Split in proportion to items"
              cents={item.amount_cents}
            />
          ))}
          <Line title="Total" detail={null} cents={expense.total_cents} strong />
        </ul>
        <p className="label">Everyone’s shares</p>
        <ul className="items">
          {expense.shares.map((share) => {
            const person = expense.people.find((p) => p.ref === share.ref);
            return (
              <Line
                key={share.ref}
                title={person?.you ? `${person.name} (you)` : (person?.name ?? 'Someone')}
                detail={null}
                cents={share.amount_cents}
              />
            );
          })}
        </ul>
      </details>
    </li>
  );
}

function Line({
  title,
  detail,
  cents,
  strong = false,
}: {
  title: string;
  detail: string | null;
  cents: number;
  strong?: boolean;
}) {
  return (
    <li className="row">
      <span className={strong ? 'body-medium' : 'small-ink'}>
        {title}
        {detail ? <span className="small"> · {detail}</span> : null}
      </span>
      <span className={strong ? 'body-medium money' : 'small money'}>{formatCents(cents)}</span>
    </li>
  );
}

const METHODS = [
  { value: 'venmo', label: 'Venmo' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

function PaidForm({
  payer,
  dueCents,
  onSubmit,
  onCancel,
}: {
  payer: string;
  dueCents: number;
  onSubmit: (cents: number, method: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(formatCents(dueCents).replace('$', ''));
  const [method, setMethod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cents = parseCents(amount);
    if (cents === null || cents <= 0) return setError('Enter an amount, like 15.00.');
    if (cents > dueCents) return setError(`That’s more than you owe (${formatCents(dueCents)}).`);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cents, method);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span className="heading">How much did you pay {payer}?</span>
        <span className="amount">
          <span aria-hidden="true">$</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="paid-hint"
          />
        </span>
        <span id="paid-hint" className="small">
          You can pay part of it. {payer} confirms it before it counts.
        </span>
      </label>
      <fieldset className="chips">
        <legend className="small">How (optional)</legend>
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            className={method === m.value ? 'chip selected' : 'chip'}
            aria-pressed={method === m.value}
            onClick={() => setMethod(method === m.value ? null : m.value)}
          >
            {m.label}
          </button>
        ))}
      </fieldset>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? 'Sending…' : `Tell ${payer} I paid`}
      </button>
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

function ProblemForm({
  payer,
  onSubmit,
  onCancel,
}: {
  payer: string;
  onSubmit: (message: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return setError('Say what looks wrong.');
    setBusy(true);
    setError(null);
    try {
      await onSubmit(message.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span className="heading">What looks wrong?</span>
        <textarea
          rows={3}
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="I didn’t get the dish soap"
        />
        <span className="small">{payer} sees this in the app.</span>
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? 'Sending…' : `Send to ${payer}`}
      </button>
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/** Unchecked by default. Checking it asks for their own number, then saves the consent. */
function TextOptIn({ token, payer, initial }: { token: string; payer: string; initial: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [checked, setChecked] = useState(initial);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(optIn: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setTextOptIn(token, optIn, optIn ? phone : null);
      setSaved(optIn);
      setChecked(optIn);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack opt-in">
      <label className="check">
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.checked;
            setChecked(next);
            setError(null);
            if (!next && saved) void save(false);
          }}
        />
        <span className="small-ink">
          Text me about payments with {payer}. Msg and data rates may apply. Reply STOP to opt out.
        </span>
      </label>
      {checked && !saved ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
        >
          <label className="field">
            <span className="small">Your phone number</span>
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="(608) 555-1234"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <button type="submit" className="button secondary" disabled={busy || !phone.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : null}
      {saved ? <p className="small">You’ll get texts about payments with {payer}.</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
