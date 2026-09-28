"use client";

import { useEffect, useState } from "react";
import {
  fetchProfile,
  fetchRegionalBreakdown,
  fetchRegionalStats,
  PRIMARY_RENT_METRIC,
  type RegionalBreakdown,
  type RegionalStat,
  type SuburbProfile,
} from "@/lib/suburb-data";
import { useWorkspace } from "@/lib/workspace";
import { usePersona } from "@/lib/preferences";
import { personaConfig } from "@/lib/persona";
import { CARD_DIMENSIONS, cardForDimension, cardOrder, type CardKey } from "@/lib/sections";
import { AddressFacts } from "./address-facts";
import { ProfileHeader } from "./profile/profile-header";
import { KpiCards } from "./profile/kpi-cards";
import { HousingCard } from "./profile/housing-card";
import { PlanningCard } from "./profile/planning-card";
import { HazardsCard } from "./profile/hazards-card";
import { PeopleCard } from "./profile/people-card";
import { GettingAroundCard } from "./profile/getting-around-card";
import { SchoolsCard } from "./profile/schools-card";
import { GenericCard } from "./profile/generic-card";

/**
 * TRI-148 — the Profile tab is composition only: the property panel (when an
 * address is pinned) → the banner that draws the line between the property
 * and the area → header → KPI cards → six persona-ordered section cards on
 * the primitives kit. Which cards, in what order, is `lib/sections.ts`;
 * which rows, the registry.
 */
export function ProfilePanel({ sa2 }: { sa2: string }) {
  const { pin } = useWorkspace();
  // Persona drives card order. The null server snapshot means SSR and the
  // hydration render use DEFAULT_PERSONA; the stored persona applies in a
  // post-mount re-render (same mechanism as the budget/workplace prefs).
  const persona = usePersona();
  // Loading is derived: data is stale until its key matches the requested sa2.
  const [data, setData] = useState<{
    key: string;
    profile: SuburbProfile | null;
    stats: RegionalStat[];
    refs: Map<string, RegionalBreakdown | null>;
  } | null>(null);

  useEffect(() => {
    let stale = false;
    Promise.all([fetchProfile(sa2), fetchRegionalStats()])
      .then(async ([p, s]) => {
        // The Auckland composition behind every breakdown bar — cached after
        // the first profile, so later suburbs pay nothing.
        const keys = p?.breakdowns.map((b) => b.def.metric_key) ?? [];
        const refs = new Map<string, RegionalBreakdown | null>();
        await Promise.all(keys.map(async (k) => refs.set(k, await fetchRegionalBreakdown(k).catch(() => null))));
        return [p, s, refs] as const;
      })
      .then(([p, s, refs]) => {
        if (!stale) setData({ key: sa2, profile: p, stats: s, refs });
      });
    return () => {
      stale = true;
    };
  }, [sa2]);

  if (data?.key !== sa2) {
    return (
      <div className="flex animate-pulse flex-col gap-3 py-2" aria-busy="true" aria-label="Loading suburb profile">
        <div className="h-7 w-2/3 rounded bg-hairline/60" />
        <div className="h-3 w-1/2 rounded bg-hairline/50" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-card bg-hairline/40" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-2 flex flex-col gap-2">
            <div className="h-4 w-28 rounded bg-hairline/50" />
            <div className="h-10 rounded bg-hairline/40" />
            <div className="h-10 rounded bg-hairline/40" />
          </div>
        ))}
      </div>
    );
  }
  const { profile, stats, refs } = data;
  if (!profile) {
    return <p className="py-8 text-center text-body text-ink/55">No data for this area — it may be non-residential.</p>;
  }

  const { suburb, scalars, breakdowns, schools } = profile;
  const statFor = (key: string, asOf: string) => stats.find((s) => s.metric_key === key && s.as_of_date === asOf);
  // TRI-130 — the suburb-level figures the block column is shown beside.
  const scalarValue = (k: string) => scalars.find((x) => x.def.metric_key === k)?.value ?? null;
  const categoryPct = (k: string, label: RegExp) => {
    const pct = breakdowns.find((b) => b.def.metric_key === k)?.categories.find((c) => label.test(c.label))?.pct;
    return pct == null ? null : Math.round(pct * 10) / 10;
  };

  const forCard = (card: CardKey) => {
    const dims = CARD_DIMENSIONS[card];
    return {
      scalars: scalars.filter((s) => dims.includes(s.def.dimension)),
      breakdowns: breakdowns.filter((b) => dims.includes(b.def.dimension)),
    };
  };
  const cards = cardOrder(persona);
  // Dimensions no card claims — rendered after the six, never hidden.
  const orphanDims = [...new Set([...scalars, ...breakdowns].map((x) => x.def.dimension))].filter((d) => !cardForDimension(d));

  const renderCard = (card: CardKey) => {
    const common = { ...forCard(card), statFor, refs };
    switch (card) {
      case "housing":
        return <HousingCard key={card} {...common} />;
      case "planning":
        return <PlanningCard key={card} {...common} />;
      case "hazards":
        return common.scalars.length || common.breakdowns.length ? <HazardsCard key={card} {...common} /> : null;
      case "people":
        return <PeopleCard key={card} {...common} />;
      case "commute":
        return <GettingAroundCard key={card} sa2={sa2} scalars={common.scalars} statFor={statFor} />;
      case "schools":
        return <SchoolsCard key={card} nearby={profile.nearbySchools} within={schools} />;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* TRI-133 — the property panel (public records + point checks) comes
          FIRST; the banner then draws the hard line: everything under it is
          the area's. TRI-122 — a searched address only ever locates the area;
          it carries no data of its own, and the copy says so before any figure. */}
      {pin && pin.sa2_code === sa2 && (
        <AddressFacts
          pin={pin}
          suburb={{
            name: suburb.name,
            population: scalarValue("population"),
            median_age: scalarValue("median_age"),
            median_household_income: scalarValue("median_household_income"),
            nzdep_decile: scalarValue("nzdep_decile"),
            renting_pct: categoryPct("tenure", /not owned/i),
            separate_house_pct: categoryPct("dwelling_type", /separate house/i),
            ethnicity: Object.fromEntries(["European", "Māori", "Pacific Peoples", "Asian"].map((e) => [e, categoryPct("ethnicity", new RegExp("^" + e + "$", "i"))])),
          }}
        />
      )}
      {pin && pin.sa2_code === sa2 && (
        <p data-testid="address-banner" className="rounded-control border border-harbour/40 bg-harbour/10 px-3 py-2 text-label leading-snug text-ink/85">
          <span className="font-medium">{pin.label}</span> sits in {suburb.name}. The panel above holds public records and point checks for that spot; everything below
          describes the area, not the property.
        </p>
      )}
      <ProfileHeader profile={profile} persona={persona} rent={scalarValue(PRIMARY_RENT_METRIC)} />
      {/* Headline numbers for the active persona (TRI-106). Which five appear
          is persona config, not logic here. */}
      <KpiCards keys={personaConfig(persona).kpiTiles} scalars={scalars} statFor={statFor} />
      {cards.map((c) => (c === "schools" ? null : renderCard(c)))}
      {orphanDims.map((dim) => (
        <GenericCard
          key={dim}
          dim={dim}
          scalars={scalars.filter((s) => s.def.dimension === dim)}
          breakdowns={breakdowns.filter((b) => b.def.dimension === dim)}
          statFor={statFor}
          refs={refs}
        />
      ))}
      {renderCard("schools")}
    </div>
  );
}
