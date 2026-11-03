"use client";

import { ChevronDown } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Fragment, useEffect, useMemo, useState } from "react";

import { currencyRates } from "@/actions/currencies";
import { OptionSheet } from "@/components/forms/option-sheet";
import { CURRENCIES, type Currency } from "@/domain/money";
import type { FxRates } from "@/integrations/currencies/types";
import { cn } from "@/lib/utils";

type Rates = FxRates;
const cache = new Map<string, Promise<Rates>>();

function useRates(base: Currency, enabled: boolean): Rates | null {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let p = cache.get(base);
    if (!p) {
      p = currencyRates({ base })
        .then((r) => (r.ok ? r.data : { day: null, rates: {}, sources: [] }))
        .catch(() => ({ day: null, rates: {}, sources: [] }));
      void p.then((r) => r.day === null && cache.delete(base));
      cache.set(base, p);
    }
    void p.then((r) => alive && setRates(r));
    return () => {
      alive = false;
    };
  }, [base, enabled]);
  return rates;
}

export function CurrencySheet({
  open,
  onOpenChange,
  title,
  value,
  onSelect,
  base,
  exclude,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: Currency;
  onSelect: (c: Currency) => void;
  base: Currency;
  exclude?: Currency[];
}) {
  const t = useTranslations("account");
  const locale = useLocale();
  const format = useFormatter();
  const fx = useRates(base, open);

  const options = useMemo(() => {
    if (!open) return [];
    const names = new Intl.DisplayNames([locale], { type: "currency" });
    const rate = (r: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: base,
        currencyDisplay: "narrowSymbol",
        ...(r >= 100
          ? { maximumFractionDigits: 0 }
          : r >= 1
            ? { maximumFractionDigits: 2 }
            : { maximumSignificantDigits: 3 }),
      }).format(r);
    return CURRENCIES.filter((c) => !exclude?.includes(c)).map((c) => {
      let name: string | undefined;
      try {
        name = names.of(c);
      } catch {}
      const r = fx?.rates[c];
      return {
        value: c,
        label: c,
        hint: name && name !== c ? name : undefined,
        aside: c === base ? t("currencyMain") : r ? `1 ${c} ≈ ${rate(r)}` : undefined,
      };
    });
  }, [open, locale, base, exclude, fx, t]);

  return (
    <OptionSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      value={value}
      options={options}
      onSelect={onSelect}
      searchable
      footer={
        fx && Object.keys(fx.rates).length > 0
          ? t.rich("ratesSource", {
              date: fx.day
                ? format.dateTime(new Date(`${fx.day}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" })
                : "none",
              source: fx.sources.map((s) => s.name).join(", "),
              link: () => (
                <>
                  {fx.sources.map((source, index) => (
                    <Fragment key={source.id}>
                      {index > 0 ? ", " : null}
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
                          {source.name}
                        </a>
                      ) : (
                        source.name
                      )}
                    </Fragment>
                  ))}
                </>
              ),
            })
          : undefined
      }
    />
  );
}

export function CurrencyField({
  id,
  value,
  onChange,
  base,
  title,
  exclude,
  className,
  "aria-label": ariaLabel,
}: {
  "id"?: string;
  "value": Currency;
  "onChange": (c: Currency) => void;
  "base": Currency;
  "title": string;
  "exclude"?: Currency[];
  "className"?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        onClick={() => setOpen(true)}
        className={cn(
          "relative flex h-12 w-full items-center rounded-md border border-input bg-transparent pr-10 pl-3 text-left text-base outline-none focus-visible:border-foreground",
          className,
        )}
      >
        {value}
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </button>
      <CurrencySheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        value={value}
        onSelect={onChange}
        base={base}
        exclude={exclude}
      />
    </>
  );
}
